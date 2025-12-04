/**
 * Flash Crowd Simulation Engine
 *
 * Runs on the server side to simulate multiple peers with varied properties
 * Now uses PeerBrowser with MockWebRTCClient for actual file transfer simulation
 */

import { createHash } from 'crypto';
import { PeerBrowser } from '../src/PeerBrowser';
import { MockMicroCloudClient } from './mock-webrtc-client';

// Helper function for hashing in Node.js
function sha256Sync(data: string): string {
  const hash = createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

export interface SimulationConfig {
  numPeers: number;
  targetFile: string;
  duration: number; // seconds
  // Request behavior: probability-based instead of fixed interval
  requestProbability?: number; // probability per second of making a request (0-1, default: 0.5)
  requestInterval?: number; // DEPRECATED: kept for backward compatibility, use requestProbability instead
  // Churn configuration
  churnRate?: number; // probability of peer leaving per cycle (0-1)
  churnMode?: 'leaving' | 'joining' | 'mixed'; // churn behavior mode (default: 'mixed')
  rejoinRate?: number; // probability of a churned peer rejoining per cycle (0-1, default: 0.5 * churnRate)
  // Flash crowd configuration
  flashCrowd?: boolean; // if true, peers join over time instead of all at once
  joinRate?: number; // peers per second for flash crowd (default: 2, can be increased for more intense flash crowds)
  anchorSignalingLatency?: number; // constant latency for joining via anchor node (ms, default: 100)
  // Device heterogeneity
  deviceHeterogeneity?: {
    latencyMin?: number; // minimum latency in ms (default: 10)
    latencyMax?: number; // maximum latency in ms (default: 250)
    bandwidthMin?: number; // minimum bandwidth in Mbps (default: 10)
    bandwidthMax?: number; // maximum bandwidth in Mbps (default: 100)
  };
  // File size configuration
  fileSizeBytes?: number; // override file size for testing (default: actual file size)
  // Baseline comparison mode
  baselineMode?: boolean; // if true, disable P2P and only use origin (for baseline comparison)
}

export interface PeerProperties {
  id: string;
  latency: number; // ms
  bandwidth: number; // Mbps
  uptime: number; // seconds
  startTime: number;
  joinTime?: number; // when this peer joined (for flash crowd)
  requestCount: number;
  cacheHits: number; // Peer-to-peer cache hits (from other peers)
  localCacheHits: number; // Local cache hits (already had file)
  cacheMisses: number; // Origin server requests
  isAnchor: boolean;
  reputation: number;
  files: Set<string>; // file hashes this peer has
  uploadsServed: number;
}

export interface PeerJoinEvent {
  peerId: string;
  timestamp: number;
  joinedViaAnchor?: string; // anchor node ID if joined via signaling
}

export interface FileTransferEvent {
  fromPeer: string;
  toPeer: string;
  fileHash: string;
  timestamp: number;
  successful: boolean;
  chunkFailure?: boolean; // True if transfer failed due to chunk loss
  totalChunks?: number; // Total chunks in the file
  failedChunkIndex?: number; // Which chunk failed (if applicable)
}

export interface RequestMetrics {
  timestamp: number;
  latency: number;
  source: 'local-cache' | 'peer-cache' | 'origin';
  peerId: string;
  peerBandwidthTier: 'low' | 'medium' | 'high';
  successful: boolean;
  isAnchor: boolean; // Whether the peer making the request is an anchor node
}

export interface PeerReputationSnapshot {
  timestamp: number;
  reputation: number;
  n_success: number; // successful uploads
  bandwidth: number; // Mbps
  uptime: number; // seconds
  breakdown: {
    uploadsContribution: number; // a * n_success
    bandwidthContribution: number; // b * B
    uptimeContribution: number; // c * T
  };
}

export interface SimulationResults {
  totalRequests: number;
  peerRequests: number;
  originRequests: number;
  cacheHitRatio: number;
  bandwidthSaved: number; // percentage
  avgLatency: number;
  latencyImprovement: number; // percentage improvement
  jainFairnessIndex: number;
  recoverySpeed?: number; // requests/sec after churn
  peersSimulated: number;
  duration: number;
  peerJoinEvents: PeerJoinEvent[];
  fileTransferEvents: FileTransferEvent[];
  anchorNodes: string[];
  filePropagationTime?: number; // time for file to reach all peers (ms) - DEPRECATED: use propagationMetrics
  peerReputationHistory?: Record<string, PeerReputationSnapshot[]>; // peerId -> array of snapshots
  // Propagation metrics
  propagationMetrics?: {
    timeTo50Percent: number; // Time (ms) for file to reach 50% of peers
    timeTo90Percent: number; // Time (ms) for file to reach 90% of peers
    timeTo100Percent: number; // Time (ms) for file to reach all peers
    avgTimeToReceive: number; // Average time (ms) from peer join to receiving file
    propagationRate: number; // Peers served per second during propagation
    timeToFirstP2P: number; // Time (ms) until first peer-to-peer transfer (vs origin-only)
    originLoadReduction: number; // Percentage reduction in origin requests after propagation
  };
  // Extended metrics
  latencyPercentiles?: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  // Latency metrics by node type (anchor vs transient)
  latencyByNodeType?: {
    anchor: {
      avgLatency: number;
      p5: number; // 5th percentile
      p50: number; // 50th percentile (median)
      p95: number; // 95th percentile
      p99: number; // 99th percentile (worst-case)
      requestCount: number;
    };
    transient: {
      avgLatency: number;
      p5: number; // 5th percentile
      p50: number; // 50th percentile (median)
      p95: number; // 95th percentile
      p99: number; // 99th percentile (worst-case)
      requestCount: number;
    };
  };
  timeSeriesData?: Array<{
    time: number; // seconds from start
    cacheHitRatio: number;
    avgLatency: number;
    originRequests: number;
    peerRequests: number;
  }>;
  perTierMetrics?: {
    low: { requestsServed: number; avgLatency: number; cacheHitRatio: number };
    medium: { requestsServed: number; avgLatency: number; cacheHitRatio: number };
    high: { requestsServed: number; avgLatency: number; cacheHitRatio: number };
  };
  chunkFailureMetrics?: {
    totalChunkTransfers: number; // Total number of chunk transfers attempted
    chunkFailures: number; // Number of chunk failures
    chunkFailureRate: number; // Percentage of chunk transfers that failed
    avgChunksPerFile: number; // Average number of chunks per file transfer
  };
  allRequestMetrics?: RequestMetrics[];
}

// Server URL will be determined at runtime
const getServerUrl = () => {
  return process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
};

// Global file registry: tracks which peers have which files
// Maps file hash to set of peer IDs that have that file
const fileRegistry = new Map<string, Set<string>>(); // fileHash -> Set<peerId>
// Global peer registry: tracks all peers and their properties
const peerRegistry = new Map<string, PeerProperties>(); // peerId -> Peer
// Global PeerBrowser registry: actual peer instances with WebRTC clients for real transfers
const peerBrowserRegistry = new Map<string, PeerBrowser>(); // peerId -> PeerBrowser
// Churned peers registry: tracks peers that have left, for potential rejoining
const churnedPeersRegistry = new Map<string, { peer: PeerProperties; churnTime: number }>(); // peerId -> {peer, churnTime}

/**
 * Generate a peer with varied properties to simulate real-world heterogeneity
 * Each peer gets different latency, bandwidth, and uptime characteristics
 * @param peerId - Unique identifier for the peer
 * @param index - Position in the peer list (0-based)
 * @param totalPeers - Total number of peers in simulation
 * @param joinTime - Optional join time for flash crowd scenarios
 * @param config - Simulation configuration for device heterogeneity
 * @returns PeerProperties with varied characteristics
 */
function createPeer(
  peerId: string,
  index: number,
  totalPeers: number,
  joinTime?: number,
  config?: SimulationConfig
): PeerProperties {
  // Device heterogeneity: use configurable min/max or defaults
  const latencyMin = config?.deviceHeterogeneity?.latencyMin ?? 10;
  const latencyMax = config?.deviceHeterogeneity?.latencyMax ?? 250;
  const bandwidthMin = config?.deviceHeterogeneity?.bandwidthMin ?? 10;
  const bandwidthMax = config?.deviceHeterogeneity?.bandwidthMax ?? 100;

  // Vary latency based on position (early peers have better connections)
  // Early peers (low index) get lower latency, simulating better network conditions
  const baseLatency = latencyMin + (index / totalPeers) * (latencyMax - latencyMin);
  const latency = baseLatency + (Math.random() - 0.5) * ((latencyMax - latencyMin) * 0.1); // Add randomness: ±10% of range

  // Vary bandwidth randomly within configured range
  // Simulates different device capabilities and network conditions
  const bandwidth = bandwidthMin + Math.random() * (bandwidthMax - bandwidthMin);

  // Vary uptime (some peers are more stable than others)
  // Simulates different device reliability and user behavior
  const uptime = 30 + Math.random() * 270; // Range: 30-300 seconds

  // Initial reputation: use report formula S(peer) = a * n_success + b * B + c * T
  // Initially: n_success = 0, so reputation = b * B + c * T
  // Weight bandwidth more heavily (3x) to ensure high-bandwidth peers become anchors
  // This ensures proper role assignment: high-bandwidth peers serve more requests
  const repWeights = { a: 1.0, b: 3.0, c: 1.0 }; // Bandwidth weight = 3x to emphasize capacity
  const initialReputation = repWeights.b * bandwidth + repWeights.c * uptime;

  const peer: PeerProperties = {
    id: peerId,
    latency: Math.max(10, Math.round(latency)),
    bandwidth: Math.round(bandwidth * 10) / 10,
    uptime: Math.round(uptime),
    startTime: joinTime || Date.now(),
    joinTime: joinTime || Date.now(),
    requestCount: 0,
    cacheHits: 0,
    localCacheHits: 0,
    cacheMisses: 0,
    isAnchor: initialReputation > 60, // Threshold of 60 per report
    reputation: initialReputation,
    files: new Set(),
    uploadsServed: 0,
  };

  peerRegistry.set(peerId, peer);

  // Create MockWebRTCClient first
  const mockClient = new MockMicroCloudClient(
    peerId,
    {
      signalingUrl: 'ws://mock',
      onLog: () => {}, // Silent in simulation (can enable for debugging)
      onOpen: () => {},
      onClose: () => {},
      // PeerBrowser will set up onFileRequest in setupWebRTCClient
      onFileRequest: () => {}, // Placeholder - will be overwritten by PeerBrowser
    },
    peer.latency,
    peer.bandwidth
  );

  // Create PeerBrowser with the mock client
  // PeerBrowser will set up its own handlers in setupWebRTCClient
  // Use same weights as reputation calculation (bandwidth 3x) for consistency
  const weights = { a: 1.0, b: 3.0, c: 1.0 }; // Bandwidth weight = 3x to match reputation calc
  const peerBrowser = new PeerBrowser(
    peerId,
    peer.bandwidth,
    weights,
    180, // anchorThreshold = 3x higher to match 3x bandwidth weight (60 * 3)
    mockClient as any // Cast to MicroCloudClient interface - PeerBrowser will wire up handlers
  );

  // Store in registry for later use
  peerBrowserRegistry.set(peerId, peerBrowser);

  // Join the peer to a shared room for simulation
  // All peers join the same room to enable P2P transfers
  mockClient.join('simulation-room').catch(() => {});

  // Update uptime tracking - peer just joined, so uptime starts at 0
  // Uptime will increase as simulation progresses
  peerBrowser.updateUptime(); // Initialize uptime tracking

  return peer;
}

/**
 * Calculate reputation score for a peer based on multiple factors
 * Uses formula: S(peer) = a * n_success + b * B + c * T
 * where n_success is number of successful uploads, B is bandwidth, T is uptime
 * @param peer - Peer to calculate reputation for
 * @returns Object with reputation score and breakdown
 */
function calculateReputationWithBreakdown(peer: PeerProperties): {
  reputation: number;
  breakdown: {
    uploadsContribution: number;
    bandwidthContribution: number;
    uptimeContribution: number;
  };
  n_success: number;
  bandwidth: number;
  uptime: number;
} {
  // Get weights - bandwidth weighted 3x to ensure proper role assignment
  // a = weight for successful uploads, b = weight for bandwidth, c = weight for uptime
  const a = 1.0; // Weight for successful uploads
  const b = 3.0; // Weight for bandwidth (Mbps) - 3x to emphasize capacity differences
  const c = 1.0; // Weight for uptime (seconds)

  // Number of successful chunk transfers (uploads served)
  const n_success = peer.uploadsServed;

  // Bandwidth in Mbps (no normalization needed per report formula)
  const B = peer.bandwidth;

  // Uptime in seconds (current session uptime)
  const T = peer.uptime;

  // Calculate individual contributions
  const uploadsContribution = a * n_success;
  const bandwidthContribution = b * B;
  const uptimeContribution = c * T;

  // Calculate reputation using report formula
  // High-bandwidth peers will have much higher reputation, ensuring they serve more requests
  const reputation = uploadsContribution + bandwidthContribution + uptimeContribution;

  return {
    reputation: Math.max(0, reputation), // Ensure non-negative
    breakdown: {
      uploadsContribution,
      bandwidthContribution,
      uptimeContribution,
    },
    n_success,
    bandwidth: B,
    uptime: T,
  };
}

/**
 * Calculate reputation score for a peer (backward compatibility)
 * @param peer - Peer to calculate reputation for
 * @returns Reputation score (can be > 100 with default weights)
 */
function calculateReputation(peer: PeerProperties): number {
  return calculateReputationWithBreakdown(peer).reputation;
}

/**
 * Record a reputation snapshot for a peer at the current time
 * Optimized to minimize performance impact - only stores essential data
 * @param peer - Peer to record snapshot for
 * @param timestamp - Current timestamp
 */
function recordReputationSnapshot(peer: PeerProperties, timestamp: number): void {
  // Use cached calculation if available, otherwise calculate
  // We already calculate reputation in updatePeerRole, so we can reuse it
  const a = 1.0;
  const b = 3.0;
  const c = 1.0;
  
  const n_success = peer.uploadsServed;
  const B = peer.bandwidth;
  const T = peer.uptime;
  
  // Fast calculation - reuse peer.reputation if it's current
  const uploadsContribution = a * n_success;
  const bandwidthContribution = b * B;
  const uptimeContribution = c * T;
  const reputation = uploadsContribution + bandwidthContribution + uptimeContribution;
  
  if (!reputationHistory.has(peer.id)) {
    reputationHistory.set(peer.id, []);
  }
  
  const history = reputationHistory.get(peer.id)!;
  
  // Limit history size to prevent memory bloat (keep last 100 snapshots per peer)
  if (history.length >= 100) {
    history.shift(); // Remove oldest
  }
  
  history.push({
    timestamp,
    reputation: Math.max(0, reputation),
    n_success,
    bandwidth: B,
    uptime: T,
    breakdown: {
      uploadsContribution,
      bandwidthContribution,
      uptimeContribution,
    },
  });
}

/**
 * Update peer role based on current reputation score
 * Peers with reputation > 60 become anchor nodes (stable, reliable)
 * Uses actual upload count and device characteristics per report formula
 * @param peer - Peer to update role for
 */
function updatePeerRole(peer: PeerProperties) {
  // Recalculate reputation based on current stats
  // Reputation = a * n_success + b * B + c * T
  peer.reputation = calculateReputation(peer);
  
  // Anchor nodes are high-reputation peers that can host signaling servers
  // Threshold of 180 (3x higher) to match 3x bandwidth weight
  // This ensures only high-bandwidth peers become anchors, leading to proper load distribution
  peer.isAnchor = peer.reputation > 180;
  
  // Update corresponding PeerBrowser's role
  const peerBrowser = peerBrowserRegistry.get(peer.id);
  if (peerBrowser) {
    peerBrowser.updateRole();
  }
}

/**
 * Register that a peer has a file in the global registry
 * Updates both the file registry (which peers have which files) and peer's file set
 * @param peerId - ID of peer that has the file
 * @param fileHash - Hash of the file
 */
function registerFile(peerId: string, fileHash: string) {
  // Create entry in registry if it doesn't exist
  if (!fileRegistry.has(fileHash)) {
    fileRegistry.set(fileHash, new Set());
  }
  // Add peer to the set of peers that have this file
  fileRegistry.get(fileHash)!.add(peerId);

  // Also update the peer's own file list
  const peer = peerRegistry.get(peerId);
  if (peer) {
    peer.files.add(fileHash);
  }
}

/**
 * Find all peers that have a specific file, sorted by reputation
 * Used to select the best peer to request a file from
 * @param fileHash - Hash of file to find
 * @returns Array of peers with the file, sorted by reputation (best first)
 */
function findPeersWithFile(fileHash: string): PeerProperties[] {
  const peerIds = fileRegistry.get(fileHash);
  if (!peerIds) return []; // No peers have this file

  // Get peer objects, filter out undefined, and sort by reputation
  return Array.from(peerIds)
    .map((id) => peerRegistry.get(id))
    .filter((p): p is PeerProperties => p !== undefined)
    .sort((a, b) => b.reputation - a.reputation); // Highest reputation first
}

/**
 * Update PeerBrowser's connection to other peers
 * Syncs peer index so peers can discover each other for transfers
 * Properly exchanges manifests so peers know what files each other has
 * @param peerId - ID of peer to update
 * @param peerBrowser - PeerBrowser instance to update
 */
async function updatePeerBrowserConnections(
  peerId: string,
  peerBrowser: PeerBrowser
): Promise<void> {
    // Get all other peers that have joined
    for (const [otherPeerId] of peerRegistry.entries()) {
      if (otherPeerId === peerId) continue;

      const otherPeerBrowser = peerBrowserRegistry.get(otherPeerId);
      if (!otherPeerBrowser) continue;

      // Ensure both peers have updated their manifests BEFORE adding to index
      // This ensures chunk index reflects current cache state, not stale data
      try {
        // Update both peers' manifests to reflect current cache state
        await peerBrowser.getManifest();
        await otherPeerBrowser.getManifest();

        // Add peer to index (PeerBrowser will clean up stale entries and update chunk index)
        // This allows this peer to discover what files the other peer has
        peerBrowser.addPeer(otherPeerBrowser);

        // Also add this peer to the other peer's index (bidirectional discovery)
        // This ensures both peers can request files from each other
        otherPeerBrowser.addPeer(peerBrowser);
      } catch (error) {
        // Ignore errors - peer might not be ready yet
        // In production, would have retry logic
        console.warn(`Error updating peer connections between ${peerId} and ${otherPeerId}:`, error);
      }
  }
}

/**
 * Get or create file hash for a file URL
 * For external URLs (http:// or https://), uses URL as hash key to avoid content changes
 * For local files, hashes the content for accuracy
 * @param fileUrl - URL of the file to hash
 * @returns Full SHA-256 hash string (64 hex characters)
 */
async function getFileHash(fileUrl: string): Promise<string> {
  // For external URLs, use URL as hash key since content may change
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return sha256Sync(fileUrl);
  }
  
  // For local files, hash the content for accuracy
  try {
    const response = await fetch(fileUrl);
    if (response.ok) {
      const content = await response.text();
      // Hash the actual content (more accurate than URL hash for local files)
      // Use full hash for consistency with PeerBrowser's cache key format
      return sha256Sync(content);
    }
  } catch (error) {
    // Fallback: hash the URL if we can't fetch the content
    // This allows simulation to continue even if file is unavailable
  }
  return sha256Sync(fileUrl);
}

