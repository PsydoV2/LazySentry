import { afterEach, describe, expect, it, vi } from 'vitest';
import { discordPlatform } from './discord.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('discordPlatform.send', () => {
  it('posts the message with mentions suppressed', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await discordPlatform.send('https://discord.com/api/webhooks/1/secret-token', 'hello @everyone');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://discord.com/api/webhooks/1/secret-token');
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ content: 'hello @everyone', allowed_mentions: { parse: [] } });
  });

  it('does not throw when the webhook responds with an error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));

    await expect(discordPlatform.send('https://discord.com/api/webhooks/1/x', 'hello')).resolves.toBeUndefined();
  });

  it('does not throw when the request itself fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(discordPlatform.send('https://discord.com/api/webhooks/1/x', 'hello')).resolves.toBeUndefined();
  });
});
