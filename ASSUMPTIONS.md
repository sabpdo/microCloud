# Assumptions and Implementation Details

This document outlines all assumptions and implementation details for the microCloud simulation, particularly regarding latency, bandwidth, and device heterogeneity.

## Device Heterogeneity

### Bandwidth Distribution
- **Implementation**: Bandwidth is randomly generated for each peer using a uniform distribution within the configured min/max range
- **Formula**: `bandwidth = bandwidthMin + Math.random() * (bandwidthMax - bandwidthMin)`
- **Default Range**: 10-100 Mbps (configurable via `deviceHeterogeneity.bandwidthMin` and `deviceHeterogeneity.bandwidthMax`)
- **Location**: `server/simulation.ts:223` in `createPeer()` function
- **Verification**: The implementation correctly uses the configured min/max values from `config.deviceHeterogeneity`, falling back to defaults (10-100 Mbps) if not specified

### Latency Distribution
- **Implementation**: Latency varies based on peer position (index) with added randomness
- **Formula**: 
  - Base latency: `latencyMin + (index / totalPeers) * (latencyMax - latencyMin)`
  - With randomness: `baseLatency + (Math.random() - 0.5) * ((latencyMax - latencyMin) * 0.1)`
- **Default Range**: 10-250 ms (configurable via `deviceHeterogeneity.latencyMin` and `deviceHeterogeneity.latencyMax`)
- **Location**: `server/simulation.ts:218-219` in `createPeer()` function
- **Note**: Early peers (low index) tend to have lower latency, simulating better network conditions

## Latency Implementation

### 1. Joining Latency
- **Location**: `server/simulation.ts:540-576` in `simulatePeerJoin()` function
- **Base Delay**: Uses `config.anchorSignalingLatency` (default: 100ms) or `anchorSignalingLatency * 2` for direct joins
- **Bandwidth Factor**: 
  - Formula: `joinLatency = baseJoinLatency * (maxBandwidth / peerBandwidth)`
  - Lower bandwidth peers experience proportionally longer join delays
  - Reference bandwidth: `config.deviceHeterogeneity.bandwidthMax ?? 100` Mbps
- **Assumption**: Lower bandwidth connections take longer to establish signaling connections
- **Example**: 
  - Peer with 10 Mbps: `100ms * (100/10) = 1000ms` join delay
  - Peer with 100 Mbps: `100ms * (100/100) = 100ms` join delay

### 2. Request Latency
- **Location**: `server/simulation.ts:741-746` before `peerBrowser.requestResource()` call
- **Base Delay**: 10ms base delay
- **Bandwidth Factor**: 
  - Formula: `requestDelay = baseRequestDelay * (maxBandwidth / peerBandwidth)`
  - Lower bandwidth peers take longer to initiate requests
  - Reference bandwidth: `config.deviceHeterogeneity.bandwidthMax ?? 100` Mbps
- **Assumption**: Lower bandwidth peers have slower request processing/initiation
- **Example**:
  - Peer with 10 Mbps: `10ms * (100/10) = 100ms` request delay
  - Peer with 100 Mbps: `10ms * (100/100) = 10ms` request delay

### 3. Chunk Transfer Latency (Sending)
- **Location**: `server/mock-webrtc-client.ts:215-224` in `sendFile()` method
- **Transfer Time Calculation**: 
  - Formula: `transferTimeMs = ((bytes.length * 8) / (bandwidth * 1000000)) * 1000`
  - Accounts for actual data transfer time based on bandwidth
- **Chunk Delay**: `chunkDelay = Math.max(1, transferTimeMs / totalChunks)`
- **Total Delay per Chunk**: `chunkDelay + latency`
- **Assumption**: Transfer time is directly proportional to file size and inversely proportional to bandwidth
- **Note**: This is the sender's bandwidth affecting how fast chunks can be sent

### 4. Chunk Receiving Latency
- **Location**: `server/mock-webrtc-client.ts:332-352` in `receiveMessage()` for `file-chunk` case
- **Base Delay**: 2ms base processing delay
- **Bandwidth Factor**: 
  - Formula: `receiveDelay = baseReceiveDelay * (referenceBandwidth / peerBandwidth)`
  - Lower bandwidth peers take longer to process received chunks
  - Reference bandwidth: 100 Mbps (fixed)
