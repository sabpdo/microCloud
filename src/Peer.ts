import { CacheManifest, ManifestGenerator, CachedResource } from './cache/manifest-generator';
import { MemoryCache } from './cache';
import { fetchFromOrigin, OriginFetchResult } from './cache/origin-fallback';

interface PeerInfo {
  peerID: string;
  lastSeen: number; // timestamp
  bandwidth: number; // Mbps
  uptime: number; // seconds
  // availableStorage: number; // MB
  reputation: number; // float
  cacheManifest: CacheManifest;
  object: Peer;
}

interface Weights {
  a: number;
  b: number;
  c: number;
  // d: number;
  // e: number;
  // f: number;
  // g: number;
}

export class Peer {
  // Peer indiv data
  public readonly peerID: string;
  private peerIndex: Map<string, PeerInfo>;
  public role: string;
  private readonly UPDATE_CYCLE_INTERVAL = 10000;

  // Peer interaction statistics
  private successfulUploads: number; // Count of successful file uploads to peers
  private failedTransfers: number; // Count of failed transfer attempts
  private anchorTreshould: number; // Reputation threshold to become anchor node

  // Device characteristics
  private bandwidth: number; // Network bandwidth capacity (Mbps)
  private connectionStartTime!: number; // When this peer connected to network
  private connectionEndTime!: number; // Last update time for connection
  private isConnected!: boolean; // Whether peer is currently connected

  // Resource and network management
  private chunkIndex: Map<string, PriorityQueue>; // Index of which peers have which files
  private uptime: number; // Current session uptime (seconds)
  private cache: MemoryCache<CachedResource>; // Local cache of resources
  private manifestGen: ManifestGenerator; // Generates cache manifests for sharing
  private cacheManifest!: CacheManifest; // Current cache manifest

  // Configuration
  private weights: Weights; // Weights for reputation calculation

  public constructor(
    peerID: string,
    initialBandwidth: number,
    // initialStorage: number,
    // initialBattery: number,
    weights: Weights,
    anchorThreshold: number
  ) {
    this.peerID = peerID;
    this.peerIndex = new Map();
    this.role = 'transient';

    this.successfulUploads = 0;
    // this.integrityVerifications = 0;
    this.failedTransfers = 0;
    this.anchorTreshould = anchorThreshold;

    this.bandwidth = initialBandwidth;
    // this.availableStorage = initialStorage;
    // this.batteryPercentage = initialBattery;

    this.uptime = 0;
    this.chunkIndex = new Map();
    this.cache = new MemoryCache();
    this.manifestGen = new ManifestGenerator(peerID, this.cache);

    this.weights = weights;

    this.startUptimeTracking();
    this.startRebalancingCycle();
  }

  public async getManifest(): Promise<void> {
    this.cacheManifest = await this.manifestGen.generateManifest();
  }

  /**
   * Calculate reputation score based on upload success rate, bandwidth, and uptime
   * Avoids division by zero when no transfers have occurred yet
   */
  public getReputation(): number {
    // Calculate success rate, avoiding division by zero
    const totalAttempts = this.successfulUploads + this.failedTransfers;
    const successRate = totalAttempts > 0 ? this.successfulUploads / totalAttempts : 0.5; // Default to 50% if no attempts yet

    // Weighted combination of factors
    return (
      this.weights.a * successRate * 100 +
      this.weights.b * this.bandwidth +
      this.weights.c * this.uptime
    );
  }

  public updateRole(): void {
    const score = this.getReputation();
    if (score >= this.anchorTreshould) {
      this.role = 'anchor';
    } else {
      this.role = 'transient';
    }
  }

  public startRebalancingCycle(): void {
    setInterval(() => {
      this.updateRole();
      this.updateConnections();
      this.getManifest();
      this.autoFetchResources();
    }, this.UPDATE_CYCLE_INTERVAL);
  }

