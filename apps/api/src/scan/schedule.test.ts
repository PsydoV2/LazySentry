import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
// config.ts refuses to load without a master key (docs/CONCEPT.md 4.2).
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { jobs, projects, settings } = await import('../db/schema.js');
const { setScanScheduleIntervalHours } = await import('../settings/app-settings.js');
const { enqueueScanJob } = await import('../queue/jobs.js');
const { enqueueDueScheduledScans } = await import('./schedule.js');
const { eq } = await import('drizzle-orm');

function createProject(name: string, lastScanAt: Date | null): number {
  return db
    .insert(projects)
    .values({
      name,
      fullName: `test/${name}`,
      cloneUrl: `https://example.test/${name}`,
      addedAt: new Date(),
      lastScanAt,
    })
    .returning({ id: projects.id })
    .get().id;
}

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(jobs).run();
  db.delete(projects).run();
  db.delete(settings).run();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('enqueueDueScheduledScans', () => {
  it('enqueues nothing when the schedule is disabled', () => {
    createProject('never-scanned', null);
    expect(enqueueDueScheduledScans()).toBe(0);
  });

  it('enqueues a never-scanned project once a schedule is set', () => {
    setScanScheduleIntervalHours(24);
    const projectId = createProject('never-scanned', null);

    expect(enqueueDueScheduledScans()).toBe(1);
    const job = db.select().from(jobs).where(eq(jobs.type, 'scan')).get();
    expect(job?.payload.projectId).toBe(projectId);
    expect(job?.payload.trigger).toBe('scheduled');
  });

  it('enqueues a project whose last scan is older than the interval', () => {
    setScanScheduleIntervalHours(24);
    createProject('stale', new Date(Date.now() - 25 * 60 * 60 * 1000));

    expect(enqueueDueScheduledScans()).toBe(1);
  });

  it('skips a project scanned within the interval', () => {
    setScanScheduleIntervalHours(24);
    createProject('fresh', new Date(Date.now() - 1 * 60 * 60 * 1000));

    expect(enqueueDueScheduledScans()).toBe(0);
  });

  it('skips a project that already has an active scan job', () => {
    setScanScheduleIntervalHours(24);
    const projectId = createProject('busy', null);
    enqueueScanJob({ projectId, trigger: 'manual' });

    expect(enqueueDueScheduledScans()).toBe(0);
  });
});
