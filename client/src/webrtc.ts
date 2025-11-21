/*
 * µCloud WebRTC Client
 * WebRTC connections, handshakes, and heartbeats only
 */

export type MicroCloudClientOptions = {
  signalingUrl: string;
  onOpen?: () => void;
  onClose?: () => void;
  onLog?: (...args: any[]) => void;
  onFileRequest?: (resourceHash: string, requestId: string) => void;
  onManifestRequest?: () => void;
};

const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 15000;

const CHUNK_SIZE = 16 * 1024; // 16KB chunks (DataChannel message size limit)

interface FileRequest {
  type: 'file-request';
  resourceHash: string;
  requestId: string;
}

interface FileResponse {
  type: 'file-response';
  requestId: string;
  resourceHash: string;
  success: boolean;
  mimeType?: string;
  totalChunks?: number;
  contentLength?: number;
}

interface FileChunk {
  type: 'file-chunk';
  requestId: string;
  chunkIndex: number;
  totalChunks: number;
  data: string; // Base64 encoded
}

interface FileTransferComplete {
  type: 'file-complete';
  requestId: string;
  resourceHash: string;
}

interface ManifestRequest {
  type: 'manifest-request';
}

interface ManifestResponse {
  type: 'manifest-response';
  manifest: any;
}

export type PeerMessage =
  | FileRequest
  | FileResponse
  | FileChunk
  | FileTransferComplete
  | ManifestRequest
  | ManifestResponse
  | { type: 'heartbeat'; t: number };

export class MicroCloudClient {
  private signalingUrl: string;
  private onOpen: () => void;
  private onClose: () => void;
  private log: (...args: any[]) => void;
  public onFileRequest: (resourceHash: string, requestId: string) => void;
  public onManifestRequest: () => void;

  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private roomId: string = 'default';
  private heartbeatTimer: number | null = null;
  private lastHeartbeatAt = 0;
  private negotiateTimer: number | null = null;

  // File transfer tracking
  private pendingRequests = new Map<
    string,
    {
      resolve: (data: ArrayBuffer) => void;
      reject: (error: Error) => void;
      chunks: Map<number, Uint8Array>;
      totalChunks: number;
      timeout: number;
    }
  >();

  constructor(options: MicroCloudClientOptions) {
    this.signalingUrl = options.signalingUrl;
    this.onOpen = options.onOpen || (() => {});
    this.onClose = options.onClose || (() => {});
    this.log = options.onLog || (() => {});
    this.onFileRequest = options.onFileRequest || (() => {});
    this.onManifestRequest = options.onManifestRequest || (() => {});
  }

  async join(roomId?: string) {
    this.roomId = roomId || 'default';
    await this.connectSignaling();
    this.sendSignal({ type: 'join', roomId: this.roomId });
  }

  async leave() {
    this.sendSignal({ type: 'leave' });
    this.teardown();
  }

