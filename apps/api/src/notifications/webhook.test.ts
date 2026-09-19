import { afterEach, describe, expect, it, vi } from 'vitest';
import { webhookPlatform } from './webhook.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('webhookPlatform.send', () => {
  it('posts a plain {text} payload to any URL', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await webhookPlatform.send('https://example.test/hook', 'hello');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://example.test/hook');
    expect(JSON.parse(init!.body as string)).toEqual({ text: 'hello' });
  });
});
