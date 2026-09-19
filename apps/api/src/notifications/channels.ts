// Storage for configured notification channels. Several can be connected at
// once, including several of the same platform (e.g. two Slack channels) —
// every one of them receives every scan notification (docs/CONCEPT.md 2.3).
// The webhook URL is encrypted at rest (docs/CONCEPT.md 4.2), same as a git
// account's token, and only decrypted where it is actually sent.

import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { notificationChannels } from '../db/schema.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import type { NotificationPlatformId } from './types.js';

export type NotificationChannel = typeof notificationChannels.$inferSelect;

/** Channel data safe to send to the client — never includes the webhook URL. */
export interface PublicNotificationChannel {
  id: number;
  platform: string;
  label: string | null;
  createdAt: number;
}

export function toPublicChannel(channel: NotificationChannel): PublicNotificationChannel {
  return {
    id: channel.id,
    platform: channel.platform,
    label: channel.label,
    createdAt: channel.createdAt.getTime(),
  };
}

export function listNotificationChannels(): NotificationChannel[] {
  return db.select().from(notificationChannels).orderBy(notificationChannels.id).all();
}

export function getNotificationChannelById(id: number): NotificationChannel | undefined {
  return db.select().from(notificationChannels).where(eq(notificationChannels.id, id)).get();
}

export function createNotificationChannel(input: {
  platform: NotificationPlatformId;
  label: string | null;
  url: string;
}): NotificationChannel {
  return db
    .insert(notificationChannels)
    .values({
      platform: input.platform,
      label: input.label,
      urlEncrypted: encrypt(input.url, config.encryptionKey),
      createdAt: new Date(),
    })
    .returning()
    .get();
}

export function deleteNotificationChannel(id: number): void {
  db.delete(notificationChannels).where(eq(notificationChannels.id, id)).run();
}

export function getChannelUrl(channel: NotificationChannel): string {
  return decrypt(channel.urlEncrypted, config.encryptionKey);
}
