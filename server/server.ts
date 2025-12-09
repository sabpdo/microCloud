/**
 * μCloud Combined Server
 *
 * HTTP origin server for static files and API endpoints.
 * WebSocket signaling server for WebRTC peer connections.
 * This server handles both HTTP requests and WebRTC signaling.
 */

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const STATIC_DIR = path.join(__dirname, '..', 'public');
const REACT_BUILD_DIR = path.join(__dirname, '..', 'dist');

// Create HTTP server (needed for WebSocket)
const server = http.createServer(app);

// WebSocket server for WebRTC signaling
const wss = new WebSocketServer({ server });

// WebRTC signaling: room management
// Rooms group peers together for signaling (SDP exchange)
type Room = Set<WebSocket>; // Set of WebSocket connections in a room
const rooms = new Map<string, Room>(); // Map room ID to set of connections

/**
 * Add a WebSocket connection to a room
 * Rooms are used to group peers for WebRTC signaling
 * @param roomId - Room identifier
 * @param ws - WebSocket connection to add
 */
function joinRoom(roomId: string, ws: WebSocket) {
  // Create room if it doesn't exist
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId)!.add(ws);
  (ws as any)._roomId = roomId; // Store room ID on connection
}

/**
 * Remove a WebSocket connection from its room
 * Called when peer disconnects or leaves
 * @param ws - WebSocket connection to remove
 */
function leaveRoom(ws: WebSocket) {
  const roomId = (ws as any)._roomId;
  if (!roomId) return; // Not in a room
  const room = rooms.get(roomId);
  if (room) {
    room.delete(ws); // Remove connection from room
    // Clean up empty rooms
    if (room.size === 0) rooms.delete(roomId);
  }
}

/**
 * Broadcast a message to all peers in a room except sender
 * Used for WebRTC signaling (SDP offers/answers, ICE candidates)
 * @param roomId - Room to broadcast to
 * @param sender - WebSocket that sent the message (excluded from broadcast)
 * @param message - Message to broadcast
 */
function broadcastToRoom(roomId: string, sender: WebSocket, message: any) {
  const room = rooms.get(roomId);
  if (!room) return; // Room doesn't exist
  const payload = JSON.stringify(message);

  // Send to all connections in room except sender
  for (const client of room) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(payload); // Forward signaling message
    }
  }
}

/**
 * WebSocket connection handler for WebRTC signaling
 * Handles peer connections, room management, and signaling message forwarding
 * Signaling server only forwards messages - actual data goes through WebRTC DataChannel
 */
wss.on('connection', (ws: WebSocket) => {
  // Handle incoming messages from peers
  ws.on('message', (data) => {
    // Parse incoming message (should be JSON)
    const msg = typeof data === 'string' ? data : data.toString('utf8');
    let parsed: any;
    try {
      parsed = JSON.parse(msg);
    } catch {
      return; // Invalid JSON - ignore
    }

    if (!parsed || typeof parsed.type !== 'string') return;

    // Route message based on type
    switch (parsed.type) {
      case 'join': {
        // Peer wants to join a room
        const roomId = String(parsed.roomId || 'default');
        joinRoom(roomId, ws); // Add to room
        const peerCount = rooms.get(roomId)!.size - 1; // Count other peers
        // Notify peer they joined successfully
        ws.send(JSON.stringify({ type: 'joined', roomId, peers: peerCount }));
        // Notify other peers in room that someone joined
        broadcastToRoom(roomId, ws, { type: 'peer-joined' });
        break;
      }
      case 'signal': {
        // Forward WebRTC signaling message (SDP offer/answer, ICE candidate)
        // These messages are forwarded to other peers in the room
        const roomId = (ws as any)._roomId || 'default';
        broadcastToRoom(roomId, ws, { type: 'signal', payload: parsed.payload });
        break;
      }
      case 'leave': {
        // Peer is leaving the room
        const roomId = (ws as any)._roomId;
        if (roomId) broadcastToRoom(roomId, ws, { type: 'peer-left' }); // Notify others
        leaveRoom(ws); // Remove from room
        break;
      }
    }
  });

  // Handle peer disconnection
  ws.on('close', () => {
    const roomId = (ws as any)._roomId;
    if (roomId) {
      // Notify other peers in room that this peer left
      broadcastToRoom(roomId, ws, { type: 'peer-left' });
    }
    leaveRoom(ws); // Clean up room membership
  });
});

/**
 * Server statistics interface
 * Tracks request metrics for monitoring and analysis
 */
interface Stats {
  totalRequests: number; // Total HTTP requests received
  totalBytes: number; // Total bytes served
  requestsByPath: Record<string, number>; // Request counts by URL path
  startTime: string; // Server start timestamp
  peerRequests: number; // Requests served by peers (cache hits) - reduces origin load
  originRequests: number; // Requests to origin server (cache misses) - server load
  cacheHitRatio: number; // Percentage of requests served by peers
}

