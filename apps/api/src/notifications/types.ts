// Notification platform abstraction — mirrors the git provider pattern
// (providers/types.ts): the interface is what lets a new platform (Teams,
// ntfy, …) be a new file instead of a rewrite of everything that sends "a"
// notification.

export type NotificationPlatformId = 'discord' | 'slack' | 'webhook';

export interface NotificationPlatform {
  readonly id: NotificationPlatformId;
  readonly label: string;
  /** URL prefix(es) this platform's webhooks are expected to start with —
   * used for a light sanity check on save. Empty means any https URL is
   * accepted (the generic webhook). */
  readonly urlPrefixes: string[];
  /** Never throws (send-webhook.ts) — a notification failure must never
   * fail the scan job that triggered it. */
  send(url: string, content: string): Promise<void>;
}
