import { ManifestGenerator } from '../manifest-generator';
import { MemoryCache } from '../memory-cache';
import type { CachedResource } from '../manifest-generator';

describe('ManifestGenerator', () => {
  const mockPeerId = 'peer-123';
  let mockCache: MemoryCache<CachedResource>;

  // Sample test data
  const testResource1: CachedResource = {
    content: 'test content 1',
    mimeType: 'text/plain',
    timestamp: Math.floor((Date.now() - 10000) / 1000), // 10 seconds ago
  };

  const testResource2: CachedResource = {
    content: new Uint8Array([1, 2, 3, 4, 5]).buffer,
    mimeType: 'application/octet-stream',
    timestamp: Math.floor((Date.now() - 5000) / 1000), // 5 seconds ago
  };

  beforeEach(() => {
    // Setup mock cache
    mockCache = new MemoryCache<CachedResource>();
    mockCache.set('test1', testResource1);
    mockCache.set('test2', testResource2);
  });

  it('should generate a valid manifest', async () => {
    const generator = new ManifestGenerator(mockPeerId, mockCache);
    const manifest = await generator.generateManifest();

    // Basic structure
    expect(manifest).toHaveProperty('peerId', mockPeerId);
    expect(manifest).toHaveProperty('generatedAt');
    expect(manifest).toHaveProperty('resources');
    expect(Array.isArray(manifest.resources)).toBe(true);

    // Should include both test resources
    expect(manifest.resources.length).toBe(2);

    // Check resource 1
    const res1 = manifest.resources[0];
    expect(res1).toHaveProperty('resourceHash');
    expect(res1).toHaveProperty('contentLength');
    expect(res1).toHaveProperty('mimeType', 'text/plain');
    expect(res1).toHaveProperty('timestamp');

    // Check resource 2
    const res2 = manifest.resources[1];
    expect(res2).toHaveProperty('resourceHash');
    expect(res2).toHaveProperty('contentLength', 5); // Uint8Array of length 5
    expect(res2).toHaveProperty('mimeType', 'application/octet-stream');
    expect(res2.timestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it('should generate valid JSON string', async () => {
    const generator = new ManifestGenerator(mockPeerId, mockCache);
    const manifestString = await generator.generateManifestString();

    // Should be valid JSON
    const manifest = JSON.parse(manifestString);
    expect(manifest).toHaveProperty('peerId', mockPeerId);
    expect(manifest.resources.length).toBe(2);
  });

  it('should handle empty cache', async () => {
    const emptyCache = new MemoryCache<CachedResource>();
    const generator = new ManifestGenerator(mockPeerId, emptyCache);
    const manifest = await generator.generateManifest();

    expect(manifest.resources).toHaveLength(0);
  });
});