// Statistics tracking for origin server
// Updated when peers report cache hits/misses
let stats: Stats = {
  totalRequests: 0,
  totalBytes: 0,
  requestsByPath: {},
  startTime: new Date().toISOString(),
  peerRequests: 0, // Track how many requests peers handled
  originRequests: 0, // Track how many requests hit origin server
  cacheHitRatio: 0, // Calculated: peerRequests / (peerRequests + originRequests)
};

// Ensure directories exist
if (!fs.existsSync(STATIC_DIR)) {
  fs.mkdirSync(STATIC_DIR, { recursive: true });
}

// Middleware
app.use(express.json()); // Parse JSON request bodies

/**
 * Track requests for statistics
 * Must be before static serving to capture all requests
 * Records total requests, bytes served, and requests by path
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  stats.totalRequests++; // Increment total request counter

  // Intercept response methods to track bytes served
  const originalSend = res.send.bind(res);
  const originalSendFile = res.sendFile.bind(res);

  // Override send() to track response size
  res.send = function (data?: any) {
    if (data) {
      // Calculate response size in bytes
      stats.totalBytes += Buffer.byteLength(data);
    }
    // Track requests by path
    stats.requestsByPath[req.path] = (stats.requestsByPath[req.path] || 0) + 1;
    return originalSend(data);
  };

  // Override sendFile() to track file requests
  res.sendFile = function (
    filePath: string,
    optionsOrCallback?: any,
    callback?: (err: Error) => void
  ) {
    // Track file requests by path
    stats.requestsByPath[req.path] = (stats.requestsByPath[req.path] || 0) + 1;
    if (callback) {
      return originalSendFile(filePath, optionsOrCallback, callback);
    } else {
      return originalSendFile(filePath, optionsOrCallback);
    }
  } as typeof originalSendFile;

  next(); // Continue to next middleware
});

/**
 * Request logging middleware
 * Logs all HTTP requests for debugging and monitoring
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
  next(); // Continue processing
});

/**
 * CORS headers for browser-based clients
 * Must be before routes to allow cross-origin requests
 * Allows any origin (*) for development - restrict in production
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow all origins
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200); // OK response for preflight
  }
  next();
});

// API Routes (must be before static file serving)
// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: 'μCloud Origin Server',
  });
});

// Statistics endpoint for monitoring server load
app.get('/stats', (req: Request, res: Response) => {
  // Calculate cache hit ratio
  const totalCacheableRequests = stats.peerRequests + stats.originRequests;
  stats.cacheHitRatio =
    totalCacheableRequests > 0 ? (stats.peerRequests / totalCacheableRequests) * 100 : 0;

  res.json({
    ...stats,
    uptime: Math.floor((Date.now() - new Date(stats.startTime).getTime()) / 1000),
  });
});

// Endpoint to record a cache hit (when peer serves content)
app.post('/api/cache-hit', (req: Request, res: Response) => {
  stats.peerRequests++;
  res.json({ success: true, stats });
});

// Endpoint to record a cache miss (when peer requests from origin)
app.post('/api/cache-miss', (req: Request, res: Response) => {
  stats.originRequests++;
  res.json({ success: true, stats });
});

// Get list of available files for simulation
app.get('/api/files', (req: Request, res: Response) => {
  try {
    const files: Array<{ path: string; size: number; chunks: number }> = [];
    const CHUNK_SIZE = 16 * 1024; // 16KB chunks

    // Check all .txt and .json files in public directory
    if (fs.existsSync(STATIC_DIR)) {
      const fileList = fs.readdirSync(STATIC_DIR);
      fileList.forEach((fileName) => {
        if (fileName.endsWith('.txt') || fileName.endsWith('.json')) {
          const filePath = `/${fileName}`;
          const filePathOnDisk = path.join(STATIC_DIR, fileName);
          try {
            const stats = fs.statSync(filePathOnDisk);
            const chunks = Math.ceil(stats.size / CHUNK_SIZE);
            files.push({
              path: filePath,
              size: stats.size,
              chunks: chunks,
            });
          } catch (err) {
            // Skip files we can't read
            console.warn(`Could not read file ${fileName}:`, err);
          }
        }
      });
    }

    // Sort by size (smallest first)
    files.sort((a, b) => a.size - b.size);

    res.json({ files: files.map(f => f.path), fileInfo: files });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Proxy endpoint for external URLs (to handle CORS)
app.get('/api/proxy', async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    // Validate URL
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // Fetch the external URL
    const response = await fetch(url);
    const contentType = response.headers.get('Content-Type') || 'text/plain';
    const content = await response.text();

    // Set CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Content-Type', contentType);
    res.send(content);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch URL',
    });
  }
});

// Flash crowd simulation endpoint
app.post('/api/simulate', async (req: Request, res: Response) => {
  try {
    const {
      numPeers,
      targetFile,
      duration,
      requestInterval,
      requestProbability,
      churnRate,
      flashCrowd,
      joinRate,
      anchorSignalingLatency,
      churnMode,
      deviceHeterogeneity,
      fileSizeBytes,
      baselineMode,
    } = req.body;

    const config = {
      numPeers: numPeers || 20,
      targetFile: targetFile || '/sample.txt',
      duration: duration || 30, // seconds
      requestInterval: requestInterval, // DEPRECATED: kept for backward compatibility
      requestProbability: requestProbability !== undefined ? requestProbability : (requestInterval ? Math.min(1.0, 1000 / requestInterval) : 0.5),
      churnRate: churnRate || 0,
      flashCrowd: flashCrowd !== undefined ? flashCrowd : false,
      joinRate: joinRate || 2, // peers per second
      anchorSignalingLatency: anchorSignalingLatency || 100, // ms
      churnMode: churnMode || 'mixed',
      deviceHeterogeneity: deviceHeterogeneity || {
        latencyMin: 10,
        latencyMax: 250,
        bandwidthMin: 10,
        bandwidthMax: 100,
      },
      fileSizeBytes: fileSizeBytes,
      baselineMode: baselineMode || false,
    };

    // Import and run simulation
    const { runFlashCrowdSimulation } = await import('./simulation');
    const results = await runFlashCrowdSimulation(config);

    res.json({ success: true, results });
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Reset stats endpoint (for testing)
app.post('/stats/reset', (req: Request, res: Response) => {
  stats = {
    totalRequests: 0,
    totalBytes: 0,
    requestsByPath: {},
    startTime: new Date().toISOString(),
    peerRequests: 0,
    originRequests: 0,
    cacheHitRatio: 0,
  };
  res.json({ message: 'Stats reset', stats });
});

// Serve React dashboard build if it exists (before public static files)
if (fs.existsSync(REACT_BUILD_DIR)) {
  // Serve React app static assets
  app.use(express.static(REACT_BUILD_DIR));

  // Serve React app for all non-API routes (SPA routing)
  // This must come AFTER API routes but BEFORE public static files
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    // Skip if it's a file with extension (like .json, .txt from public/)
    if (req.path.match(/\.[^/]+$/)) {
      return next();
    }
    // Serve React app index.html for all other routes
    res.sendFile(path.join(REACT_BUILD_DIR, 'index.html'));
  });
}

// Serve static files from public directory (fallback for sample files)
// These are served with explicit paths like /sample.txt, /sample.json
app.use('/sample.txt', express.static(path.join(STATIC_DIR, 'sample.txt')));
app.use('/sample.json', express.static(path.join(STATIC_DIR, 'sample.json')));
// Serve the larger test files for chunking tests
app.use('/sample-50kb.txt', express.static(path.join(STATIC_DIR, 'sample-50kb.txt')));
app.use('/sample-200kb.txt', express.static(path.join(STATIC_DIR, 'sample-200kb.txt')));
app.use('/sample-500kb.txt', express.static(path.join(STATIC_DIR, 'sample-500kb.txt')));
app.use('/sample-1mb.txt', express.static(path.join(STATIC_DIR, 'sample-1mb.txt')));
app.use('/sample-large.txt', express.static(path.join(STATIC_DIR, 'sample-large.txt')));
app.use('/demo.html', express.static(path.join(STATIC_DIR, 'demo.html')));
app.use('/style.css', express.static(path.join(STATIC_DIR, 'style.css')));

// Start server (HTTP + WebSocket)
server
  .listen(PORT, () => {
    console.log(`μCloud Server running on http://localhost:${PORT}`);
    console.log(`  - HTTP API & static files`);
    console.log(`  - WebSocket signaling (ws://localhost:${PORT})`);
    console.log(`Serving static files from: ${STATIC_DIR}`);
    if (fs.existsSync(REACT_BUILD_DIR)) {
      console.log(`Configuration dashboard: http://localhost:${PORT}/`);
    } else {
      console.log(`   (React build not found. Run 'npm run build' to build the dashboard.)`);
    }
    console.log(`View stats at: http://localhost:${PORT}/stats`);
    console.log(`\nPress Ctrl+C to stop the server`);
  })
  .on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use.`);
      console.error(`   Another process is using this port.`);
      console.error(`   To find and kill it, run: lsof -ti:${PORT} | xargs kill -9`);
      console.error(`   Or change the port with: PORT=3001 npm run dev:server\n`);
    } else {
      console.error(`\nServer error:`, err);
    }
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down server...');
  process.exit(0);
});
