// Generic webhook delivery (roadmap Phase 3, docs/CONCEPT.md 2.3) — for any
// service that accepts a plain {"text": ...} POST, without committing to a
// specific platform's payload conventions.

import { postWebhook, trimToLimit } from './send-webhook.js';
import type { NotificationPlatform } from './types.js';

const WEBHOOK_MESSAGE_LIMIT = 3000;

async function send(url: string, content: string): Promise<void> {
  await postWebhook('Webhook', url, { text: trimToLimit(content, WEBHOOK_MESSAGE_LIMIT) });
}

export const webhookPlatform: NotificationPlatform = {
  id: 'webhook',
  label: 'Generic webhook',
  urlPrefixes: [],
  send,
};