- **Assumption**: Lower bandwidth peers have slower processing/decoding of received chunks
- **Implementation**: Uses `setTimeout()` to simulate async processing delay
- **Example**:
  - Peer with 10 Mbps: `2ms * (100/10) = 20ms` receive delay per chunk
  - Peer with 100 Mbps: `2ms * (100/100) = 2ms` receive delay per chunk

## Latency Model Summary

All latency components use a **linear inverse relationship** with bandwidth:
- **Formula Pattern**: `delay = baseDelay * (maxBandwidth / peerBandwidth)`
- **Rationale**: Lower bandwidth = higher delay (inverse relationship)
- **Linearity**: The relationship is linear, not exponential, for simplicity and predictability

### Total Latency Components
1. **Join Latency**: Bandwidth-dependent delay when peer joins network
2. **Request Latency**: Bandwidth-dependent delay before making resource request
3. **Transfer Latency**: Bandwidth-dependent time to send chunks (sender's bandwidth)
4. **Receive Latency**: Bandwidth-dependent time to process received chunks (receiver's bandwidth)

## Network Latency vs Bandwidth

- **Network Latency** (`peer.latency`): Represents round-trip time (RTT) in milliseconds
  - Used for: Network propagation delays, message delivery delays
  - Location: Set in `createPeer()` based on device heterogeneity config
  - Range: 10-250ms (default, configurable)

- **Bandwidth** (`peer.bandwidth`): Represents data transfer capacity in Mbps
  - Used for: Transfer time calculations, processing delays
  - Location: Set in `createPeer()` based on device heterogeneity config
  - Range: 10-100 Mbps (default, configurable)

## Additional Assumptions

### Bandwidth Units
- All bandwidth values are in **Mbps** (Megabits per second)

### Linearity Assumption
- All bandwidth-based delays use linear scaling
- **Rationale**: Simple, predictable, and computationally efficient
- **Alternative Considered**: Exponential scaling was considered but rejected for simplicity
- **Future Enhancement**: Could be made configurable (linear vs exponential)

## Baseline Experiment Assumptions

The baseline experiment simulates a traditional origin-server-only architecture where all requests go directly to the origin server with no peer-to-peer caching. This is used for comparison with the P2P approach.

### Baseline Mode Implementation

**Location**: `server/simulation.ts:906-1022` in `requestFromOrigin()` function when `config.baselineMode === true`

The baseline uses a realistic server model with proper FIFO queuing, timeout handling, and load-based performance degradation.

**Hardcoded Constants**:
- `SERVER_BASE_LATENCY = 20` - Base server processing latency (ms) - realistic for a good server
- `MAX_QUEUE_SIZE = 100` - Maximum requests that can wait in queue
- `REQUEST_TIMEOUT = 30000` - 30 second timeout for requests
- `maxConcurrentRequests = 20` (flash crowd) or `40` (normal) - Server capacity (configurable based on flash crowd mode)

**Server Model**:
Realistic server behavior with proper queuing:
- **FIFO Queue**: Requests wait in first-in-first-out order when server is at capacity
- **Queue Size Limit**: Maximum 100 requests can wait in queue
- **Timeout Handling**: Requests timeout after 30 seconds if still waiting
- **Immediate Rejection**: If queue is full, requests are immediately rejected (simulates "503 Service Unavailable")

**Load-Based Processing Latency**:
- **Normal Load** (`loadRatio ≤ 0.8`):
  - `processingLatency = SERVER_BASE_LATENCY` (20ms)
  - No degradation, normal server performance

- **High Load** (`loadRatio > 0.8`):
  - `processingLatency = SERVER_BASE_LATENCY * (1 + (loadRatio - 0.8) * 5)`
  - Linear degradation due to resource contention (CPU, memory, I/O):
    - At 80% capacity: `20 * (1 + (0.8 - 0.8) * 5) = 20ms` (1.0x)
    - At 90% capacity: `20 * (1 + (0.9 - 0.8) * 5) = 30ms` (1.5x)
    - At 100% capacity: `20 * (1 + (1.0 - 0.8) * 5) = 40ms` (2.0x)

**Queue Behavior**:
1. **Server Available**: If `activeRequests < maxConcurrentRequests`, request is processed immediately
2. **Server at Capacity**: If server is full but queue has space, request waits in FIFO queue
3. **Queue Full**: If queue is full (100 requests), request is immediately rejected with 10ms latency
4. **Timeout**: If request waits in queue longer than 30 seconds, it times out and fails
5. **FIFO Processing**: When a server slot becomes available, the next request in queue is processed

**Total Latency**:
- `totalLatency = peer.latency + serverLatency`
- Server latency includes: queue wait time + processing time
- Measured from request arrival to completion
- Network latency (`peer.latency`) represents RTT to server

**Assumptions**:
- Server has limited concurrent request capacity (20-40 requests depending on flash crowd mode)
- Requests beyond capacity wait in FIFO queue (up to 100 requests)
- Server performance degrades under load (linear degradation starting at 80% capacity)
- Queue full or timeout results in request failure
- No bandwidth-based delays for baseline requests (only network latency + server processing)

**Hardcoded Values Summary**:
| Constant | Value | Description |
|----------|-------|-------------|
| `SERVER_BASE_LATENCY` | 20ms | Base server processing latency |
| `maxConcurrentRequests` (normal) | 40 | Max concurrent requests (normal mode) |
| `maxConcurrentRequests` (flash crowd) | 20 | Max concurrent requests (flash crowd mode) |
| `MAX_QUEUE_SIZE` | 100 | Maximum requests in queue |
| `REQUEST_TIMEOUT` | 30000ms | Request timeout (30 seconds) |
| Queue rejection latency | 10ms | Latency for rejected requests (queue full) |
| Load degradation threshold | 0.8 (80%) | Load ratio where degradation starts |
| Load degradation multiplier | 5x | Multiplier for load-based degradation |

### Baseline Request Flow

1. **Request Initiation**: Peer makes request to origin server
2. **Network Latency**: `peer.latency` (RTT to server)
3. **Server Queuing**: If server at capacity, request waits in queue
4. **Server Processing**: Server processes request (latency depends on load)
5. **Response**: Response sent back (network latency already included in `peer.latency`)

### Baseline Assumptions Summary

**Server Capacity**:
- Limited concurrent request handling (20-40 requests depending on flash crowd mode)
- Queue size limits (100 requests max)
- Capacity does not scale with number of peers

**Server Performance**:
- Base processing latency: 20ms (assumes well-optimized server)
- Performance degrades under load (linear degradation starting at 80% capacity)
- Requests fail when queue is full or timeout occurs (30 second timeout)

**No Bandwidth Delays**:
- **Important**: Baseline requests do NOT include bandwidth-based delays
- Only network latency (`peer.latency`) and server processing delays
- This makes baseline faster than P2P for high-bandwidth scenarios, but slower when server is overloaded

**Flash Crowd Behavior**:
- Lower server capacity during flash crowds (20 vs 40 concurrent requests)
- Simulates server being overwhelmed by sudden traffic spike
- Higher queuing delays and failure rates

**Failure Handling**:
- Failed requests counted as cache misses
- Failure scenarios:
  - Queue full: Immediate rejection with 10ms latency
  - Timeout: Request times out after 30 seconds
- No retry logic (request fails immediately)

### Comparison with P2P Mode

**Baseline Advantages**:
- No bandwidth-based delays for requests
- Direct server access (no peer discovery overhead)

**Baseline Disadvantages**:
- Server becomes bottleneck (limited capacity)
- All requests hit origin (no caching)
- Server overload causes high latency and failures
- No load distribution (all load on single server)

**P2P Advantages**:
- Load distributed across peers
- Caching reduces origin requests
- No single bottleneck

**P2P Disadvantages**:
- Bandwidth-based delays for all operations
- Peer discovery overhead
- Potential for peer failures

## Testing Considerations

When testing latency behavior:
1. **Low Bandwidth Peers**: Should experience significantly longer delays across all operations
2. **High Bandwidth Peers**: Should experience minimal delays
3. **Bandwidth Range**: Test with different min/max ranges to verify scaling
4. **Edge Cases**: Test with very low bandwidth (e.g., 1 Mbps) to ensure no division by zero errors
5. **Baseline Overload**: Test with many peers to observe server overload behavior
6. **Flash Crowds**: Compare baseline vs P2P during flash crowd scenarios

