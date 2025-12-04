/**
 * Baseline Simulation Implementations
 * 
 * Provides comparison baselines for µCloud evaluation:
 * 1. Origin-Only: All requests go directly to origin server
 * 2. CDN: Requests go through CDN edge locations
 * 3. DHT: Distributed hash table based P2P system
 */

import { SimulationConfig, PeerProperties, SimulationResults } from './simulation';

export interface BaselineConfig extends SimulationConfig {
  baselineType: 'origin-only' | 'cdn' | 'dht';
  // CDN-specific config
  cdnEdgeLocations?: number; // Number of edge locations (default: 3)
  cdnEdgeLatency?: number; // Latency to edge (ms, default: 30-50ms)
  // DHT-specific config
  dhtRoutingHops?: number; // Average routing hops (default: 2-4)
  dhtRehashCost?: number; // Latency penalty for rehashing (ms, default: 100-200ms)
}

/**
 * Origin-Only Baseline
 * Every request goes directly to origin server with no caching
 */
export async function runOriginOnlyBaseline(
  config: BaselineConfig
): Promise<SimulationResults> {
  const peers: PeerProperties[] = [];
  const startTime = Date.now();
  
  // Create peers (same as main simulation)
  for (let i = 0; i < config.numPeers; i++) {
    const peerId = `peer-${String(i + 1).padStart(3, '0')}`;
    const baseLatency = 50 + (i / config.numPeers) * 200;
    const latency = baseLatency + (Math.random() - 0.5) * 50;
    const bandwidth = 10 + Math.random() * 90;
    
    peers.push({
      id: peerId,
      latency: Math.max(10, Math.round(latency)),
      bandwidth: Math.round(bandwidth * 10) / 10,
      uptime: 30 + Math.random() * 270,
      startTime: startTime,
      requestCount: 0,
      cacheHits: 0,
      localCacheHits: 0,
      cacheMisses: 0,
      isAnchor: false,
      reputation: 0,
      files: new Set(),
      uploadsServed: 0,
    });
  }

  // Realistic server model with proper queuing
  // Real servers have: connection limits, request queues, processing delays, timeouts
  const serverBaseLatency = 20; // Base server processing latency (ms) - realistic for a good server
  const maxConcurrentRequests = config.flashCrowd ? 20 : 40; // Realistic capacity (lower for flash crowds)
  const maxQueueSize = 100; // Maximum requests that can wait in queue
  const requestTimeout = 30000; // 30 second timeout (realistic)
  
  // Server state tracking (using a lock-like mechanism for thread safety)
  let activeRequests = 0; // Currently processing requests
  const requestQueue: Array<{ resolve: () => void; startTime: number }> = []; // Queue of waiting requests
  const requestLatencies: number[] = [];
  const requestTimestamps: number[] = [];
  const requestMetrics: Array<{
    timestamp: number;
    latency: number;
    source: 'origin';
    peerId: string;
    peerBandwidthTier: 'low' | 'medium' | 'high';
    successful: boolean;
    isAnchor: boolean;
  }> = [];
  
  // Helper to get bandwidth tier
  const getBandwidthTier = (bandwidth: number): 'low' | 'medium' | 'high' => {
    if (bandwidth < 25) return 'low';
    if (bandwidth < 75) return 'medium';
    return 'high';
  };

  // Server processing function - simulates actual server behavior with proper queuing
  const processServerRequest = async (): Promise<{ latency: number; success: boolean }> => {
    const requestArrivalTime = Date.now();
    
    // Try to acquire server slot
    if (activeRequests >= maxConcurrentRequests) {
      // Server at capacity - check if queue is full
      if (requestQueue.length >= maxQueueSize) {
        // Queue full - request rejected (simulates "503 Service Unavailable" or connection refused)
        // In real servers, this happens immediately, so minimal latency
        return { latency: 10, success: false }; // Instant rejection with minimal overhead
      }
      
      // Wait in queue for server capacity
      const queueStartTime = Date.now();
      await new Promise<void>((resolve) => {
        requestQueue.push({ resolve, startTime: queueStartTime });
      });
      
      const queueWaitTime = Date.now() - queueStartTime;
      
      // Check if we timed out while waiting in queue
      if (queueWaitTime >= requestTimeout) {
        return { latency: requestTimeout, success: false };
      }
    }
    
    // Acquired server slot - start processing
    activeRequests++;
    
    // Calculate processing latency based on current load
    // Under 80% capacity: normal latency
    // Over 80%: degradation due to resource contention (CPU, memory, I/O)
    const loadRatio = activeRequests / maxConcurrentRequests;
    let processingLatency = serverBaseLatency;
    
    if (loadRatio > 0.8) {
      // Server under stress - resource contention causes slowdown
      // Linear degradation: 1.2x at 0.8, 1.5x at 0.9, 2x at 1.0
      processingLatency = serverBaseLatency * (1 + (loadRatio - 0.8) * 5);
    }
    
    // Simulate request processing time
    await new Promise((resolve) => setTimeout(resolve, processingLatency));
    
    // Request complete - release server slot
    activeRequests--;
    
    // Process next queued request if any (FIFO order)
    if (requestQueue.length > 0) {
      const nextRequest = requestQueue.shift()!;
      // Resolve the promise to let the next request proceed
      nextRequest.resolve();
    }
    
    const totalServerLatency = Date.now() - requestArrivalTime;
    return { latency: totalServerLatency, success: true };
  };

  // Simulate requests
  const requestPromises: Promise<void>[] = [];
  
  for (const peer of peers) {
    const peerPromise = (async () => {
      const endTime = startTime + config.duration * 1000;
      
      while (Date.now() < endTime) {
        // Check churn
        if (config.churnRate && Math.random() < config.churnRate) {
          return; // Peer leaves
        }

        const requestStart = Date.now();
        
        // Request from server (with proper queuing)
        const serverResult = await processServerRequest();
        
        if (serverResult.success) {
          // Total latency = network latency + server latency (queuing + processing)
          const totalLatency = peer.latency + serverResult.latency;
          requestLatencies.push(totalLatency);
          requestTimestamps.push(requestStart);
          
          // Track request metrics
          requestMetrics.push({
            timestamp: requestStart,
            latency: totalLatency,
            source: 'origin',
            peerId: peer.id,
            peerBandwidthTier: getBandwidthTier(peer.bandwidth),
            successful: true,
            isAnchor: false, // Baseline doesn't use anchors
          });
          
          peer.cacheMisses++;
          peer.requestCount++;
        } else {
          // Request failed (timeout or queue full)
          requestLatencies.push(requestTimeout);
          requestTimestamps.push(requestStart);
          
          // Track failed request metrics
          requestMetrics.push({
            timestamp: requestStart,
            latency: requestTimeout,
            source: 'origin',
            peerId: peer.id,
            peerBandwidthTier: getBandwidthTier(peer.bandwidth),
            successful: false,
            isAnchor: false,
          });
          
          peer.cacheMisses++;
          peer.requestCount++;
        }

        // Wait for next request (use probability-based if available, otherwise fallback)
        const requestProbability = (config as any).requestProbability ?? 
          (config.requestInterval ? Math.min(1.0, 1000 / config.requestInterval) : 0.5);
        const checkInterval = 100;
        const probabilityPerCheck = requestProbability * (checkInterval / 1000);
        const shouldRequest = Math.random() < probabilityPerCheck;
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }
    })();
    
    requestPromises.push(peerPromise);
  }

  await Promise.all(requestPromises);
  const endTime = Date.now();

  // Calculate metrics
  const totalRequests = peers.reduce((sum, p) => sum + p.requestCount, 0);
  const originRequests = peers.reduce((sum, p) => sum + p.cacheMisses, 0);
  const avgLatency = requestLatencies.length > 0
    ? requestLatencies.reduce((a, b) => a + b, 0) / requestLatencies.length
    : 0;

  // Calculate percentiles (including p5)
  const sortedLatencies = [...requestLatencies].sort((a, b) => a - b);
  const p5 = sortedLatencies[Math.floor(sortedLatencies.length * 0.05)] || 0;
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p75 = sortedLatencies[Math.floor(sortedLatencies.length * 0.75)] || 0;
  const p90 = sortedLatencies[Math.floor(sortedLatencies.length * 0.90)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

  // Calculate latency by node type (baseline doesn't distinguish anchor/transient, but we'll calculate for consistency)
  // For baseline, all peers are treated the same, but we can still calculate percentiles
  const successfulRequests = requestMetrics.filter(m => m.successful);
  const transientRequests = successfulRequests; // All requests are from "transient" peers in baseline (no anchors)
  
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
      p99: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0,
      requestCount: requests.length,
    };
  };

  const latencyByNodeType = {
    anchor: {
      avgLatency: 0,
      p5: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      requestCount: 0,
    },
    transient: calculateNodeTypeMetrics(transientRequests),
  };

  // Calculate worst-case metrics (P99 and worst-performing peer)
  let worstPerformingPeer: {
    id: string;
    latency: number;
    bandwidth: number;
    tier: 'low' | 'medium' | 'high';
    isAnchor: boolean;
    p99Latency: number;
  } | undefined;

  if (peers.length > 0 && requestMetrics.length > 0) {
    // Group requests by peer
    const peerLatencies = new Map<string, number[]>();
    for (const metric of requestMetrics) {
      if (!peerLatencies.has(metric.peerId)) {
        peerLatencies.set(metric.peerId, []);
      }
      peerLatencies.get(metric.peerId)!.push(metric.latency);
    }

    // Find peer with highest P99 latency
    let worstP99 = 0;
    let worstPeerId = '';
    for (const [peerId, latencies] of peerLatencies.entries()) {
      if (latencies.length > 0) {
        const sorted = [...latencies].sort((a, b) => a - b);
        const peerP99 = sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1] || 0;
        if (peerP99 > worstP99) {
          worstP99 = peerP99;
          worstPeerId = peerId;
        }
      }
    }

    if (worstPeerId) {
      const worstPeer = peers.find(p => p.id === worstPeerId);
      if (worstPeer) {
        worstPerformingPeer = {
          id: worstPeerId,
          latency: worstPeer.latency,
          bandwidth: worstPeer.bandwidth,
          tier: getBandwidthTier(worstPeer.bandwidth),
          isAnchor: false,
          p99Latency: Math.round(worstP99),
        };
      }
    }
  }

  return {
    totalRequests,
    peerRequests: 0, // No P2P in origin-only
    originRequests,
    cacheHitRatio: 0, // No caching
    bandwidthSaved: 0,
    avgLatency: Math.round(avgLatency),
    latencyImprovement: 0, // No improvement (this is the baseline)
    jainFairnessIndex: 0, // Not applicable
    peersSimulated: config.numPeers,
    duration: Math.round((endTime - startTime) / 100) / 10,
    peerJoinEvents: [],
    fileTransferEvents: [],
    anchorNodes: [],
    // Extended metrics
    latencyPercentiles: { p50, p75, p90, p95, p99 },
    latencyByNodeType,
    allRequestMetrics: requestMetrics,
    worstCaseMetrics: {
      p99Latency: Math.round(p99),
      worstPerformingPeer,
    },
    timeSeriesData: generateTimeSeries(requestTimestamps, requestLatencies),
  } as any;
}

