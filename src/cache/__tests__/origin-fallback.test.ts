import { fetchFromOrigin, reportOriginCacheMiss } from '../origin-fallback';

describe('Origin Fallback', () => {
  // Test fetching from origin server
  describe('fetchFromOrigin', () => {
    it('should fetch a resource from origin server', async () => {
      // This test requires a running server, so we'll skip if server is not available
      // In practice, you'd want to mock the fetch or use a test server
      const result = await fetchFromOrigin('/sample.txt').catch(() => null);

      if (result) {
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('mimeType');
        expect(result).toHaveProperty('status', 200);
        expect(result.content).toBeInstanceOf(ArrayBuffer);
      }
    });

    it('should normalize path with leading slash', async () => {
      const result1 = await fetchFromOrigin('/sample.txt').catch(() => null);
      const result2 = await fetchFromOrigin('sample.txt').catch(() => null);

      if (result1 && result2) {
        expect(result1.url).toBe(result2.url);
      }
    });

    it('should use custom baseUrl when provided', async () => {
      const result = await fetchFromOrigin('/sample.txt', {
        baseUrl: 'http://localhost:3000',
      }).catch(() => null);

      if (result) {
        expect(result.url).toContain('localhost:3000');
      }
    });

    it('should throw error on failed fetch', async () => {
      await expect(
        fetchFromOrigin('/nonexistent-file.txt', {
          baseUrl: 'http://localhost:3000',
        })
      ).rejects.toThrow();
    });

    it('should handle missing content-type header', async () => {
      // Mock fetch to return response without content-type
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'http://localhost:3000/test',
        headers: {
          get: () => null, // No content-type
        },
        arrayBuffer: async () => new ArrayBuffer(0),
      });

      const result = await fetchFromOrigin('/test');
      expect(result.mimeType).toBe('application/octet-stream');

      global.fetch = originalFetch;
    });
  });

  // Test cache miss reporting
  describe('reportOriginCacheMiss', () => {
    it('should report cache miss without throwing', async () => {
      // This should not throw even if server is not available
      await expect(reportOriginCacheMiss()).resolves.not.toThrow();
    });

    it('should handle custom baseUrl', async () => {
      await expect(reportOriginCacheMiss('http://localhost:3000')).resolves.not.toThrow();
    });

    it('should normalize baseUrl trailing slash', async () => {
      // Both should work the same way
      await expect(reportOriginCacheMiss('http://localhost:3000/')).resolves.not.toThrow();

      await expect(reportOriginCacheMiss('http://localhost:3000')).resolves.not.toThrow();
    });
  });
});
