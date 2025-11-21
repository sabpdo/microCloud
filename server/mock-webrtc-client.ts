/**
 * Mock WebRTC Client for Server-Side Simulation
 * Simulates WebRTC DataChannel file transfers without actual WebRTC
 * Used in server-side simulation to test PeerBrowser logic
 */

import type { CacheManifest } from '../src/cache/manifest-generator';

// Types matching the real MicroCloudClient interface
export type MicroCloudClientOptions = {
  signalingUrl: string;
  onOpen?: () => void;
  onClose?: () => void;
  onLog?: (...args: any[]) => void;
  onFileRequest?: (resourceHash: string, requestId: string) => void;
  onManifestRequest?: () => void;
};

export type PeerMessage =
  | { type: 'file-request'; resourceHash: string; requestId: string }
  | {
      type: 'file-response';
      requestId: string;
      resourceHash: string;
      success: boolean;
      mimeType?: string;
      totalChunks?: number;
      contentLength?: number;
    }
  | { type: 'file-chunk'; requestId: string; chunkIndex: number; totalChunks: number; data: string }
  | { type: 'file-complete'; requestId: string; resourceHash: string }
  | { type: 'manifest-request' }
  | { type: 'manifest-response'; manifest: any }
  | { type: 'heartbeat'; t: number };

const CHUNK_SIZE = 16 * 1024; // 16KB chunks

/**
 * Mock MicroCloudClient for server-side simulation
 * Simulates WebRTC file transfers with latency and bandwidth constraints
 * Connects to other mock clients via a shared message bus
 */
export class MockMicroCloudClient {
  private onOpen: () => void;
  private onClose: () => void;
  private log: (...args: any[]) => void;
  public onFileRequest: (resourceHash: string, requestId: string) => void;
  public onManifestRequest: () => void;

  private roomId: string = 'default';
  private isOpen: boolean = false;
  private peerId: string;

  // File transfer tracking
  private pendingRequests = new Map<
    string,
    {
      resolve: (data: ArrayBuffer) => void;
      reject: (error: Error) => void;
      chunks: Map<number, Uint8Array>;
      totalChunks: number;
      timeout: NodeJS.Timeout;
    }
  >();

  // Static message bus for peer-to-peer communication
  private static messageBus = new Map<string, MockMicroCloudClient[]>();

  // Latency and bandwidth for this peer (for simulation)
  private latency: number = 50; // ms
  private bandwidth: number = 100; // Mbps

  constructor(
    peerId: string,
    options: MicroCloudClientOptions,
    latency?: number,
    bandwidth?: number
  ) {
    this.peerId = peerId;
    this.onOpen = options.onOpen || (() => {});
    this.onClose = options.onClose || (() => {});
    this.log = options.onLog || (() => {});
    this.onFileRequest = options.onFileRequest || (() => {});
    this.onManifestRequest = options.onManifestRequest || (() => {});

    if (latency !== undefined) this.latency = latency;
    if (bandwidth !== undefined) this.bandwidth = bandwidth;
  }

  /**
   * Join a room (add to message bus)
   */
  async join(roomId?: string): Promise<void> {
    this.roomId = roomId || 'default';

    // Add this client to the room's message bus
    if (!MockMicroCloudClient.messageBus.has(this.roomId)) {
      MockMicroCloudClient.messageBus.set(this.roomId, []);
    }
    MockMicroCloudClient.messageBus.get(this.roomId)!.push(this);

    // Simulate connection delay
    await this.delay(this.latency);
    this.isOpen = true;
    this.onOpen();
    this.log(`Mock client ${this.peerId} joined room ${this.roomId}`);
  }

  /**
   * Check if data channel is ready (simulated as always ready if joined)
   */
  isDataChannelReady(): boolean {
    return this.isOpen;
  }

  /**
   * Get a mock data channel (returns null - not used in simulation)
   */
  getDataChannel(): null {
    return null; // Not used in mock
  }

