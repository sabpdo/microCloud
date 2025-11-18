import { fetchFromOrigin, reportOriginCacheMiss } from '../origin-fallback';

// Helper to create a mock Response-like object
function mockResponse({
  ok = true,
  status = 200,
  statusText = 'OK',
  body = new ArrayBuffer(0),
  contentType = 'application/octet-stream',
  url = 'http://localhost:3000/sample.txt'
} = {}) {
  return {
    ok,
    status,
    statusText,
    url,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null),
    },
    arrayBuffer: async () => body,
  } as unknown as Response;
}

describe('origin-fallback', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    // Restore fetch between tests
    global.fetch = originalFetch as any;
    jest.restoreAllMocks();
  });

  it('fetchFromOrigin returns bytes, mimeType, status and url on success', async () => {
    const bytes = new TextEncoder().encode('hello').buffer;
    const resp = mockResponse({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: bytes,
      contentType: 'text/plain; charset=utf-8',
      url: 'http://localhost:3000/sample.txt',
    });

    const fetchSpy = jest.fn().mockResolvedValue(resp);
    global.fetch = fetchSpy as any;

    const result = await fetchFromOrigin('/sample.txt');

    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3000/sample.txt');
    expect(result.status).toBe(200);
    expect(result.mimeType).toBe('text/plain; charset=utf-8');
    expect(result.url).toBe('http://localhost:3000/sample.txt');
    // Verify content round-trip
    const text = new TextDecoder().decode(new Uint8Array(result.content));
    expect(text).toBe('hello');
  });

  it('fetchFromOrigin throws on non-ok HTTP status', async () => {
    const resp = mockResponse({ ok: false, status: 404, statusText: 'Not Found', url: 'http://localhost:3000/missing.txt' });
    global.fetch = jest.fn().mockResolvedValue(resp) as any;

    await expect(fetchFromOrigin('missing.txt')).rejects.toThrow('Origin fetch failed: 404 Not Found');
  });

  it('reportOriginCacheMiss posts best-effort and ignores errors', async () => {
    const postSpy = jest.fn()
      .mockResolvedValueOnce(mockResponse({ ok: true, status: 200 })) // success case
      .mockRejectedValueOnce(new Error('network down')); // failure case should be swallowed

    global.fetch = postSpy as any;

    // Success
    await expect(reportOriginCacheMiss()).resolves.toBeUndefined();
    expect(postSpy).toHaveBeenCalledWith('http://localhost:3000/api/cache-miss', expect.objectContaining({ method: 'POST' }));

    // Failure swallowed
    await expect(reportOriginCacheMiss()).resolves.toBeUndefined();
  });
});
