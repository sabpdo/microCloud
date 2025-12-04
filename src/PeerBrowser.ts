/**
 * Browser-based Peer class that uses WebRTC for actual file transfers
 */

import { MicroCloudClient } from '../client/src/webrtc';
import { CacheManifest, ManifestGenerator, CachedResource } from './cache/manifest-generator';
import { MemoryCache } from './cache';
import { fetchFromOrigin, OriginFetchResult } from './cache/origin-fallback';
import { sha256 } from './utils/hash';

interface PeerInfo {
  peerID: string;
  lastSeen: number;
  bandwidth: number;
  uptime: number;
  reputation: number;
  cacheManifest: CacheManifest;
  client?: MicroCloudClient; // WebRTC client for this peer
}

interface Weights {
  a: number;
  b: number;
  c: number;
}

export class PeerBrowser {
  public readonly peerID: string;
  private peerIndex: Map<string, PeerInfo>;
  public role: string;
  private readonly UPDATE_CYCLE_INTERVAL = 10000;

  private successfulUploads: number;
  private failedTransfers: number;
  private anchorPromoteThreshold: number;
  private anchorDemoteThreshold: number;

  private bandwidth: number;
  private connectionStartTime!: number;
  private connectionEndTime!: number;
  private isConnected!: boolean;

  private chunkIndex: Map<string, PriorityQueue>;
  private uptime: number;

  private cache: MemoryCache<CachedResource>;
  private manifestGen: ManifestGenerator;
  private cacheManifest!: CacheManifest;

  private weights: Weights;

  // WebRTC client for this peer
  private webrtcClient: MicroCloudClient | null = null;

  // Connected peers' WebRTC clients
  private peerConnections = new Map<string, MicroCloudClient>();

  public constructor(
    peerID: string,
    initialBandwidth: number,
    weights: Weights,
    anchorThreshold: number,
    webrtcClient?: MicroCloudClient
  ) {
    this.peerID = peerID;
    this.peerIndex = new Map();
    this.role = 'transient';

    this.successfulUploads = 0;
    this.failedTransfers = 0;
    // Hysteresis: demote threshold is 85% of promote threshold to reduce flapping
    this.anchorPromoteThreshold = anchorThreshold;
    this.anchorDemoteThreshold = anchorThreshold * 0.85;

    this.bandwidth = initialBandwidth;
    this.uptime = 0;
    this.chunkIndex = new Map();
    this.cache = new MemoryCache();
    this.manifestGen = new ManifestGenerator(peerID, this.cache);

    this.weights = weights;

    if (webrtcClient) {
      this.setupWebRTCClient(webrtcClient);
    }

    this.startUptimeTracking();
    this.startRebalancingCycle();
  }

  private setupWebRTCClient(client: MicroCloudClient) {
    this.webrtcClient = client;

    // Setup file request handlers
    client.onFileRequest = (resourceHash: string, requestId: string) => {
      this.handleFileRequest(resourceHash, requestId);
    };

    client.onManifestRequest = () => {
      this.handleManifestRequest();
    };
  }

  private async handleFileRequest(resourceHash: string, requestId: string) {
    if (!this.webrtcClient) return;

    const resource = this.cache.get(resourceHash);
    if (!resource) {
      // Send failure response
      const response = {
        type: 'file-response',
        requestId,
        resourceHash,
        success: false,
      };
      if (this.webrtcClient.isDataChannelReady()) {
        const dc = this.webrtcClient.getDataChannel();
        if (dc) {
          dc.send(JSON.stringify(response));
        }
      }
      return;
    }

    // Send file via WebRTC
    // The sendFile method handles both string and ArrayBuffer
    if (this.webrtcClient.isDataChannelReady()) {
      this.webrtcClient.sendFile(resourceHash, resource.content, resource.mimeType, requestId);
      this.recordSuccessfulUpload();
    } else {
      // Send failure response if channel not ready
      const dc = this.webrtcClient.getDataChannel();
      if (dc && dc.readyState === 'open') {
        const response = {
          type: 'file-response',
          requestId,
          resourceHash,
          success: false,
        };
        dc.send(JSON.stringify(response));
      }
    }
  }

  private async handleManifestRequest() {
    if (!this.webrtcClient) return;

    await this.getManifest();
    this.webrtcClient.sendManifest(this.cacheManifest);
  }

  public async getManifest(): Promise<void> {
    this.cacheManifest = await this.manifestGen.generateManifest();
  }

