import { afterEach, describe, expect, it, vi } from 'vitest';
import { packagistRegistry } from './packagist.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('packagistRegistry', () => {
  it('picks the first stable release, skipping prereleases newer than it', async () => {
    // p2 endpoints list newest-first, prereleases included.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          packages: {
            'symfony/console': [
              { version: 'v8.1.0-RC1' },
              { version: 'v8.0.5' },
              { version: 'v8.0.4' },
            ],
          },
        }),
      ),
    );
    expect(await packagistRegistry.getLatestVersion('symfony/console')).toBe('8.0.5');
  });

  it('skips dev branch entries entirely', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          packages: {
            'acme/lib': [{ version: 'dev-main' }, { version: 'v2.0.0' }],
          },
        }),
      ),
    );
    expect(await packagistRegistry.getLatestVersion('acme/lib')).toBe('2.0.0');
  });

  it('returns null when only prereleases and dev branches exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          packages: { 'acme/lib': [{ version: 'dev-main' }, { version: 'v1.0.0-beta1' }] },
        }),
      ),
    );
    expect(await packagistRegistry.getLatestVersion('acme/lib')).toBeNull();
  });

  it('returns null for a 404 (package not found)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})));
    expect(await packagistRegistry.getLatestVersion('acme/does-not-exist')).toBeNull();
  });
});
