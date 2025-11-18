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
type Room = Set<WebSocket>;
const rooms = new Map<string, Room>();

function joinRoom(roomId: string, ws: WebSocket) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId)!.add(ws);
  (ws as any)._roomId = roomId;
}

function leaveRoom(ws: WebSocket) {
  const roomId = (ws as any)._roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) rooms.delete(roomId);
  }
}

function broadcastToRoom(roomId: string, sender: WebSocket, message: any) {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const client of room) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// WebSocket connection handler for WebRTC signaling
wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (data) => {
    const msg = typeof data === 'string' ? data : data.toString('utf8');
    let parsed: any;
    try {
      parsed = JSON.parse(msg);
    } catch {
      return;
    }

    if (!parsed || typeof parsed.type !== 'string') return;

    switch (parsed.type) {
      case 'join': {
        const roomId = String(parsed.roomId || 'default');
        joinRoom(roomId, ws);
        const peerCount = rooms.get(roomId)!.size - 1;
        ws.send(JSON.stringify({ type: 'joined', roomId, peers: peerCount }));
        broadcastToRoom(roomId, ws, { type: 'peer-joined' });
        break;
      }
      case 'signal': {
        const roomId = (ws as any)._roomId || 'default';
        broadcastToRoom(roomId, ws, { type: 'signal', payload: parsed.payload });
        break;
      }
      case 'leave': {
        const roomId = (ws as any)._roomId;
        if (roomId) broadcastToRoom(roomId, ws, { type: 'peer-left' });
        leaveRoom(ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    const roomId = (ws as any)._roomId;
    if (roomId) broadcastToRoom(roomId, ws, { type: 'peer-left' });
    leaveRoom(ws);
  });
});

interface Stats {
    totalRequests: number;
    totalBytes: number;
    requestsByPath: Record<string, number>;
    startTime: string;
    peerRequests: number; // Requests served by peers (cache hits)
    originRequests: number; // Requests to origin server (cache misses)
    cacheHitRatio: number;
}

// Statistics tracking
let stats: Stats = {
    totalRequests: 0,
    totalBytes: 0,
    requestsByPath: {},
    startTime: new Date().toISOString(),
    peerRequests: 0,
    originRequests: 0,
    cacheHitRatio: 0,
};

// Ensure directories exist
if (!fs.existsSync(STATIC_DIR)) {
    fs.mkdirSync(STATIC_DIR, { recursive: true });
}

// Middleware
app.use(express.json());

// Track requests for statistics (must be before static serving)
app.use((req: Request, res: Response, next: NextFunction) => {
    stats.totalRequests++;
    const originalSend = res.send.bind(res);
    const originalSendFile = res.sendFile.bind(res);

    res.send = function (data?: any) {
        if (data) {
            stats.totalBytes += Buffer.byteLength(data);
        }
        stats.requestsByPath[req.path] = (stats.requestsByPath[req.path] || 0) + 1;
        return originalSend(data);
    };

    res.sendFile = function (
        filePath: string,
        optionsOrCallback?: any,
        callback?: (err: Error) => void
    ) {
        stats.requestsByPath[req.path] = (stats.requestsByPath[req.path] || 0) + 1;
        if (callback) {
            return originalSendFile(filePath, optionsOrCallback, callback);
        } else {
            return originalSendFile(filePath, optionsOrCallback);
        }
    } as typeof originalSendFile;

    next();
});

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
    next();
});

// CORS headers for browser-based clients (must be before routes)
app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
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
        totalCacheableRequests > 0
            ? (stats.peerRequests / totalCacheableRequests) * 100
            : 0;

    res.json({
        ...stats,
        uptime: Math.floor(
            (Date.now() - new Date(stats.startTime).getTime()) / 1000
        ),
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
        const files: string[] = [];
        const filePaths = ['/sample.txt', '/sample.json', '/demo.html', '/style.css'];

        // Check which files actually exist
        filePaths.forEach((filePath) => {
            const fileName = filePath.substring(1); // Remove leading /
            const filePathOnDisk = path.join(STATIC_DIR, fileName);
            if (fs.existsSync(filePathOnDisk)) {
                files.push(filePath);
            }
        });

        res.json({ files });
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
            error: error instanceof Error ? error.message : 'Failed to fetch URL'
        });
    }
});

// Flash crowd simulation endpoint
app.post('/api/simulate', async (req: Request, res: Response) => {
    try {
        const { numPeers, targetFile, duration, requestInterval, churnRate } = req.body;

        const config = {
            numPeers: numPeers || 20,
            targetFile: targetFile || '/sample.txt',
            duration: duration || 30, // seconds
            requestInterval: requestInterval || 100, // ms
            churnRate: churnRate || 0,
        };

        // Import and run simulation
        const { runFlashCrowdSimulation } = await import('./simulation');
        const results = await runFlashCrowdSimulation(config);

        res.json({ success: true, results });
    } catch (error) {
        console.error('Simulation error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
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
app.use('/demo.html', express.static(path.join(STATIC_DIR, 'demo.html')));
app.use('/style.css', express.static(path.join(STATIC_DIR, 'style.css')));

// Start server (HTTP + WebSocket)
server.listen(PORT, () => {
    console.log(`μCloud Server running on http://localhost:${PORT}`);
    console.log(`  - HTTP API & static files`);
    console.log(`  - WebSocket signaling (ws://localhost:${PORT})`);
    console.log(`Serving static files from: ${STATIC_DIR}`);
    if (fs.existsSync(REACT_BUILD_DIR)) {
        console.log(`Configuration dashboard: http://localhost:${PORT}/`);
    } else {
        console.log(
            `   (React build not found. Run 'npm run build' to build the dashboard.)`
        );
    }
    console.log(`View stats at: http://localhost:${PORT}/stats`);
    console.log(`\nPress Ctrl+C to stop the server`);
}).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use.`);
        console.error(`   Another process is using this port.`);
        console.error(`   To find and kill it, run: lsof -ti:${PORT} | xargs kill -9`);
        console.error(`   Or change the port with: PORT=3001 npm run dev:server\n`);
    } else {
        console.error(`\n❌ Server error:`, err);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\nShutting down server...');
    process.exit(0);
});

