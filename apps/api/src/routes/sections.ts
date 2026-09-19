// Dashboard sections: user-defined groups projects can be organized into
// (not in docs/CONCEPT.md — a homepage organization layer on top of the
// urgency-sorted grid). CRUD plus a reorder endpoint mirroring the one on
// /api/projects.

import type { FastifyInstance } from 'fastify';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth, requireSameOrigin } from '../auth/session.js';
import { db } from '../db/client.js';
import { projects, projectSections } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { toSectionDto } from './dto.js';

const sectionIdParams = z.object({ id: z.coerce.number().int().positive() });

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name must not be empty').max(100),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name must not be empty').max(100).optional(),
    collapsed: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes to apply' });

const reorderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

function requireSection(rawParams: unknown) {
  const { id } = sectionIdParams.parse(rawParams);
  const section = db.select().from(projectSections).where(eq(projectSections.id, id)).get();
  if (!section) throw notFound('Section not found');
  return section;
}

export function registerSectionRoutes(app: FastifyInstance): void {
  app.get('/api/sections', async (request) => {
    requireAuth(request);
    return db
      .select()
      .from(projectSections)
      .orderBy(asc(projectSections.sortOrder))
      .all()
      .map(toSectionDto);
  });

  app.post('/api/sections', async (request, reply) => {
    requireAuth(request);
    requireSameOrigin(request);
    const input = createSchema.parse(request.body);

    const row = db
      .select({ max: sql<number | null>`max(${projectSections.sortOrder})` })
      .from(projectSections)
      .get();
    const created = db
      .insert(projectSections)
      .values({ name: input.name, sortOrder: (row?.max ?? -1) + 1, createdAt: new Date() })
      .returning()
      .get();
    return reply.status(201).send(toSectionDto(created));
  });

  app.patch('/api/sections/:id', async (request) => {
    requireAuth(request);
    requireSameOrigin(request);
    const section = requireSection(request.params);
    const input = updateSchema.parse(request.body);

    const updated = db
      .update(projectSections)
      .set(input)
      .where(eq(projectSections.id, section.id))
      .returning()
      .get();
    return toSectionDto(updated);
  });

  // Section headers are drag-reorderable among themselves, same idea as
  // POST /api/projects/reorder but for the one flat list of sections.
  app.post('/api/sections/reorder', async (request) => {
    requireAuth(request);
    requireSameOrigin(request);
    const { ids } = reorderSchema.parse(request.body);

    const existing = new Set(
      db.select({ id: projectSections.id }).from(projectSections).all().map((row) => row.id),
    );
    for (const id of ids) {
      if (!existing.has(id)) throw notFound(`Section ${id} not found`);
    }

    db.transaction((tx) => {
      ids.forEach((id, index) => {
        tx.update(projectSections).set({ sortOrder: index }).where(eq(projectSections.id, id)).run();
      });
    });

    return db
      .select()
      .from(projectSections)
      .orderBy(asc(projectSections.sortOrder))
      .all()
      .map(toSectionDto);
  });

  app.delete('/api/sections/:id', async (request, reply) => {
    requireAuth(request);
    requireSameOrigin(request);
    const section = requireSection(request.params);
    // schema.ts declares section_id ON DELETE SET NULL, but the migration
    // that added the column (0007, `ALTER TABLE ... ADD section_id integer
    // REFERENCES ...`) predates that and never carried the clause into the
    // actual column — SQLite has no ALTER TABLE that can attach it
    // retroactively without a full table rebuild. So every install's live
    // schema defaults to NO ACTION here, and just deleting the section row
    // trips a FOREIGN KEY constraint failure the moment it still has
    // members. Detached explicitly instead, so members reappear in the
    // leftover group rather than blocking the delete.
    db.update(projects).set({ sectionId: null }).where(eq(projects.sectionId, section.id)).run();
    db.delete(projectSections).where(eq(projectSections.id, section.id)).run();
    return reply.status(204).send();
  });
}
