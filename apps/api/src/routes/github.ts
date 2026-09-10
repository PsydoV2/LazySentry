// GitHub connect and repository import (docs/CONCEPT.md 7, 8.1).

import type { FastifyInstance } from 'fastify';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  getAccountToken,
  getGitAccount,
  markAccountInvalid,
  markAccountValid,
  saveGitAccount,
  toPublicAccount,
} from '../accounts/git-accounts.js';
import { requireAuth, requireSameOrigin } from '../auth/session.js';
import { db } from '../db/client.js';
import { projects } from '../db/schema.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { enqueueScanJob } from '../queue/jobs.js';
import { githubProvider } from '../providers/github.js';
import { ProviderAuthError, ProviderRequestError } from '../providers/types.js';
import { adminAccountExists } from '../auth/users.js';

const connectSchema = z.object({
  token: z.string().trim().min(1, 'Token must not be empty'),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().optional(),
});

const importSchema = z.object({
  repositoryIds: z
    .array(z.string().min(1))
    .min(1, 'Select at least one repository')
    .max(100, 'Import at most 100 repositories at a time'),
});

/** Maps provider failures onto the API error shape (docs/CONCEPT.md 3.4). */
function toApiError(error: unknown): never {
  if (error instanceof ProviderAuthError) {
    throw new AppError(400, 'PROVIDER_AUTH_FAILED', error.message);
  }
  if (error instanceof ProviderRequestError) {
    throw new AppError(502, 'PROVIDER_UNAVAILABLE', error.message);
  }
  throw error;
}

export function registerGithubRoutes(app: FastifyInstance): void {
  /**
   * Connecting is allowed during setup, before a session exists — but only
   * while there is no admin account yet, i.e. inside the wizard. Afterwards
   * it requires a login like every other state-changing endpoint.
   */
  function requireSetupOrAuth(request: Parameters<typeof requireAuth>[0]): void {
    requireSameOrigin(request);
    if (adminAccountExists() && request.session.userId === undefined) {
      requireAuth(request);
    }
  }

  app.post(
    '/api/git-accounts/github',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      requireSetupOrAuth(request);
      const { token } = connectSchema.parse(request.body);

      const account = await githubProvider
        .validateToken(token)
        .catch(toApiError);

      const saved = saveGitAccount({
        provider: 'github',
        username: account.username,
        token,
        scopes: account.scopes,
      });

      return reply.status(201).send({
        account: toPublicAccount(saved),
        // Surfaced by the UI as a visible warning (docs/CONCEPT.md 6.2).
        writeScopes: account.writeScopes,
        scopesUnknown: account.scopesUnknown,
      });
    },
  );

  app.get('/api/git-accounts/github/repositories', async (request) => {
    requireAuth(request);
    const account = getGitAccount();
    if (!account) throw notFound('No GitHub account connected');

    const query = listQuerySchema.parse(request.query);
    const token = getAccountToken(account);

    let page;
    try {
      page = await githubProvider.listRepositories(token, {
        page: query.page,
        perPage: query.perPage,
      });
      markAccountValid(account.id);
    } catch (error) {
      if (error instanceof ProviderAuthError) markAccountInvalid(account.id);
      return toApiError(error);
    }

    const search = query.search?.toLowerCase();
    const repositories = search
      ? page.repositories.filter((repo) =>
          repo.fullName.toLowerCase().includes(search),
        )
      : page.repositories;

    // Already-imported repositories are marked rather than hidden, so the
    // picker can grey them out (docs/CONCEPT.md 8.1).
    const importedIds = new Set(
      db
        .select({ providerRepoId: projects.providerRepoId })
        .from(projects)
        .all()
        .map((row) => row.providerRepoId),
    );

    return {
      repositories: repositories.map((repo) => ({
        ...repo,
        imported: importedIds.has(repo.providerRepoId),
      })),
      page: query.page,
      hasMore: page.hasMore,
    };
  });

  app.post('/api/projects/import', async (request, reply) => {
    requireAuth(request);
    requireSameOrigin(request);
    const account = getGitAccount();
    if (!account) throw notFound('No GitHub account connected');

    const { repositoryIds } = importSchema.parse(request.body);
    const token = getAccountToken(account);

    // Resolve the selected ids against the account's repositories, so a
    // client cannot import a repository this token has no access to.
    const wanted = new Set(repositoryIds);
    const found = new Map<string, Awaited<ReturnType<typeof githubProvider.listRepositories>>['repositories'][number]>();
    try {
      for (let page = 1; page <= 20 && found.size < wanted.size; page++) {
        const result = await githubProvider.listRepositories(token, {
          page,
          perPage: 100,
        });
        for (const repo of result.repositories) {
          if (wanted.has(repo.providerRepoId)) found.set(repo.providerRepoId, repo);
        }
        if (!result.hasMore) break;
      }
      markAccountValid(account.id);
    } catch (error) {
      if (error instanceof ProviderAuthError) markAccountInvalid(account.id);
      return toApiError(error);
    }

    const missing = repositoryIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw badRequest(
        `Not accessible with the connected account: ${missing.join(', ')}`,
      );
    }

    const alreadyImported = new Set(
      db
        .select({ providerRepoId: projects.providerRepoId })
        .from(projects)
        .where(inArray(projects.providerRepoId, [...wanted]))
        .all()
        .map((row) => row.providerRepoId),
    );

    const imported: { id: number; fullName: string }[] = [];
    const skipped: string[] = [];
    for (const [repoId, repo] of found) {
      if (alreadyImported.has(repoId)) {
        skipped.push(repo.fullName);
        continue;
      }
      const project = db
        .insert(projects)
        .values({
          gitAccountId: account.id,
          providerRepoId: repo.providerRepoId,
          name: repo.name,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          cloneUrl: repo.cloneUrl,
          isPrivate: repo.isPrivate,
          addedAt: new Date(),
        })
        .returning({ id: projects.id, fullName: projects.fullName })
        .get();
      // The card should appear as "scanning" right away (docs/CONCEPT.md 8.1).
      enqueueScanJob({ projectId: project.id, trigger: 'manual' });
      imported.push(project);
    }

    return reply.status(201).send({ imported, skipped });
  });
}
