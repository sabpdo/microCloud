import { runFlashCrowdSimulation, SimulationConfig } from '../simulation';

describe('Simulation', () => {
  // Increase timeout for all simulation tests (they take longer to run)
  jest.setTimeout(30000);

  // Mock fetch to avoid actual network calls in tests
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic Simulation', () => {
    it('should run a basic simulation successfully', async () => {
      // Mock successful file fetch
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => 'test file content',
        headers: { get: () => 'text/plain' },
      });

      // Mock cache hit/miss endpoints
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 2, // Minimal peers for fast test
        targetFile: '/sample.txt',
        duration: 1, // Very short duration for fast test
        requestInterval: 100, // Fast requests
        churnRate: 0,
      };

      const results = await runFlashCrowdSimulation(config);

      expect(results).toBeDefined();
      expect(results.peersSimulated).toBe(2); // Matches config above
      expect(results.totalRequests).toBeGreaterThanOrEqual(0);
      expect(results.cacheHitRatio).toBeGreaterThanOrEqual(0);
      expect(results.cacheHitRatio).toBeLessThanOrEqual(100);
    });

    it('should calculate cache hit ratio correctly', async () => {
      jest.setTimeout(60000); // Long timeout for actual simulation
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 2, // Minimal peers for fast test
        targetFile: '/sample.txt',
        duration: 1, // Very short duration
        requestInterval: 100,
        churnRate: 0,
      };

      const results = await runFlashCrowdSimulation(config);

      // Cache hit ratio should be between 0 and 100
      expect(results.cacheHitRatio).toBeGreaterThanOrEqual(0);
      expect(results.cacheHitRatio).toBeLessThanOrEqual(100);

      // Total requests should equal peer + origin requests
      expect(results.totalRequests).toBe(results.peerRequests + results.originRequests);
    });

    it('should track bandwidth saved correctly', async () => {
      jest.setTimeout(60000); // Long timeout
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 20,
        targetFile: '/sample.txt',
        duration: 15,
        requestInterval: 300,
      };

      const results = await runFlashCrowdSimulation(config);

      // Bandwidth saved should match cache hit ratio
      expect(results.bandwidthSaved).toBe(results.cacheHitRatio);
      expect(results.bandwidthSaved).toBeGreaterThanOrEqual(0);
      expect(results.bandwidthSaved).toBeLessThanOrEqual(100);
    });
  });

  describe('Flash Crowd Simulation', () => {
    it('should handle flash crowd mode', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 30,
        targetFile: '/sample.txt',
        duration: 20,
        requestInterval: 200,
        flashCrowd: true,
        joinRate: 2,
        anchorSignalingLatency: 100,
      };

      const results = await runFlashCrowdSimulation(config);

      expect(results).toBeDefined();
      expect(results.peerJoinEvents).toBeDefined();
      expect(Array.isArray(results.peerJoinEvents)).toBe(true);
      expect(results.peerJoinEvents.length).toBeGreaterThan(0);
    });

    it('should track anchor nodes in flash crowd', async () => {

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      // Use minimal configuration for fast test
      const config: SimulationConfig = {
        numPeers: 5, // Small number for fast test
        targetFile: '/sample.txt',
        duration: 2, // Very short duration
        requestInterval: 200,
        flashCrowd: true,
        joinRate: 2,
      };

      const results = await runFlashCrowdSimulation(config);

      expect(results.anchorNodes).toBeDefined();
      expect(Array.isArray(results.anchorNodes)).toBe(true);
      // Anchor nodes may or may not exist depending on reputation scores
      // Just verify structure is correct
      expect(results.anchorNodes.length).toBeGreaterThanOrEqual(0);
    });

    it('should track file transfer events', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 25,
        targetFile: '/sample.txt',
        duration: 30,
        requestInterval: 150,
        flashCrowd: false,
      };

      const results = await runFlashCrowdSimulation(config);

      expect(results.fileTransferEvents).toBeDefined();
      expect(Array.isArray(results.fileTransferEvents)).toBe(true);
    });
  });

  describe('Churn Handling', () => {
    it('should handle peer churn', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 20,
        targetFile: '/sample.txt',
        duration: 20,
        requestInterval: 200,
        churnRate: 0.05, // 5% chance per cycle
      };

      const results = await runFlashCrowdSimulation(config);

      expect(results).toBeDefined();
      // With churn, we might have recovery metrics
      if (results.recoverySpeed !== undefined) {
        expect(results.recoverySpeed).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle single peer', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 1,
        targetFile: '/sample.txt',
        duration: 5,
        requestInterval: 1000,
      };

      const results = await runFlashCrowdSimulation(config);

      expect(results.peersSimulated).toBe(1);
      expect(results.totalRequests).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero duration gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 10,
        targetFile: '/sample.txt',
        duration: 0,
        requestInterval: 100,
      };

      const results = await runFlashCrowdSimulation(config);

      expect(results).toBeDefined();
      expect(results.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle very high churn rate', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 15,
        targetFile: '/sample.txt',
        duration: 10,
        requestInterval: 300,
        churnRate: 0.5, // 50% churn rate
      };

      const results = await runFlashCrowdSimulation(config);

      expect(results).toBeDefined();
      // With high churn, total requests might be lower
      expect(results.totalRequests).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Metrics Calculation', () => {
    it('should calculate Jain fairness index', async () => {
      jest.setTimeout(30000); // Increase timeout for simulation tests
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 20,
        targetFile: '/sample.txt',
        duration: 15,
        requestInterval: 200,
      };

      const results = await runFlashCrowdSimulation(config);

      expect(results.jainFairnessIndex).toBeDefined();
      expect(results.jainFairnessIndex).toBeGreaterThanOrEqual(0);
      expect(results.jainFairnessIndex).toBeLessThanOrEqual(1);
    });

    it('should calculate latency improvement', async () => {
      jest.setTimeout(30000); // Increase timeout for simulation tests
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 25,
        targetFile: '/sample.txt',
        duration: 20,
        requestInterval: 250,
      };

      const results = await runFlashCrowdSimulation(config);

      expect(results.latencyImprovement).toBeDefined();
      expect(results.latencyImprovement).toBeGreaterThanOrEqual(0);
      expect(results.avgLatency).toBeGreaterThanOrEqual(0);
    });

    it('should track file propagation time', async () => {
      jest.setTimeout(30000); // Increase timeout for simulation tests
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => 'content',
        headers: { get: () => 'text/plain' },
        json: async () => ({ success: true }),
      });

      const config: SimulationConfig = {
        numPeers: 30,
        targetFile: '/sample.txt',
        duration: 25,
        requestInterval: 200,
        flashCrowd: true,
        joinRate: 2,
      };

      const results = await runFlashCrowdSimulation(config);

      if (results.filePropagationTime !== undefined) {
        expect(results.filePropagationTime).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