  /**
   * Start tracking uptime when peer connects
   * Records connection start time
   */
  public startUptimeTracking(): void {
    this.connectionStartTime = Date.now();
    this.isConnected = true;
  }

  /**
   * Stop tracking uptime when peer disconnects
   * Marks peer as disconnected
   */
  public stopUptimeTracking(): void {
    if (this.isConnected) {
      this.connectionEndTime = Date.now();
      this.isConnected = false;
    }
  }

  /**
   * Update and return current uptime
   * Calculates how long peer has been connected in seconds
   */
  public updateUptime(): number {
    if (this.isConnected) {
      this.connectionEndTime = Date.now();
      const currentSession = (this.connectionEndTime - this.connectionStartTime) / 1000;
      this.uptime = currentSession;
    }
    return this.uptime;
  }

  /**
   * Get current peer information for sharing with other peers
   * Returns snapshot of peer's state including cache manifest
   * @returns PeerInfo with current statistics and cache manifest
   */
  public getPeerInfo(): PeerInfo {
    const info: PeerInfo = {
      peerID: this.peerID,
      lastSeen: this.connectionEndTime / 1000, // Convert to seconds
      bandwidth: this.bandwidth,
      uptime: this.uptime,
      reputation: this.getReputation(), // Current reputation score
      cacheManifest: this.cacheManifest, // What files this peer has
      object: this, // Reference to this peer instance
    };
    return info;
  }

  /**
   * Add a peer to the peer index and update chunk index
   * When a new peer is discovered, record what files it has
   * This enables finding peers with specific files later
   * @param peer - Peer to add to the index
   */
  public addPeer(peer: Peer): void {
    const newPeerInfo: PeerInfo = peer.getPeerInfo();
    // Add peer to main index
    this.peerIndex.set(peer.peerID, newPeerInfo);

    // Update chunk index: for each resource the peer has, add to priority queue
    // Priority queue helps quickly find best peer for each file
    for (const resource of newPeerInfo.cacheManifest.resources) {
      if (this.chunkIndex.has(resource.resourceHash)) {
        // Resource already indexed, add this peer to its queue
        this.chunkIndex.get(resource.resourceHash)?.insert(newPeerInfo.reputation, peer.peerID);
      } else {
        // New resource, create priority queue for it
        let pq: PriorityQueue = new PriorityQueue();
        pq.insert(newPeerInfo.reputation, peer.peerID);
        this.chunkIndex.set(resource.resourceHash, pq);
      }
    }
  }

  /**
   * Update peer connections by removing stale peers
   * Removes peers that haven't been seen recently (timeout threshold)
   * Also updates uptime for this peer
   * Called periodically during rebalancing cycle
   */
  public updateConnections(): void {
    const now = Date.now();
    const TIMEOUT_THRESHOLD = 30000; // 30 seconds - consider peer dead after this

    // Check each peer in index for staleness
    // In production, this would use heartbeat mechanism
    for (const [peerID, info] of this.peerIndex.entries()) {
      if (now - info.lastSeen * 1000 > TIMEOUT_THRESHOLD) {
        // Peer hasn't been seen recently - remove from index
        this.peerIndex.delete(peerID);

        // Remove peer from all resource priority queues
        for (const resource of info.cacheManifest.resources) {
          if (this.chunkIndex.has(resource.resourceHash)) {
            let pq = this.chunkIndex.get(resource.resourceHash)!;
            pq.deletePeer(peerID); // Remove from queue
          }
        }
      }
    }

    // Update this peer's uptime
    this.uptime = this.updateUptime();
  }

