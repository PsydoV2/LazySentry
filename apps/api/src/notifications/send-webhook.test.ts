import { afterEach, describe, expect, it, vi } from 'vitest';
import { postWebhook, trimToLimit } from './send-webhook.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('trimToLimit', () => {
  it('leaves content under the limit untouched', () => {
    expect(trimToLimit('hello', 10)).toBe('hello');
  });

  it('truncates content over the limit with an ellipsis', () => {
    const result = trimToLimit('a'.repeat(20), 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('postWebhook', () => {
  it('never throws when the endpoint responds with an error status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      postWebhook('Test', 'https://example.test/hook', { text: 'hi' }),
    ).resolves.toBeUndefined();
  });

  it('never throws when the request itself fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(
      postWebhook('Test', 'https://example.test/hook', { text: 'hi' }),
    ).resolves.toBeUndefined();
  });
});
