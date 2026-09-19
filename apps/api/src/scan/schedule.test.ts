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
const {
  setScanScheduleAnchorHour,
  setScanScheduleIntervalHours,
  setScanScheduleWeekday,
} = await import('../settings/app-settings.js');
const { enqueueScanJob } = await import('../queue/jobs.js');
const { enqueueDueScheduledScans, mostRecentOccurrence } = await import('./schedule.js');
const { eq } = await import('drizzle-orm');

// A fixed instant instead of the real clock, so "due" vs. "not due" never
// depends on how close a test run happens to land to a real hour/weekday
// boundary.
const NOW = new Date(2026, 0, 15, 10, 0, 0);

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

describe('mostRecentOccurrence', () => {
  it('resolves a daily anchor to today once that hour has passed', () => {
    expect(mostRecentOccurrence(NOW, 24, 4, 1)).toEqual(new Date(2026, 0, 15, 4, 0, 0));
  });

  it('resolves a daily anchor to yesterday when today has not reached it yet', () => {
    expect(mostRecentOccurrence(NOW, 24, 18, 1)).toEqual(new Date(2026, 0, 14, 18, 0, 0));
  });

  it('resolves an hourly anchor to the latest matching hour today', () => {
    // Anchored at 02 with a 6h step fires at 02/08/14/20 — NOW is 10:00.
    expect(mostRecentOccurrence(NOW, 6, 2, 1)).toEqual(new Date(2026, 0, 15, 8, 0, 0));
  });

  it('resolves a weekly anchor to today when today is the configured weekday', () => {
    expect(mostRecentOccurrence(NOW, 168, 4, NOW.getDay())).toEqual(
      new Date(2026, 0, 15, 4, 0, 0),
    );
  });

  it('resolves a weekly anchor to an earlier day when today does not match', () => {
    const otherWeekday = (NOW.getDay() + 3) % 7;
    const result = mostRecentOccurrence(NOW, 168, 4, otherWeekday);

    expect(result.getDay()).toBe(otherWeekday);
    expect(result.getHours()).toBe(4);
    expect(result.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });
});

describe('enqueueDueScheduledScans', () => {
  it('enqueues nothing when the schedule is disabled', () => {
    createProject('never-scanned', null);
    expect(enqueueDueScheduledScans(NOW)).toBe(0);
  });

  it('enqueues a never-scanned project once a schedule is set', () => {
    setScanScheduleIntervalHours(24);
    setScanScheduleAnchorHour(4);
    const projectId = createProject('never-scanned', null);

    expect(enqueueDueScheduledScans(NOW)).toBe(1);
    const job = db.select().from(jobs).where(eq(jobs.type, 'scan')).get();
    expect(job?.payload.projectId).toBe(projectId);
    expect(job?.payload.trigger).toBe('scheduled');
  });

  it('enqueues a project last scanned before its anchor hour today', () => {
    setScanScheduleIntervalHours(24);
    setScanScheduleAnchorHour(4); // NOW is 10:00 — today's 04:00 has passed
    createProject('stale', new Date(2026, 0, 15, 3, 0, 0));

    expect(enqueueDueScheduledScans(NOW)).toBe(1);
  });

  it('skips a project already scanned since its anchor hour today', () => {
    setScanScheduleIntervalHours(24);
    setScanScheduleAnchorHour(4);
    createProject('fresh', new Date(2026, 0, 15, 5, 0, 0));

    expect(enqueueDueScheduledScans(NOW)).toBe(0);
  });

  it('skips a project whose anchor hour has not happened yet today', () => {
    setScanScheduleIntervalHours(24);
    setScanScheduleAnchorHour(18); // NOW is 10:00 — today's 18:00 is still ahead
    createProject('waiting', new Date(2026, 0, 14, 20, 0, 0)); // after yesterday's 18:00

    expect(enqueueDueScheduledScans(NOW)).toBe(0);
  });

  it('anchors an hourly interval to the configured hour, not just elapsed time', () => {
    setScanScheduleIntervalHours(6);
    setScanScheduleAnchorHour(2); // fires at 02/08/14/20 — 08:00 has passed
    createProject('stale', new Date(2026, 0, 15, 7, 0, 0));

    expect(enqueueDueScheduledScans(NOW)).toBe(1);
  });

  it('only fires a weekly schedule on its configured weekday', () => {
    setScanScheduleIntervalHours(168);
    setScanScheduleAnchorHour(4);
    setScanScheduleWeekday(NOW.getDay());
    createProject('due-today', new Date(2026, 0, 15, 3, 0, 0));

    expect(enqueueDueScheduledScans(NOW)).toBe(1);
  });

  it('skips a project that already has an active scan job', () => {
    setScanScheduleIntervalHours(24);
    setScanScheduleAnchorHour(4);
    const projectId = createProject('busy', null);
    enqueueScanJob({ projectId, trigger: 'manual' });

    expect(enqueueDueScheduledScans(NOW)).toBe(0);
  });
});
