// Registry mapping a stored channel's platform id to its implementation.
// Every consumer that needs "the platform for this channel" goes through
// here instead of branching on `platform === 'discord'` itself — mirrors
// providers/index.ts.

import { discordPlatform } from './discord.js';
import { slackPlatform } from './slack.js';
import { webhookPlatform } from './webhook.js';
import type { NotificationPlatform, NotificationPlatformId } from './types.js';

const PLATFORMS: Record<NotificationPlatformId, NotificationPlatform> = {
  discord: discordPlatform,
  slack: slackPlatform,
  webhook: webhookPlatform,
};

export const NOTIFICATION_PLATFORM_LIST = Object.values(PLATFORMS);

export function isNotificationPlatformId(value: string): value is NotificationPlatformId {
  return value in PLATFORMS;
}

export function getNotificationPlatform(id: NotificationPlatformId): NotificationPlatform {
  return PLATFORMS[id];
}

export * from './types.js';
