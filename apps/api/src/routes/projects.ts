import type { FastifyInstance } from 'fastify';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth, requireSameOrigin } from '../auth/session.js';
import { db } from '../db/client.js';
import {
  packages,
  projects,
  scans,
  secrets,
  vulnerabilities,
} from '../db/schema.js';
import { conflict, notFound } from '../lib/errors.js';
import { enqueueScanJob, hasActiveScanJob } from '../queue/jobs.js';
import { scanStateFor, scanStatesByProject } from '../scan/scan-state.js';
import {
  toPackageDto,
  toProjectDto,
  toScanDto,
  toSecretDto,
  toVulnerabilityDto,
} from './dto.js';

const projectIdParams = z.object({ id: z.coerce.number().int().positive() });

const triggerScanSchema = z
  .object({
    /**
     * Full rescan (docs/CONCEPT.md 5.4/8.2): ignore last_scanned_commit_sha
     * and walk the whole history again instead of only new commits.
     */
    full: z.boolean().optional(),
  })
  .optional();

const settingsSchema = z
  .object({
    scanSecretsEnabled: z.boolean().optional(),
    verifySecretsEnabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No settings to update',
  });

type ProjectRow = typeof projects.$inferSelect;

/** Resolves the :id route param to an existing project row, or throws. */
function requireProject(rawParams: unknown): ProjectRow {
  const { id } = projectIdParams.parse(rawParams);
  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) throw notFound('Project not found');
  return project;
}

/** Row shape shared by the list and single-project queries below. */
function selectProjectsWithLastScanError() {
  return db
    .select({ project: projects, lastScanErrorMessage: scans.errorMessage })
    .from(projects)
    .leftJoin(scans, eq(projects.lastScanId, scans.id));
}

export function registerProjectRoutes(app: FastifyInstance): void {
  app.get('/api/projects', async (request) => {
    requireAuth(request);
    const states = scanStatesByProject();
    return selectProjectsWithLastScanError()
      .all()
      .map((row) =>
        toProjectDto(
          row.project,
          states.get(row.project.id) ?? 'idle',
          row.lastScanErrorMessage,
        ),
      );
  });

  app.get('/api/projects/:id', async (request) => {
    requireAuth(request);
    const project = requireProject(request.params);
    const row = selectProjectsWithLastScanError()
      .where(eq(projects.id, project.id))
      .get();
    return toProjectDto(
      project,
      scanStateFor(project.id),
      row?.lastScanErrorMessage ?? null,
    );
  });

  app.patch('/api/projects/:id', async (request) => {
    requireAuth(request);
    requireSameOrigin(request);
    const project = requireProject(request.params);
    const input = settingsSchema.parse(request.body);

    const updated = db
      .update(projects)
      .set(input)
      .where(eq(projects.id, project.id))
      .returning()
      .get();
    return toProjectDto(updated, scanStateFor(project.id));
  });

  app.get('/api/projects/:id/scans', async (request) => {
    requireAuth(request);
    const project = requireProject(request.params);
    return db
      .select()
      .from(scans)
      .where(eq(scans.projectId, project.id))
      .orderBy(desc(scans.id))
      .all()
      .map(toScanDto);
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
      const project = requireProject(request.params);
      const input = triggerScanSchema.parse(request.body) ?? {};
      if (hasActiveScanJob(project.id)) {
        throw conflict(
          'SCAN_ALREADY_QUEUED',
          'A scan for this project is already queued or running',
        );
      }
      // The flag rides along in the job payload instead of resetting
      // last_scanned_commit_sha here: a queued job that never runs must not
      // leave the project in a state that silently changes the next scan.
      const job = enqueueScanJob({
        projectId: project.id,
        trigger: 'manual',
        ...(input.full ? { fullRescan: true } : {}),
      });
      return reply.status(202).send({ jobId: job.id, status: job.status });
    },
  );

  app.delete('/api/projects/:id', async (request, reply) => {
    requireAuth(request);
    requireSameOrigin(request);
    const project = requireProject(request.params);
    // Scans, packages and findings cascade from the project row.
    db.delete(projects).where(eq(projects.id, project.id)).run();
    return reply.status(204).send();
  });

  /**
   * The dependency inventory (docs/CONCEPT.md 8.2). Package rows are a
   * per-scan snapshot, so this returns the newest scan that actually produced
   * one — not necessarily the newest scan, which may have failed or found no
   * lockfiles at all.
   */
  app.get('/api/projects/:id/packages', async (request) => {
    requireAuth(request);
    const project = requireProject(request.params);

    const latest = db
      .select({ scanId: sql<number | null>`max(${packages.scanId})` })
      .from(packages)
      .innerJoin(scans, eq(packages.scanId, scans.id))
      .where(eq(scans.projectId, project.id))
      .get();
    if (!latest?.scanId) return [];

    return db
      .select()
      .from(packages)
      .where(eq(packages.scanId, latest.scanId))
      .orderBy(packages.ecosystem, packages.name)
      .all()
      .map(toPackageDto);
  });

  app.get('/api/projects/:id/vulnerabilities', async (request) => {
    requireAuth(request);
    const project = requireProject(request.params);
    // Left join: the package row a finding pointed at belongs to one scan and
    // may be gone, while the finding itself lives on (docs/CONCEPT.md 4.1).
    return db
      .select({ vulnerability: vulnerabilities, package: packages })
      .from(vulnerabilities)
      .leftJoin(packages, eq(vulnerabilities.packageId, packages.id))
      .where(eq(vulnerabilities.projectId, project.id))
      .orderBy(desc(vulnerabilities.cvssScore))
      .all()
      .map((row) => toVulnerabilityDto(row.vulnerability, row.package));
  });

  app.get('/api/projects/:id/secrets', async (request) => {
    requireAuth(request);
    const project = requireProject(request.params);
    // The `secrets` row itself never holds the raw value (docs/CONCEPT.md
    // 4.3) — selecting the whole row and returning it is safe, unlike the
    // equivalent for a hypothetical raw-secret column.
    return db
      .select()
      .from(secrets)
      .where(eq(secrets.projectId, project.id))
      .orderBy(desc(secrets.isVerified), desc(secrets.id))
      .all()
      .map(toSecretDto);
  });
}
