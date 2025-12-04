# µCloud Implementation Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Core Modules](#core-modules)
4. [Data Flow](#data-flow)
5. [Key Algorithms](#key-algorithms)
6. [Components](#components)
7. [Protocols](#protocols)
8. [Testing and Simulation](#testing-and-simulation)

---

## Project Overview

**µCloud** is a peer-assisted caching system that transforms nearby user devices into a self-organizing micro-cloud. The system operates entirely at the client layer, using WebRTC DataChannels for direct peer-to-peer content distribution, reducing server load and latency.

### Key Features

- **Client-Layer Operation**: No server-side deployment required for caching
- **WebRTC-Based P2P**: Direct peer-to-peer transfers using WebRTC DataChannels
- **Automatic Fallback**: Falls back to origin server when P2P fails
- **Reputation-Based Peer Selection**: Intelligent peer selection based on reputation scores
- **Anchor Node System**: Stable peers act as anchor nodes for improved reliability
- **Flash Crowd Support**: Handles sudden traffic spikes with gradual peer joining
- **Churn Resilience**: System adapts to peers joining and leaving

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    µCloud System                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │   Browser    │      │   Browser    │                    │
│  │   Client 1   │◄─────►│   Client 2   │                    │
│  │              │ WebRTC│              │                    │
│  │ PeerBrowser  │       │ PeerBrowser  │                    │
│  │   + Cache    │       │   + Cache    │                    │
│  └──────┬───────┘       └──────┬───────┘                    │
│         │                      │                             │
│         │                      │                             │
│         └──────────┬───────────┘                             │
│                    │                                         │
│         ┌──────────▼──────────┐                              │
│         │  Signaling Server   │                              │
│         │  (WebSocket)        │                              │
│         └──────────┬──────────┘                              │
│                    │                                         │
│         ┌──────────▼──────────┐                              │
│         │   Origin Server     │                              │
│         │   (HTTP + API)      │                              │
│         └─────────────────────┘                              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Component Layers

1. **Client Layer** (`src/`)
   - `PeerBrowser.ts`: Browser-based peer implementation
   - `Peer.ts`: Core peer logic (used in simulations)
   - Cache modules: Memory cache, manifest generation, origin fallback
   - React dashboard: Configuration and metrics UI

2. **WebRTC Layer** (`client/src/`)
   - `webrtc.ts`: WebRTC client for P2P connections
   - Handles signaling, data channels, file transfers

3. **Server Layer** (`server/`)
   - `server.ts`: HTTP origin server + WebSocket signaling server
   - `simulation.ts`: Flash crowd simulation engine
   - `mock-webrtc-client.ts`: Mock WebRTC client for server-side simulations

4. **Dashboard Layer** (`src/components/`)
   - `ContentPolicies.tsx`: Content caching policy configuration
   - `MetricsDashboard.tsx`: Real-time performance metrics
   - `SimulationControl.tsx`: Simulation control and results

---

## Core Modules

### 1. Peer Module (`src/Peer.ts` and `src/PeerBrowser.ts`)

The Peer module is the core of the system, managing peer state, cache, and peer-to-peer interactions.

#### Key Responsibilities

- **Peer Discovery**: Maintains a peer index of known peers and their capabilities
- **Cache Management**: Stores and retrieves cached resources
- **Reputation Calculation**: Computes reputation scores for peer selection
- **Role Assignment**: Determines if peer should be an anchor node
- **File Requests**: Handles requests from other peers and origin server

#### Key Data Structures

```typescript
interface PeerInfo {
  peerID: string;
  lastSeen: number;        // timestamp
  bandwidth: number;       // Mbps
  uptime: number;          // seconds
  reputation: number;      // calculated score
  cacheManifest: CacheManifest;  // what files peer has
  client?: MicroCloudClient;      // WebRTC client (PeerBrowser only)
}
```

#### Reputation Calculation

The reputation score determines peer reliability and is used for:
- Anchor node promotion/demotion
- Peer selection for file requests
- Load balancing

Formula: `S(peer) = a * n_success + b * B + c * T`

Where:
- `a`: Weight for successful uploads
- `n_success`: Number of successful file uploads
- `b`: Weight for bandwidth
- `B`: Bandwidth capacity (Mbps)
- `c`: Weight for uptime
- `T`: Connection uptime (seconds)

#### Anchor Node System

- **Promotion**: When reputation ≥ `anchorPromoteThreshold`
- **Demotion**: When reputation < `anchorDemoteThreshold` (hysteresis to prevent flapping)
- **Benefits**: Anchor nodes are preferred for new peer connections and file transfers

#### PeerBrowser vs Peer

- **Peer**: Abstract peer implementation used in server-side simulations
- **PeerBrowser**: Browser-based implementation with actual WebRTC connections

### 2. Cache Module (`src/cache/`)

The cache module provides in-memory caching with manifest generation for peer discovery.

#### MemoryCache (`memory-cache.ts`)

- In-memory key-value store with optional TTL
- Stores `CachedResource` objects containing content, MIME type, and timestamp
- Automatic expiration of expired entries

```typescript
interface CachedResource {
  content: string | ArrayBuffer;
  mimeType: string;
  timestamp: number;
}
```

#### ManifestGenerator (`manifest-generator.ts`)

Generates cache manifests that peers share to advertise available resources.

```typescript
interface CacheManifest {
  peerId: string;
  generatedAt: number;  // Unix timestamp (seconds)
  resources: Array<{
    resourceHash: string;      // SHA-256 hash
    contentLength: number;     // bytes
    mimeType: string;
    timestamp: number;         // Unix timestamp (seconds)
  }>;
}
```

**Purpose**: Allows peers to discover what files other peers have without querying each peer individually.

#### OriginFallback (`origin-fallback.ts`)

Handles fetching from origin server when P2P fails.

- Fetches resources from origin server (default: `http://localhost:3000`)
- Supports both relative paths and full URLs
- Reports cache misses to origin server for statistics

### 3. WebRTC Client (`client/src/webrtc.ts`)

The WebRTC client handles all WebRTC-related functionality for peer-to-peer connections.

#### Key Features

- **Signaling**: Connects to WebSocket signaling server for SDP/ICE exchange
- **Data Channels**: Creates and manages RTCDataChannel for file transfers
- **Heartbeat**: Monitors connection health (5s interval, 15s timeout)
- **File Transfer**: Chunked file transfer protocol (16KB chunks)

#### Connection Flow

1. **Join Room**: Connect to signaling server and join a room
2. **ICE Negotiation**: Exchange SDP offers/answers and ICE candidates
3. **Data Channel**: Create or accept data channel
4. **Heartbeat**: Start periodic heartbeat to monitor connection
5. **File Transfer**: Ready for file requests/responses

#### File Transfer Protocol

Files are transferred in chunks to handle:
- DataChannel message size limits (typically 16KB)
- Large files
- Network reliability

**Transfer Flow**:
1. Request: `file-request` message with `resourceHash` and `requestId`
2. Response: `file-response` with metadata (success, MIME type, chunk count)
3. Chunks: Multiple `file-chunk` messages (base64 encoded, 16KB each)
4. Completion: `file-complete` acknowledgment

### 4. Server Module (`server/server.ts`)

The server provides two main services:

#### HTTP Origin Server

- Serves static files from `public/` directory
- Tracks request statistics (total requests, bytes served, cache hits/misses)
- Provides API endpoints:
  - `GET /stats`: Server statistics
  - `POST /api/cache-hit`: Record cache hit
  - `POST /api/cache-miss`: Record cache miss
  - `POST /api/simulate`: Run flash crowd simulation
  - `GET /api/files`: List available files

#### WebSocket Signaling Server

- Manages WebRTC signaling between peers
- Room-based peer grouping
- Forwards SDP offers/answers and ICE candidates
- Handles peer join/leave events

**Message Types**:
- `join`: Peer wants to join a room
- `signal`: Forward WebRTC signaling message
- `leave`: Peer is leaving

### 5. Simulation Module (`server/simulation.ts`)

The simulation engine runs server-side flash crowd simulations for testing and analysis.

#### Simulation Features

- **Flash Crowd**: Peers join gradually over time (configurable join rate)
- **Churn**: Peers can leave and rejoin (configurable churn rate)
- **Device Heterogeneity**: Varies latency and bandwidth across peers
- **Baseline Mode**: Compare with origin-only (no P2P) performance
- **Comprehensive Metrics**: Tracks cache hit ratio, latency, fairness, propagation, etc.

#### Key Metrics Collected

- Cache hit ratio (peer vs origin requests)
- Average latency and latency percentiles
- Bandwidth saved
- Jain's fairness index
- File propagation time (time to reach all peers)
- Anchor node formation
- Peer join/leave events
- File transfer events

#### Simulation Flow

1. **Initialization**: Create peers with varied properties (bandwidth, latency)
2. **Flash Crowd**: Peers join gradually (if enabled)
3. **Request Generation**: Peers make requests based on probability or interval
4. **File Transfer**: Peers request files, system routes to best peer or origin
5. **Churn**: Peers may leave/rejoin based on churn rate
6. **Metrics Collection**: Continuously collect performance metrics
7. **Results**: Generate comprehensive results with all metrics

---

## Data Flow

### File Request Flow

```
┌─────────┐
│  Peer A │  Wants file /sample.txt
└────┬────┘
     │
     │ 1. Check local cache
     ├───► Cache miss
     │
     │ 2. Check peer index for peers with file
     ├───► Find Peer B has file
     │
     │ 3. Request file from Peer B via WebRTC
     ├───► WebRTC DataChannel
     │
     │ 4. Receive file chunks
     ├───► Store in cache
     │
     │ 5. Update manifest
     └───► Done
```

### Cache Miss Flow

```
┌─────────┐
│  Peer A │  Cache miss, no peers have file
└────┬────┘
     │
     │ 1. Request from origin server
     ├───► HTTP GET /sample.txt
     │
     │ 2. Receive file
     ├───► Store in cache
     │
     │ 3. Report cache miss to origin
     ├───► POST /api/cache-miss
     │
     │ 4. Update manifest
     └───► Done
```

### Peer Discovery Flow

```
┌─────────┐         ┌──────────────┐         ┌─────────┐
│ Peer A  │────────►│  Signaling   │◄────────│ Peer B  │
│         │ WebSocket│   Server     │ WebSocket│         │
└─────────┘         └──────┬───────┘         └─────────┘
                            │
                            │ Exchange manifests
                            │
     ┌──────────────────────┴──────────────────────┐
     │  Peer A learns Peer B has file X           │
     │  Peer B learns Peer A has file Y             │
     └──────────────────────────────────────────────┘
```

### Manifest Exchange Flow

1. **Peer A** generates manifest from its cache
2. **Peer A** sends manifest to **Peer B** via WebRTC
3. **Peer B** updates its peer index with Peer A's available files
4. **Peer B** can now request files from Peer A
5. Process repeats in reverse (bidirectional)

---

## Key Algorithms

### 1. Peer Selection Algorithm

When a peer needs a file, it selects the best peer to request from:

```typescript
function selectBestPeer(fileHash: string): PeerInfo | null {
  // 1. Find all peers with the file
  const candidates = peerIndex.values()
    .filter(peer => peer.cacheManifest.resources
      .some(r => r.resourceHash === fileHash));
  
  if (candidates.length === 0) return null;
  
  // 2. Sort by reputation (highest first)
  candidates.sort((a, b) => b.reputation - a.reputation);
  
  // 3. Prefer anchor nodes
  const anchorNodes = candidates.filter(p => p.role === 'anchor');
  if (anchorNodes.length > 0) {
    return anchorNodes[0];
  }
  
  // 4. Return highest reputation peer
  return candidates[0];
}
```

### 2. Reputation Update Algorithm

Reputation is updated after each successful/failed transfer:

```typescript
function updateReputation(success: boolean) {
  if (success) {
    successfulUploads++;
  } else {
    failedTransfers++;
  }
  
  // Recalculate reputation
  reputation = weights.a * successfulUploads +
               weights.b * bandwidth +
               weights.c * uptime;
  
  // Update role if threshold crossed
  if (reputation >= anchorPromoteThreshold && role !== 'anchor') {
    role = 'anchor';
  } else if (reputation < anchorDemoteThreshold && role === 'anchor') {
    role = 'transient';
  }
}
```

### 3. Cache Replacement

Currently uses simple in-memory cache with TTL. Future enhancements could include:
- LRU (Least Recently Used) eviction
- Size-based eviction
- Content-type priority

### 4. Chunk Index Management

The chunk index tracks which peers have which files:

```typescript
// chunkIndex: Map<fileHash, PriorityQueue<PeerInfo>>
// PriorityQueue sorted by reputation (highest first)

function updateChunkIndex(fileHash: string, peerInfo: PeerInfo) {
  if (!chunkIndex.has(fileHash)) {
    chunkIndex.set(fileHash, new PriorityQueue());
  }
  chunkIndex.get(fileHash).add(peerInfo);
}
```

---

## Components

### React Dashboard Components

#### 1. ContentPolicies (`src/components/ContentPolicies.tsx`)

Allows users to configure which content types to cache:
- Video files
- Image files
- JSON/Data files
- Text files

Settings are saved to `localStorage` and persist across sessions.

#### 2. MetricsDashboard (`src/components/MetricsDashboard.tsx`)

Displays real-time performance metrics:
- Cache hit ratio (ring chart)
- Total requests (peer vs origin)
- Data served breakdown
- Requests by path
- Server uptime

Auto-refreshes every 2 seconds (can be paused).

#### 3. SimulationControl (`src/components/SimulationControl.tsx`)

Comprehensive simulation interface:
- Configuration: peers, file, duration, intervals, churn
- Flash crowd settings: join rate, anchor latency
- Device heterogeneity: latency/bandwidth ranges
- Results display: metrics, anchor nodes, join timeline, transfer events

### Utility Modules

#### Hash Utility (`src/utils/hash.ts`)

Provides SHA-256 hashing for:
- File content hashing (resource identification)
- Cache key generation
- Integrity verification

Uses Web Crypto API in browser, Node.js `crypto` module on server.

#### Configuration (`src/hooks/useConfig.ts`)

React hook for managing system configuration:
- Loads from `localStorage`
- Provides update function
- Type-safe configuration interface

---

## Protocols

### WebRTC Signaling Protocol

Messages exchanged via WebSocket signaling server:

```typescript
// Join room
{ type: 'join', roomId: string }

// Response
{ type: 'joined', roomId: string, peers: number }

// WebRTC signal (SDP/ICE)
{ type: 'signal', payload: RTCSessionDescription | RTCIceCandidate }

// Peer events
{ type: 'peer-joined' }
{ type: 'peer-left' }
```

### File Transfer Protocol

Messages exchanged via WebRTC DataChannel:

```typescript
// File request
{ type: 'file-request', resourceHash: string, requestId: string }

// File response
{ type: 'file-response', requestId: string, resourceHash: string,
  success: boolean, mimeType?: string, totalChunks?: number,
  contentLength?: number }

// File chunk
{ type: 'file-chunk', requestId: string, chunkIndex: number,
  totalChunks: number, data: string }  // data is base64 encoded

// Transfer complete
{ type: 'file-complete', requestId: string, resourceHash: string }

// Manifest request/response
{ type: 'manifest-request' }
{ type: 'manifest-response', manifest: CacheManifest }

// Heartbeat
{ type: 'heartbeat', t: number }  // timestamp
```

### Cache Manifest Protocol

Manifests are shared between peers to advertise available resources:

```json
{
  "peerId": "peer-123",
  "generatedAt": 1234567890,
  "resources": [
    {
      "resourceHash": "abc123...",
      "contentLength": 1024,
      "mimeType": "text/plain",
      "timestamp": 1234567890
    }
  ]
}
```

---

## Testing and Simulation

### Unit Tests

Located in `src/**/__tests__/`:
- `memory-cache.test.ts`: Cache operations
- `manifest-generator.test.ts`: Manifest generation
- `origin-fallback.test.ts`: Origin fetching
- `hash.test.ts`: Hashing utilities
- `Peer.test.ts`: Peer logic

Run with: `npm test`

### Integration Tests

Server-side simulation tests in `server/__tests__/`:
- `simulation.test.ts`: Flash crowd simulation

### Flash Crowd Simulation

The simulation engine (`server/simulation.ts`) provides:

#### Configuration Options

- `numPeers`: Number of peers to simulate
- `targetFile`: File to request (e.g., `/sample.txt`)
- `duration`: Simulation duration in seconds
- `requestProbability`: Probability per second of making a request (0-1)
- `churnRate`: Probability of peer leaving per cycle (0-1)
- `flashCrowd`: Enable gradual peer joining
- `joinRate`: Peers per second for flash crowd
- `deviceHeterogeneity`: Vary latency and bandwidth
- `baselineMode`: Disable P2P for baseline comparison

#### Metrics Collected

- **Performance**: Cache hit ratio, latency, bandwidth saved
- **Fairness**: Jain's fairness index
- **Propagation**: Time to reach 50%/90%/100% of peers
- **Resilience**: Recovery speed after churn
- **Events**: Peer joins, file transfers, anchor promotions

#### Running Simulations

**Via API**:
```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "numPeers": 50,
    "targetFile": "/sample.txt",
    "duration": 60,
    "requestProbability": 0.5,
    "flashCrowd": true,
    "joinRate": 2
  }'
```

**Via Dashboard**: Use the Simulation tab in the React dashboard.

### Analysis Tools

Located in `analysis/`:
- `analyze-simulation.ts`: Analyze simulation results
- `plot-metrics.py`: Generate visualizations (Python)
- `run-batch-analysis.ts`: Batch simulation runner

---

## File Structure Summary

```
microCloud/
├── src/                          # React app + core logic
│   ├── cache/                    # Caching system
│   │   ├── index.ts
│   │   ├── memory-cache.ts       # In-memory cache
│   │   ├── manifest-generator.ts # Cache manifest generation
│   │   └── origin-fallback.ts    # Origin server fallback
│   ├── components/               # React components
│   │   ├── ContentPolicies.tsx
│   │   ├── MetricsDashboard.tsx
│   │   └── SimulationControl.tsx
│   ├── hooks/
│   │   └── useConfig.ts          # Configuration hook
│   ├── Peer.ts                   # Core peer implementation
│   ├── PeerBrowser.ts            # Browser peer with WebRTC
│   ├── App.tsx                   # Main React app
│   ├── main.tsx                  # React entry point
│   └── types.ts                  # TypeScript types
├── client/                       # Standalone WebRTC client
│   ├── src/
│   │   └── webrtc.ts             # WebRTC client implementation
│   └── index.html                # Test page
├── server/                       # Server-side code
│   ├── server.ts                 # HTTP + WebSocket server
│   ├── simulation.ts             # Simulation engine
│   └── mock-webrtc-client.ts     # Mock WebRTC for simulations
├── public/                       # Static files
│   └── sample-*.txt              # Test files
└── analysis/                     # Analysis tools
    ├── analyze-simulation.ts
    └── plot-metrics.py
```

---

## Key Design Decisions

### 1. Client-Layer Operation

**Decision**: System operates entirely at client layer, no server-side caching.

**Rationale**: 
- No deployment required
- Works with any origin server
- User controls caching behavior

### 2. WebRTC for P2P

**Decision**: Use WebRTC DataChannels for peer-to-peer transfers.

**Rationale**:
- Browser-native, no plugins required
- Direct peer connections (lower latency)
- Encrypted by default
- Works through NATs/firewalls with STUN

### 3. Reputation-Based Selection

**Decision**: Use reputation scores for peer selection and anchor promotion.

**Rationale**:
- Rewards reliable peers
- Improves system stability
- Self-organizing (no central authority)

### 4. Chunked File Transfer

**Decision**: Transfer files in 16KB chunks.

**Rationale**:
- DataChannel message size limits
- Better error handling (retry individual chunks)
- Progress tracking possible

### 5. Manifest-Based Discovery

**Decision**: Peers share cache manifests to advertise available files.

**Rationale**:
- Efficient discovery (one message vs many queries)
- Reduces signaling overhead
- Enables intelligent peer selection

### 6. Anchor Node System

**Decision**: Promote stable peers to anchor nodes.

**Rationale**:
- Improves reliability (stable peers preferred)
- Faster file propagation (anchors help new peers)
- Reduces churn impact

---

## Future Enhancements

Potential improvements and extensions:

1. **Cache Replacement Policies**: LRU, LFU, size-based eviction
2. **Encryption**: End-to-end encryption for file transfers
3. **Deduplication**: Detect and share identical content across different URLs
4. **Prefetching**: Predictively cache likely-to-be-requested content
5. **Multi-Chunk Parallel Transfer**: Request different chunks from different peers
6. **Bandwidth-Aware Routing**: Consider available bandwidth in peer selection
7. **Mobile Optimization**: Battery-aware caching, background sync
8. **Analytics**: More detailed metrics and visualization
9. **Security**: Peer authentication, content verification
10. **Scalability**: Support for larger peer networks (1000+ peers)

---

## Conclusion

µCloud is a comprehensive peer-assisted caching system that demonstrates how WebRTC can be used to create a self-organizing content distribution network at the client layer. The system's modular architecture, reputation-based peer selection, and comprehensive simulation capabilities make it suitable for both research and practical deployment.

For more information, see:
- [README.md](README.md): Getting started guide
- [SIMULATION_WALKTHROUGH.md](SIMULATION_WALKTHROUGH.md): Simulation experiments
- [WEBRTC_USAGE.md](WEBRTC_USAGE.md): WebRTC integration details
- [TESTING.md](TESTING.md): Testing guide