/**
 * Simulate a peer joining the network (for flash crowd scenarios)
 * New peers can join via anchor nodes (faster) or directly (slower)
 * Tracks join events for analysis and visualization
 * @param peer - Peer that is joining
 * @param config - Simulation configuration
 * @param joinEvents - Array to record join events
 */
async function simulatePeerJoin(
  peer: PeerProperties,
  config: SimulationConfig,
  joinEvents: PeerJoinEvent[]
): Promise<void> {
  // Get configured latency for joining via anchor node
  const joinLatency = config.anchorSignalingLatency || 100;

  // Find available anchor nodes (sorted by reputation, best first)
  // Anchor nodes help new peers join by hosting signaling servers
  const anchorNodes = Array.from(peerRegistry.values())
    .filter((p) => p.isAnchor && p.id !== peer.id)
    .sort((a, b) => b.reputation - a.reputation);

  if (anchorNodes.length > 0) {
    // Join via best anchor node (faster, lower latency)
    const anchor = anchorNodes[0];
    // Simulate signaling latency - time to establish connection via anchor
    await new Promise((resolve) => setTimeout(resolve, joinLatency));

    // Record join event with anchor information
    joinEvents.push({
      peerId: peer.id,
      timestamp: Date.now(),
      joinedViaAnchor: anchor.id, // Track which anchor helped
    });
  } else {
    // No anchor available, must join directly (longer latency)
    // Represents peers joining without existing infrastructure
    await new Promise((resolve) => setTimeout(resolve, joinLatency * 2));
    joinEvents.push({
      peerId: peer.id,
      timestamp: Date.now(),
      // No anchor - direct join
    });
  }
}

