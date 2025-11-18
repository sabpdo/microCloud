import { MemoryCache } from './memory-cache';

describe('MemoryCache', () => {
  let cache: MemoryCache;
  const testKey = 'testKey';
  const testValue = { data: 'test data' };

  beforeEach(() => {
    cache = new MemoryCache();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should set and get a value', () => {
    cache.set(testKey, testValue);
    expect(cache.get(testKey)).toEqual(testValue);
  });

  it('should return undefined for non-existent key', () => {
    expect(cache.get('nonExistentKey')).toBeUndefined();
  });

  it('should delete a value', () => {
    cache.set(testKey, testValue);
    expect(cache.delete(testKey)).toBe(true);
    expect(cache.get(testKey)).toBeUndefined();
  });

  it('should check if key exists', () => {
    cache.set(testKey, testValue);
    expect(cache.has(testKey)).toBe(true);
    expect(cache.has('nonExistentKey')).toBe(false);
  });

  it('should clear all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('should respect TTL', () => {
    jest.useFakeTimers();
    const ttl = 1000; // 1 second
    
    cache.set(testKey, testValue, ttl);
    
    // Before TTL expires
    jest.advanceTimersByTime(500);
    expect(cache.get(testKey)).toEqual(testValue);
    
    // After TTL expires
    jest.advanceTimersByTime(600);
    expect(cache.get(testKey)).toBeUndefined();
  });

  it('should return all keys', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    const keys = cache.keys();
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
    expect(keys).toHaveLength(2);
  });

  it('should return correct size', () => {
    expect(cache.size()).toBe(0);
    cache.set('key1', 'value1');
    expect(cache.size()).toBe(1);
    cache.set('key2', 'value2');
    expect(cache.size()).toBe(2);
    cache.delete('key1');
    expect(cache.size()).toBe(1);
  });
});
