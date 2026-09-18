// Exposes the update notice (version-check.ts) to the frontend.

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/session.js';
import { config } from '../config.js';
import { checkForUpdate } from '../version-check.js';

export function registerVersionRoutes(app: FastifyInstance): void {
  app.get('/api/version', async (request) => {
    requireAuth(request);
    return checkForUpdate(config.APP_VERSION);
  });
}
