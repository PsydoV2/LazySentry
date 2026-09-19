// Notification channels (roadmap Phase 3, docs/CONCEPT.md 2.3): several can
// be configured at once, including several of the same platform. Managing
// them is a member-level action, not admin-only — same as the rest of the
// notification/schedule settings (docs/CONCEPT.md 2.6).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireSameOrigin } from '../auth/session.js';
import { badRequest, notFound } from '../lib/errors.js';
import {
  createNotificationChannel,
  deleteNotificationChannel,
  getNotificationChannelById,
  listNotificationChannels,
  toPublicChannel,
} from '../notifications/channels.js';
import {
  getNotificationPlatform,
  isNotificationPlatformId,
  NOTIFICATION_PLATFORM_LIST,
} from '../notifications/index.js';

const createSchema = z.object({
  platform: z.enum(['discord', 'slack', 'webhook']),
  url: z.string().trim().url(),
  label: z.string().trim().max(60).optional(),
});

export function registerNotificationChannelRoutes(app: FastifyInstance): void {
  app.get('/api/notification-platforms', async () => ({
    platforms: NOTIFICATION_PLATFORM_LIST.map((platform) => ({
      id: platform.id,
      label: platform.label,
    })),
  }));

  app.get('/api/notification-channels', async (request) => {
    requireAuth(request);
    return { channels: listNotificationChannels().map(toPublicChannel) };
  });

  app.post('/api/notification-channels', async (request, reply) => {
    requireAuth(request);
    requireSameOrigin(request);
    const input = createSchema.parse(request.body);
    if (!isNotificationPlatformId(input.platform)) {
      throw badRequest(`Unknown notification platform: ${input.platform}`);
    }
    const platform = getNotificationPlatform(input.platform);

    if (
      platform.urlPrefixes.length > 0 &&
      !platform.urlPrefixes.some((prefix) => input.url.startsWith(prefix))
    ) {
      throw badRequest(`A ${platform.label} webhook URL looks like ${platform.urlPrefixes[0]}...`);
    }

    const created = createNotificationChannel({
      platform: input.platform,
      label: input.label?.trim() || null,
      url: input.url,
    });
    return reply.status(201).send({ channel: toPublicChannel(created) });
  });

  app.delete('/api/notification-channels/:id', async (request, reply) => {
    requireAuth(request);
    requireSameOrigin(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    if (!getNotificationChannelById(id)) throw notFound('Notification channel not found');

    deleteNotificationChannel(id);
    return reply.status(204).send();
  });
}
