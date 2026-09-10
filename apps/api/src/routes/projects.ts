import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { projects, vulnerabilities } from '../db/schema.js';

export function registerProjectRoutes(app: FastifyInstance): void {
  app.get('/api/projects', async () => {
    return db.select().from(projects).all();
  });

  app.get<{ Params: { id: string } }>(
    '/api/projects/:id/vulnerabilities',
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid project id' },
        });
      }
      const project = db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, id))
        .get();
      if (!project) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        });
      }
      return db
        .select()
        .from(vulnerabilities)
        .where(eq(vulnerabilities.projectId, id))
        .orderBy(desc(vulnerabilities.cvssScore))
        .all();
    },
  );
}
