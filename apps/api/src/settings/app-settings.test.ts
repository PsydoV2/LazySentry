import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Point the database at a throwaway file before the client module is imported.
const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
// config.ts refuses to load without a master key (docs/CONCEPT.md 4.2).
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { settings } = await import('../db/schema.js');
const {
  getAppSettingsPublic,
  getScanScheduleAnchorHour,
  getScanScheduleIntervalHours,
  getScanScheduleWeekday,
  setScanScheduleAnchorHour,
  setScanScheduleIntervalHours,
  setScanScheduleWeekday,
} = await import('./app-settings.js');

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(settings).run();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('app settings', () => {
  it('treats a missing schedule interval as disabled (0)', () => {
    expect(getScanScheduleIntervalHours()).toBe(0);
    expect(getAppSettingsPublic().scanScheduleIntervalHours).toBe(0);
  });

  it('round-trips a schedule interval and treats 0 as disabling it again', () => {
    setScanScheduleIntervalHours(24);
    expect(getScanScheduleIntervalHours()).toBe(24);

    setScanScheduleIntervalHours(0);
    expect(getScanScheduleIntervalHours()).toBe(0);
  });

  it('defaults the anchor hour to midnight and the weekday to Monday', () => {
    expect(getScanScheduleAnchorHour()).toBe(0);
    expect(getScanScheduleWeekday()).toBe(1);
    expect(getAppSettingsPublic().scanScheduleAnchorHour).toBe(0);
    expect(getAppSettingsPublic().scanScheduleWeekday).toBe(1);
  });

  it('round-trips the anchor hour and weekday', () => {
    setScanScheduleAnchorHour(4);
    setScanScheduleWeekday(3);

    expect(getScanScheduleAnchorHour()).toBe(4);
    expect(getScanScheduleWeekday()).toBe(3);
    expect(getAppSettingsPublic().scanScheduleAnchorHour).toBe(4);
    expect(getAppSettingsPublic().scanScheduleWeekday).toBe(3);
  });
});
