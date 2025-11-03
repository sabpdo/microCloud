/**
 * Flash Crowd Simulation Script
 * 
 * Simulates multiple peers making simultaneous requests to test
 * cache hit ratio and server load during flash crowd scenarios.
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const NUM_PEERS = parseInt(process.env.NUM_PEERS || '20');
const TARGET_FILE = process.env.TARGET_FILE || '/sample.txt';
const REQUEST_INTERVAL = parseInt(process.env.REQUEST_INTERVAL || '100'); // ms between requests
const SIMULATION_DURATION = parseInt(
    process.env.SIMULATION_DURATION || '30000'
); // ms

interface Peer {
    id: string;
    latency: number;
    uptime: number;
    cacheHit: boolean;
}

// Simulate peer behavior
async function simulatePeer(peerId: string, latency: number): Promise<void> {
    const peer: Peer = {
        id: peerId,
        latency,
        uptime: Date.now(),
        cacheHit: false,
    };

    console.log(`[Peer ${peerId}] Started simulation (latency: ${latency}ms)`);

    const startTime = Date.now();
    let requestCount = 0;

    // Continue until simulation duration ends
    while (Date.now() - startTime < SIMULATION_DURATION) {
        // Simulate cache check first (some peers might have it cached)
        const hasCache = Math.random() < 0.3; // 30% chance peer has cached content

        if (hasCache) {
            // Cache hit - peer serves from cache
            try {
                await fetch(`${SERVER_URL}/api/cache-hit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                peer.cacheHit = true;
                console.log(`[Peer ${peerId}] Cache HIT - serving from peer cache`);
            } catch (error) {
                console.error(`[Peer ${peerId}] Error reporting cache hit:`, error);
            }
        } else {
            // Cache miss - request from origin server
            try {
                const response = await fetch(`${SERVER_URL}${TARGET_FILE}`);
                if (response.ok) {
                    await response.text(); // Read the response
                    await fetch(`${SERVER_URL}/api/cache-miss`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                    });
                    console.log(`[Peer ${peerId}] Cache MISS - fetched from origin`);
                }
            } catch (error) {
                console.error(`[Peer ${peerId}] Error fetching from origin:`, error);
            }
        }

        requestCount++;

        // Wait before next request (simulate latency + thinking time)
        await new Promise((resolve) =>
            setTimeout(resolve, latency + REQUEST_INTERVAL)
        );
    }

    console.log(
        `[Peer ${peerId}] Completed: ${requestCount} requests, ${peer.cacheHit ? 'had cache' : 'no cache'}`
    );
}

// Main simulation function
async function runFlashCrowdSimulation() {
    console.log('🚀 Starting Flash Crowd Simulation');
    console.log(`📊 Configuration:`);
    console.log(`   - Number of peers: ${NUM_PEERS}`);
    console.log(`   - Target file: ${TARGET_FILE}`);
    console.log(`   - Request interval: ${REQUEST_INTERVAL}ms`);
    console.log(`   - Simulation duration: ${SIMULATION_DURATION}ms`);
    console.log(`   - Server URL: ${SERVER_URL}\n`);

    // Check server is running
    try {
        const healthCheck = await fetch(`${SERVER_URL}/health`);
        if (!healthCheck.ok) {
            throw new Error('Server health check failed');
        }
        console.log('✅ Server is running\n');
    } catch (error) {
        console.error('❌ Error: Server is not accessible at', SERVER_URL);
        console.error('   Make sure the server is running with: npm start');
        process.exit(1);
    }

    // Reset stats before simulation
    try {
        await fetch(`${SERVER_URL}/stats/reset`, { method: 'POST' });
        console.log('📊 Stats reset\n');
    } catch (error) {
        console.warn('⚠️  Could not reset stats:', error);
    }

    // Create peers with varying latencies
    const peers: Promise<void>[] = [];
    for (let i = 0; i < NUM_PEERS; i++) {
        const peerId = `peer-${String(i + 1).padStart(3, '0')}`;
        // Simulate varying network conditions
        const latency = Math.floor(Math.random() * 200) + 50; // 50-250ms latency
        peers.push(simulatePeer(peerId, latency));
    }

    console.log(`\n📡 Starting ${NUM_PEERS} peers simultaneously...\n`);

    // Wait for all peers to complete
    await Promise.all(peers);

    // Get final stats
    console.log('\n📊 Fetching final statistics...\n');
    try {
        const statsResponse = await fetch(`${SERVER_URL}/stats`);
        const stats = await statsResponse.json();

        console.log('═══════════════════════════════════════');
        console.log('📈 SIMULATION RESULTS');
        console.log('═══════════════════════════════════════');
        console.log(`Total Requests: ${stats.totalRequests}`);
        console.log(`Peer Requests (Cache Hits): ${stats.peerRequests}`);
        console.log(`Origin Requests (Cache Misses): ${stats.originRequests}`);
        console.log(
            `Cache Hit Ratio: ${stats.cacheHitRatio.toFixed(2)}%`
        );
        console.log(`Total Bytes Served: ${(stats.totalBytes / 1024).toFixed(2)} KB`);
        console.log(`Server Uptime: ${stats.uptime}s`);
        console.log('═══════════════════════════════════════\n');
    } catch (error) {
        console.error('Error fetching stats:', error);
    }

    console.log('✅ Simulation complete!');
}

// Run the simulation
runFlashCrowdSimulation().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