// Global request metrics tracker
const requestMetrics: RequestMetrics[] = [];

// Global reputation history tracker: peerId -> array of snapshots over time
const reputationHistory = new Map<string, PeerReputationSnapshot[]>();

// Helper to get bandwidth tier
function getBandwidthTier(bandwidth: number): 'low' | 'medium' | 'high' {
  if (bandwidth < 25) return 'low';
  if (bandwidth < 75) return 'medium';
  return 'high';
}

// Simulate a single peer requesting and downloading files
async function simulatePeer(
  peer: PeerProperties,
  config: SimulationConfig,
  fileHash: string,
  _fileSizeBytes: number,
  transferEvents: FileTransferEvent[],
  onChurn: () => void
): Promise<void> {
  const startTime = peer.joinTime || Date.now();
  const endTime = startTime + config.duration * 1000;

  // Use probability-based requests instead of fixed intervals
  // requestProbability is probability per second (0-1)
  // Convert old requestInterval (ms) to probability if needed
  const requestProbability = config.requestProbability ?? 
    (config.requestInterval ? Math.min(1.0, 1000 / config.requestInterval) : 0.5);
  const checkInterval = 100; // Check every 100ms for probability-based requests
  const probabilityPerCheck = requestProbability * (checkInterval / 1000); // Probability per check interval
  
  // Peer requests the file based on probability
  while (Date.now() < endTime) {
    // Check if peer should churn (leave) - only if churn mode allows leaving
    const churnMode = config.churnMode ?? 'mixed';
    const canLeave = churnMode === 'leaving' || churnMode === 'mixed';
    if (canLeave && config.churnRate && Math.random() < (config.churnRate * (checkInterval / 1000))) {
      // Store peer info before removing (for potential rejoin)
      const peerBrowser = peerBrowserRegistry.get(peer.id);
      if (peerBrowser) {
        peerBrowser.stopUptimeTracking();
      }
      
      // Store peer in churned registry (keep properties for rejoining)
      churnedPeersRegistry.set(peer.id, {
        peer: { ...peer }, // Copy peer properties
        churnTime: Date.now(),
      });
      
      // Clean up: remove peer from active registries
      fileRegistry.forEach((peerSet) => {
        peerSet.delete(peer.id);
      });
      peerRegistry.delete(peer.id);
      peerBrowserRegistry.delete(peer.id);
      
      onChurn();
      return; // Peer leaves
    }

    // Probability-based request: check if peer should make a request this cycle
    const shouldRequest = Math.random() < probabilityPerCheck;
    
    if (shouldRequest) {
      // Check if peer already has the file
      if (peer.files.has(fileHash)) {
        // Peer already has file - serve from local cache (not counted as peer-to-peer hit)
        const requestStart = Date.now();
        const latency = peer.latency * 0.05; // Local cache is very fast
        await new Promise((resolve) => setTimeout(resolve, latency));

        // Track metrics
        requestMetrics.push({
          timestamp: requestStart,
          latency,
          source: 'local-cache',
          peerId: peer.id,
          peerBandwidthTier: getBandwidthTier(peer.bandwidth),
          successful: true,
          isAnchor: peer.isAnchor,
        });

        // Only report to server stats if using local server
        // Skip for external URLs
        // Fire-and-forget to avoid blocking simulation
        const isExternalUrl = config.targetFile.startsWith('http://') || config.targetFile.startsWith('https://');
        if (!isExternalUrl) {
          // Non-blocking: don't await to avoid slowing simulation
          fetch(`${getServerUrl()}/api/cache-hit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).catch(() => {}); // Silently fail if server unavailable
        }

        peer.localCacheHits++;
        peer.requestCount++;
    } else {
      // Peer needs the file - try P2P via WebRTC first, then origin
      // If baseline mode is enabled, skip P2P and go directly to origin
      if (config.baselineMode) {
        await requestFromOrigin(peer, config, fileHash);
      } else {
        const peerBrowser = peerBrowserRegistry.get(peer.id);
        if (!peerBrowser) {
          // Fallback if PeerBrowser not available
          await requestFromOrigin(peer, config, fileHash);
          return;
        }

      // Update peer browser's knowledge of other peers
      // Sync peer index with current state
      await updatePeerBrowserConnections(peer.id, peerBrowser);

      // Try to get file using PeerBrowser (which uses WebRTC)
      // Pass the actual file path for origin fallback
      const transferStart = Date.now();
      
      // Update peer connections and manifests before requesting
      // This ensures peer knows about other peers and their cached files
      await updatePeerBrowserConnections(peer.id, peerBrowser);
      
      // Introduce realistic P2P failure probability based on network conditions
      // Higher latency and lower bandwidth peers have higher failure rates
      // Per report: "We will improve our simulations by adding simulated network 
      // connection failures during peer requests based on the bandwidth of an 
      // individual peer and the density of the network"
      const baseFailureRate = 0.10; // 10% base failure rate (more realistic than 15%)
      const latencyFactor = Math.min(peer.latency / 250, 0.25); // Up to 25% more for high latency
      const bandwidthFactor = Math.max((100 - peer.bandwidth) / 400, 0); // Up to 25% more for low bandwidth
      const networkDensity = Math.min(peerRegistry.size / 50, 1); // Density factor (more peers = more congestion)
      const densityFactor = networkDensity * 0.15; // Up to 15% more for dense networks
      const p2pFailureRate = Math.min(
        baseFailureRate + latencyFactor + bandwidthFactor + densityFactor, 
        0.5
      ); // Max 50% failure
      
      // Check if P2P attempt should fail (simulating network issues)
      const p2pShouldFail = Math.random() < p2pFailureRate;
      
      let transferFromPeer: string | undefined;
      try {
        if (p2pShouldFail) {
          // Simulate P2P failure due to network conditions
          throw new Error('P2P transfer failed due to network conditions');
        }
        
        // Find which peer has the file (for tracking)
        const peersWithFile = findPeersWithFile(fileHash);
        if (peersWithFile.length > 0) {
          transferFromPeer = peersWithFile[0].id; // Best peer (highest reputation)
        }
        
        const resource = await peerBrowser.requestResource(fileHash, config.targetFile);
        const transferEnd = Date.now();
        const transferLatency = transferEnd - transferStart;

        if (resource) {
          // WebRTC transfer succeeded!
          // Track which peer served the file (for metrics)
          if (transferFromPeer) {
            const sourcePeer = peerRegistry.get(transferFromPeer);
            if (sourcePeer) {
              sourcePeer.uploadsServed++; // Track successful upload
              updatePeerRole(sourcePeer); // Update reputation based on new upload count
            }
          }

          // Track metrics for successful P2P transfer
          requestMetrics.push({
            timestamp: transferStart,
            latency: transferLatency,
            source: 'peer-cache',
            peerId: peer.id,
            peerBandwidthTier: getBandwidthTier(peer.bandwidth),
            successful: true,
            isAnchor: peer.isAnchor,
          });

          transferEvents.push({
            fromPeer: transferFromPeer || 'unknown',
            toPeer: peer.id,
            fileHash,
            timestamp: transferStart,
            successful: true,
          });

          // Update peer stats
          registerFile(peer.id, fileHash);

          // Only report to server stats if using local server
          // Skip for external URLs
          // Fire-and-forget to avoid blocking simulation
          const isExternalUrl = config.targetFile.startsWith('http://') || config.targetFile.startsWith('https://');
          if (!isExternalUrl) {
            // Non-blocking: don't await to avoid slowing simulation
            fetch(`${getServerUrl()}/api/cache-hit`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            }).catch(() => {}); // Silently fail if server unavailable
          }

          peer.cacheHits++;
          peer.requestCount++;
        } else {
          // WebRTC failed (no peers have it or connection issues), try origin
          requestMetrics.push({
            timestamp: transferStart,
            latency: transferLatency,
            source: 'peer-cache',
            peerId: peer.id,
            peerBandwidthTier: getBandwidthTier(peer.bandwidth),
            successful: false,
            isAnchor: peer.isAnchor,
          });
          await requestFromOrigin(peer, config, fileHash, transferStart);
        }
      } catch (error) {
        // WebRTC transfer error, try origin
        const transferEnd = Date.now();
        const transferLatency = transferEnd - transferStart;
        requestMetrics.push({
          timestamp: transferStart,
          latency: transferLatency,
          source: 'peer-cache',
          peerId: peer.id,
          peerBandwidthTier: getBandwidthTier(peer.bandwidth),
          successful: false,
          isAnchor: peer.isAnchor,
        });
        // Check if failure was due to chunk loss (error message might indicate this)
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isChunkFailure = errorMessage.includes('chunk') || errorMessage.includes('timeout');
        
        // Get file size to calculate chunks
        const fileSizeBytes = config.fileSizeBytes || 10000;
        const CHUNK_SIZE = 16 * 1024; // 16KB
        const totalChunks = Math.ceil(fileSizeBytes / CHUNK_SIZE);
        
        transferEvents.push({
          fromPeer: transferFromPeer || 'unknown',
          toPeer: peer.id,
          fileHash,
          timestamp: transferStart,
          successful: false,
          chunkFailure: isChunkFailure && totalChunks > 1,
          totalChunks: totalChunks > 1 ? totalChunks : undefined,
        });
        await requestFromOrigin(peer, config, fileHash, transferStart);
      }
      }
    }
    }

    // Update peer uptime (increases as simulation progresses)
    const peerBrowser = peerBrowserRegistry.get(peer.id);
    if (peerBrowser) {
      peerBrowser.updateUptime();
      // Sync uptime from PeerBrowser to PeerProperties
      const peerInfo = peerBrowser.getPeerInfo();
      peer.uptime = peerInfo.uptime;
    } else {
      // Manual uptime calculation if PeerBrowser not available
      const currentTime = Date.now();
      peer.uptime = Math.floor((currentTime - peer.startTime) / 1000);
    }

    // Update peer role periodically based on current reputation
    updatePeerRole(peer);
    
    // Record reputation snapshot every 2 seconds (throttled to avoid performance impact)
    // Only record if peer has been active (has requests or uploads)
    if (peer.requestCount > 0 || peer.uploadsServed > 0) {
      const currentTime = Date.now();
      const lastSnapshot = reputationHistory.get(peer.id);
      // Throttle: only record every 2 seconds max, and skip if no changes
      if (!lastSnapshot || lastSnapshot.length === 0) {
        // First snapshot
        recordReputationSnapshot(peer, currentTime);
      } else {
        const last = lastSnapshot[lastSnapshot.length - 1];
        const timeSinceLast = currentTime - last.timestamp;
        // Only record if 2+ seconds passed AND reputation changed significantly (>1%)
        const repChanged = Math.abs(peer.reputation - last.reputation) > (last.reputation * 0.01);
        if (timeSinceLast >= 2000 && repChanged) {
          recordReputationSnapshot(peer, currentTime);
        }
      }
    }

    // Wait before next check cycle
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
}

/**
 * Request file from origin server when P2P transfer is not possible
 * Called when no peers have the file or P2P transfer failed
 * Registers file in cache after successful fetch
 * @param peer - Peer requesting the file
 * @param config - Simulation configuration
 * @param fileHash - Hash of file being requested
 */
// Global server overload tracking for baseline mode
let serverConcurrentRequests = 0;
let serverRequestQueue: Array<() => void> = [];
const SERVER_MAX_CONCURRENT = 30; // Realistic server capacity (much lower for flash crowds)
const SERVER_BASE_LATENCY = 20; // Base processing latency (ms)
const SERVER_QUEUE_DELAY = 5; // Base queuing delay per request in queue (ms)

async function requestFromOrigin(
  peer: PeerProperties,
  config: SimulationConfig,
  fileHash: string,
  requestStart?: number
): Promise<void> {
  try {
    const startTime = requestStart || Date.now();

    // If baseline mode, simulate server overload realistically
    if (config.baselineMode) {
      // Simulate server queuing and overload
      serverConcurrentRequests++;
      const queuePosition = Math.max(0, serverConcurrentRequests - SERVER_MAX_CONCURRENT);
      
      // Calculate server latency based on overload
      // Base latency + queuing delay + overload degradation
      const capacityRatio = serverConcurrentRequests / SERVER_MAX_CONCURRENT;
      let serverLatency = SERVER_BASE_LATENCY;
      
      // Queuing delay: each request beyond capacity waits
      const queueDelay = queuePosition * SERVER_QUEUE_DELAY;
      
      // Server degradation: exponential increase under load
      if (capacityRatio > 1.5) {
        // Severely overloaded: exponential degradation
        serverLatency = SERVER_BASE_LATENCY * Math.pow(2, capacityRatio - 1.5) + queueDelay;
        // High failure rate when severely overloaded
        if (Math.random() < 0.4) {
          serverConcurrentRequests--;
          const timeoutLatency = 10000; // 10 second timeout
          requestMetrics.push({
            timestamp: startTime,
            latency: timeoutLatency,
            source: 'origin',
            peerId: peer.id,
            peerBandwidthTier: getBandwidthTier(peer.bandwidth),
            successful: false,
            isAnchor: peer.isAnchor,
          });
          peer.cacheMisses++;
          peer.requestCount++;
          return;
        }
      } else if (capacityRatio > 1.0) {
        // Overloaded: linear degradation + queuing
        serverLatency = SERVER_BASE_LATENCY * (1 + (capacityRatio - 1.0) * 3) + queueDelay;
        // Some failures when overloaded
        if (Math.random() < 0.15) {
          serverConcurrentRequests--;
          const timeoutLatency = 5000; // 5 second timeout
          requestMetrics.push({
            timestamp: startTime,
            latency: timeoutLatency,
            source: 'origin',
            peerId: peer.id,
            peerBandwidthTier: getBandwidthTier(peer.bandwidth),
            successful: false,
            isAnchor: peer.isAnchor,
          });
          peer.cacheMisses++;
          peer.requestCount++;
          return;
        }
      } else if (capacityRatio > 0.7) {
        // High load: moderate degradation
        serverLatency = SERVER_BASE_LATENCY * (1 + (capacityRatio - 0.7) * 2) + queueDelay;
      } else {
        // Normal load: just base latency + small queuing if any
        serverLatency = SERVER_BASE_LATENCY + queueDelay;
      }
      
      // Total latency = network latency + server processing + queuing
      const totalLatency = peer.latency + serverLatency;
      
      // Simulate request processing time
      await new Promise((resolve) => setTimeout(resolve, Math.min(totalLatency, 15000)));
      
      serverConcurrentRequests--;
      
      // Track metrics
      requestMetrics.push({
        timestamp: startTime,
        latency: totalLatency,
        source: 'origin',
        peerId: peer.id,
        peerBandwidthTier: getBandwidthTier(peer.bandwidth),
        successful: true,
        isAnchor: peer.isAnchor,
      });
      
      // Register that peer now has the file
      registerFile(peer.id, fileHash);
      
      // Also cache in PeerBrowser so it can serve to other peers (even in baseline mode for consistency)
      const peerBrowser = peerBrowserRegistry.get(peer.id);
      if (peerBrowser) {
        // For baseline mode, we still need to simulate having the file content
        // Use a dummy content since we're not actually fetching
        const encoder = new TextEncoder();
        const dummyContent = 'baseline-mode-file-content';
        const buffer = encoder.encode(dummyContent).buffer;
        
        const cache = (peerBrowser as any).cache;
        if (cache) {
          cache.set(fileHash, {
            content: buffer,
            mimeType: 'text/plain',
            timestamp: Math.floor(Date.now() / 1000),
          });
        }
      }
      
      peer.cacheMisses++;
      peer.requestCount++;
      return;
    }

    // Normal mode: actual fetch (for non-baseline simulations)
    // Handle both absolute URLs and relative paths
    const targetUrl =
      config.targetFile.startsWith('http://') || config.targetFile.startsWith('https://')
        ? config.targetFile
        : `${getServerUrl()}${config.targetFile}`;

    const response = await fetch(targetUrl);
    if (response.ok) {
      const content = await response.text();
      const mimeType = response.headers.get('content-type') || 'text/plain';
      const actualLatency = Date.now() - startTime;

      // Track metrics for origin request
      requestMetrics.push({
        timestamp: startTime,
        latency: actualLatency,
        source: 'origin',
        peerId: peer.id,
        peerBandwidthTier: getBandwidthTier(peer.bandwidth),
        successful: true,
        isAnchor: peer.isAnchor,
      });

      // Register that peer now has the file (for future P2P transfers)
      registerFile(peer.id, fileHash);

      // Also cache in PeerBrowser so it can serve to other peers
      const peerBrowser = peerBrowserRegistry.get(peer.id);
      if (peerBrowser) {
        // Convert content to ArrayBuffer for PeerBrowser cache
        const encoder = new TextEncoder();
        const buffer = encoder.encode(content).buffer;

        // Access private cache to store resource
        const cache = (peerBrowser as any).cache;
        if (cache) {
          const cacheEntry = {
            content: buffer,
            mimeType: mimeType,
            timestamp: Math.floor(Date.now() / 1000),
          };
          cache.set(fileHash, cacheEntry);
          
          // Verify the cache entry was actually stored
          const verifyCache = cache.get(fileHash);
          if (!verifyCache) {
            console.error(`Failed to cache file ${fileHash} for peer ${peer.id}`);
          }
          
          // Immediately update manifest so other peers know this peer has the file
          // This fixes the issue where peers claim to have a file in their manifest
          // but can't serve it because the manifest wasn't updated after caching
          await peerBrowser.getManifest();
          
          // Verify the manifest includes the file
          const manifest = (peerBrowser as any).cacheManifest;
          const hasFileInManifest = manifest?.resources?.some((r: any) => r.resourceHash === fileHash);
          if (!hasFileInManifest) {
            console.warn(`File ${fileHash} cached but not in manifest for peer ${peer.id}`);
          }
          
          // Also immediately update peer connections so other peers see the updated manifest
          // This ensures that when other peers call updatePeerBrowserConnections,
          // they'll see this peer's updated manifest with the new file
          await updatePeerBrowserConnections(peer.id, peerBrowser);
        }
      }

      // Report cache miss to server for statistics (only for local server)
      // Skip for external URLs
      // Fire-and-forget to avoid blocking simulation
      const isExternalUrl = config.targetFile.startsWith('http://') || config.targetFile.startsWith('https://');
      if (!isExternalUrl) {
        // Non-blocking: don't await to avoid slowing simulation
        fetch(`${getServerUrl()}/api/cache-miss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => {}); // Silently fail if server unavailable
      }

      peer.cacheMisses++; // Track origin requests
      peer.requestCount++;
    } else {
      // Failed origin request
      const actualLatency = Date.now() - startTime;
      requestMetrics.push({
        timestamp: startTime,
        latency: actualLatency,
        source: 'origin',
        peerId: peer.id,
        peerBandwidthTier: getBandwidthTier(peer.bandwidth),
        successful: false,
        isAnchor: peer.isAnchor,
      });
      peer.cacheMisses++;
      peer.requestCount++;
    }
  } catch (error) {
    // Track failed request
    const actualLatency = Date.now() - (requestStart || Date.now());
    requestMetrics.push({
      timestamp: requestStart || Date.now(),
      latency: actualLatency || 5000, // Timeout latency
      source: 'origin',
      peerId: peer.id,
      peerBandwidthTier: getBandwidthTier(peer.bandwidth),
      successful: false,
      isAnchor: peer.isAnchor,
    });
    peer.cacheMisses++;
    peer.requestCount++;
  }
}

/**
 * Calculate Jain's fairness index for load distribution
 * Measures how evenly uploads (workload) are distributed among peers
 * Per report: should reflect actual load distribution, not just requests received
 * Returns 1.0 for perfect fairness, lower values indicate imbalance
 * @param peers - Array of peers to analyze
 * @returns Fairness index between 0 and 1
 */
function calculateJainFairnessIndex(peers: PeerProperties[]): number {
  if (peers.length === 0) return 0;

  // Use uploadsServed as the workload metric (serving files to other peers)
  // This better reflects the actual distribution of work, not just requests made
  // Per report: "we will add another evaluation metric that divides the peers 
  // into groups based on bandwidth and compares the average number of requests within each group"
  const uploads = peers.map((p) => p.uploadsServed); // Uploads served per peer
  const sum = uploads.reduce((a, b) => a + b, 0); // Total uploads
  const sumSquares = uploads.reduce((a, b) => a + b * b, 0); // Sum of squares

  if (sum === 0) return 0; // No uploads - undefined fairness
  // Jain's formula: (sum^2) / (n * sum_squares)
  // Perfect fairness = 1.0 (all peers serve equal number of uploads)
  // Lower values = imbalanced workload (some peers serve many more uploads)
  return (sum * sum) / (peers.length * sumSquares);
}

/**
 * Calculate average network latency across all peers
 * Simple mean of peer latencies
 * @param peers - Array of peers to analyze
 * @returns Average latency in milliseconds
 */
function calculateAvgLatency(peers: PeerProperties[]): number {
  if (peers.length === 0) return 0;
  const total = peers.reduce((sum, p) => sum + p.latency, 0);
  return total / peers.length; // Simple mean
}

/**
 * Run flash crowd simulation
 * Main simulation function that orchestrates peer behavior
 * Supports both flash crowd (staggered joins) and normal (simultaneous) modes
 * @param config - Simulation configuration parameters
 * @returns SimulationResults with metrics and event logs
 */
export async function runFlashCrowdSimulation(
  config: SimulationConfig
): Promise<SimulationResults> {
  // Clear previous simulation state
  // Important for running multiple simulations in sequence
  fileRegistry.clear();
  peerRegistry.clear();
  peerBrowserRegistry.clear();
  churnedPeersRegistry.clear(); // Clear churned peers
  requestMetrics.length = 0; // Clear request metrics
  reputationHistory.clear(); // Clear reputation history
  MockMicroCloudClient.clearAllRooms(); // Clear mock WebRTC message bus
  
  // Reset server overload tracking for baseline mode
  serverConcurrentRequests = 0;
  serverRequestQueue = [];

  // Track simulation state
  const peers: PeerProperties[] = [];
  let churnedPeers = 0;
  const joinEvents: PeerJoinEvent[] = []; // Record all peer joins
  const transferEvents: FileTransferEvent[] = []; // Record all file transfers

  // Get file hash and size for tracking
  // Handle both absolute URLs and relative paths
  const targetUrl =
    config.targetFile.startsWith('http://') || config.targetFile.startsWith('https://')
      ? config.targetFile
      : `${getServerUrl()}${config.targetFile}`;

  let fileHash: string;
  let fileSizeBytes = config.fileSizeBytes ?? 10000; // Use config override or default estimate

  // For external URLs, always use URL as hash (content may change)
  // For local files, fetch to get size and hash
  const isExternalUrl = config.targetFile.startsWith('http://') || config.targetFile.startsWith('https://');
  
  if (isExternalUrl) {
    // External URL: use URL as hash key
    fileHash = sha256Sync(targetUrl);
    // Try to get file size, but don't fail if we can't
    if (!config.fileSizeBytes) {
      try {
        const response = await fetch(targetUrl);
        if (response.ok) {
          const content = await response.text();
          fileSizeBytes = Buffer.byteLength(content, 'utf8');
        }
      } catch (error) {
        // Use default size if we can't fetch
      }
    }
  } else {
    // Local file: fetch to get actual hash and size (unless overridden)
    if (!config.fileSizeBytes) {
      try {
        const response = await fetch(targetUrl);
        if (response.ok) {
          const content = await response.text();
          // Calculate actual size in bytes
          fileSizeBytes = Buffer.byteLength(content, 'utf8');
          fileHash = await getFileHash(targetUrl);
        } else {
          // Fallback: hash the URL (use full hash)
          fileHash = sha256Sync(targetUrl);
        }
      } catch (error) {
        // Fallback if fetch fails (server might not be running in tests)
        fileHash = sha256Sync(targetUrl);
      }
    } else {
      // Use configured file size, still need to hash the file
      try {
        const response = await fetch(targetUrl);
        if (response.ok) {
          fileHash = await getFileHash(targetUrl);
        } else {
          fileHash = sha256Sync(targetUrl);
        }
      } catch (error) {
        fileHash = sha256Sync(targetUrl);
      }
    }
  }
  
  // Store file size in config for use in chunk failure tracking
  config.fileSizeBytes = fileSizeBytes;

  const startTime = Date.now();
  const joinRate = config.joinRate || 2; // Peers per second for flash crowd

  // Create all peers with varied properties
  // Peers are created upfront but may join at different times (flash crowd)
  for (let i = 0; i < config.numPeers; i++) {
    const peerId = `peer-${String(i + 1).padStart(3, '0')}`;
    let joinTime: number | undefined;

    if (config.flashCrowd) {
      // Flash crowd mode: peers join over time (staggered)
      // Simulates real-world scenario where users arrive gradually
      const joinDelay = (i / joinRate) * 1000; // milliseconds
      joinTime = startTime + joinDelay;
    } else {
      // Normal mode: all peers join simultaneously
      joinTime = startTime;
    }

    // Create peer with varied characteristics
    peers.push(createPeer(peerId, i, config.numPeers, joinTime, config));
  }

  // Track churn events
  const churnEvents: number[] = [];
  const rejoinEvents: PeerJoinEvent[] = [];
  const onChurn = () => {
    churnedPeers++;
    churnEvents.push(Date.now());
  };

  // Function to handle peer rejoining
  const handlePeerRejoin = async (churnedPeer: { peer: PeerProperties; churnTime: number }) => {
    const { peer: oldPeer } = churnedPeer;
    
    // Create new peer with same properties but reset some stats
    const newPeer = createPeer(
      oldPeer.id,
      peerRegistry.size, // Use current active peer count as index
      config.numPeers,
      Date.now(), // New join time
      config
    );
    
    // Restore some properties from before churn
    newPeer.bandwidth = oldPeer.bandwidth;
    newPeer.latency = oldPeer.latency;
    // Reset request/upload stats for fresh start
    newPeer.requestCount = 0;
    newPeer.uploadsServed = 0;
    newPeer.cacheHits = 0;
    newPeer.localCacheHits = 0;
    newPeer.cacheMisses = 0;
    
    // If peer had files before, they're lost (simulating cache cleared on disconnect)
    // But they can re-download from other peers
    
    // Add to peers array for tracking
    peers.push(newPeer);
    
    // Record rejoin event
    await simulatePeerJoin(newPeer, config, rejoinEvents);
    
    // Start peer simulation (add to promises so we wait for it)
    const rejoinPromise = simulatePeer(newPeer, config, fileHash, fileSizeBytes, transferEvents, onChurn);
    peerPromises.push(rejoinPromise);
  };

  // Start peers (with staggered joins for flash crowd)
  const peerPromises: Promise<void>[] = [];

  for (const peer of peers) {
    if (config.flashCrowd && peer.joinTime) {
      // Wait until join time, then join and start
      const joinPromise = (async () => {
        // Wait until it's time to join
        const waitTime = Math.max(0, peer.joinTime! - Date.now());
        if (waitTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }

        // Simulate joining the network
        await simulatePeerJoin(peer, config, joinEvents);

        // Start peer simulation
        await simulatePeer(peer, config, fileHash, fileSizeBytes, transferEvents, onChurn);
      })();
      peerPromises.push(joinPromise);
    } else {
      // Immediate join and start
      const startPromise = (async () => {
        await simulatePeerJoin(peer, config, joinEvents);
        await simulatePeer(peer, config, fileHash, fileSizeBytes, transferEvents, onChurn);
      })();
      peerPromises.push(startPromise);
    }
  }

  // Start rejoin monitoring (peers can rejoin after churning)
  // Only allow rejoins if churn mode allows joining
  const churnMode = config.churnMode ?? 'mixed';
  const canJoin = churnMode === 'joining' || churnMode === 'mixed';
  const rejoinRate = canJoin ? (config.rejoinRate ?? (config.churnRate ? config.churnRate * 0.5 : 0)) : 0;
  let rejoinCheckInterval: NodeJS.Timeout | null = null;
  
  if (canJoin && config.churnRate && rejoinRate > 0) {
    // Only start rejoin monitoring if churn is enabled and rejoin rate > 0
    rejoinCheckInterval = setInterval(() => {
      if (churnedPeersRegistry.size === 0) return;
      
      // Check each churned peer for potential rejoin
      const peersToRejoin: Array<{ peerId: string; data: { peer: PeerProperties; churnTime: number } }> = [];
      
      for (const [peerId, churnedData] of churnedPeersRegistry.entries()) {
        // Only allow rejoin if enough time has passed (at least 2 seconds)
        const timeSinceChurn = Date.now() - churnedData.churnTime;
        if (timeSinceChurn >= 2000 && Math.random() < rejoinRate) {
          peersToRejoin.push({ peerId, data: churnedData });
        }
      }
      
      // Process rejoins
      for (const { peerId, data } of peersToRejoin) {
        // Remove from churned registry before rejoining
        churnedPeersRegistry.delete(peerId);
        handlePeerRejoin(data).catch((err) => {
          console.error(`Error rejoining peer ${peerId}:`, err);
        });
      }
    }, 2000); // Check every 2 seconds to avoid too frequent checks
  }

  // Wait for all peers to complete
  await Promise.all(peerPromises);
  
  // Clean up rejoin monitoring
  if (rejoinCheckInterval) {
    clearInterval(rejoinCheckInterval);
  }
  
  const endTime = Date.now();

  // ===== Calculate Performance Metrics =====

  // Total requests across all peers during simulation
  const totalRequests = peers.reduce((sum, p) => sum + p.requestCount, 0);

  // Requests served by peers via P2P (peer-to-peer cache hits) - reduces origin server load
  const peerRequests = peers.reduce((sum, p) => sum + p.cacheHits, 0);

  // Requests served from local cache (don't count in peer-to-peer hit ratio)
  const localCacheRequests = peers.reduce((sum, p) => sum + p.localCacheHits, 0);

  // Requests to origin server (cache misses) - incurs server load
  const originRequests = peers.reduce((sum, p) => sum + p.cacheMisses, 0);

  // Cache hit ratio: percentage of ALL requests served from cache (local + P2P) vs origin
  // This is the more realistic metric showing overall caching effectiveness
  // const requestsNeedingNetwork = peerRequests + originRequests; // Requests that need network
  const requestsServedFromCache = localCacheRequests + peerRequests; // Requests served from cache
  
  // Calculate cache hit ratio as: cache requests / total requests
  // This shows how much we reduce load on origin server
  const cacheHitRatio = totalRequests > 0 
    ? (requestsServedFromCache / totalRequests) * 100 
    : 0;
  
  // P2P effectiveness ratio: of requests that need network (not local cache),
  // how many are served by P2P vs origin?
  // const p2pEffectiveness = requestsNeedingNetwork > 0
  //   ? (peerRequests / requestsNeedingNetwork) * 100
  //   : 0;

  // Bandwidth saved equals cache hit ratio (peers save that much bandwidth)
  const bandwidthSaved = cacheHitRatio;

  // Calculate average latency weighted by request count per peer
  // Per report: "We calculated the difference between the average latency without 
  // peer-to-peer caching and with µCloud's peer-to-peer caching"
  // P2P cache hits are faster (typically 10-20% of network latency due to proximity)
  // Local cache is very fast (5% of latency, near-instant)
  // Origin misses are slower (100-200% of latency due to server load and network distance)
  let totalLatencyWeighted = 0;
  let totalRequestsForLatency = 0;
  
  peers.forEach((peer) => {
    // Calculate latency for each type of request:
    // - Local cache: ~5% of base latency (near-instant, just memory access)
    // - P2P cache: ~10% of base latency (local network, no server round-trip)
    // - Origin server: ~150% of base latency (server processing + network distance)
    
    const localCacheLatency = peer.latency * 0.05;
    const p2pCacheLatency = peer.latency * 0.1;
    const originLatency = peer.latency * 1.5;
    
    // Weighted average latency for this peer
    const totalLatencyForPeer = 
      (peer.localCacheHits * localCacheLatency) +
      (peer.cacheHits * p2pCacheLatency) +
      (peer.cacheMisses * originLatency);
    
    totalLatencyWeighted += totalLatencyForPeer;
    totalRequestsForLatency += peer.requestCount;
  });

  // Overall average latency across all requests
  const avgLatency =
    totalRequestsForLatency > 0
      ? totalLatencyWeighted / totalRequestsForLatency
      : calculateAvgLatency(peers);

  // Calculate latency improvement: compare with all-origin baseline
  // If all requests went to origin server (no caching), what would latency be?
  const avgOriginLatency = peers.reduce((sum, p) => sum + p.latency * 1.5, 0) / Math.max(1, peers.length);
  
  // Latency improvement percentage = how much faster we are vs origin-only
  const latencyImprovement =
    avgOriginLatency > 0 && totalRequests > 0
      ? ((avgOriginLatency - avgLatency) / avgOriginLatency) * 100
      : 0;

  // Calculate Jain's fairness index: measures load distribution fairness
  // 1.0 = perfect fairness, lower values = more imbalance
  const jainFairnessIndex = calculateJainFairnessIndex(peers);

  // Calculate recovery speed after churn events (if any occurred)
  // Measures how quickly system recovers after peers leave
  let recoverySpeed: number | undefined;
  if (churnEvents.length > 0 && churnEvents.length < peers.length) {
    // const lastChurn = Math.max(...churnEvents);
    const recoveryWindow = 5000; // 5 seconds after churn to measure recovery
    const recoveryPeers = peers.filter((p) => p.requestCount > 0);

    // Estimate requests made during recovery window
    const recoveryRequests = recoveryPeers.reduce((sum, p) => {
      const requestsPerSecond = p.requestCount / config.duration;
      const recoveryRequests = requestsPerSecond * (recoveryWindow / 1000);
      return sum + recoveryRequests;
    }, 0);
    recoverySpeed = recoveryRequests / (recoveryWindow / 1000); // Requests per second
  }

  // Find all anchor nodes (high-reputation, stable peers)
  // Anchor nodes help with signaling and serve more requests
  const anchorNodes = peers.filter((p) => p.isAnchor).map((p) => p.id);

  // Calculate file propagation time: how long for file to spread to all peers
  // Measured from first successful transfer to last successful transfer
  let filePropagationTime: number | undefined;
  if (transferEvents.length > 0) {
    const successfulTransfers = transferEvents.filter((e) => e.successful);
    if (successfulTransfers.length > 0) {
      const firstTransfer = Math.min(...successfulTransfers.map((e) => e.timestamp));
      const lastTransfer = Math.max(...successfulTransfers.map((e) => e.timestamp));
      filePropagationTime = lastTransfer - firstTransfer; // Time in milliseconds
    }
  }

  // Calculate detailed propagation metrics
  let propagationMetrics: {
    timeTo50Percent: number;
    timeTo90Percent: number;
    timeTo100Percent: number;
    avgTimeToReceive: number;
    propagationRate: number;
    timeToFirstP2P: number;
    originLoadReduction: number;
  } | undefined;

  if (transferEvents.length > 0 && peers.length > 0) {
    const successfulTransfers = transferEvents.filter((e) => e.successful);
    
    if (successfulTransfers.length > 0) {
      // Track when each peer first received the file
      const peerReceiveTimes = new Map<string, number>(); // peerId -> timestamp when they first got file
      const firstOriginRequest = Math.min(
        ...requestMetrics
          .filter(m => m.source === 'origin' && m.successful)
          .map(m => m.timestamp)
      );
      
      // Process transfers chronologically to find when each peer got the file
      const sortedTransfers = [...successfulTransfers].sort((a, b) => a.timestamp - b.timestamp);
      const firstTransferTime = sortedTransfers[0].timestamp;
      
      for (const transfer of sortedTransfers) {
        // Record when the receiving peer got the file
        if (!peerReceiveTimes.has(transfer.toPeer)) {
          peerReceiveTimes.set(transfer.toPeer, transfer.timestamp);
        }
      }
      
      // Also include peers that got file from origin
      for (const metric of requestMetrics) {
        if (metric.source === 'origin' && metric.successful && !peerReceiveTimes.has(metric.peerId)) {
          peerReceiveTimes.set(metric.peerId, metric.timestamp);
        }
      }
      
      // Include peers that already had file (local cache hits at start)
      for (const peer of peers) {
        if (peer.files.has(fileHash) && !peerReceiveTimes.has(peer.id)) {
          // They had it from the start - use their join time as receive time (delay = 0)
          const joinTime = peer.joinTime || peer.startTime;
          peerReceiveTimes.set(peer.id, joinTime);
        }
      }
      
      const receiveTimes = Array.from(peerReceiveTimes.values()).sort((a, b) => a - b);
      const totalPeers = Math.max(peerReceiveTimes.size, peers.length);
      
      // Time to reach X% of peers
      const timeTo50Percent = receiveTimes.length >= Math.ceil(totalPeers * 0.5)
        ? receiveTimes[Math.ceil(totalPeers * 0.5) - 1] - firstTransferTime
        : receiveTimes.length > 0 ? receiveTimes[receiveTimes.length - 1] - firstTransferTime : 0;
      
      const timeTo90Percent = receiveTimes.length >= Math.ceil(totalPeers * 0.9)
        ? receiveTimes[Math.ceil(totalPeers * 0.9) - 1] - firstTransferTime
        : receiveTimes.length > 0 ? receiveTimes[receiveTimes.length - 1] - firstTransferTime : 0;
      
      const timeTo100Percent = receiveTimes.length > 0
        ? receiveTimes[receiveTimes.length - 1] - firstTransferTime
        : 0;
      
      // Average time from peer join to receiving file
      let avgTimeToReceive = 0;
      if (receiveTimes.length > 0) {
        let totalDelay = 0;
        let count = 0;
        for (const peer of peers) {
          const receiveTime = peerReceiveTimes.get(peer.id);
          if (receiveTime !== undefined) {
            const joinTime = peer.joinTime || peer.startTime;
            // Ensure receiveTime is at least joinTime (can't receive before joining)
            const actualReceiveTime = Math.max(receiveTime, joinTime);
            const delay = actualReceiveTime - joinTime;
            // Delay should always be >= 0, but double-check
            if (delay >= 0) {
              totalDelay += delay;
              count++;
            }
          }
        }
        avgTimeToReceive = count > 0 ? totalDelay / count : 0;
      }
      
      // Propagation rate: peers served per second during active propagation
      const propagationRate = timeTo100Percent > 0
        ? (receiveTimes.length / (timeTo100Percent / 1000))
        : 0;
      
      // Time to first P2P transfer (vs origin-only period)
      const firstP2PTransfer = successfulTransfers.find(t => t.fromPeer !== 'unknown' && t.fromPeer !== '');
      const timeToFirstP2P = firstP2PTransfer
        ? firstP2PTransfer.timestamp - firstOriginRequest
        : 0;
      
      // Origin load reduction: compare origin requests in first half vs second half of simulation
      const midTime = startTime + (endTime - startTime) / 2;
      const firstHalfOrigin = requestMetrics.filter(
        m => m.source === 'origin' && m.timestamp >= startTime && m.timestamp < midTime
      ).length;
      const secondHalfOrigin = requestMetrics.filter(
        m => m.source === 'origin' && m.timestamp >= midTime && m.timestamp <= endTime
      ).length;
      const originLoadReduction = firstHalfOrigin > 0
        ? ((firstHalfOrigin - secondHalfOrigin) / firstHalfOrigin) * 100
        : 0;
      
      propagationMetrics = {
        timeTo50Percent: Math.round(timeTo50Percent),
        timeTo90Percent: Math.round(timeTo90Percent),
        timeTo100Percent: Math.round(timeTo100Percent),
        avgTimeToReceive: Math.round(avgTimeToReceive),
        propagationRate: Math.round(propagationRate * 10) / 10,
        timeToFirstP2P: Math.round(timeToFirstP2P),
        originLoadReduction: Math.round(originLoadReduction * 10) / 10,
      };
    }
  }

  // Calculate latency percentiles from request metrics
  const successfulRequests = requestMetrics.filter(m => m.successful);
  const latencies = successfulRequests.map(m => m.latency).sort((a, b) => a - b);
  let latencyPercentiles: { p50: number; p75: number; p90: number; p95: number; p99: number } | undefined;
  if (latencies.length > 0) {
    latencyPercentiles = {
      p50: latencies[Math.floor(latencies.length * 0.5)] || 0,
      p75: latencies[Math.floor(latencies.length * 0.75)] || 0,
      p90: latencies[Math.floor(latencies.length * 0.90)] || 0,
      p95: latencies[Math.floor(latencies.length * 0.95)] || 0,
      p99: latencies[Math.floor(latencies.length * 0.99)] || 0,
    };
  }

  // Calculate latency metrics by node type (anchor vs transient)
  const anchorRequests = successfulRequests.filter(m => m.isAnchor);
  const transientRequests = successfulRequests.filter(m => !m.isAnchor);
  
  let latencyByNodeType: {
    anchor: { avgLatency: number; p5: number; p50: number; p95: number; p99: number; requestCount: number };
    transient: { avgLatency: number; p5: number; p50: number; p95: number; p99: number; requestCount: number };
  } | undefined;

  if (anchorRequests.length > 0 || transientRequests.length > 0) {
    const calculateNodeTypeMetrics = (requests: typeof successfulRequests) => {
      if (requests.length === 0) {
        return {
          avgLatency: 0,
          p5: 0,
          p50: 0,
          p95: 0,
          p99: 0,
          requestCount: 0,
        };
      }
      
      const sortedLatencies = requests.map(m => m.latency).sort((a, b) => a - b);
      const avgLatency = sortedLatencies.reduce((sum, lat) => sum + lat, 0) / sortedLatencies.length;
      
      return {
        avgLatency: Math.round(avgLatency * 10) / 10,
        p5: sortedLatencies[Math.floor(sortedLatencies.length * 0.05)] || 0,
        p50: sortedLatencies[Math.floor(sortedLatencies.length * 0.50)] || 0,
        p95: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
        p99: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0, // Worst-case
        requestCount: requests.length,
      };
    };

    latencyByNodeType = {
      anchor: calculateNodeTypeMetrics(anchorRequests),
      transient: calculateNodeTypeMetrics(transientRequests),
    };
  }

  // Generate time-series data
  const timeSeriesData: Array<{
    time: number;
    cacheHitRatio: number;
    avgLatency: number;
    originRequests: number;
    peerRequests: number;
  }> = [];
  if (requestMetrics.length > 0) {
    const startTime = Math.min(...requestMetrics.map(m => m.timestamp));
    const timeWindow = 1000; // 1 second windows
    const maxTime = Math.max(...requestMetrics.map(m => m.timestamp));
    
    for (let t = startTime; t <= maxTime; t += timeWindow) {
      const windowRequests = requestMetrics.filter(m => m.timestamp >= t && m.timestamp < t + timeWindow);
      if (windowRequests.length > 0) {
        const successful = windowRequests.filter(m => m.successful);
        const peerHits = successful.filter(m => m.source === 'peer-cache').length;
        const localHits = successful.filter(m => m.source === 'local-cache').length;
        const originReqs = successful.filter(m => m.source === 'origin').length;
        const total = windowRequests.length;
        const hitRatio = total > 0 ? ((peerHits + localHits) / total) * 100 : 0;
        const avgLat = successful.length > 0
          ? successful.reduce((sum, m) => sum + m.latency, 0) / successful.length
          : 0;
        
        timeSeriesData.push({
          time: (t - startTime) / 1000, // Convert to seconds
          cacheHitRatio: hitRatio,
          avgLatency: avgLat,
          originRequests: originReqs,
          peerRequests: peerHits,
        });
      }
    }
  }

  // Calculate per-tier metrics
  const perTierMetrics: {
    low: { requestsServed: number; avgLatency: number; cacheHitRatio: number };
    medium: { requestsServed: number; avgLatency: number; cacheHitRatio: number };
    high: { requestsServed: number; avgLatency: number; cacheHitRatio: number };
  } = {
    low: { requestsServed: 0, avgLatency: 0, cacheHitRatio: 0 },
    medium: { requestsServed: 0, avgLatency: 0, cacheHitRatio: 0 },
    high: { requestsServed: 0, avgLatency: 0, cacheHitRatio: 0 },
  };

  for (const tier of ['low', 'medium', 'high'] as const) {
    const tierRequests = requestMetrics.filter(m => m.peerBandwidthTier === tier && m.successful);
    const tierUploads = peers
      .filter(p => getBandwidthTier(p.bandwidth) === tier)
      .reduce((sum, p) => sum + p.uploadsServed, 0);
    
    perTierMetrics[tier].requestsServed = tierUploads;
    if (tierRequests.length > 0) {
      perTierMetrics[tier].avgLatency = tierRequests.reduce((sum, m) => sum + m.latency, 0) / tierRequests.length;
      const tierHits = tierRequests.filter(m => m.source === 'peer-cache' || m.source === 'local-cache').length;
      perTierMetrics[tier].cacheHitRatio = (tierHits / tierRequests.length) * 100;
    }
  }

  // Calculate chunk failure metrics
  const CHUNK_SIZE = 16 * 1024; // 16KB
  // Use the fileSizeBytes already calculated above (from config or fetched)
  const totalChunksPerFile = Math.ceil((config.fileSizeBytes || 10000) / CHUNK_SIZE);
  
  // Count chunk transfers and failures
  const multiChunkTransfers = transferEvents.filter(e => e.totalChunks && e.totalChunks > 1);
  const chunkFailures = transferEvents.filter(e => e.chunkFailure === true);
  const totalChunkTransfers = multiChunkTransfers.reduce((sum, e) => sum + (e.totalChunks || 0), 0);
  const chunkFailureRate = totalChunkTransfers > 0 
    ? (chunkFailures.length / multiChunkTransfers.length) * 100 
    : 0;
  const avgChunksPerFile = multiChunkTransfers.length > 0
    ? totalChunkTransfers / multiChunkTransfers.length
    : totalChunksPerFile;

  const chunkFailureMetrics = {
    totalChunkTransfers: multiChunkTransfers.length,
    chunkFailures: chunkFailures.length,
    chunkFailureRate: Math.round(chunkFailureRate * 10) / 10,
    avgChunksPerFile: Math.round(avgChunksPerFile * 10) / 10,
  };

  return {
    totalRequests,
    peerRequests,
    originRequests,
    cacheHitRatio,
    bandwidthSaved,
    avgLatency: Math.round(avgLatency),
    latencyImprovement: Math.max(0, Math.round(latencyImprovement * 10) / 10),
    jainFairnessIndex: Math.round(jainFairnessIndex * 1000) / 1000,
    recoverySpeed: recoverySpeed ? Math.round(recoverySpeed * 10) / 10 : undefined,
    peersSimulated: config.numPeers,
    duration: Math.round((endTime - startTime) / 100) / 10,
    peerJoinEvents: [...joinEvents, ...rejoinEvents].sort((a, b) => a.timestamp - b.timestamp),
    fileTransferEvents: transferEvents.sort((a, b) => a.timestamp - b.timestamp),
    anchorNodes,
    filePropagationTime,
    propagationMetrics,
    latencyPercentiles,
    latencyByNodeType,
    chunkFailureMetrics,
    timeSeriesData,
    perTierMetrics,
    allRequestMetrics: requestMetrics,
    // Convert Map to object only at the end (lazy conversion for performance)
    peerReputationHistory: reputationHistory.size > 0 ? Object.fromEntries(reputationHistory) : undefined,
  };
}