  // Signaling
  private connectSignaling(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.signalingUrl);
      this.ws = ws;
      ws.onopen = () => {
        this.log('signaling connected');
        resolve();
      };
      ws.onmessage = (ev) => this.onSignalMessage(ev);
      ws.onclose = () => {
        this.log('signaling closed');
        this.teardown();
      };
      ws.onerror = (err) => {
        this.log('signaling error', err);
        reject(err);
      };
    });
  }

  private sendSignal(obj: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private async onSignalMessage(ev: MessageEvent) {
    const data = typeof ev.data === 'string' ? ev.data : String(ev.data);
    let msg: any;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'joined': {
        this.log('joined room', msg.roomId, 'peers:', msg.peers);
        await this.ensurePeerConnection(false);
        // Fallback: initiate if no offer received within 3s
        this.clearNegotiateTimer();
        this.negotiateTimer = window.setTimeout(async () => {
          if (!this.pc) return;
          const hasRemote = !!this.pc.currentRemoteDescription;
          const dcOpen = this.dc && this.dc.readyState === 'open';
          if (!hasRemote && !dcOpen) {
            this.log('no offer received, initiating');
            await this.ensurePeerConnection(true);
            await this.createOffer();
          }
        }, 3000);
        break;
      }
      case 'peer-joined': {
        this.log('peer joined, initiating connection');
        await this.ensurePeerConnection(true);
        this.clearNegotiateTimer();
        await this.createOffer();
        break;
      }
      case 'peer-left': {
        this.log('peer left');
        break;
      }
      case 'signal': {
        await this.handleSignal(msg.payload);
        break;
      }
    }
  }

  // WebRTC
  private async ensurePeerConnection(initiator: boolean) {
    if (this.pc) {
      if (initiator && !this.dc) {
        this.log('creating datachannel as initiator');
        const channel = this.pc.createDataChannel('mc', { ordered: true });
        this.attachDataChannel(channel);
      }
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.pc = pc;
    this.log('peer connection created, initiator:', initiator);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.log('ice candidate');
        this.sendSignal({
          type: 'signal',
          payload: { kind: 'ice-candidate', candidate: ev.candidate },
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      this.log('ice state:', pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      this.log('connection state:', pc.connectionState);
    };

    pc.ondatachannel = (ev) => {
      this.log('datachannel received');
      if (this.dc && this.dc !== ev.channel) {
        this.log('ignoring duplicate datachannel');
        return;
      }
      this.attachDataChannel(ev.channel);
    };

    if (initiator && !this.dc) {
      const channel = pc.createDataChannel('mc', { ordered: true });
      this.attachDataChannel(channel);
    }
  }

  private attachDataChannel(channel: RTCDataChannel) {
    if (this.dc === channel) {
      if (channel.readyState === 'open') {
        this.onOpen();
        this.startHeartbeat();
      }
      return;
    }

    this.dc = channel;
    this.log('datachannel attached, state:', channel.readyState);

    if (channel.readyState === 'open') {
      this.log('datachannel open');
      this.onOpen();
      this.startHeartbeat();
      this.sendHeartbeat();
    } else {
      channel.onopen = () => {
        this.log('datachannel opened');
        this.onOpen();
        this.startHeartbeat();
        this.sendHeartbeat();
      };
    }

    channel.onclose = () => {
      this.log('datachannel closed');
      this.onClose();
      this.stopHeartbeat();
    };

    channel.onmessage = (ev) => {
      this.handleDataChannelMessage(ev);
    };
  }

  private handleDataChannelMessage(ev: MessageEvent) {
    const text = typeof ev.data === 'string' ? ev.data : String(ev.data);
    let msg: PeerMessage;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'heartbeat': {
        this.lastHeartbeatAt = Date.now();
        this.log('heartbeat received');
        break;
      }
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
          // Initialize chunk tracking
          const pending = this.pendingRequests.get(msg.requestId);
          if (pending) {
            pending.totalChunks = msg.totalChunks;
            if (pending.totalChunks === 0) {
              // Empty file
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
          const binaryString = atob(msg.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
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
        // Acknowledgment, can be used for cleanup
        this.log('file transfer acknowledged');
        break;
      }
      case 'manifest-request': {
        this.onManifestRequest();
        break;
      }
    }
  }

  private async createOffer() {
    if (!this.pc) return;
    this.log('creating offer');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({
      type: 'signal',
      payload: { kind: 'sdp-offer', sdp: this.pc.localDescription },
    });
  }

  private async handleSignal(payload: any) {
    if (!payload || typeof payload.kind !== 'string') return;
    await this.ensurePeerConnection(false);

    switch (payload.kind) {
      case 'sdp-offer': {
        this.log('received offer');
        const desc = new RTCSessionDescription(payload.sdp);
        await this.pc!.setRemoteDescription(desc);
        const answer = await this.pc!.createAnswer();
        await this.pc!.setLocalDescription(answer);
        this.sendSignal({
          type: 'signal',
          payload: { kind: 'sdp-answer', sdp: this.pc!.localDescription },
        });
        break;
      }
      case 'sdp-answer': {
        this.log('received answer');
        const desc = new RTCSessionDescription(payload.sdp);
        await this.pc!.setRemoteDescription(desc);
        break;
      }
      case 'ice-candidate': {
        try {
          await this.pc!.addIceCandidate(payload.candidate);
        } catch (e) {
          this.log('addIceCandidate error', e);
        }
        break;
      }
    }
  }

  // Heartbeat
  private startHeartbeat() {
    this.stopHeartbeat();
    this.lastHeartbeatAt = Date.now();
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.dc || this.dc.readyState !== 'open') {
        return;
      }
      this.sendHeartbeat();
      const elapsed = Date.now() - this.lastHeartbeatAt;
      if (elapsed >= HEARTBEAT_TIMEOUT_MS) {
        this.log('heartbeat timeout, closing connection');
        this.teardown();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat() {
    if (!this.dc || this.dc.readyState !== 'open') return;
    try {
      this.dc.send(JSON.stringify({ type: 'heartbeat', t: Date.now() }));
    } catch (err) {
      this.log('heartbeat send error', err);
    }
  }

  private clearNegotiateTimer() {
    if (this.negotiateTimer) {
      clearTimeout(this.negotiateTimer);
      this.negotiateTimer = null;
    }
  }

  // Public getters
  isDataChannelReady(): boolean {
    return this.dc !== null && this.dc.readyState === 'open';
  }

  getDataChannel(): RTCDataChannel | null {
    return this.dc;
  }

  // File transfer methods
  async requestFile(resourceHash: string, timeout: number = 30000): Promise<ArrayBuffer> {
    if (!this.isDataChannelReady()) {
      throw new Error('DataChannel not open');
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
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

      const request: FileRequest = {
        type: 'file-request',
        resourceHash,
        requestId,
      };

      try {
        if (!this.dc) {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          reject(new Error('DataChannel not available'));
          return;
        }
        this.dc.send(JSON.stringify(request));
        this.log('sent file request:', resourceHash);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  sendFile(
    resourceHash: string,
    content: ArrayBuffer | string,
    mimeType: string,
    requestId: string
  ): void {
    if (!this.isDataChannelReady()) {
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

      if (!this.dc) {
        this.log('cannot send file: DataChannel is null');
        return;
      }

      if (totalChunks === 0) {
        // Empty file
        const response: FileResponse = {
          type: 'file-response',
          requestId,
          resourceHash,
          success: true,
          mimeType,
          totalChunks: 0,
          contentLength: 0,
        };
        this.dc.send(JSON.stringify(response));
        return;
      }

      // Send response with metadata
      const response: FileResponse = {
        type: 'file-response',
        requestId,
        resourceHash,
        success: true,
        mimeType,
        totalChunks,
        contentLength: bytes.length,
      };
      this.dc.send(JSON.stringify(response));

      // Send chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, bytes.length);
        const chunk = bytes.subarray(start, end);

        // Encode as base64
        const binaryString = String.fromCharCode(...chunk);
        const base64 = btoa(binaryString);

        const chunkMsg: FileChunk = {
          type: 'file-chunk',
          requestId,
          chunkIndex: i,
          totalChunks,
          data: base64,
        };

        if (this.dc) {
          this.dc.send(JSON.stringify(chunkMsg));
        }
      }

      // Send completion message
      if (this.dc) {
        const complete: FileTransferComplete = {
          type: 'file-complete',
          requestId,
          resourceHash,
        };
        this.dc.send(JSON.stringify(complete));
        this.log(`sent file ${resourceHash} (${totalChunks} chunks)`);
      }
    } catch (error) {
      this.log('error sending file:', error);
      if (this.dc) {
        const errorResponse: FileResponse = {
          type: 'file-response',
          requestId,
          resourceHash,
          success: false,
        };
        this.dc.send(JSON.stringify(errorResponse));
      }
    }
  }

  sendManifest(manifest: any): void {
    if (!this.isDataChannelReady() || !this.dc) {
      return;
    }

    const msg: ManifestResponse = {
      type: 'manifest-response',
      manifest,
    };

    try {
      this.dc.send(JSON.stringify(msg));
      this.log('sent manifest');
    } catch (error) {
      this.log('error sending manifest:', error);
    }
  }

  requestManifest(): void {
    if (!this.isDataChannelReady() || !this.dc) {
      return;
    }

    const msg: ManifestRequest = {
      type: 'manifest-request',
    };

    try {
      this.dc.send(JSON.stringify(msg));
      this.log('requested manifest');
    } catch (error) {
      this.log('error requesting manifest:', error);
    }
  }

  private teardown() {
    this.stopHeartbeat();
    this.clearNegotiateTimer();

    // Reject all pending requests
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    try {
      this.dc && this.dc.close();
    } catch {}
    try {
      this.pc && this.pc.close();
    } catch {}
    try {
      this.ws && this.ws.close();
    } catch {}
    this.dc = null;
    this.pc = null;
    this.ws = null;
  }
}

(window as any).MicroCloudClient = MicroCloudClient;
