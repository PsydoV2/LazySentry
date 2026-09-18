import { afterEach, describe, expect, it, vi } from 'vitest';
import { npmRegistry } from './npm.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('npmRegistry', () => {
  it('returns the version and license fields from the /latest endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { version: '4.18.1', license: 'MIT' })),
    );
    expect(await npmRegistry.getPackageInfo('lodash')).toEqual({
      latestVersion: '4.18.1',
      license: 'MIT',
    });
  });

  it('reads the deprecated { type, url } license object form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { version: '1.0.0', license: { type: 'ISC', url: 'https://x' } }),
      ),
    );
    expect(await npmRegistry.getPackageInfo('old-package')).toEqual({
      latestVersion: '1.0.0',
      license: 'ISC',
    });
  });

  it('reads the deprecated licenses array form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { version: '1.0.0', licenses: [{ type: 'Apache-2.0' }] }),
      ),
    );
    expect(await npmRegistry.getPackageInfo('older-package')).toEqual({
      latestVersion: '1.0.0',
      license: 'Apache-2.0',
    });
  });

  it('returns null license when the registry has none', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { version: '1.0.0' })));
    expect(await npmRegistry.getPackageInfo('no-license-package')).toEqual({
      latestVersion: '1.0.0',
      license: null,
    });
  });

  it('returns null for a 404 (package not found)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})));
    expect(await npmRegistry.getPackageInfo('this-package-does-not-exist')).toBeNull();
  });

  it('throws on an unexpected status so the caller does not cache it as "not found"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));
    await expect(npmRegistry.getPackageInfo('lodash')).rejects.toThrow();
  });

  it('URL-encodes scoped package names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { version: '1.0.0' }));
    vi.stubGlobal('fetch', fetchMock);
    await npmRegistry.getPackageInfo('@babel/core');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.npmjs.org/%40babel%2Fcore/latest',
      expect.anything(),
    );
  });
});
