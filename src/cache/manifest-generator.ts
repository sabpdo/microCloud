import { MemoryCache } from './memory-cache';

// Define the shape of cached resources
interface CachedResource {
  content: string | ArrayBuffer;
  mimeType: string;
  timestamp: number;
}

/**
 * Represents the complete cache manifest that will be shared between peers.
 * 
 * @property peerId - Unique identifier for the peer generating this manifest
 * @property generatedAt - Unix timestamp (in seconds) when the manifest was created
 * @property resources - Array of cached resources with their metadata
 */
export interface CacheManifest {
  peerId: string;
  generatedAt: number;
  resources: Array<{
    // The SHA-256 hash of the resource content (used as a unique identifier)
    resourceHash: string;
    // Size of the resource in bytes
    contentLength: number;
    // MIME type of the resource (e.g., 'text/html', 'application/json')
    mimeType: string;
    // When the resource was cached (Unix timestamp in seconds)
    timestamp: number;
  }>;
}

/**
 * ManifestGenerator creates a summary of cached resources that can be shared with other peers.
 * This helps peers discover what resources are available in the network.
 */
export class ManifestGenerator {
  private readonly peerId: string;
  private readonly cache: MemoryCache<CachedResource>;

  constructor(peerId: string, cache: MemoryCache<CachedResource>) {
    this.peerId = peerId;
    this.cache = cache;
  }

  async generateManifest(): Promise<CacheManifest> {
    const resources = [];
    
    // Get all non-expired entries from the cache
    for (const [resourceHash, resource] of this.cache.entries()) {
      try {
        const content = typeof resource.content === 'string'
          ? new TextEncoder().encode(resource.content)
          : new Uint8Array(resource.content);
        
        resources.push({
          resourceHash,  // Using the key as resourceHash
          contentLength: content.byteLength,
          mimeType: resource.mimeType,
          timestamp: Math.floor(resource.timestamp / 1000) // Convert to seconds
        });
      } catch (error) {
        console.error(`Failed to process resource ${resourceHash}:`, error);
      }
    }

    return {
      peerId: this.peerId,
      generatedAt: Math.floor(Date.now() / 1000), // Current time in seconds
      resources
    };
  }

  // Helper method to get a compact JSON string
  async generateManifestString(): Promise<string> {
    const manifest = await this.generateManifest();
    return JSON.stringify(manifest);
  }
}
