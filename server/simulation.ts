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
  requestInterval: number; // ms
  churnRate?: number; // probability of peer leaving per cycle (0-1)
  flashCrowd?: boolean; // if true, peers join over time instead of all at once
  joinRate?: number; // peers per second for flash crowd (default: 2)
  anchorSignalingLatency?: number; // constant latency for joining via anchor node (ms, default: 100)
}

export interface PeerProperties {
  id: string;
  latency: number; // ms
  bandwidth: number; // Mbps
  uptime: number; // seconds
  startTime: number;
  joinTime?: number; // when this peer joined (for flash crowd)
  requestCount: number;
  cacheHits: number;
  cacheMisses: number;
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
  filePropagationTime?: number; // time for file to reach all peers (ms)
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

/**
 * Generate a peer with varied properties to simulate real-world heterogeneity
 * Each peer gets different latency, bandwidth, and uptime characteristics
 * @param peerId - Unique identifier for the peer
 * @param index - Position in the peer list (0-based)
 * @param totalPeers - Total number of peers in simulation
 * @param joinTime - Optional join time for flash crowd scenarios
 * @returns PeerProperties with varied characteristics
 */
function createPeer(
  peerId: string,
  index: number,
  totalPeers: number,
  joinTime?: number
): PeerProperties {
  // Vary latency based on position (early peers have better connections)
  // Early peers (low index) get lower latency, simulating better network conditions
  const baseLatency = 50 + (index / totalPeers) * 200; // Range: 50-250ms
  const latency = baseLatency + (Math.random() - 0.5) * 50; // Add randomness: ±25ms

  // Vary bandwidth randomly (10-100 Mbps)
  // Simulates different device capabilities and network conditions
  const bandwidth = 10 + Math.random() * 90;

  // Vary uptime (some peers are more stable than others)
  // Simulates different device reliability and user behavior
  const uptime = 30 + Math.random() * 270; // Range: 30-300 seconds

  // Initial reputation based on bandwidth and latency (early peers have higher rep)
  // Peers that join earlier and have better connections start with higher reputation
  const initialReputation = 100 - (index / totalPeers) * 50 + Math.random() * 20;

  const peer: PeerProperties = {
    id: peerId,
    latency: Math.max(10, Math.round(latency)),
    bandwidth: Math.round(bandwidth * 10) / 10,
    uptime: Math.round(uptime),
    startTime: joinTime || Date.now(),
    joinTime: joinTime || Date.now(),
    requestCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    isAnchor: initialReputation > 70, // Top ~30% become anchors initially
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
  const weights = { a: 1.0, b: 1.0, c: 1.0 };
  const peerBrowser = new PeerBrowser(
    peerId,
    peer.bandwidth,
    weights,
    60, // anchorThreshold
    mockClient as any // Cast to MicroCloudClient interface - PeerBrowser will wire up handlers
  );

  // Store in registry for later use
  peerBrowserRegistry.set(peerId, peerBrowser);

  // Join the peer to a shared room for simulation
  // All peers join the same room to enable P2P transfers
  mockClient.join('simulation-room').catch(() => {});

  return peer;
}

/**
 * Calculate reputation score for a peer based on multiple factors
 * Combines upload success rate, bandwidth, and uptime into a single score
 * Higher reputation = more reliable peer for caching and serving content
 * @param peer - Peer to calculate reputation for
 * @returns Reputation score (0-100 scale)
 */
function calculateReputation(peer: PeerProperties): number {
  // Calculate success rate (how often uploads succeed vs fail)
  // Default to 50% if no attempts yet (neutral)
  const successRate =
    peer.requestCount > 0
      ? peer.uploadsServed / Math.max(1, peer.uploadsServed + peer.requestCount)
      : 0.5;

  // Normalize bandwidth to 0-1 scale (assuming max 100 Mbps)
  const bandwidthNorm = peer.bandwidth / 100;

  // Normalize uptime to 0-1 scale (assuming max 300 seconds is "good")
  const uptimeNorm = Math.min(1, peer.uptime / 300);

  // Weighted combination: 40% success rate, 30% bandwidth, 30% uptime
  return successRate * 40 + bandwidthNorm * 30 + uptimeNorm * 30;
}

/**
 * Update peer role based on current reputation score
 * Peers with reputation > 60 become anchor nodes (stable, reliable)
 * @param peer - Peer to update role for
 */
function updatePeerRole(peer: PeerProperties) {
  peer.reputation = calculateReputation(peer);
  // Anchor nodes are high-reputation peers that can host signaling servers
  peer.isAnchor = peer.reputation > 60; // threshold for anchor status
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
 * @param peerId - ID of peer to update
 * @param peerBrowser - PeerBrowser instance to update
 */
async function updatePeerBrowserConnections(
  peerId: string,
  peerBrowser: PeerBrowser
): Promise<void> {
  // Get all other peers that have joined
  for (const [otherPeerId, otherPeerProps] of peerRegistry.entries()) {
    if (otherPeerId === peerId) continue;

    const otherPeerBrowser = peerBrowserRegistry.get(otherPeerId);
    if (!otherPeerBrowser) continue;

    // Ensure this peer knows about the other peer
    // Check if already in peer index by getting manifest
    try {
      await otherPeerBrowser.getManifest();
      const otherPeerInfo = otherPeerBrowser.getPeerInfo();

      // Add peer to index (PeerBrowser will handle duplicates)
      peerBrowser.addPeer(otherPeerBrowser);
    } catch (error) {
      // Ignore errors - peer might not be ready yet
    }
  }
}

/**
 * Get or create file hash for a file URL
 * Fetches the file and generates a SHA-256 hash (first 16 chars for readability)
 * Falls back to hashing the URL if fetch fails
 * @param fileUrl - URL of the file to hash
 * @returns Short hash string (16 characters)
 */
async function getFileHash(fileUrl: string): Promise<string> {
  try {
    const response = await fetch(fileUrl);
    if (response.ok) {
      const content = await response.text();
      // Hash the actual content (more accurate than URL hash)
      return sha256Sync(content).substring(0, 16); // First 16 chars for readability
    }
  } catch (error) {
    // Fallback: hash the URL if we can't fetch the content
    // This allows simulation to continue even if file is unavailable
  }
  return sha256Sync(fileUrl).substring(0, 16);
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

// Simulate a single peer requesting and downloading files
async function simulatePeer(
  peer: PeerProperties,
  config: SimulationConfig,
  fileHash: string,
  fileSizeBytes: number,
  transferEvents: FileTransferEvent[],
  onChurn: () => void
): Promise<void> {
  const startTime = peer.joinTime || Date.now();
  const endTime = startTime + config.duration * 1000;

  // Peer requests the file periodically
  while (Date.now() < endTime) {
    // Check if peer should churn (leave)
    if (config.churnRate && Math.random() < config.churnRate) {
      // Clean up: remove peer from file registry
      fileRegistry.forEach((peerSet, hash) => {
        peerSet.delete(peer.id);
      });
      peerRegistry.delete(peer.id);
      onChurn();
      return; // Peer leaves
    }

    // Check if peer already has the file
    if (peer.files.has(fileHash)) {
      // Peer already has file - serve from cache
      await new Promise((resolve) => setTimeout(resolve, peer.latency * 0.1));

      await fetch(`${getServerUrl()}/api/cache-hit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});

      peer.cacheHits++;
      peer.requestCount++;
    } else {
      // Peer needs the file - try P2P via WebRTC first, then origin
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
      try {
        const resource = await peerBrowser.requestResource(fileHash, config.targetFile);

        if (resource) {
          // WebRTC transfer succeeded!
          transferEvents.push({
            fromPeer: 'peer', // Source peer determined by PeerBrowser
            toPeer: peer.id,
            fileHash,
            timestamp: transferStart,
            successful: true,
          });

          // Update peer stats
          registerFile(peer.id, fileHash);

          await fetch(`${getServerUrl()}/api/cache-hit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).catch(() => {});

          peer.cacheHits++;
          peer.requestCount++;
        } else {
          // WebRTC failed, try origin
          await requestFromOrigin(peer, config, fileHash);
        }
      } catch (error) {
        // WebRTC transfer error, try origin
        transferEvents.push({
          fromPeer: 'peer',
          toPeer: peer.id,
          fileHash,
          timestamp: transferStart,
          successful: false,
        });
        await requestFromOrigin(peer, config, fileHash);
      }
    }

    // Update peer role periodically
    updatePeerRole(peer);

    // Wait for next cycle
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(peer.latency, config.requestInterval))
    );
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
async function requestFromOrigin(
  peer: PeerProperties,
  config: SimulationConfig,
  fileHash: string
): Promise<void> {
  try {
    const requestStart = Date.now();

    // Handle both absolute URLs and relative paths
    const targetUrl =
      config.targetFile.startsWith('http://') || config.targetFile.startsWith('https://')
        ? config.targetFile
        : `${getServerUrl()}${config.targetFile}`;

    const response = await fetch(targetUrl);
    if (response.ok) {
      const content = await response.text();
      const mimeType = response.headers.get('content-type') || 'text/plain';
      const actualLatency = Date.now() - requestStart;

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
          cache.set(fileHash, {
            content: buffer,
            mimeType: mimeType,
            timestamp: Math.floor(Date.now() / 1000),
          });
        }
      }

      // Report cache miss to server for statistics
      await fetch(`${getServerUrl()}/api/cache-miss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {}); // Ignore failures

      peer.cacheMisses++; // Track origin requests
      peer.requestCount++;
    }
  } catch (error) {
    // Ignore errors (server might not be running in tests)
    // In production, this would trigger retry logic or error handling
  }
}

/**
 * Calculate Jain's fairness index for load distribution
 * Measures how evenly requests are distributed among peers
 * Returns 1.0 for perfect fairness, lower values indicate imbalance
 * @param peers - Array of peers to analyze
 * @returns Fairness index between 0 and 1
 */
function calculateJainFairnessIndex(peers: PeerProperties[]): number {
  if (peers.length === 0) return 0;

  const requests = peers.map((p) => p.requestCount); // Request count per peer
  const sum = requests.reduce((a, b) => a + b, 0); // Total requests
  const sumSquares = requests.reduce((a, b) => a + b * b, 0); // Sum of squares

  if (sum === 0) return 0; // No requests - undefined fairness
  // Jain's formula: (sum^2) / (n * sum_squares)
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
  MockMicroCloudClient.clearAllRooms(); // Clear mock WebRTC message bus

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
  let fileSizeBytes = 10000; // Default estimate if fetch fails

  // Fetch file to get actual hash and size
  try {
    const response = await fetch(targetUrl);
    if (response.ok) {
      const content = await response.text();
      // Calculate actual size in bytes
      fileSizeBytes = Buffer.byteLength(content, 'utf8');
      fileHash = await getFileHash(targetUrl);
    } else {
      // Fallback: hash the URL
      fileHash = sha256Sync(targetUrl).substring(0, 16);
    }
  } catch (error) {
    // Fallback if fetch fails (server might not be running in tests)
    fileHash = sha256Sync(targetUrl).substring(0, 16);
  }

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
    peers.push(createPeer(peerId, i, config.numPeers, joinTime));
  }

  // Track churn events
  const churnEvents: number[] = [];
  const onChurn = () => {
    churnedPeers++;
    churnEvents.push(Date.now());
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

  // Wait for all peers to complete
  await Promise.all(peerPromises);
  const endTime = Date.now();

  // ===== Calculate Performance Metrics =====

  // Total requests across all peers during simulation
  const totalRequests = peers.reduce((sum, p) => sum + p.requestCount, 0);

  // Requests served by peers (cache hits) - reduces origin server load
  const peerRequests = peers.reduce((sum, p) => sum + p.cacheHits, 0);

  // Requests to origin server (cache misses) - incurs server load
  const originRequests = peers.reduce((sum, p) => sum + p.cacheMisses, 0);

  // Cache hit ratio: percentage of requests served by peers
  const cacheHitRatio = totalRequests > 0 ? (peerRequests / totalRequests) * 100 : 0;

  // Bandwidth saved equals cache hit ratio (peers save that much bandwidth)
  const bandwidthSaved = cacheHitRatio;

  // Calculate average latency weighted by request count per peer
  // Cache hits are much faster (10% of network latency) than misses (150% of latency)
  let totalLatencyWeighted = 0;
  let totalRequestsForLatency = 0;
  peers.forEach((peer) => {
    // Weighted average: cache hits (fast) vs misses (slow)
    const avgLatencyForPeer =
      (peer.cacheHits * peer.latency * 0.1 + peer.cacheMisses * (peer.latency * 1.5)) /
      Math.max(1, peer.requestCount);
    totalLatencyWeighted += avgLatencyForPeer * peer.requestCount;
    totalRequestsForLatency += peer.requestCount;
  });

  // Overall average latency across all requests
  const avgLatency =
    totalRequestsForLatency > 0
      ? totalLatencyWeighted / totalRequestsForLatency
      : calculateAvgLatency(peers);

  // Calculate latency improvement from caching
  // Shows how much faster the system is with peer caching vs without
  const avgLatencyWithoutCache = calculateAvgLatency(peers) * 1.5; // All requests to origin
  const avgLatencyWithCache = calculateAvgLatency(peers) * 0.1; // All from cache
  const latencyImprovement =
    totalRequests > 0 && avgLatencyWithoutCache > 0
      ? ((avgLatencyWithoutCache - avgLatency) / avgLatencyWithoutCache) * 100
      : 0;

  // Calculate Jain's fairness index: measures load distribution fairness
  // 1.0 = perfect fairness, lower values = more imbalance
  const jainFairnessIndex = calculateJainFairnessIndex(peers);

  // Calculate recovery speed after churn events (if any occurred)
  // Measures how quickly system recovers after peers leave
  let recoverySpeed: number | undefined;
  if (churnEvents.length > 0 && churnEvents.length < peers.length) {
    const lastChurn = Math.max(...churnEvents);
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
    peerJoinEvents: joinEvents.sort((a, b) => a.timestamp - b.timestamp),
    fileTransferEvents: transferEvents.sort((a, b) => a.timestamp - b.timestamp),
    anchorNodes,
    filePropagationTime,
  };
}
