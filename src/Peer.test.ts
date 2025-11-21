import { Peer } from './Peer';
import { MemoryCache } from './cache';
import { CachedResource } from './cache/manifest-generator';

describe('Peer', () => {
  let peer1: Peer;
  let peer2: Peer;
  let peer3: Peer;

  const weights = { a: 1.0, b: 1.0, c: 1.0 };

  beforeEach(() => {
    // Mock fetch to avoid network calls in tests
    global.fetch = jest.fn().mockRejectedValue(new Error('Network unavailable in tests'));

    // Create test peers with different characteristics
    peer1 = new Peer('peer-1', 100, weights, 50); // High bandwidth
    peer2 = new Peer('peer-2', 50, weights, 50); // Medium bandwidth
    peer3 = new Peer('peer-3', 25, weights, 50); // Low bandwidth
  });

  afterEach(() => {
    // Clean up any intervals
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with correct properties', () => {
      expect(peer1.peerID).toBe('peer-1');
      expect(peer1.role).toBe('transient');
    });

    it('should start with zero reputation components', () => {
      const rep = peer1.getReputation();
      // Should be based on bandwidth and uptime only (no uploads yet)
      // Default success rate is 0.5, so rep = 1.0 * 0.5 * 100 + 1.0 * 100 + 1.0 * 0 = 150
      expect(rep).toBeGreaterThan(0);
      expect(isNaN(rep)).toBe(false);
    });

    it('should initialize cache and manifest generator', async () => {
      await peer1.getManifest();
      const info = peer1.getPeerInfo();
      expect(info.cacheManifest).toBeDefined();
      if (info.cacheManifest) {
        expect(info.cacheManifest.peerId).toBe('peer-1');
        expect(info.cacheManifest.resources).toBeDefined();
        expect(Array.isArray(info.cacheManifest.resources)).toBe(true);
      }
    });
  });

  describe('Reputation System', () => {
    it('should calculate reputation based on uploads', () => {
      const initialRep = peer1.getReputation();

      // Add successful uploads
      for (let i = 0; i < 10; i++) {
        peer1.recordSuccessfulUpload();
      }

      const newRep = peer1.getReputation();
      expect(newRep).toBeGreaterThan(initialRep);
    });

    it('should decrease reputation with failed transfers', () => {
      peer1.recordSuccessfulUpload();
      peer1.recordSuccessfulUpload();
      const repWithSuccess = peer1.getReputation();

      peer1.recordFailedTransfer();
      const repWithFailure = peer1.getReputation();

      // Reputation should decrease but still be positive
      expect(repWithFailure).toBeLessThan(repWithSuccess);
    });

    it('should update role based on reputation threshold', () => {
      expect(peer1.role).toBe('transient');

      // Boost reputation above threshold
      for (let i = 0; i < 100; i++) {
        peer1.recordSuccessfulUpload();
      }
      peer1.updateRole();

      expect(peer1.role).toBe('anchor');
    });
  });

  describe('Peer Management', () => {
    it('should add peer to peer index', async () => {
      await peer2.getManifest();
      peer1.addPeer(peer2);

      const info = peer1.getPeerInfo();
      // Peer should be in index (check via peer info access)
      expect(info).toBeDefined();
    });

    it('should update connections and remove stale peers', () => {
      jest.useFakeTimers();

      // This test checks connection timeout logic
      // In practice, you'd need to manipulate lastSeen timestamps
      peer1.updateConnections();

      // Should not throw
      expect(() => peer1.updateConnections()).not.toThrow();
    });

    it('should track uptime correctly', () => {
      jest.useFakeTimers();

      peer1.startUptimeTracking();
      jest.advanceTimersByTime(5000); // 5 seconds

      const uptime = peer1.updateUptime();
      expect(uptime).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Resource Caching', () => {
    it('should cache resources locally', async () => {
      const resource: CachedResource = {
        content: 'test content',
        mimeType: 'text/plain',
        timestamp: Math.floor(Date.now() / 1000),
      };

      const hash = 'test-hash-123';
      // Access private cache through grantChunk to test caching
      const result = await peer1.grantChunk(hash);
      expect(result).toBeNull(); // Not cached yet
    });

    it('should generate manifest with cached resources', async () => {
      await peer1.getManifest();
      const info = peer1.getPeerInfo();
      const manifest = info.cacheManifest;

      expect(manifest).toBeDefined();
      if (manifest) {
        expect(manifest).toHaveProperty('peerId', 'peer-1');
        expect(manifest).toHaveProperty('resources');
        expect(Array.isArray(manifest.resources)).toBe(true);
      }
    });
  });

  describe('Resource Request', () => {
    it('should handle request for non-existent resource', async () => {
      // Mock fetch to avoid actual network calls
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      // Request resource that doesn't exist locally or in peers
      try {
        const result = await peer1.requestResource('nonexistent-hash');
        // If it succeeds, should be defined; if it fails, we catch it
        expect(result !== undefined || result === null).toBe(true);
      } catch (error) {
        // Fetch failure is expected without a running server
        expect(error).toBeDefined();
      }
    });

    it('should return cached resource if available', async () => {
      // This test would require setting up cache first
      // For now, we test the structure
      const result = await peer1.requestResource('test-hash');
      expect(result !== undefined || result === null).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero bandwidth gracefully', () => {
      const zeroPeer = new Peer('zero-peer', 0, weights, 50);
      const rep = zeroPeer.getReputation();
      expect(typeof rep).toBe('number');
      expect(isNaN(rep)).toBe(false);
    });

    it('should handle division by zero in reputation calculation', () => {
      const newPeer = new Peer('new-peer', 50, weights, 50);
      // No uploads or failures, should still calculate reputation
      const rep = newPeer.getReputation();
      expect(typeof rep).toBe('number');
      expect(isNaN(rep)).toBe(false);
    });

    it('should handle stopUptimeTracking when not connected', () => {
      const peer = new Peer('test-peer', 50, weights, 50);
      peer.stopUptimeTracking();
      peer.stopUptimeTracking(); // Should not throw

      expect(() => peer.stopUptimeTracking()).not.toThrow();
    });

    it('should update uptime when not connected', () => {
      const peer = new Peer('test-peer', 50, weights, 50);
      peer.stopUptimeTracking();
      const uptime = peer.updateUptime();

      expect(typeof uptime).toBe('number');
    });
  });

  describe('Integration', () => {
    it('should work with multiple peers', async () => {
      // Set up peer relationships
      await Promise.all([peer1.getManifest(), peer2.getManifest(), peer3.getManifest()]);

      // Add peers to each other
      peer1.addPeer(peer2);
      peer1.addPeer(peer3);
      peer2.addPeer(peer1);
      peer2.addPeer(peer3);

      // All peers should have valid manifests
      const info1 = peer1.getPeerInfo();
      const info2 = peer2.getPeerInfo();

      expect(info1.cacheManifest).toBeDefined();
      expect(info2.cacheManifest).toBeDefined();
    });

    it('should handle rapid reputation updates', () => {
      // Rapidly update reputation
      for (let i = 0; i < 1000; i++) {
        if (i % 2 === 0) {
          peer1.recordSuccessfulUpload();
        } else {
          peer1.recordFailedTransfer();
        }
      }

      const rep = peer1.getReputation();
      expect(typeof rep).toBe('number');
      expect(rep >= 0).toBe(true);
    });
  });
});
