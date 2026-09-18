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
  getDiscordWebhookUrl,
  getScanScheduleIntervalHours,
  setDiscordWebhookUrl,
  setScanScheduleIntervalHours,
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
  it('reports the webhook as unconfigured until one is set', () => {
    expect(getAppSettingsPublic().discordWebhookConfigured).toBe(false);
    expect(getDiscordWebhookUrl()).toBeNull();
  });

  it('round-trips a discord webhook url without exposing it publicly', () => {
    setDiscordWebhookUrl('https://discord.com/api/webhooks/1/secret-token');

    expect(getDiscordWebhookUrl()).toBe('https://discord.com/api/webhooks/1/secret-token');
    // The public view never carries the raw url, same as a git account token.
    const publicView = getAppSettingsPublic() as Record<string, unknown>;
    expect(publicView['discordWebhookConfigured']).toBe(true);
    expect(publicView['discordWebhookUrl']).toBeUndefined();
  });

  it('clears the webhook when set to null', () => {
    setDiscordWebhookUrl('https://discord.com/api/webhooks/1/secret-token');
    setDiscordWebhookUrl(null);

    expect(getDiscordWebhookUrl()).toBeNull();
    expect(getAppSettingsPublic().discordWebhookConfigured).toBe(false);
  });

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
});
