import { afterEach, describe, expect, it, vi } from 'vitest';
import { slackPlatform } from './slack.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('slackPlatform.send', () => {
  it('posts a plain {text} payload', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await slackPlatform.send('https://hooks.slack.com/services/1/2/3', 'hello');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://hooks.slack.com/services/1/2/3');
    expect(JSON.parse(init!.body as string)).toEqual({ text: 'hello' });
  });

  it('does not throw when the request fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(
      slackPlatform.send('https://hooks.slack.com/services/1/2/3', 'hello'),
    ).resolves.toBeUndefined();
  });
});
