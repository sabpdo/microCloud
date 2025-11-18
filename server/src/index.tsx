/*
 * µCloud Signaling Server
 * WebSocket-based signaling for WebRTC handshakes only
 */

import express from 'express';
import http from 'http';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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

server.listen(PORT, () => {
  console.log(`µCloud signaling server on http://localhost:${PORT}`);
});