  /**
   * Request a resource (file) by hash
   * Tries local cache first, then peers, then origin server
   * Implements retry logic with fallback to origin
   * @param resourceHash - SHA-256 hash of the resource to request
   * @returns CachedResource if found, null if all attempts fail
   */
  public async requestResource(resourceHash: string): Promise<CachedResource | null> {
    const DEFAULT_MAX_RETRIES = 3; // Try up to 3 peers before giving up
    const DEFAULT_TIMEOUT = 3000; // 3 second timeout per request

    // Step 1: Check local cache first (fastest)
    if (this.cache.has(resourceHash)) {
      const cached = this.cache.get(resourceHash)!;
      return cached; // Cache hit - return immediately
    }

    // Step 2: Check if any peers have this resource
    if (!this.chunkIndex.has(resourceHash)) {
      // No peers have it - fetch from origin server
      console.log(`No peers have resource ${resourceHash}, requesting from origin`);
      const resource = await this.defaultToOrigin('');
      if (resource) {
        this.cache.set(resourceHash, resource); // Cache for future use
      }
      return resource;
    }

    // Step 3: Try to get resource from peers (P2P)
    // Try multiple peers in order of reputation (best first)
    for (let attempt = 0; attempt < DEFAULT_MAX_RETRIES; attempt++) {
      try {
        const peerQueue = this.chunkIndex.get(resourceHash)!;

        // Check if queue is empty (all peers tried or failed)
        if (peerQueue.getSize() == 0) {
          this.chunkIndex.delete(resourceHash);
          const resource = await this.defaultToOrigin('');
          if (resource) {
            this.cache.set(resourceHash, resource);
          }
          return resource;
        }

        // Get best available peer (highest reputation)
        const peerID = peerQueue.get_max();
        const peerInfo = this.peerIndex.get(peerID);

        // Skip if peer info is invalid
        if (!peerInfo) {
          peerQueue.delete_max(); // Remove invalid peer from queue
          continue;
        }

        console.log(`Attempt ${attempt + 1}: Requesting ${resourceHash} from peer ${peerID}`);

        // Request resource from peer with timeout
        const resource = await this.requestWithTimeout(
          () => peerInfo.object.grantChunk(resourceHash),
          DEFAULT_TIMEOUT
        );

        if (resource) {
          // Success - cache the resource and update peer stats
          this.cache.set(resourceHash, resource);
          peerInfo.object.recordSuccessfulUpload(); // Reward peer for serving
          console.log(`Successfully received ${resourceHash} from peer ${peerID}`);
          return resource;
        } else {
          throw new Error('Peer returned null/undefined');
        }
      } catch (error) {
        // Request failed - try next peer
        console.error(`Attempt ${attempt + 1} failed:`, error);

        const peerQueue = this.chunkIndex.get(resourceHash)!;
        const peerID = peerQueue.get_max();
        const peerInfo = this.peerIndex.get(peerID)!;
        peerInfo?.object.recordFailedTransfer(); // Penalize peer for failure

        // Remove failed peer from queue, try next one
        if (attempt < DEFAULT_MAX_RETRIES - 1) {
          peerQueue.delete_max();
        }
      }
    }

    // Step 4: All P2P attempts failed - fall back to origin server
    console.log(`All peer requests failed for ${resourceHash}, falling back to origin`);
    const resource = await this.defaultToOrigin('');
    if (resource) {
      this.cache.set(resourceHash, resource); // Cache for future P2P sharing
    }
    return resource;
  }

  /**
   * Fetch resource from origin server when P2P fails
   * Used as fallback when peers don't have the resource
   * @param path - Path to resource (currently unused, future enhancement)
   * @returns CachedResource from origin server
   */
  private async defaultToOrigin(path: string): Promise<CachedResource> {
    const result: OriginFetchResult = await fetchFromOrigin(path);
    // Convert origin response to cached resource format
    return {
      content: result.content,
      mimeType: result.mimeType,
      timestamp: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
    };
  }

