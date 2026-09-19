// Instance-wide settings (roadmap Phase 3, docs/CONCEPT.md 2.3): the global
// scan-schedule. Follows the same shape as the rest of the API (docs/
// CONCEPT.md 3.4) — GET returns the plain object, PATCH validates with Zod
// and rejects an empty diff. Notification channels have their own routes
// (routes/notification-channels.ts) since more than one can be configured.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recordAuditLog } from '../audit/log.js';
import { requireAuth, requireSameOrigin } from '../auth/session.js';
import {
  getAppSettingsPublic,
  setScanScheduleAnchorHour,
  setScanScheduleIntervalHours,
  setScanScheduleWeekday,
} from '../settings/app-settings.js';

const updateSchema = z
  .object({
    // A generous upper bound (~90 days) rather than an unbounded integer —
    // this is a schedule, not an arbitrary number field.
    scanScheduleIntervalHours: z.number().int().min(0).max(24 * 90).optional(),
    scanScheduleAnchorHour: z.number().int().min(0).max(23).optional(),
    scanScheduleWeekday: z.number().int().min(0).max(6).optional(),
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

    if (input.scanScheduleIntervalHours !== undefined) {
      setScanScheduleIntervalHours(input.scanScheduleIntervalHours);
    }
    if (input.scanScheduleAnchorHour !== undefined) {
      setScanScheduleAnchorHour(input.scanScheduleAnchorHour);
    }
    if (input.scanScheduleWeekday !== undefined) {
      setScanScheduleWeekday(input.scanScheduleWeekday);
    }

    recordAuditLog(request, { action: 'settings.update', meta: input });
    return getAppSettingsPublic();
  });
}
