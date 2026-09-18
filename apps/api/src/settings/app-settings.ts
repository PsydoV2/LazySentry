// Generic key-value settings (docs/CONCEPT.md 4, `settings` table) for
// instance-wide configuration that isn't tied to a git account or project —
// currently the Discord notification webhook and the global scan-schedule
// interval (roadmap Phase 3, docs/CONCEPT.md 2.3). Every value is encrypted
// at rest the same way as a connected account's token (docs/CONCEPT.md 4.2);
// `isSecret` only controls what a route is allowed to hand back to the
// frontend, mirroring how a git account's token is never returned
// (accounts/git-accounts.ts toPublicAccount).

import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { decrypt, encrypt } from '../lib/crypto.js';

const DISCORD_WEBHOOK_URL_KEY = 'discord_webhook_url';
const SCAN_SCHEDULE_INTERVAL_HOURS_KEY = 'scan_schedule_interval_hours';

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
  discordWebhookConfigured: boolean;
  scanScheduleIntervalHours: number;
}

/** What the frontend is allowed to see — never the raw webhook URL. */
export function getAppSettingsPublic(): AppSettingsPublic {
  return {
    discordWebhookConfigured: readSetting(DISCORD_WEBHOOK_URL_KEY) !== null,
    scanScheduleIntervalHours: getScanScheduleIntervalHours(),
  };
}

export function setDiscordWebhookUrl(url: string | null): void {
  if (url === null) {
    deleteSetting(DISCORD_WEBHOOK_URL_KEY);
  } else {
    writeSetting(DISCORD_WEBHOOK_URL_KEY, url, true);
  }
}

/** Internal use only (the notifications module) — never sent to the client. */
export function getDiscordWebhookUrl(): string | null {
  return readSetting(DISCORD_WEBHOOK_URL_KEY);
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
