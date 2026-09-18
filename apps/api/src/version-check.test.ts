import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate, resetVersionCheckCache } from './version-check.js';

function mockTagsResponse(names: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(names.map((name) => ({ name }))), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

beforeEach(() => {
  resetVersionCheckCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkForUpdate', () => {
  it('flags an update when GitHub has a newer tag', async () => {
    mockTagsResponse(['v1.2.0', 'v1.1.0', 'v1.0.0']);
    const result = await checkForUpdate('1.1.0');

    expect(result.latest).toBe('v1.2.0');
    expect(result.updateAvailable).toBe(true);
  });

  it('does not flag an update when already on the latest tag', async () => {
    mockTagsResponse(['v1.2.0', 'v1.1.0']);
    const result = await checkForUpdate('1.2.0');

    expect(result.updateAvailable).toBe(false);
  });

  it('does not flag an update when running a newer version than any tag', async () => {
    mockTagsResponse(['v1.2.0']);
    const result = await checkForUpdate('1.3.0');

    expect(result.updateAvailable).toBe(false);
  });

  it('ignores tags that are not plain semver', async () => {
    mockTagsResponse(['v2.0.0-rc1', 'not-a-version', 'v1.5.0']);
    const result = await checkForUpdate('1.0.0');

    expect(result.latest).toBe('v1.5.0');
  });

  it('never flags an update for a non-semver current version (e.g. a dev build)', async () => {
    mockTagsResponse(['v1.0.0']);
    const result = await checkForUpdate('dev');

    expect(result.updateAvailable).toBe(false);
    expect(result.current).toBe('dev');
  });

  it('degrades to no notice, never throwing, when GitHub is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const result = await checkForUpdate('1.0.0');

    expect(result.latest).toBeNull();
    expect(result.updateAvailable).toBe(false);
  });

  it('caches the GitHub response instead of refetching on every call', async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify([{ name: 'v1.0.0' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', spy);

    await checkForUpdate('0.9.0');
    await checkForUpdate('0.9.0');

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
