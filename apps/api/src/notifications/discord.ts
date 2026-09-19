// Discord webhook delivery (roadmap Phase 3, docs/CONCEPT.md 2.3).

import { postWebhook, trimToLimit } from './send-webhook.js';
import type { NotificationPlatform } from './types.js';

const DISCORD_MESSAGE_LIMIT = 2000;

async function send(url: string, content: string): Promise<void> {
  await postWebhook('Discord', url, {
    content: trimToLimit(content, DISCORD_MESSAGE_LIMIT),
    // The message embeds a project's full name, which comes straight from
    // the connected provider's API and is not trusted content (docs/
    // CONCEPT.md 6.1) — parse: [] suppresses every @everyone/@here/role/
    // user mention it could otherwise trigger.
    allowed_mentions: { parse: [] },
  });
}

export const discordPlatform: NotificationPlatform = {
  id: 'discord',
  label: 'Discord',
  urlPrefixes: ['https://discord.com/api/webhooks/', 'https://discordapp.com/api/webhooks/'],
  send,
};