/**
 * CDN Baseline
 * Requests go through CDN edge locations with caching
 */
export async function runCDNBaseline(
  config: BaselineConfig
): Promise<SimulationResults> {
  const peers: PeerProperties[] = [];
  const startTime = Date.now();
  const numEdges = config.cdnEdgeLocations || 3;
  const edgeLatency = config.cdnEdgeLatency || 40; // 30-50ms typical
  
  // Create edge locations
  const edgeLocations = Array.from({ length: numEdges }, (_, i) => ({
    id: `edge-${i + 1}`,
    cache: new Map<string, boolean>(), // fileHash -> hasCached
    latency: edgeLatency + (Math.random() - 0.5) * 10, // 30-50ms range
    concurrentRequests: 0,
  }));

  // Create peers and assign to edges (geographic distribution)
  const peerEdgeAssignments = new Map<string, string>(); // peerId -> edgeId
  for (let i = 0; i < config.numPeers; i++) {
    const peerId = `peer-${String(i + 1).padStart(3, '0')}`;
    const baseLatency = 50 + (i / config.numPeers) * 200;
    const latency = baseLatency + (Math.random() - 0.5) * 50;
    const bandwidth = 10 + Math.random() * 90;
    const assignedEdge = edgeLocations[i % numEdges]; // Round-robin assignment
    
    peers.push({
      id: peerId,
      latency: Math.max(10, Math.round(latency)),
      bandwidth: Math.round(bandwidth * 10) / 10,
      uptime: 30 + Math.random() * 270,
      startTime: startTime,
      requestCount: 0,
      cacheHits: 0,
      localCacheHits: 0,
      cacheMisses: 0,
      isAnchor: false,
      reputation: 0,
      files: new Set(),
      uploadsServed: 0,
    });
    // Store edge assignment
    peerEdgeAssignments.set(peerId, assignedEdge.id);
  }

  const requestLatencies: number[] = [];
  const requestTimestamps: number[] = [];
  const requestSources: ('edge-cache' | 'origin')[] = [];
  const fileHash = 'sample-file-hash'; // In real scenario, would hash actual file

  // Simulate requests
  const requestPromises: Promise<void>[] = [];
  
  for (const peer of peers) {
    const peerPromise = (async () => {
      const endTime = startTime + config.duration * 1000;
      const edgeId = peerEdgeAssignments.get(peer.id)!;
      const edge = edgeLocations.find(e => e.id === edgeId)!;
      
      while (Date.now() < endTime) {
        if (config.churnRate && Math.random() < config.churnRate) {
          return;
        }

        const requestStart = Date.now();
        edge.concurrentRequests++;
        
        // Check if edge has cached file
        const isCacheHit = edge.cache.has(fileHash);
        
        let totalLatency: number;
        let source: 'edge-cache' | 'origin';
        
        if (isCacheHit) {
          // Cache hit: fast edge response
          totalLatency = edge.latency + peer.latency * 0.1; // Edge is close
          source = 'edge-cache';
          peer.cacheHits++; // Count as cache hit
        } else {
          // Cache miss: first request hits origin, then caches at edge
          const originLatency = 100 + peer.latency * 1.5; // Origin is further
          totalLatency = edge.latency + originLatency;
          source = 'origin';
          edge.cache.set(fileHash, true); // Cache at edge for future requests
          peer.cacheMisses++;
        }
        
        await new Promise((resolve) => setTimeout(resolve, Math.min(totalLatency, 5000)));
        edge.concurrentRequests--;
        
        requestLatencies.push(totalLatency);
        requestTimestamps.push(requestStart);
        requestSources.push(source);
        peer.requestCount++;

        // Wait for next request (use probability-based if available, otherwise fallback)
        const requestProbability = (config as any).requestProbability ?? 
          (config.requestInterval ? Math.min(1.0, 1000 / config.requestInterval) : 0.5);
        const checkInterval = 100;
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }
    })();
    
    requestPromises.push(peerPromise);
  }

  await Promise.all(requestPromises);
  const endTime = Date.now();

  // Calculate metrics
  const totalRequests = peers.reduce((sum, p) => sum + p.requestCount, 0);
  const cacheHits = peers.reduce((sum, p) => sum + p.cacheHits, 0);
  const originRequests = peers.reduce((sum, p) => sum + p.cacheMisses, 0);
  const cacheHitRatio = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;
  const avgLatency = requestLatencies.length > 0
    ? requestLatencies.reduce((a, b) => a + b, 0) / requestLatencies.length
    : 0;

  const sortedLatencies = [...requestLatencies].sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p75 = sortedLatencies[Math.floor(sortedLatencies.length * 0.75)] || 0;
  const p90 = sortedLatencies[Math.floor(sortedLatencies.length * 0.90)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

  return {
    totalRequests,
    peerRequests: cacheHits, // CDN cache hits
    originRequests,
    cacheHitRatio,
    bandwidthSaved: cacheHitRatio,
    avgLatency: Math.round(avgLatency),
    latencyImprovement: 0,
    jainFairnessIndex: 0,
    peersSimulated: config.numPeers,
    duration: Math.round((endTime - startTime) / 100) / 10,
    peerJoinEvents: [],
    fileTransferEvents: [],
    anchorNodes: [],
    latencyPercentiles: { p50, p75, p90, p95, p99 },
    timeSeriesData: generateTimeSeries(requestTimestamps, requestLatencies),
  } as any;
}

/**
 * DHT Baseline
 * Distributed hash table based P2P system (like Chord/Kademlia)
 */
export async function runDHTBaseline(
  config: BaselineConfig
): Promise<SimulationResults> {
  const peers: PeerProperties[] = [];
  const startTime = Date.now();
  const avgRoutingHops = config.dhtRoutingHops || 3;
  const rehashCost = config.dhtRehashCost || 150;
  
  // Create peers (all treated equally in DHT)
  for (let i = 0; i < config.numPeers; i++) {
    const peerId = `peer-${String(i + 1).padStart(3, '0')}`;
    const baseLatency = 50 + (i / config.numPeers) * 200;
    const latency = baseLatency + (Math.random() - 0.5) * 50;
    const bandwidth = 10 + Math.random() * 90;
    
    peers.push({
      id: peerId,
      latency: Math.max(10, Math.round(latency)),
      bandwidth: Math.round(bandwidth * 10) / 10,
      uptime: 30 + Math.random() * 270,
      startTime: startTime,
      requestCount: 0,
      cacheHits: 0,
      localCacheHits: 0,
      cacheMisses: 0,
      isAnchor: false,
      reputation: 0,
      files: new Set(),
      uploadsServed: 0,
    });
  }

  // DHT: consistent hashing assigns files to specific peers
  const fileHash = 'sample-file-hash';
  const fileOwnerIndex = Math.floor(Math.random() * peers.length); // Random owner
  let fileOwner = peers[fileOwnerIndex];
  const fileRegistry = new Set<string>(); // Peers that have the file
  fileRegistry.add(fileOwner.id);

  const requestLatencies: number[] = [];
  const requestTimestamps: number[] = [];
  let churnCount = 0;

  // Simulate requests
  const requestPromises: Promise<void>[] = [];
  
  for (const peer of peers) {
    const peerPromise = (async () => {
      const endTime = startTime + config.duration * 1000;
      
      while (Date.now() < endTime) {
        // Check churn
        if (config.churnRate && Math.random() < config.churnRate) {
          // Peer leaves: trigger rehashing if it was the file owner
          if (fileOwner.id === peer.id) {
            // Rehash: find new owner (expensive operation)
            const remainingPeers = peers.filter(p => p.id !== peer.id);
            if (remainingPeers.length > 0) {
              fileOwner = remainingPeers[Math.floor(Math.random() * remainingPeers.length)];
              fileRegistry.clear();
              fileRegistry.add(fileOwner.id);
              churnCount++;
            }
          }
          return;
        }

        const requestStart = Date.now();
        
        // Check if peer already has file
        if (fileRegistry.has(peer.id)) {
          // Local cache hit
          const latency = peer.latency * 0.05;
          requestLatencies.push(latency);
          requestTimestamps.push(requestStart);
          peer.localCacheHits++;
          peer.requestCount++;
        } else {
          // Need to find file via DHT routing
          // DHT routing: multiple hops to find owner
          const routingHops = Math.floor(avgRoutingHops + (Math.random() - 0.5) * 2);
          const routingLatency = routingHops * (peer.latency * 0.3); // Each hop adds latency
          
          // Check if owner is still online (churn problem)
          const ownerStillOnline = peers.some(p => p.id === fileOwner.id);
          
          if (!ownerStillOnline) {
            // Owner left: need to rehash (expensive)
            const remainingPeers = peers.filter(p => p.id !== fileOwner.id && fileRegistry.has(p.id));
            if (remainingPeers.length > 0) {
              fileOwner = remainingPeers[0];
            } else {
              // No one has file: must fetch from origin
              const originLatency = peer.latency * 1.5 + 100;
              requestLatencies.push(originLatency + routingLatency + rehashCost);
              requestTimestamps.push(requestStart);
              peer.cacheMisses++;
              peer.requestCount++;
              fileRegistry.add(peer.id); // Peer now has file
              continue;
            }
          }
          
          // Transfer from owner (P2P)
          const transferLatency = Math.max(peer.latency, fileOwner.latency) * 0.2; // P2P transfer
          const totalLatency = routingLatency + transferLatency;
          
          await new Promise((resolve) => setTimeout(resolve, Math.min(totalLatency, 5000)));
          
          requestLatencies.push(totalLatency);
          requestTimestamps.push(requestStart);
          peer.cacheHits++;
          peer.requestCount++;
          fileRegistry.add(peer.id); // Peer now has file
          fileOwner.uploadsServed++;
        }

        // Wait for next request (use probability-based if available, otherwise fallback)
        const requestProbability = (config as any).requestProbability ?? 
          (config.requestInterval ? Math.min(1.0, 1000 / config.requestInterval) : 0.5);
        const checkInterval = 100;
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }
    })();
    
    requestPromises.push(peerPromise);
  }

  await Promise.all(requestPromises);
  const endTime = Date.now();

  // Calculate metrics
  const totalRequests = peers.reduce((sum, p) => sum + p.requestCount, 0);
  const peerRequests = peers.reduce((sum, p) => sum + p.cacheHits, 0);
  const localCacheRequests = peers.reduce((sum, p) => sum + p.localCacheHits, 0);
  const originRequests = peers.reduce((sum, p) => sum + p.cacheMisses, 0);
  const cacheHitRatio = totalRequests > 0
    ? ((localCacheRequests + peerRequests) / totalRequests) * 100
    : 0;
  const avgLatency = requestLatencies.length > 0
    ? requestLatencies.reduce((a, b) => a + b, 0) / requestLatencies.length
    : 0;

  // Fairness: DHT treats all peers equally (high fairness, but may overload weak peers)
  const uploads = peers.map(p => p.uploadsServed);
  const sum = uploads.reduce((a, b) => a + b, 0);
  const sumSquares = uploads.reduce((a, b) => a + b * b, 0);
  const jainFairness = sum > 0 ? (sum * sum) / (peers.length * sumSquares) : 0;

  const sortedLatencies = [...requestLatencies].sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p75 = sortedLatencies[Math.floor(sortedLatencies.length * 0.75)] || 0;
  const p90 = sortedLatencies[Math.floor(sortedLatencies.length * 0.90)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

  return {
    totalRequests,
    peerRequests,
    originRequests,
    cacheHitRatio,
    bandwidthSaved: cacheHitRatio,
    avgLatency: Math.round(avgLatency),
    latencyImprovement: 0,
    jainFairnessIndex: Math.round(jainFairness * 1000) / 1000,
    peersSimulated: config.numPeers,
    duration: Math.round((endTime - startTime) / 100) / 10,
    peerJoinEvents: [],
    fileTransferEvents: [],
    anchorNodes: [],
    latencyPercentiles: { p50, p75, p90, p95, p99 },
    timeSeriesData: generateTimeSeries(requestTimestamps, requestLatencies),
    churnEvents: churnCount,
  } as any;
}

/**
 * Generate time-series data from request timestamps and latencies
 */
function generateTimeSeries(
  timestamps: number[],
  latencies: number[]
): Array<{ time: number; latency: number; hitRatio?: number }> {
  if (timestamps.length === 0) return [];
  
  const startTime = Math.min(...timestamps);
  const timeWindow = 1000; // 1 second windows
  const timeSeries: Array<{ time: number; latency: number; hitRatio?: number }> = [];
  
  const maxTime = Math.max(...timestamps);
  for (let t = startTime; t <= maxTime; t += timeWindow) {
    const windowRequests = timestamps
      .map((ts, i) => ({ ts, latency: latencies[i] }))
      .filter(({ ts }) => ts >= t && ts < t + timeWindow);
    
    if (windowRequests.length > 0) {
      const avgLatency = windowRequests.reduce((sum, r) => sum + r.latency, 0) / windowRequests.length;
      timeSeries.push({
        time: (t - startTime) / 1000, // Convert to seconds
        latency: avgLatency,
      });
    }
  }
  
  return timeSeries;
}

