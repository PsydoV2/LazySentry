// Fleet-wide package query and trend charts (docs/CONCEPT.md 2.2). Both
// read-only, both answered from data already collected by ordinary project
// scans — no new scan is triggered by either endpoint.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/session.js';
import { queryFleetPackages } from '../scan/fleet-query.js';
import { queryFleetTrends } from '../scan/fleet-snapshot.js';
import { toFleetPackageMatchDto, toFleetTrendPointDto } from './dto.js';

const packageQuerySchema = z.object({
  name: z.string().trim().min(1),
  range: z.string().trim().min(1).optional(),
});

const RANGE_DAYS = { '30d': 30, '90d': 90, '1y': 365 } as const;
const trendsQuerySchema = z.object({
  range: z.enum(['30d', '90d', '1y']).default('90d'),
});

export function registerFleetRoutes(app: FastifyInstance): void {
  app.get('/api/fleet/packages', async (request) => {
    requireAuth(request);
    const input = packageQuerySchema.parse(request.query);
    const matches = queryFleetPackages(input);
    return { matches: matches.map(toFleetPackageMatchDto) };
  });

  app.get('/api/fleet/trends', async (request) => {
    requireAuth(request);
    const input = trendsQuerySchema.parse(request.query);
    const points = queryFleetTrends({ days: RANGE_DAYS[input.range] });
    return { points: points.map(toFleetTrendPointDto) };
  });
}