  /**
   * Calculate reputation score using formula:
   * S(peer) = a * n_success + b * B + c * T
   * where n_success = number of successful uploads, B = bandwidth (Mbps), T = uptime (seconds)
   * @returns Reputation score (can be > 100 with default weights)
   */
  public getReputation(): number {
    // n_success: number of successful chunk transfers (uploads to other peers)
    const n_success = this.successfulUploads;
    
    // B: bandwidth in Mbps (no normalization per report formula)
    const B = this.bandwidth;
    
    // T: uptime in seconds (current session duration)
    const T = this.uptime;
    
    // Apply weights: a, b, c are tunable scalar weights
    // Default weights are all 1.0 per report
    return (
      this.weights.a * n_success +
      this.weights.b * B +
      this.weights.c * T
    );
  }

  public updateRole(): void {
    const score = this.getReputation();
    // Hysteresis: different thresholds for promotion vs demotion to reduce rapid oscillation
    if (this.role === 'transient' && score >= this.anchorPromoteThreshold) {
      // Promote to anchor: need to exceed promote threshold
      this.role = 'anchor';
    } else if (this.role === 'anchor' && score < this.anchorDemoteThreshold) {
      // Demote from anchor: need to fall below demote threshold (lower than promote)
      this.role = 'transient';
    }
    // If score is between thresholds, keep current role (hysteresis prevents flapping)
  }

  public startRebalancingCycle(): void {
    setInterval(() => {
      this.updateRole();
      this.updateConnections();
      this.getManifest();
      this.autoFetchResources();
    }, this.UPDATE_CYCLE_INTERVAL);
  }

  public startUptimeTracking(): void {
    this.connectionStartTime = Date.now();
    this.isConnected = true;
  }

  public stopUptimeTracking(): void {
    if (this.isConnected) {
      this.connectionEndTime = Date.now();
      this.isConnected = false;
    }
  }

  public updateUptime(): number {
    if (this.isConnected) {
      this.connectionEndTime = Date.now();
      const currentSession = (this.connectionEndTime - this.connectionStartTime) / 1000;
      this.uptime = currentSession;
    }
    return this.uptime;
  }

  public getPeerInfo(): PeerInfo {
    return {
      peerID: this.peerID,
      lastSeen: Date.now() / 1000,
      bandwidth: this.bandwidth,
      uptime: this.uptime,
      reputation: this.getReputation(),
      cacheManifest: this.cacheManifest,
      client: this.webrtcClient || undefined,
    };
  }

  public addPeer(peer: PeerBrowser): void {
    const newPeerInfo: PeerInfo = peer.getPeerInfo();
    
    // Get old peer info to clean up stale chunk index entries
    const oldPeerInfo = this.peerIndex.get(peer.peerID);
    
    // Remove this peer from all chunk index entries (in case their cache changed)
    if (oldPeerInfo) {
      for (const resource of oldPeerInfo.cacheManifest.resources) {
        if (this.chunkIndex.has(resource.resourceHash)) {
          this.chunkIndex.get(resource.resourceHash)?.deletePeer(peer.peerID);
        }
      }
    }
    
    // Update peer index
    this.peerIndex.set(peer.peerID, newPeerInfo);

    if (peer.webrtcClient) {
      this.peerConnections.set(peer.peerID, peer.webrtcClient);
    }

    // Add this peer to chunk index for their current resources
    for (const resource of newPeerInfo.cacheManifest.resources) {
      if (this.chunkIndex.has(resource.resourceHash)) {
        const pq = this.chunkIndex.get(resource.resourceHash);
        if (pq) {
          // Remove peer first to avoid duplicates, then re-insert with current reputation
          pq.deletePeer(peer.peerID);
          pq.insert(newPeerInfo.reputation, peer.peerID);
        }
      } else {
        let pq: PriorityQueue = new PriorityQueue();
        pq.insert(newPeerInfo.reputation, peer.peerID);
        this.chunkIndex.set(resource.resourceHash, pq);
      }
    }
  }

  public updateConnections(): void {
    const now = Date.now();
    const TIMEOUT_THRESHOLD = 30000;

    for (const [peerID, info] of this.peerIndex.entries()) {
      if (now - info.lastSeen * 1000 > TIMEOUT_THRESHOLD) {
        this.peerIndex.delete(peerID);
        this.peerConnections.delete(peerID);
        for (const resource of info.cacheManifest.resources) {
          if (this.chunkIndex.has(resource.resourceHash)) {
            let pq = this.chunkIndex.get(resource.resourceHash)!;
            pq.deletePeer(peerID);
          }
        }
      }
    }

    this.uptime = this.updateUptime();
  }

