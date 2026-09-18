import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
// config.ts refuses to load without a master key (docs/CONCEPT.md 4.2).
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { registryCache } = await import('../db/schema.js');
const { getCached, setCached } = await import('./cache.js');

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(registryCache).run();
  vi.useRealTimers();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('registry cache', () => {
  it('is a miss when nothing was ever cached', () => {
    expect(getCached('npm', 'left-pad')).toEqual({
      hit: false,
      latestVersion: null,
      license: null,
    });
  });

  it('returns a fresh cached version and license', () => {
    setCached('npm', 'lodash', '4.18.1', 'MIT');
    expect(getCached('npm', 'lodash')).toEqual({
      hit: true,
      latestVersion: '4.18.1',
      license: 'MIT',
    });
  });

  it('caches a confirmed "not found" as a hit with a null version and license', () => {
    setCached('npm', 'this-package-does-not-exist', null, null);
    expect(getCached('npm', 'this-package-does-not-exist')).toEqual({
      hit: true,
      latestVersion: null,
      license: null,
    });
  });

  it('treats an entry older than 24h as a miss', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    setCached('npm', 'lodash', '4.18.1', 'MIT');

    vi.setSystemTime(new Date('2025-01-02T00:00:01Z')); // 24h + 1s later
    expect(getCached('npm', 'lodash')).toEqual({
      hit: false,
      latestVersion: null,
      license: null,
    });
  });

  it('keeps ecosystems separate for the same package name', () => {
    setCached('npm', 'console', '1.0.0', 'MIT');
    expect(getCached('Packagist', 'console')).toEqual({
      hit: false,
      latestVersion: null,
      license: null,
    });
  });
});
