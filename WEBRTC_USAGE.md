# WebRTC File Transfer Usage

This document explains how to use the WebRTC-based file transfer system.

## Overview

The system now uses actual WebRTC DataChannels to transfer file content between peers. File transfers are chunked (16KB chunks) to handle large files and DataChannel message size limits.

## Key Components

### MicroCloudClient

The `MicroCloudClient` class handles WebRTC connections and file transfers:

- `requestFile(resourceHash, timeout)`: Request a file from a connected peer
- `sendFile(resourceHash, content, mimeType, requestId)`: Send a file to a requesting peer
- `sendManifest(manifest)`: Broadcast cache manifest
- `requestManifest()`: Request manifest from peer

### PeerBrowser

The `PeerBrowser` class is a browser-based Peer implementation that uses WebRTC:

- Manages cache of resources
- Tracks peer connections via WebRTC
- Handles file requests and responses
- Automatically falls back to origin server on failures

## File Transfer Protocol

1. **File Request**: Peer sends `file-request` message with resource hash and request ID
2. **File Response**: Peer responds with `file-response` containing metadata (success, MIME type, chunk count)
3. **Chunks**: File is sent in multiple `file-chunk` messages (16KB each, base64 encoded)
4. **Completion**: Sender sends `file-complete` acknowledgment

## Example Usage

```typescript
import { MicroCloudClient } from './client/src/webrtc';
import { PeerBrowser } from './src/PeerBrowser';

// Create WebRTC client
const client = new MicroCloudClient({
  signalingUrl: 'ws://localhost:3000',
  onLog: console.log,
  onOpen: () => console.log('Connected'),
  onClose: () => console.log('Disconnected'),
  onFileRequest: (hash, requestId) => {
    // Handle incoming file request
    const resource = cache.get(hash);
    if (resource) {
      client.sendFile(hash, resource.content, resource.mimeType, requestId);
    }
  },
});

// Join room
await client.join('my-room');

// Create browser peer with WebRTC client
const peer = new PeerBrowser(
  'peer-1',
  100, // bandwidth
  { a: 1, b: 1, c: 1 }, // weights
  50, // anchor threshold
  client
);

// Request resource from peers
const resource = await peer.requestResource('resource-hash');

// If not found locally or via peers, falls back to origin server
```

## Chunking

Files are automatically chunked into 16KB pieces for transfer:

- Large files are split into multiple messages
- Chunks are base64 encoded for safe transmission
- Receiver reassembles chunks in order
- Supports both string and ArrayBuffer content

## Error Handling

- Timeouts: File requests timeout after 30 seconds (configurable)
- Retries: PeerBrowser retries up to 3 times with different peers
- Fallback: Automatic fallback to origin server on failures
- Connection loss: Pending transfers are cancelled on disconnect

## Integration with Cache

The PeerBrowser integrates with the existing cache system:

- Cached resources can be served directly to requesting peers
- Resources fetched from peers are added to local cache
- Cache manifest is shared with peers for discovery
- Cache hit/miss statistics track peer transfers vs origin fetches