  /**
   * Execute a promise with timeout
   * Used to prevent hanging on peer requests
   * @param fn - Function that returns a promise
   * @param timeoutMs - Timeout in milliseconds
   * @returns Result of function or throws timeout error
   */
  private async requestWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(), // Actual request
      // Timeout promise that rejects after timeout
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Grant a chunk (file) to another peer that requested it
   * Called when another peer requests a file we have cached
   * @param resourceHash - Hash of the resource being requested
   * @returns CachedResource if we have it, null otherwise
   */
  public async grantChunk(resourceHash: string): Promise<CachedResource | null> {
    try {
      const resource = this.cache.get(resourceHash);

      if (!resource) {
        // We don't have this resource (shouldn't happen in well-behaved system)
        console.warn(`Peer ${this.peerID} does not have resource ${resourceHash}`);
        return null;
      }
      console.log(`Peer ${this.peerID} granted chunk ${resourceHash}`);
      return resource; // Return cached resource
    } catch (error) {
      console.error(`Error granting chunk ${resourceHash}:`, error);
      return null;
    }
  }

  /**
   * Record a successful upload to another peer
   * Increases reputation score
   */
  public recordSuccessfulUpload(): void {
    this.successfulUploads++;
  }

  /**
   * Record a failed transfer attempt
   * Decreases reputation score
   */
  public recordFailedTransfer(): void {
    this.failedTransfers++;
  }

  /**
   * Automatically fetch popular resources from peers
   * Proactively caches resources that other peers have
   * Prioritizes resources available from high-reputation peers
   */
  private async autoFetchResources(): Promise<void> {
    // Get all resources that peers have but we don't
    const availableResources = Array.from(this.chunkIndex.keys());
    const missingResources = availableResources.filter((hash) => !this.cache.has(hash));

    if (missingResources.length === 0) {
      return; // Nothing to fetch
    }

    // Sort by max reputation of peers who have each resource
    // Fetch from highest-reputation peers first (most reliable)
    const prioritized = missingResources
      .map((hash) => ({
        hash,
        maxReputation: this.getMaxReputationForResource(hash),
      }))
      .sort((a, b) => b.maxReputation - a.maxReputation)[0]; // Get highest reputation

    try {
      // Proactively fetch the resource
      const resource = await this.requestResource(prioritized.hash);

      if (resource) {
        console.log(`Auto-fetched resource ${prioritized.hash}`);
      }
    } catch (error) {
      console.log(`Auto-fetch failed for ${prioritized.hash}:`, error);
    }
  }

  /**
   * Get the maximum reputation among peers that have a resource
   * Used to prioritize which resources to fetch proactively
   * @param resourceHash - Hash of resource to check
   * @returns Maximum reputation score, or 0 if no peers have it
   */
  private getMaxReputationForResource(resourceHash: string): number {
    const queue = this.chunkIndex.get(resourceHash);
    if (!queue || queue.getSize() == 0) {
      return 0; // No peers have this resource
    }

    // Get best peer (top of priority queue)
    const topPeerID = queue.get_max();
    const peerInfo = this.peerIndex.get(topPeerID);
    return peerInfo?.reputation ?? 0;
  }

  // update anchor threshold? heartbeat?
}

interface QueueNode {
  key: number;
  peerID: string;
}

/**
 * Max-heap priority queue for peer selection
 * Maintains peers sorted by reputation (highest first)
 * Used to quickly find best peer for each resource
 */
class PriorityQueue {
  private arr: QueueNode[]; // Array representation of heap (1-indexed)
  private size: number; // Number of elements in queue

  public constructor() {
    // Initialize with sentinel at index 0 (simplifies heap operations)
    this.arr = [{ key: Infinity, peerID: '' }];
    this.size = 0;
  }

  // Heap helper functions for 1-indexed array
  private parent(i: number): number {
    return Math.floor(i / 2);
  }

  private lChild(i: number): number {
    return 2 * i;
  }

  private rChild(i: number): number {
    return 2 * i + 1;
  }

  /**
   * Get current size of queue
   * @returns Number of peers in queue
   */
  public getSize(): number {
    return this.size;
  }