  /**
   * Request a resource (file) by hash
   * Tries local cache first, then peers via WebRTC, then origin server
   * @param resourceHash - SHA-256 hash of the resource to request
   * @param originPath - Optional path to use when falling back to origin (default: '/sample.txt')
   */
  public async requestResource(
    resourceHash: string,
    originPath: string = '/sample.txt'
  ): Promise<CachedResource | null> {
    const DEFAULT_MAX_RETRIES = 3;
    const DEFAULT_TIMEOUT = 30000;

    // Check local cache first
    if (this.cache.has(resourceHash)) {
      const cached = this.cache.get(resourceHash)!;
      return cached;
    }

    // Try to get from peers via WebRTC
    if (!this.chunkIndex.has(resourceHash)) {
      console.log(`No peers have resource ${resourceHash}, requesting from origin`);
      const resource = await this.defaultToOrigin(originPath);
      if (resource) {
        this.cache.set(resourceHash, resource);
      }
      return resource;
    }

    // Try peers in order of reputation
    for (let attempt = 0; attempt < DEFAULT_MAX_RETRIES; attempt++) {
      try {
        const peerQueue = this.chunkIndex.get(resourceHash)!;

        if (peerQueue.getSize() === 0) {
          this.chunkIndex.delete(resourceHash);
          const resource = await this.defaultToOrigin(originPath);
          if (resource) {
            this.cache.set(resourceHash, resource);
          }
          return resource;
        }

        const peerID = peerQueue.get_max();
        const peerInfo = this.peerIndex.get(peerID);

        if (!peerInfo) {
          peerQueue.delete_max();
          continue;
        }

        // Verify that this peer actually has the requested resource in their manifest
        // This prevents requesting from peers that have stale chunk index entries
        const hasResource = peerInfo.cacheManifest.resources.some(
          r => r.resourceHash === resourceHash
        );
        if (!hasResource) {
          console.warn(`Peer ${peerID} no longer has resource ${resourceHash.substring(0, 8)}... (stale chunk index entry)`);
          peerQueue.delete_max();
          continue;
        }

        // Check if we have WebRTC connection to this peer
        const peerClient = this.peerConnections.get(peerID) || peerInfo.client;
        if (!peerClient) {
          console.log(`No WebRTC connection to peer ${peerID}`);
          peerQueue.delete_max();
          continue;
        }

        console.log(
          `Attempt ${attempt + 1}: Requesting ${resourceHash.substring(0, 8)}... from peer ${peerID} via WebRTC`
        );

        // Request file via WebRTC
        const arrayBuffer = await this.requestFileViaWebRTC(
          peerClient,
          resourceHash,
          DEFAULT_TIMEOUT
        );

        if (arrayBuffer) {
          // Verify hash: compute hash of received content and compare to requested hash
          const receivedHash = await sha256(arrayBuffer);
          if (receivedHash !== resourceHash) {
            // Hash mismatch: peer sent wrong content, treat as failure
            console.warn(
              `Hash verification failed for ${resourceHash}: received ${receivedHash} from peer ${peerID}`
            );
            // Penalize peer for sending incorrect content
            if (peerInfo) {
              this.recordFailedTransfer();
            }
            throw new Error(`Hash verification failed: expected ${resourceHash}, got ${receivedHash}`);
          }

          // Hash matches: content is correct, proceed to cache
          // Get MIME type from manifest or infer
          const manifestEntry = peerInfo.cacheManifest.resources.find(
            (r) => r.resourceHash === resourceHash
          );
          const mimeType = manifestEntry?.mimeType || 'application/octet-stream';

          const resource: CachedResource = {
            content: arrayBuffer,
            mimeType,
            timestamp: Math.floor(Date.now() / 1000),
          };

          this.cache.set(resourceHash, resource);
          console.log(`Successfully received and verified ${resourceHash} from peer ${peerID} via WebRTC`);
          return resource;
        } else {
          throw new Error('Peer returned null/undefined');
        }
      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        const peerQueue = this.chunkIndex.get(resourceHash)!;
        const peerID = peerQueue.get_max();
        const peerInfo = this.peerIndex.get(peerID);
        if (peerInfo) {
          this.recordFailedTransfer();
        }

        if (attempt < DEFAULT_MAX_RETRIES - 1) {
          peerQueue.delete_max();
        }
      }
    }

    // All peer attempts failed, fall back to origin
    console.log(`All peer requests failed for ${resourceHash}, falling back to origin`);
    const resource = await this.defaultToOrigin(originPath);
    if (resource) {
      this.cache.set(resourceHash, resource);
    }
    return resource;
  }

