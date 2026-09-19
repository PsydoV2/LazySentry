// Audit log viewer (docs/CONCEPT.md 2.2, 6.2) — admin only, same restriction
// as git-account and user management.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth/session.js';
import { listAuditLog } from '../audit/log.js';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  beforeId: z.coerce.number().int().positive().optional(),
});

export function registerAuditLogRoutes(app: FastifyInstance): void {
  app.get('/api/audit-log', async (request) => {
    requireRole(request, 'admin');
    const { limit, beforeId } = listQuerySchema.parse(request.query);
    return listAuditLog({ limit, beforeId });
  });
}