  /**
   * Request a file from connected peers
   * Simulates file transfer with latency and bandwidth constraints
   */
  async requestFile(resourceHash: string, timeout: number = 30000): Promise<ArrayBuffer> {
    if (!this.isOpen) {
      throw new Error('DataChannel not open');
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('File request timeout'));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        chunks: new Map(),
        totalChunks: 0,
        timeout: timeoutId,
      });

      // Broadcast file request to all peers in room
      const request: PeerMessage = {
        type: 'file-request',
        resourceHash,
        requestId,
      };

      this.broadcastToPeers(request);
      this.log(`sent file request: ${resourceHash}`);
    });
  }

  /**
   * Send a file to requesting peer
   * Simulates chunked transfer with bandwidth and latency
   */
  async sendFile(
    resourceHash: string,
    content: ArrayBuffer | string,
    mimeType: string,
    requestId: string
  ): Promise<void> {
    if (!this.isOpen) {
      this.log('cannot send file: DataChannel not open');
      return;
    }

    try {
      // Convert string to ArrayBuffer if needed
      let buffer: ArrayBuffer;
      if (typeof content === 'string') {
        const encoder = new TextEncoder();
        buffer = encoder.encode(content).buffer;
      } else {
        buffer = content;
      }

      const bytes = new Uint8Array(buffer);
      const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);

      if (totalChunks === 0) {
        // Empty file
        const response: PeerMessage = {
          type: 'file-response',
          requestId,
          resourceHash,
          success: true,
          mimeType,
          totalChunks: 0,
          contentLength: 0,
        };
        this.sendToRequestingPeer(requestId, response);
        return;
      }

      // Send response with metadata
      const response: PeerMessage = {
        type: 'file-response',
        requestId,
        resourceHash,
        success: true,
        mimeType,
        totalChunks,
        contentLength: bytes.length,
      };
      this.sendToRequestingPeer(requestId, response);

      // Simulate transfer time based on bandwidth
      const transferTimeMs = ((bytes.length * 8) / (this.bandwidth * 1000000)) * 1000;
      const chunkDelay = Math.max(1, transferTimeMs / totalChunks);

      // Send chunks with simulated bandwidth delay
      for (let i = 0; i < totalChunks; i++) {
        await this.delay(chunkDelay + this.latency);

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, bytes.length);
        const chunk = bytes.subarray(start, end);

        // Encode as base64
        const binaryString = String.fromCharCode(...chunk);
        const base64 = Buffer.from(binaryString, 'binary').toString('base64');

        const chunkMsg: PeerMessage = {
          type: 'file-chunk',
          requestId,
          chunkIndex: i,
          totalChunks,
          data: base64,
        };

        this.sendToRequestingPeer(requestId, chunkMsg);
      }

      // Send completion message
      const complete: PeerMessage = {
        type: 'file-complete',
        requestId,
        resourceHash,
      };
      this.sendToRequestingPeer(requestId, complete);
    } catch (error) {
      this.log('error sending file:', error);
      const failResponse: PeerMessage = {
        type: 'file-response',
        requestId,
        resourceHash,
        success: false,
      };
      this.sendToRequestingPeer(requestId, failResponse);
    }
  }

  /**
   * Send manifest (not fully implemented in mock)
   */
  sendManifest(manifest: CacheManifest): void {
    if (!this.isOpen) return;
    this.log('sent manifest (mock)');
  }

  /**
   * Request manifest (not fully implemented in mock)
   */
  requestManifest(): void {
    if (!this.isOpen) return;
    const msg: PeerMessage = { type: 'manifest-request' };
    this.broadcastToPeers(msg);
  }

  /**
   * Handle incoming message from another peer
   */
  receiveMessage(msg: PeerMessage): void {
    if (!this.isOpen) return;

    switch (msg.type) {
      case 'file-request': {
        this.log('file request received:', msg.resourceHash);
        this.onFileRequest(msg.resourceHash, msg.requestId);
        break;
      }
      case 'file-response': {
        this.log('file response received:', msg.success ? 'success' : 'failed');
        if (!msg.success) {
          const pending = this.pendingRequests.get(msg.requestId);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(msg.requestId);
            pending.reject(new Error('Peer does not have requested file'));
          }
        } else if (msg.totalChunks !== undefined) {
          const pending = this.pendingRequests.get(msg.requestId);
          if (pending) {
            pending.totalChunks = msg.totalChunks;
            if (pending.totalChunks === 0) {
              clearTimeout(pending.timeout);
              this.pendingRequests.delete(msg.requestId);
              pending.resolve(new ArrayBuffer(0));
            }
          }
        }
        break;
      }
      case 'file-chunk': {
        const pending = this.pendingRequests.get(msg.requestId);
        if (!pending) {
          this.log('received chunk for unknown request:', msg.requestId);
          return;
        }

        // Decode base64 chunk
        try {
          const buffer = Buffer.from(msg.data, 'base64');
          const bytes = new Uint8Array(buffer);
          pending.chunks.set(msg.chunkIndex, bytes);
          this.log(`received chunk ${msg.chunkIndex + 1}/${msg.totalChunks}`);

          // Check if all chunks received
          if (pending.chunks.size === pending.totalChunks) {
            clearTimeout(pending.timeout);

            // Reassemble file
            const chunks = Array.from(
              { length: pending.totalChunks },
              (_, i) => pending.chunks.get(i)!
            );
            const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const result = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              result.set(chunk, offset);
              offset += chunk.length;
            }

            this.pendingRequests.delete(msg.requestId);
            pending.resolve(result.buffer);
            this.log('file transfer complete');
          }
        } catch (error) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(msg.requestId);
          pending.reject(new Error('Failed to decode chunk'));
        }
        break;
      }
      case 'file-complete': {
        this.log('file transfer acknowledged');
        break;
      }
      case 'manifest-request': {
        this.onManifestRequest();
        break;
      }
    }
  }

  /**
   * Broadcast message to all other peers in the room
   */
  private broadcastToPeers(msg: PeerMessage): void {
    const peers = MockMicroCloudClient.messageBus.get(this.roomId) || [];
    for (const peer of peers) {
      if (peer !== this && peer.isOpen) {
        // Simulate network latency
        setTimeout(() => {
          peer.receiveMessage(msg);
        }, this.latency);
      }
    }
  }

  /**
   * Send message to the peer that requested a file
   * In real WebRTC, this would be a direct connection
   * In simulation, we find the requesting peer and send to them
   */
  private sendToRequestingPeer(requestId: string, msg: PeerMessage): void {
    const peers = MockMicroCloudClient.messageBus.get(this.roomId) || [];
    // Find peer that has this request pending
    for (const peer of peers) {
      if (peer !== this && peer.isOpen && peer.pendingRequests.has(requestId)) {
        setTimeout(() => {
          peer.receiveMessage(msg);
        }, this.latency);
        return;
      }
    }
    // If not found, broadcast (fallback)
    this.broadcastToPeers(msg);
  }

  /**
   * Simulate delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Disconnect from room
   */
  disconnect(): void {
    const peers = MockMicroCloudClient.messageBus.get(this.roomId) || [];
    const index = peers.indexOf(this);
    if (index > -1) {
      peers.splice(index, 1);
    }
    this.isOpen = false;
    this.onClose();
    this.log(`Mock client ${this.peerId} disconnected`);
  }

  /**
   * Clear all rooms (for testing)
   */
  static clearAllRooms(): void {
    MockMicroCloudClient.messageBus.clear();
  }
}