  private async requestFileViaWebRTC(
    client: MicroCloudClient,
    resourceHash: string,
    timeout: number
  ): Promise<ArrayBuffer | null> {
    try {
      const arrayBuffer = await client.requestFile(resourceHash, timeout);
      return arrayBuffer;
    } catch (error) {
      console.error(`WebRTC file request failed for ${resourceHash}:`, error);
      return null;
    }
  }

  private async defaultToOrigin(path: string): Promise<CachedResource | null> {
    try {
      const result: OriginFetchResult = await fetchFromOrigin(path);
      if (!result) return null;

      return {
        content: result.content,
        mimeType: result.mimeType,
        timestamp: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      console.error('Failed to fetch from origin:', error);
      return null;
    }
  }

  public recordSuccessfulUpload(): void {
    this.successfulUploads++;
  }

  public recordFailedTransfer(): void {
    this.failedTransfers++;
  }

  private async autoFetchResources(): Promise<void> {
    const availableResources = Array.from(this.chunkIndex.keys());
    const missingResources = availableResources.filter((hash) => !this.cache.has(hash));

    if (missingResources.length === 0) {
      return;
    }

    // Sort by the max reputation of peers who have each resource
    const prioritized = missingResources
      .map((hash) => ({
        hash,
        maxReputation: this.getMaxReputationForResource(hash),
      }))
      .sort((a, b) => b.maxReputation - a.maxReputation)[0];

    try {
      const resource = await this.requestResource(prioritized.hash);
      if (resource) {
        console.log(`Auto-fetched resource ${prioritized.hash}`);
      }
    } catch (error) {
      console.log(`Auto-fetch failed for ${prioritized.hash}:`, error);
    }
  }

  private getMaxReputationForResource(resourceHash: string): number {
    const queue = this.chunkIndex.get(resourceHash);
    if (!queue || queue.getSize() === 0) {
      return 0;
    }

    const topPeerID = queue.get_max();
    const peerInfo = this.peerIndex.get(topPeerID);
    return peerInfo?.reputation ?? 0;
  }
}

// Priority Queue implementation (same as Peer.ts)
interface QueueNode {
  key: number;
  peerID: string;
}

class PriorityQueue {
  private arr: QueueNode[];
  private size: number;

  public constructor() {
    this.arr = [{ key: Infinity, peerID: '' }];
    this.size = 0;
  }

  private parent(i: number): number {
    return Math.floor(i / 2);
  }

  private lChild(i: number): number {
    return 2 * i;
  }

  private rChild(i: number): number {
    return 2 * i + 1;
  }

  public getSize(): number {
    return this.size;
  }

  public insert(key: number, peerID: string): void {
    this.size += 1;
    this.arr[this.size] = { key, peerID };
    this.heapify_up(this.size);
  }

  public deletePeer(peerID: string): void {
    let nodeInd = 1;
    while (nodeInd <= this.size && this.arr[nodeInd].peerID !== peerID) {
      nodeInd += 1;
    }
    if (nodeInd > this.size) return;

    this.swap(nodeInd, this.size);
    this.size -= 1;
    this.heapify_down(nodeInd);
  }

  public delete_max(): string {
    if (this.size === 0) return '';
    this.swap(1, this.size);
    this.size -= 1;
    this.heapify_down(1);
    return this.arr[this.size + 1].peerID;
  }

  public get_max(): string {
    if (this.size === 0) return '';
    return this.arr[1].peerID;
  }

  private heapify_up(xind: number): void {
    const pind = this.parent(xind);
    if (pind > 0 && this.arr[xind].key > this.arr[pind].key) {
      this.swap(xind, pind);
      this.heapify_up(pind);
    }
  }

  private heapify_down(xind: number): void {
    const lind = this.lChild(xind);
    const rind = this.rChild(xind);
    let curr = xind;

    if (lind <= this.size && this.arr[lind].key > this.arr[xind].key) {
      curr = lind;
    }
    if (rind <= this.size && this.arr[rind].key > this.arr[curr].key) {
      curr = rind;
    }
    if (curr > xind) {
      this.swap(curr, xind);
      this.heapify_down(curr);
    }
  }

  private swap(i1: number, i2: number): void {
    const temp: QueueNode = this.arr[i1];
    this.arr[i1] = this.arr[i2];
    this.arr[i2] = temp;
  }
}
