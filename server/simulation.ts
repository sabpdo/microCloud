/**
 * Flash Crowd Simulation Engine
 * 
 * Runs on the server side to simulate multiple peers with varied properties
 */

export interface SimulationConfig {
    numPeers: number;
    targetFile: string;
    duration: number; // seconds
    requestInterval: number; // ms
    churnRate?: number; // probability of peer leaving per cycle (0-1)
}

export interface PeerProperties {
    id: string;
    latency: number; // ms
    bandwidth: number; // Mbps
    uptime: number; // seconds
    startTime: number;
    requestCount: number;
    cacheHits: number;
    cacheMisses: number;
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
}

// Server URL will be determined at runtime
const getServerUrl = () => {
    return process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
};

// Generate peer with varied properties
function createPeer(peerId: string, index: number, totalPeers: number): PeerProperties {
    // Vary latency based on position (early peers have better connections)
    const baseLatency = 50 + (index / totalPeers) * 200; // 50-250ms
    const latency = baseLatency + (Math.random() - 0.5) * 50; // Add some randomness

    // Vary bandwidth (10-100 Mbps)
    const bandwidth = 10 + Math.random() * 90;

    // Vary uptime (some peers are more stable)
    const uptime = 30 + Math.random() * 270; // 30-300 seconds

    return {
        id: peerId,
        latency: Math.max(10, Math.round(latency)),
        bandwidth: Math.round(bandwidth * 10) / 10,
        uptime: Math.round(uptime),
        startTime: Date.now(),
        requestCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
    };
}

// Simulate a single peer
async function simulatePeer(
    peer: PeerProperties,
    config: SimulationConfig,
    onChurn: () => void
): Promise<void> {
    const startTime = Date.now();
    const endTime = startTime + config.duration * 1000;
    const cycleTime = 1000; // 1 second cycles

    while (Date.now() < endTime) {
        // Check if peer should churn (leave)
        if (config.churnRate && Math.random() < config.churnRate) {
            onChurn();
            return; // Peer leaves
        }

        // Simulate cache check (probability increases with time as more peers cache)
        const timeElapsed = (Date.now() - startTime) / 1000;
        const cacheProbability = Math.min(0.7, 0.1 + timeElapsed / config.duration * 0.6);
        const hasCache = Math.random() < cacheProbability;

        if (hasCache) {
            // Cache hit - peer serves from cache (lower latency)
            try {
                const requestStart = Date.now();
                // Simulate cache retrieval latency (much faster than origin)
                await new Promise(resolve => setTimeout(resolve, peer.latency * 0.1));

                await fetch(`${getServerUrl()}/api/cache-hit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                peer.cacheHits++;
                peer.requestCount++;
            } catch (error) {
                // Ignore errors
            }
        } else {
            // Cache miss - request from origin (higher latency)
            try {
                const requestStart = Date.now();
                const response = await fetch(`${getServerUrl()}${config.targetFile}`);
                if (response.ok) {
                    await response.text();
                    const actualLatency = Date.now() - requestStart;

                    await fetch(`${getServerUrl()}/api/cache-miss`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                    });
                    peer.cacheMisses++;
                    peer.requestCount++;
                }
            } catch (error) {
                // Ignore errors
            }
        }

        // Wait for next cycle (simulate network latency + interval)
        await new Promise(resolve =>
            setTimeout(resolve, Math.max(peer.latency, config.requestInterval))
        );
    }
}

// Calculate Jain's fairness index
function calculateJainFairnessIndex(peers: PeerProperties[]): number {
    if (peers.length === 0) return 0;

    const requests = peers.map(p => p.requestCount);
    const sum = requests.reduce((a, b) => a + b, 0);
    const sumSquares = requests.reduce((a, b) => a + b * b, 0);

    if (sum === 0) return 0;
    return (sum * sum) / (peers.length * sumSquares);
}

// Calculate average latency
function calculateAvgLatency(peers: PeerProperties[]): number {
    if (peers.length === 0) return 0;
    const total = peers.reduce((sum, p) => sum + p.latency, 0);
    return total / peers.length;
}

// Run flash crowd simulation
export async function runFlashCrowdSimulation(
    config: SimulationConfig
): Promise<SimulationResults> {
    const peers: PeerProperties[] = [];
    let churnedPeers = 0;

    // Create all peers
    for (let i = 0; i < config.numPeers; i++) {
        const peerId = `peer-${String(i + 1).padStart(3, '0')}`;
        peers.push(createPeer(peerId, i, config.numPeers));
    }

    // Track churn events
    const churnEvents: number[] = [];
    const onChurn = () => {
        churnedPeers++;
        churnEvents.push(Date.now());
    };

    // Start all peers simultaneously
    const startTime = Date.now();
    const peerPromises = peers.map(peer => simulatePeer(peer, config, onChurn));

    // Wait for all peers to complete
    await Promise.all(peerPromises);
    const endTime = Date.now();

    // Calculate metrics
    const totalRequests = peers.reduce((sum, p) => sum + p.requestCount, 0);
    const peerRequests = peers.reduce((sum, p) => sum + p.cacheHits, 0);
    const originRequests = peers.reduce((sum, p) => sum + p.cacheMisses, 0);
    const cacheHitRatio = totalRequests > 0 ? (peerRequests / totalRequests) * 100 : 0;

    // Calculate bandwidth saved (percentage of requests served by peers)
    const bandwidthSaved = cacheHitRatio;

    // Calculate average latency (weighted by request count)
    let totalLatencyWeighted = 0;
    let totalRequestsForLatency = 0;
    peers.forEach(peer => {
        // Cache hits have lower latency (10% of peer latency)
        // Cache misses have higher latency (peer latency + network overhead)
        const avgLatencyForPeer = (peer.cacheHits * peer.latency * 0.1 +
            peer.cacheMisses * (peer.latency * 1.5)) /
            Math.max(1, peer.requestCount);
        totalLatencyWeighted += avgLatencyForPeer * peer.requestCount;
        totalRequestsForLatency += peer.requestCount;
    });
    const avgLatency = totalRequestsForLatency > 0
        ? totalLatencyWeighted / totalRequestsForLatency
        : calculateAvgLatency(peers);

    // Calculate latency improvement (cache hits vs misses)
    // Cache hits have ~90% lower latency (10% of peer latency vs 150% for misses)
    const avgLatencyWithoutCache = calculateAvgLatency(peers) * 1.5; // Miss latency
    const avgLatencyWithCache = calculateAvgLatency(peers) * 0.1; // Hit latency
    const latencyImprovement = totalRequests > 0 && avgLatencyWithoutCache > 0
        ? ((avgLatencyWithoutCache - avgLatency) / avgLatencyWithoutCache) * 100
        : 0;

    // Calculate Jain's fairness index
    const jainFairnessIndex = calculateJainFairnessIndex(peers);

    // Calculate recovery speed (if churn occurred)
    let recoverySpeed: number | undefined;
    if (churnEvents.length > 0 && churnEvents.length < peers.length) {
        const lastChurn = Math.max(...churnEvents);
        const recoveryWindow = 5000; // 5 seconds after churn
        const recoveryEnd = lastChurn + recoveryWindow;
        const recoveryPeers = peers.filter(p => p.requestCount > 0);
        const recoveryRequests = recoveryPeers
            .reduce((sum, p) => {
                // Estimate requests made during recovery window
                const requestsPerSecond = p.requestCount / (config.duration);
                const recoveryRequests = requestsPerSecond * (recoveryWindow / 1000);
                return sum + recoveryRequests;
            }, 0);
        recoverySpeed = recoveryRequests / (recoveryWindow / 1000);
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
    };
}

