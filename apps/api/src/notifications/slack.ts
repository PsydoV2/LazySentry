// Slack incoming-webhook delivery (roadmap Phase 3, docs/CONCEPT.md 2.3).

import { postWebhook, trimToLimit } from './send-webhook.js';
import type { NotificationPlatform } from './types.js';

const SLACK_MESSAGE_LIMIT = 3000;

async function send(url: string, content: string): Promise<void> {
  // Unlike Discord, no mention-suppression is needed here: GitHub and GitLab
  // both restrict project names to [A-Za-z0-9_.-], so the untrusted fullName
  // embedded in a message (docs/CONCEPT.md 6.1) can never contain Slack's
  // <!channel>/<!here>/<!everyone> mention syntax.
  await postWebhook('Slack', url, { text: trimToLimit(content, SLACK_MESSAGE_LIMIT) });
}

export const slackPlatform: NotificationPlatform = {
  id: 'slack',
  label: 'Slack',
  urlPrefixes: ['https://hooks.slack.com/services/'],
  send,
};
