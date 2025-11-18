/**
 * Origin fallback fetch module
 * - Use this only when P2P/peer retrieval fails
 * - Integrates with the toy origin server in this repo (default http://localhost:3000)
 */
export type OriginFetchResult = {
  content: ArrayBuffer;
  mimeType: string;
  status: number;
  url: string;
};

/**
 * Fetch a resource from the origin server.
 * - Caller handles caching, hashing, and any retries.
 * - Path can be with or without a leading slash.
 */
export async function fetchFromOrigin(
  path: string,
  options?: { baseUrl?: string }
): Promise<OriginFetchResult> {
  const baseUrl = (options?.baseUrl ?? 'http://localhost:3000').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${normalizedPath}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Origin fetch failed: ${res.status} ${res.statusText} (${url})`);
  }

  const content = await res.arrayBuffer();
  const mimeType = res.headers.get('content-type') || 'application/octet-stream';

  return {
    content,
    mimeType,
    status: res.status,
    url: res.url,
  };
}

/**
 * Notify the toy origin server that a cache miss occurred.
 * Useful for keeping the server's stats accurate during testing.
 */
export async function reportOriginCacheMiss(baseUrl = 'http://localhost:3000'): Promise<void> {
  try {
    const url = baseUrl.replace(/\/$/, '') + '/api/cache-miss';
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  } catch {
    // Non-fatal: best-effort reporting only
  }
}
