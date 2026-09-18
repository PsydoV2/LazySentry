// Discord webhook delivery (roadmap Phase 3, docs/CONCEPT.md 2.3). A
// notification failure must never fail the scan job that triggered it — this
// module never throws, it only logs.

import { getDiscordWebhookUrl } from '../settings/app-settings.js';

const DISCORD_MESSAGE_LIMIT = 2000;
const REQUEST_TIMEOUT_MS = 10_000;

export async function sendDiscordNotification(content: string): Promise<void> {
  const url = getDiscordWebhookUrl();
  if (!url) return;

  const trimmed =
    content.length > DISCORD_MESSAGE_LIMIT
      ? `${content.slice(0, DISCORD_MESSAGE_LIMIT - 1)}…`
      : content;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // The message embeds a project's full name, which comes straight from
      // the connected provider's API and is not trusted content (docs/
      // CONCEPT.md 6.1) — parse: [] suppresses every @everyone/@here/role/
      // user mention it could otherwise trigger.
      body: JSON.stringify({ content: trimmed, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`Discord notification failed: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(
      `Discord notification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
