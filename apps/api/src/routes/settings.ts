// Instance-wide settings (roadmap Phase 3, docs/CONCEPT.md 2.3): the Discord
// notification webhook and the global scan-schedule interval. Follows the
// same shape as the rest of the API (docs/CONCEPT.md 3.4) — GET returns the
// plain object, PATCH validates with Zod and rejects an empty diff.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireSameOrigin } from '../auth/session.js';
import { badRequest } from '../lib/errors.js';
import {
  getAppSettingsPublic,
  setDiscordWebhookUrl,
  setScanScheduleIntervalHours,
} from '../settings/app-settings.js';

const DISCORD_WEBHOOK_PREFIXES = [
  'https://discord.com/api/webhooks/',
  'https://discordapp.com/api/webhooks/',
];

const updateSchema = z
  .object({
    discordWebhookUrl: z.string().url().nullable().optional(),
    // A generous upper bound (~90 days) rather than an unbounded integer —
    // this is a schedule, not an arbitrary number field.
    scanScheduleIntervalHours: z.number().int().min(0).max(24 * 90).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No settings to update' });

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get('/api/settings', async (request) => {
    requireAuth(request);
    return getAppSettingsPublic();
  });

  app.patch('/api/settings', async (request) => {
    requireAuth(request);
    requireSameOrigin(request);
    const input = updateSchema.parse(request.body);

    if (input.discordWebhookUrl !== undefined) {
      if (
        input.discordWebhookUrl !== null &&
        !DISCORD_WEBHOOK_PREFIXES.some((prefix) => input.discordWebhookUrl!.startsWith(prefix))
      ) {
        throw badRequest(
          'A Discord webhook URL looks like https://discord.com/api/webhooks/...',
        );
      }
      setDiscordWebhookUrl(input.discordWebhookUrl);
    }
    if (input.scanScheduleIntervalHours !== undefined) {
      setScanScheduleIntervalHours(input.scanScheduleIntervalHours);
    }

    return getAppSettingsPublic();
  });
}
