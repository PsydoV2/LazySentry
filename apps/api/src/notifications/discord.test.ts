import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { settings } = await import('../db/schema.js');
const { setDiscordWebhookUrl } = await import('../settings/app-settings.js');
const { sendDiscordNotification } = await import('./discord.js');

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(settings).run();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('sendDiscordNotification', () => {
  it('does nothing when no webhook is configured', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    await sendDiscordNotification('hello');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts the message with mentions suppressed', async () => {
    setDiscordWebhookUrl('https://discord.com/api/webhooks/1/secret-token');
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await sendDiscordNotification('hello @everyone');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://discord.com/api/webhooks/1/secret-token');
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ content: 'hello @everyone', allowed_mentions: { parse: [] } });
  });

  it('does not throw when the webhook responds with an error', async () => {
    setDiscordWebhookUrl('https://discord.com/api/webhooks/1/secret-token');
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));

    await expect(sendDiscordNotification('hello')).resolves.toBeUndefined();
  });

  it('does not throw when the request itself fails', async () => {
    setDiscordWebhookUrl('https://discord.com/api/webhooks/1/secret-token');
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(sendDiscordNotification('hello')).resolves.toBeUndefined();
  });
});
