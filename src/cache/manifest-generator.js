'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ManifestGenerator = void 0;
/**
 * ManifestGenerator creates a summary of cached resources that can be shared with other peers.
 * This helps peers discover what resources are available in the network.
 */
class ManifestGenerator {
  constructor(peerId, cache) {
    Object.defineProperty(this, 'peerId', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    });
    Object.defineProperty(this, 'cache', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    });
    this.peerId = peerId;
    this.cache = cache;
  }
  async generateManifest() {
    const resources = [];
    // Get all non-expired entries from the cache
    for (const [resourceHash, resource] of this.cache.entries()) {
      try {
        const content =
          typeof resource.content === 'string'
            ? new TextEncoder().encode(resource.content)
            : new Uint8Array(resource.content);
        resources.push({
          resourceHash, // Using the key as resourceHash
          contentLength: content.byteLength,
          mimeType: resource.mimeType,
          timestamp: Math.floor(resource.timestamp / 1000), // Convert to seconds
        });
      } catch (error) {
        console.error(`Failed to process resource ${resourceHash}:`, error);
      }
    }
    return {
      peerId: this.peerId,
      generatedAt: Math.floor(Date.now() / 1000), // Current time in seconds
      resources,
    };
  }
  // Helper method to get a compact JSON string
  async generateManifestString() {
    const manifest = await this.generateManifest();
    return JSON.stringify(manifest);
  }
}
exports.ManifestGenerator = ManifestGenerator;