  /**
   * Insert a peer into the priority queue
   * Maintains max-heap property (highest reputation at top)
   * @param key - Reputation score (higher = better)
   * @param peerID - ID of peer to insert
   */
  public insert(key: number, peerID: string): void {
    this.size += 1;
    this.arr[this.size] = { key: key, peerID: peerID };
    this.heapify_up(this.size); // Restore heap property
  }

  /**
   * Update reputation (key) for an existing peer in the queue
   * Maintains heap property after update
   * @param peerID - ID of peer to update
   * @param newKey - New reputation score
   */
  public updateValue(peerID: string, newKey: number): void {
    // Find peer in array (linear search)
    let nodeInd = 1;
    while (nodeInd <= this.size && this.arr[nodeInd].peerID != peerID) {
      nodeInd += 1;
    }
    if (nodeInd > this.size) return; // Peer not found

    const pastKey = this.arr[nodeInd].key;
    this.arr[nodeInd].key = newKey;

    // Restore heap property based on whether key increased or decreased
    if (newKey < pastKey) {
      this.heapify_down(nodeInd); // Key decreased - move down in heap
    }
    if (newKey > pastKey) {
      this.heapify_up(nodeInd); // Key increased - move up in heap
    }
  }

  /**
   * Remove a peer from the priority queue
   * Used when peer disconnects or becomes unavailable
   * @param peerID - ID of peer to remove
   */
  public deletePeer(peerID: string): void {
    // Find peer in array
    let nodeInd = 1;
    while (nodeInd <= this.size && this.arr[nodeInd].peerID != peerID) {
      nodeInd += 1;
    }
    if (nodeInd > this.size) return; // Peer not found

    // Swap with last element and remove
    this.swap(nodeInd, this.size);
    this.size -= 1;
    this.heapify_down(nodeInd); // Restore heap property
  }

  /**
   * Remove and return peer with highest reputation (max element)
   * Used to get best peer for a file transfer
   * @returns ID of peer with highest reputation
   */
  public delete_max(): string {
    if (this.size === 0) return '';
    // Swap root with last element
    this.swap(1, this.size);
    this.size -= 1;
    this.heapify_down(1); // Restore heap property
    return this.arr[this.size + 1].peerID; // Return removed peer
  }

  /**
   * Get peer with highest reputation without removing it
   * Used to query best peer without modifying queue
   * @returns ID of peer with highest reputation
   */
  public get_max(): string {
    if (this.size === 0) return '';
    return this.arr[1].peerID; // Root of max-heap has highest reputation
  }

  /**
   * Restore max-heap property by moving element up
   * Called when element's key increases (reputation improves)
   * @param xind - Index of element to move up
   */
  private heapify_up(xind: number): void {
    const pind = this.parent(xind);
    if (pind > 0 && this.arr[xind].key > this.arr[pind].key) {
      // Child larger than parent - swap and continue up
      this.swap(xind, pind);
      this.heapify_up(pind);
    }
  }

  /**
   * Restore max-heap property by moving element down
   * Called when element's key decreases (reputation drops)
   * @param xind - Index of element to move down
   */
  private heapify_down(xind: number): void {
    const lind = this.lChild(xind);
    const rind = this.rChild(xind);
    let curr = xind;

    // Find largest of node and its children
    if (lind <= this.size && this.arr[lind].key > this.arr[xind].key) {
      curr = lind;
    }
    if (rind <= this.size && this.arr[rind].key > this.arr[curr].key) {
      curr = rind;
    }

    // If child is larger, swap and continue down
    if (curr > xind) {
      this.swap(curr, xind);
      this.heapify_down(curr);
    }
  }

  /**
   * Swap two elements in the array
   * Helper function for heap operations
   * @param i1 - First index
   * @param i2 - Second index
   */
  private swap(i1: number, i2: number): void {
    const temp: QueueNode = this.arr[i1];
    this.arr[i1] = this.arr[i2];
    this.arr[i2] = temp;
  }
}
