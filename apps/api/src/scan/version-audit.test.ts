import { beforeEach, describe, expect, it, vi } from 'vitest';

const cacheStore = new Map<string, string | null>();

vi.mock('../registries/cache.js', () => ({
  getCached: vi.fn((ecosystem: string, name: string) => {
    const key = `${ecosystem} ${name}`;
    return cacheStore.has(key)
      ? { hit: true, latestVersion: cacheStore.get(key) ?? null }
      : { hit: false, latestVersion: null };
  }),
  setCached: vi.fn((ecosystem: string, name: string, version: string | null) => {
    cacheStore.set(`${ecosystem} ${name}`, version);
  }),
}));

const npmGetLatestVersion = vi.fn();
vi.mock('../registries/index.js', () => ({
  getRegistryClient: vi.fn((ecosystem: string) =>
    ecosystem === 'npm' ? { getLatestVersion: npmGetLatestVersion } : undefined,
  ),
}));

const { auditPackageVersions, cacheKey } = await import('./version-audit.js');

beforeEach(() => {
  cacheStore.clear();
  npmGetLatestVersion.mockReset();
});

describe('auditPackageVersions', () => {
  it('resolves the update type for each unique (ecosystem, name)', async () => {
    npmGetLatestVersion.mockResolvedValue('5.0.0');
    const results = await auditPackageVersions([
      { ecosystem: 'npm', name: 'lodash', versionInstalled: '4.17.4' },
    ]);
    expect(results.get(cacheKey('npm', 'lodash'))).toEqual({
      versionLatest: '5.0.0',
      updateType: 'major',
    });
  });

  it('only looks a package up once even if it appears in multiple lockfiles', async () => {
    npmGetLatestVersion.mockResolvedValue('4.18.1');
    await auditPackageVersions([
      { ecosystem: 'npm', name: 'lodash', versionInstalled: '4.17.4' },
      { ecosystem: 'npm', name: 'lodash', versionInstalled: '4.17.4' },
    ]);
    expect(npmGetLatestVersion).toHaveBeenCalledTimes(1);
  });

  it('marks an unsupported ecosystem as unknown without calling any registry', async () => {
    const results = await auditPackageVersions([
      { ecosystem: 'crates.io', name: 'serde', versionInstalled: '1.0.0' },
    ]);
    expect(results.get(cacheKey('crates.io', 'serde'))).toEqual({
      versionLatest: null,
      updateType: 'unknown',
    });
    expect(npmGetLatestVersion).not.toHaveBeenCalled();
  });

  it('does not let one failing lookup abort the others', async () => {
    npmGetLatestVersion.mockImplementation((name: string) =>
      name === 'broken' ? Promise.reject(new Error('boom')) : Promise.resolve('9.9.9'),
    );
    const results = await auditPackageVersions([
      { ecosystem: 'npm', name: 'broken', versionInstalled: '1.0.0' },
      { ecosystem: 'npm', name: 'fine', versionInstalled: '1.0.0' },
    ]);
    expect(results.get(cacheKey('npm', 'broken'))).toEqual({
      versionLatest: null,
      updateType: 'unknown',
    });
    expect(results.get(cacheKey('npm', 'fine'))).toEqual({
      versionLatest: '9.9.9',
      updateType: 'major',
    });
  });

  it('uses the cache instead of calling the registry again', async () => {
    npmGetLatestVersion.mockResolvedValue('9.9.9');
    await auditPackageVersions([{ ecosystem: 'npm', name: 'lodash', versionInstalled: '1.0.0' }]);
    expect(npmGetLatestVersion).toHaveBeenCalledTimes(1);

    await auditPackageVersions([{ ecosystem: 'npm', name: 'lodash', versionInstalled: '1.0.0' }]);
    expect(npmGetLatestVersion).toHaveBeenCalledTimes(1); // still 1 — served from cache
  });
});
