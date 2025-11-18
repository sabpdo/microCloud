# µCloud

# WebRTC

## Run

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start signaling server:
   ```bash
   npm run dev
   ```

3. Build and open client:
   ```bash
   npm run build:client
   ```
   Then open `client/index.html` in a browser (or use a local server).

4. Open multiple browser windows/tabs to test peer connections (should enter same room and see heartbeats)

Architecture so far:

- **Signaling Server** (`server/src/index.tsx`): WebSocket server for WebRTC handshake signaling
- **WebRTC Client** (`client/src/webrtc.tsx`): Browser client with WebRTC connections, SDP/ICE handshakes, and heartbeat monitoring
