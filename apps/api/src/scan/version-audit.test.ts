import { beforeEach, describe, expect, it, vi } from 'vitest';

const cacheStore = new Map<string, { latestVersion: string | null; license: string | null }>();

vi.mock('../registries/cache.js', () => ({
  getCached: vi.fn((ecosystem: string, name: string) => {
    const key = `${ecosystem} ${name}`;
    const entry = cacheStore.get(key);
    return entry
      ? { hit: true, latestVersion: entry.latestVersion, license: entry.license }
      : { hit: false, latestVersion: null, license: null };
  }),
  setCached: vi.fn(
    (ecosystem: string, name: string, latestVersion: string | null, license: string | null) => {
      cacheStore.set(`${ecosystem} ${name}`, { latestVersion, license });
    },
  ),
}));

const npmGetPackageInfo = vi.fn();
vi.mock('../registries/index.js', () => ({
  getRegistryClient: vi.fn((ecosystem: string) =>
    ecosystem === 'npm' ? { getPackageInfo: npmGetPackageInfo } : undefined,
  ),
}));

const { auditPackageVersions, cacheKey } = await import('./version-audit.js');

beforeEach(() => {
  cacheStore.clear();
  npmGetPackageInfo.mockReset();
});

describe('auditPackageVersions', () => {
  it('resolves the update type and license for each unique (ecosystem, name)', async () => {
    npmGetPackageInfo.mockResolvedValue({ latestVersion: '5.0.0', license: 'MIT' });
    const results = await auditPackageVersions([
      { ecosystem: 'npm', name: 'lodash', versionInstalled: '4.17.4' },
    ]);
    expect(results.get(cacheKey('npm', 'lodash'))).toEqual({
      versionLatest: '5.0.0',
      updateType: 'major',
      license: 'MIT',
    });
  });

  it('only looks a package up once even if it appears in multiple lockfiles', async () => {
    npmGetPackageInfo.mockResolvedValue({ latestVersion: '4.18.1', license: 'MIT' });
    await auditPackageVersions([
      { ecosystem: 'npm', name: 'lodash', versionInstalled: '4.17.4' },
      { ecosystem: 'npm', name: 'lodash', versionInstalled: '4.17.4' },
    ]);
    expect(npmGetPackageInfo).toHaveBeenCalledTimes(1);
  });

  it('marks an unsupported ecosystem as unknown without calling any registry', async () => {
    const results = await auditPackageVersions([
      { ecosystem: 'crates.io', name: 'serde', versionInstalled: '1.0.0' },
    ]);
    expect(results.get(cacheKey('crates.io', 'serde'))).toEqual({
      versionLatest: null,
      updateType: 'unknown',
      license: null,
    });
    expect(npmGetPackageInfo).not.toHaveBeenCalled();
  });

  it('does not let one failing lookup abort the others', async () => {
    npmGetPackageInfo.mockImplementation((name: string) =>
      name === 'broken'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ latestVersion: '9.9.9', license: 'ISC' }),
    );
    const results = await auditPackageVersions([
      { ecosystem: 'npm', name: 'broken', versionInstalled: '1.0.0' },
      { ecosystem: 'npm', name: 'fine', versionInstalled: '1.0.0' },
    ]);
    expect(results.get(cacheKey('npm', 'broken'))).toEqual({
      versionLatest: null,
      updateType: 'unknown',
      license: null,
    });
    expect(results.get(cacheKey('npm', 'fine'))).toEqual({
      versionLatest: '9.9.9',
      updateType: 'major',
      license: 'ISC',
    });
  });

  it('uses the cache instead of calling the registry again', async () => {
    npmGetPackageInfo.mockResolvedValue({ latestVersion: '9.9.9', license: 'MIT' });
    await auditPackageVersions([{ ecosystem: 'npm', name: 'lodash', versionInstalled: '1.0.0' }]);
    expect(npmGetPackageInfo).toHaveBeenCalledTimes(1);

    await auditPackageVersions([{ ecosystem: 'npm', name: 'lodash', versionInstalled: '1.0.0' }]);
    expect(npmGetPackageInfo).toHaveBeenCalledTimes(1); // still 1 — served from cache
  });
});
