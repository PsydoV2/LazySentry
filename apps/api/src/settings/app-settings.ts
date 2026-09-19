// Generic key-value settings (docs/CONCEPT.md 4, `settings` table) for
// instance-wide configuration that isn't tied to a git account or project —
// currently just the global scan-schedule (roadmap Phase 3, docs/CONCEPT.md
// 2.3). Every value is encrypted at rest the same way as a connected
// account's token (docs/CONCEPT.md 4.2); `isSecret` only controls what a
// route is allowed to hand back to the frontend, mirroring how a git
// account's token is never returned (accounts/git-accounts.ts
// toPublicAccount). Notification webhooks live in their own table
// (notifications/channels.ts) since, unlike these, more than one can exist.

import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { decrypt, encrypt } from '../lib/crypto.js';

const SCAN_SCHEDULE_INTERVAL_HOURS_KEY = 'scan_schedule_interval_hours';
const SCAN_SCHEDULE_ANCHOR_HOUR_KEY = 'scan_schedule_anchor_hour';
const SCAN_SCHEDULE_WEEKDAY_KEY = 'scan_schedule_weekday';

function readSetting(key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? decrypt(row.valueEncrypted, config.encryptionKey) : null;
}

function writeSetting(key: string, value: string, isSecret: boolean): void {
  const valueEncrypted = encrypt(value, config.encryptionKey);
  db.insert(settings)
    .values({ key, valueEncrypted, isSecret })
    .onConflictDoUpdate({ target: settings.key, set: { valueEncrypted, isSecret } })
    .run();
}

function deleteSetting(key: string): void {
  db.delete(settings).where(eq(settings.key, key)).run();
}

export interface AppSettingsPublic {
  scanScheduleIntervalHours: number;
  scanScheduleAnchorHour: number;
  scanScheduleWeekday: number;
}

/** What the frontend is allowed to see. */
export function getAppSettingsPublic(): AppSettingsPublic {
  return {
    scanScheduleIntervalHours: getScanScheduleIntervalHours(),
    scanScheduleAnchorHour: getScanScheduleAnchorHour(),
    scanScheduleWeekday: getScanScheduleWeekday(),
  };
}

export function setScanScheduleIntervalHours(hours: number): void {
  if (hours <= 0) {
    deleteSetting(SCAN_SCHEDULE_INTERVAL_HOURS_KEY);
  } else {
    writeSetting(SCAN_SCHEDULE_INTERVAL_HOURS_KEY, String(hours), false);
  }
}

/** `0` means disabled — same as the setting being absent entirely. */
export function getScanScheduleIntervalHours(): number {
  return Number(readSetting(SCAN_SCHEDULE_INTERVAL_HOURS_KEY) ?? '0');
}

/** Hour of day (0-23, server-local) the schedule is anchored to; defaults to
 * midnight until the admin picks one. */
export function setScanScheduleAnchorHour(hour: number): void {
  writeSetting(SCAN_SCHEDULE_ANCHOR_HOUR_KEY, String(hour), false);
}

export function getScanScheduleAnchorHour(): number {
  return Number(readSetting(SCAN_SCHEDULE_ANCHOR_HOUR_KEY) ?? '0');
}

/** 0=Sunday..6=Saturday; defaults to Monday until the admin picks one. Only
 * read by the scheduler while the weekly preset is active. */
export function setScanScheduleWeekday(weekday: number): void {
  writeSetting(SCAN_SCHEDULE_WEEKDAY_KEY, String(weekday), false);
}

export function getScanScheduleWeekday(): number {
  return Number(readSetting(SCAN_SCHEDULE_WEEKDAY_KEY) ?? '1');
}
