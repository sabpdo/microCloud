'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.MemoryCache = void 0;
class MemoryCache {
  /**
   * Creates a new in-memory cache instance
   * @param options Cache configuration options
   * @param options.defaultTTL Default time-to-live in milliseconds (optional)
   */
  constructor(options = {}) {
    Object.defineProperty(this, 'cache', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    });
    Object.defineProperty(this, 'defaultTTL', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    });
    this.cache = new Map();
    this.defaultTTL = options.defaultTTL || null;
  }
  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time-to-live in milliseconds (overrides defaultTTL if provided)
   */
  set(key, value, ttl) {
    const expiry = this.calculateExpiry(ttl);
    this.cache.set(key, { value, expiry });
  }
  /**
   * Get a value from the cache
   * @param key Cache key
   * @returns Cached value or undefined if not found or expired
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    // Check if entry has expired
    if (entry.expiry && Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }
  /**
   * Get all entries in the cache
   * @returns Array of [key, value] pairs
   */
  entries() {
    const now = Date.now();
    const result = [];
    for (const [key, entry] of this.cache.entries()) {
      // Skip expired entries
      if (entry.expiry && now > entry.expiry) {
        this.cache.delete(key);
        continue;
      }
      result.push([key, entry.value]);
    }
    return result;
  }
  /**
   * Delete a value from the cache
   * @param key Cache key
   * @returns true if an element existed and has been removed, false otherwise
   */
  delete(key) {
    return this.cache.delete(key);
  }
  /**
   * Clear all entries from the cache
   */
  clear() {
    this.cache.clear();
  }
  /**
   * Check if a key exists in the cache
   * @param key Cache key
   * @returns true if the key exists and is not expired
   */
  has(key) {
    return this.get(key) !== undefined;
  }
  /**
   * Get all cache keys
   * @returns Array of cache keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }
  /**
   * Get the number of items in the cache
   * @returns Number of items in the cache
   */
  size() {
    return this.cache.size;
  }
  calculateExpiry(ttl) {
    if (ttl !== undefined) {
      return Date.now() + ttl;
    }
    return this.defaultTTL ? Date.now() + this.defaultTTL : undefined;
  }
}
exports.MemoryCache = MemoryCache;
