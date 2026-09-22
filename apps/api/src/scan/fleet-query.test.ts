import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
// config.ts refuses to load without a master key (docs/CONCEPT.md 4.2).
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { packages, projects, scans } = await import('../db/schema.js');
const { queryFleetPackages } = await import('./fleet-query.js');

function createProject(name: string): number {
  return db
    .insert(projects)
    .values({
      name,
      fullName: `acme/${name}`,
      cloneUrl: `https://example.test/${name}`,
      addedAt: new Date(),
      lastScanAt: new Date(2026, 0, 15),
    })
    .returning({ id: projects.id })
    .get().id;
}

function createScan(projectId: number): number {
  return db
    .insert(scans)
    .values({ projectId, status: 'completed', trigger: 'manual' })
    .returning({ id: scans.id })
    .get().id;
}

function addPackage(
  scanId: number,
  overrides: Partial<typeof packages.$inferInsert> & { name: string; versionInstalled: string },
): void {
  db.insert(packages)
    .values({ scanId, ecosystem: 'npm', isDirect: true, ...overrides })
    .run();
}

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(packages).run();
  db.delete(scans).run();
  db.delete(projects).run();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('queryFleetPackages', () => {
  it('finds a package installed in one project', () => {
    const projectId = createProject('web-storefront');
    const scanId = createScan(projectId);
    addPackage(scanId, { name: 'lodash', versionInstalled: '4.17.15' });

    const matches = queryFleetPackages({ name: 'lodash' });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      projectId,
      projectName: 'web-storefront',
      versionInstalled: '4.17.15',
    });
  });

  it('matches package names case-insensitively', () => {
    const projectId = createProject('web-storefront');
    addPackage(createScan(projectId), { name: 'Lodash', versionInstalled: '4.17.15' });

    expect(queryFleetPackages({ name: 'LODASH' })).toHaveLength(1);
  });

  it('filters by version range when given', () => {
    const a = createProject('vulnerable-project');
    addPackage(createScan(a), { name: 'lodash', versionInstalled: '4.17.15' });
    const b = createProject('patched-project');
    addPackage(createScan(b), { name: 'lodash', versionInstalled: '4.17.21' });

    const matches = queryFleetPackages({ name: 'lodash', range: '< 4.17.21' });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.projectName).toBe('vulnerable-project');
  });

  it('only reports the project\'s latest scan, not an older one that also had the package', () => {
    const projectId = createProject('rescanned-project');
    addPackage(createScan(projectId), { name: 'lodash', versionInstalled: '4.17.4' });
    // A later scan no longer has lodash at all (dependency removed).
    const laterScan = createScan(projectId);
    addPackage(laterScan, { name: 'left-pad', versionInstalled: '1.0.0' });

    expect(queryFleetPackages({ name: 'lodash' })).toHaveLength(0);
  });

  it('reports the newer installed version once a project is rescanned', () => {
    const projectId = createProject('rescanned-project');
    addPackage(createScan(projectId), { name: 'lodash', versionInstalled: '4.17.4' });
    addPackage(createScan(projectId), { name: 'lodash', versionInstalled: '4.17.21' });

    const matches = queryFleetPackages({ name: 'lodash' });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.versionInstalled).toBe('4.17.21');
  });

  it('returns nothing for a package installed nowhere', () => {
    const projectId = createProject('clean-project');
    addPackage(createScan(projectId), { name: 'left-pad', versionInstalled: '1.0.0' });

    expect(queryFleetPackages({ name: 'lodash' })).toHaveLength(0);
  });

  it('sorts direct dependencies before transitive ones', () => {
    const transitiveProject = createProject('via-transitive');
    addPackage(createScan(transitiveProject), {
      name: 'lodash',
      versionInstalled: '4.17.15',
      isDirect: false,
    });
    const directProject = createProject('via-direct');
    addPackage(createScan(directProject), {
      name: 'lodash',
      versionInstalled: '4.17.15',
      isDirect: true,
    });

    const matches = queryFleetPackages({ name: 'lodash' });

    expect(matches[0]?.isDirect).toBe(true);
    expect(matches[1]?.isDirect).toBe(false);
  });
});
