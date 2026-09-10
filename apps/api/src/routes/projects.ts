import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth, requireSameOrigin } from '../auth/session.js';
import { db } from '../db/client.js';
import { projects, scans, vulnerabilities } from '../db/schema.js';
import { conflict, notFound } from '../lib/errors.js';
import { enqueueScanJob, hasActiveScanJob } from '../queue/jobs.js';

const projectIdParams = z.object({ id: z.coerce.number().int().positive() });

/** Resolves the :id route param to an existing project id, or throws. */
function requireProjectId(rawParams: unknown): number {
  const { id } = projectIdParams.parse(rawParams);
  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id))
    .get();
  if (!project) throw notFound('Project not found');
  return project.id;
}

export function registerProjectRoutes(app: FastifyInstance): void {
  app.get('/api/projects', async (request) => {
    requireAuth(request);
    return db.select().from(projects).all();
  });

  app.get('/api/projects/:id', async (request) => {
    requireAuth(request);
    const projectId = requireProjectId(request.params);
    return db.select().from(projects).where(eq(projects.id, projectId)).get();
  });

  app.get('/api/projects/:id/scans', async (request) => {
    requireAuth(request);
    const projectId = requireProjectId(request.params);
    return db
      .select()
      .from(scans)
      .where(eq(scans.projectId, projectId))
      .orderBy(desc(scans.id))
      .all();
  });

  app.post(
    '/api/projects/:id/scans',
    {
      // Keeps a frontend bug or a hijacked session from flooding the worker
      // with jobs (docs/CONCEPT.md 6.2).
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      requireAuth(request);
      requireSameOrigin(request);
      const projectId = requireProjectId(request.params);
      if (hasActiveScanJob(projectId)) {
        throw conflict(
          'SCAN_ALREADY_QUEUED',
          'A scan for this project is already queued or running',
        );
      }
      const job = enqueueScanJob({ projectId, trigger: 'manual' });
      return reply.status(202).send({ jobId: job.id, status: job.status });
    },
  );

  app.delete('/api/projects/:id', async (request, reply) => {
    requireAuth(request);
    requireSameOrigin(request);
    const projectId = requireProjectId(request.params);
    // Scans, packages and findings cascade from the project row.
    db.delete(projects).where(eq(projects.id, projectId)).run();
    return reply.status(204).send();
  });

  app.get('/api/projects/:id/vulnerabilities', async (request) => {
    requireAuth(request);
    const projectId = requireProjectId(request.params);
    return db
      .select()
      .from(vulnerabilities)
      .where(eq(vulnerabilities.projectId, projectId))
      .orderBy(desc(vulnerabilities.cvssScore))
      .all();
  });
}
