import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
// config.ts refuses to load without a master key (docs/CONCEPT.md 4.2).
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { fleetSnapshots, projects } = await import('../db/schema.js');
const { captureDueFleetSnapshot, queryFleetTrends } = await import('./fleet-snapshot.js');

const NOW = new Date(2026, 0, 15, 10, 0, 0);

function createProject(
  name: string,
  overrides: Partial<typeof projects.$inferInsert> = {},
): number {
  return db
    .insert(projects)
    .values({
      name,
      fullName: `acme/${name}`,
      cloneUrl: `https://example.test/${name}`,
      addedAt: new Date(),
      ...overrides,
    })
    .returning({ id: projects.id })
    .get().id;
}

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(fleetSnapshots).run();
  db.delete(projects).run();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('captureDueFleetSnapshot', () => {
  it('captures today\'s aggregate counts across every project', () => {
    createProject('a', { countVulnCritical: 2, countVulnHigh: 1 });
    createProject('b', { countVulnCritical: 1, countVulnLow: 3 });

    expect(captureDueFleetSnapshot(NOW)).toBe(true);

    const row = db.select().from(fleetSnapshots).get();
    expect(row?.date).toBe('2026-01-15');
    expect(row?.countVulnCritical).toBe(3);
    expect(row?.countVulnHigh).toBe(1);
    expect(row?.countVulnLow).toBe(3);
  });

  it('buckets projects by sustainability status', () => {
    createProject('active', { lastCommitAt: new Date(NOW.getTime() - 10 * 86_400_000) });
    createProject('dead', { lastCommitAt: new Date(NOW.getTime() - 800 * 86_400_000) });
    createProject('unknown', { lastCommitAt: null });

    captureDueFleetSnapshot(NOW);

    const row = db.select().from(fleetSnapshots).get();
    expect(row?.countSustainActive).toBe(1);
    expect(row?.countSustainDead).toBe(1);
    expect(row?.countSustainUnknown).toBe(1);
  });

  it('does nothing on a second call the same day', () => {
    createProject('a', { countVulnCritical: 1 });
    captureDueFleetSnapshot(NOW);

    // A project's counters change later the same day...
    db.update(projects).set({ countVulnCritical: 5 }).run();

    expect(captureDueFleetSnapshot(new Date(2026, 0, 15, 22, 0, 0))).toBe(false);
    // ...but the snapshot already taken this morning is left untouched.
    expect(db.select().from(fleetSnapshots).all()).toHaveLength(1);
    expect(db.select().from(fleetSnapshots).get()?.countVulnCritical).toBe(1);
  });

  it('captures a new row for the next calendar day', () => {
    createProject('a');
    captureDueFleetSnapshot(NOW);
    expect(captureDueFleetSnapshot(new Date(2026, 0, 16, 10, 0, 0))).toBe(true);
    expect(db.select().from(fleetSnapshots).all()).toHaveLength(2);
  });
});

describe('queryFleetTrends', () => {
  it('returns only snapshots within the requested window, oldest first', () => {
    db.insert(fleetSnapshots)
      .values([
        { date: '2025-11-01', createdAt: NOW },
        { date: '2026-01-10', createdAt: NOW },
        { date: '2026-01-14', createdAt: NOW },
      ])
      .run();

    const points = queryFleetTrends({ days: 30 }, NOW);

    expect(points.map((p) => p.date)).toEqual(['2026-01-10', '2026-01-14']);
  });

  it('returns an empty array when nothing has been captured yet', () => {
    expect(queryFleetTrends({ days: 90 }, NOW)).toEqual([]);
  });
});
