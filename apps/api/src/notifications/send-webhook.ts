// Delivery mechanics shared by every notification platform (discord.ts,
// slack.ts, webhook.ts): POST a JSON body, never throw. A notification
// failure must never fail the scan job that triggered it — only the
// platform-specific payload shape and message-length limit differ.

const REQUEST_TIMEOUT_MS = 10_000;

export async function postWebhook(
  platformLabel: string,
  url: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`${platformLabel} notification failed: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(
      `${platformLabel} notification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function trimToLimit(content: string, limit: number): string {
  return content.length > limit ? `${content.slice(0, limit - 1)}…` : content;
}
