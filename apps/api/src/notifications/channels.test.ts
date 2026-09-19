import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
// config.ts refuses to load without a master key (docs/CONCEPT.md 4.2).
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { notificationChannels } = await import('../db/schema.js');
const {
  createNotificationChannel,
  deleteNotificationChannel,
  getChannelUrl,
  getNotificationChannelById,
  listNotificationChannels,
  toPublicChannel,
} = await import('./channels.js');

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(notificationChannels).run();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

function connect(overrides: Partial<Parameters<typeof createNotificationChannel>[0]> = {}) {
  return createNotificationChannel({
    platform: 'discord',
    label: null,
    url: 'https://discord.com/api/webhooks/1/secret-token',
    ...overrides,
  });
}

describe('createNotificationChannel', () => {
  it('allows several channels side by side, including two of the same platform', () => {
    const first = connect({ label: 'Security team' });
    const second = connect({ label: 'On-call' });

    expect(first.id).not.toBe(second.id);
    expect(listNotificationChannels().map((c) => c.label).sort()).toEqual([
      'On-call',
      'Security team',
    ]);
  });

  it('never stores the raw webhook url', () => {
    const channel = connect();
    expect(channel.urlEncrypted).not.toContain('secret-token');
    expect(getChannelUrl(channel)).toBe('https://discord.com/api/webhooks/1/secret-token');
  });
});

describe('toPublicChannel', () => {
  it('never carries the webhook url', () => {
    const channel = connect({ label: 'Security team' });
    const publicView = toPublicChannel(channel) as Record<string, unknown>;

    expect(publicView['label']).toBe('Security team');
    expect(publicView['url']).toBeUndefined();
    expect(publicView['urlEncrypted']).toBeUndefined();
  });
});

describe('deleteNotificationChannel', () => {
  it('removes the channel', () => {
    const channel = connect();
    deleteNotificationChannel(channel.id);

    expect(listNotificationChannels()).toHaveLength(0);
    expect(getNotificationChannelById(channel.id)).toBeUndefined();
  });
});
