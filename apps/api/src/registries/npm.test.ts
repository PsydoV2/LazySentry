import { afterEach, describe, expect, it, vi } from 'vitest';
import { npmRegistry } from './npm.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('npmRegistry', () => {
  it('returns the version field from the /latest endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { version: '4.18.1' })));
    expect(await npmRegistry.getLatestVersion('lodash')).toBe('4.18.1');
  });

  it('returns null for a 404 (package not found)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})));
    expect(await npmRegistry.getLatestVersion('this-package-does-not-exist')).toBeNull();
  });

  it('throws on an unexpected status so the caller does not cache it as "not found"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));
    await expect(npmRegistry.getLatestVersion('lodash')).rejects.toThrow();
  });

  it('URL-encodes scoped package names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { version: '1.0.0' }));
    vi.stubGlobal('fetch', fetchMock);
    await npmRegistry.getLatestVersion('@babel/core');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.npmjs.org/%40babel%2Fcore/latest',
      expect.anything(),
    );
  });
});
