/*
 * µCloud WebRTC Client
 * WebRTC connections, handshakes, and heartbeats only
 */

export type MicroCloudClientOptions = {
  signalingUrl: string;
  onOpen?: () => void;
  onClose?: () => void;
  onLog?: (...args: any[]) => void;
};

const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 15000;

export class MicroCloudClient {
  private signalingUrl: string;
  private onOpen: () => void;
  private onClose: () => void;
  private log: (...args: any[]) => void;

  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private roomId: string = 'default';
  private heartbeatTimer: number | null = null;
  private lastHeartbeatAt = 0;
  private isInitiator = false;
  private negotiateTimer: number | null = null;

  constructor(options: MicroCloudClientOptions) {
    this.signalingUrl = options.signalingUrl;
    this.onOpen = options.onOpen || (() => {});
    this.onClose = options.onClose || (() => {});
    this.log = options.onLog || (() => {});
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
        this.isInitiator = false;
        await this.ensurePeerConnection(false);
        // Fallback: initiate if no offer received within 3s
        this.clearNegotiateTimer();
        this.negotiateTimer = window.setTimeout(async () => {
          if (!this.pc) return;
          const hasRemote = !!this.pc.currentRemoteDescription;
          const dcOpen = this.dc && this.dc.readyState === 'open';
          if (!hasRemote && !dcOpen) {
            this.log('no offer received, initiating');
            this.isInitiator = true;
            await this.ensurePeerConnection(true);
            await this.createOffer();
          }
        }, 3000);
        break;
      }
      case 'peer-joined': {
        this.log('peer joined, initiating connection');
        this.isInitiator = true;
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
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    this.pc = pc;
    this.log('peer connection created, initiator:', initiator);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.log('ice candidate');
        this.sendSignal({
          type: 'signal',
          payload: { kind: 'ice-candidate', candidate: ev.candidate }
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
      const text = typeof ev.data === 'string' ? ev.data : String(ev.data);
      let msg: any;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (msg && msg.type === 'heartbeat') {
        this.lastHeartbeatAt = Date.now();
        this.log('heartbeat received');
      }
    };
  }

  private async createOffer() {
    if (!this.pc) return;
    this.log('creating offer');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({
      type: 'signal',
      payload: { kind: 'sdp-offer', sdp: this.pc.localDescription }
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
          payload: { kind: 'sdp-answer', sdp: this.pc!.localDescription }
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

  private teardown() {
    this.stopHeartbeat();
    this.clearNegotiateTimer();
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
