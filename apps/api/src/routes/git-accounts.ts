// Connecting git accounts (GitHub and GitLab, several at once) and importing
// repositories from them (docs/CONCEPT.md 7, 8.1).

import type { FastifyInstance } from 'fastify';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  countProjectsForAccount,
  createGitAccount,
  deleteGitAccount,
  findMatchingAccount,
  getAccountToken,
  getGitAccountById,
  listGitAccounts,
  markAccountInvalid,
  markAccountValid,
  reconnectGitAccount,
  toPublicAccount,
} from '../accounts/git-accounts.js';
import { requireAuth, requireRole, requireSameOrigin } from '../auth/session.js';
import { db } from '../db/client.js';
import { projects } from '../db/schema.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { enqueueScanJob } from '../queue/jobs.js';
import { getProvider, isProviderId, PROVIDER_LIST } from '../providers/index.js';
import { ProviderAuthError, ProviderRequestError } from '../providers/types.js';
import { adminAccountExists } from '../auth/users.js';

const connectSchema = z.object({
  provider: z.enum(['github', 'gitlab']),
  token: z.string().trim().min(1, 'Token must not be empty'),
  baseUrl: z.string().trim().url().optional(),
});

const reconnectSchema = z.object({
  token: z.string().trim().min(1, 'Token must not be empty'),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().optional(),
});

const importSchema = z.object({
  gitAccountId: z.coerce.number().int().positive(),
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

function normalizeBaseUrl(baseUrl: string | undefined): string | null {
  if (baseUrl === undefined) return null;
  return baseUrl.replace(/\/+$/, '');
}

function requireAccount(id: number) {
  const account = getGitAccountById(id);
  if (!account) throw notFound('Git account not found');
  return account;
}

export function registerGitAccountRoutes(app: FastifyInstance): void {
  /**
   * Connecting is allowed during setup, before a session exists — but only
   * while there is no account yet, i.e. inside the wizard. Afterwards it
   * requires an admin login (docs/CONCEPT.md 2.6: git-account management is
   * admin-only, unlike most other state-changing endpoints).
   */
  function requireSetupOrAdmin(request: Parameters<typeof requireAuth>[0]): void {
    requireSameOrigin(request);
    if (adminAccountExists()) {
      requireRole(request, 'admin');
    }
  }

  app.get('/api/providers', async () => ({
    providers: PROVIDER_LIST.map((p) => ({
      id: p.id,
      label: p.label,
      supportsCustomBaseUrl: p.supportsCustomBaseUrl,
      defaultBaseUrl: p.defaultBaseUrl,
    })),
  }));

  app.post(
    '/api/git-accounts',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      requireSetupOrAdmin(request);
      const input = connectSchema.parse(request.body);
      const provider = getProvider(input.provider);

      if (input.baseUrl && !provider.supportsCustomBaseUrl) {
        throw badRequest(`${provider.label} does not support a custom base URL`);
      }
      const baseUrl = provider.supportsCustomBaseUrl ? normalizeBaseUrl(input.baseUrl) : null;

      const account = await provider.validateToken(input.token, baseUrl ?? undefined).catch(toApiError);

      const existing = findMatchingAccount(input.provider, baseUrl, account.username);
      if (existing) {
        throw conflict(
          'GIT_ACCOUNT_ALREADY_CONNECTED',
          `${account.username} on ${provider.label} is already connected`,
        );
      }

      const saved = createGitAccount({
        provider: input.provider,
        baseUrl,
        username: account.username,
        token: input.token,
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

  /** Connected accounts for the Settings page (docs/CONCEPT.md 6.2). */
  app.get('/api/git-accounts', async (request) => {
    requireAuth(request);
    return { accounts: listGitAccounts().map(toPublicAccount) };
  });

  app.post(
    '/api/git-accounts/:id/reconnect',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      requireRole(request, 'admin');
      requireSameOrigin(request);
      const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
      const account = requireAccount(id);
      if (!isProviderId(account.provider)) {
        throw new AppError(500, 'INTERNAL_ERROR', 'Unknown provider on stored account');
      }
      const { token } = reconnectSchema.parse(request.body);
      const provider = getProvider(account.provider);

      const validated = await provider
        .validateToken(token, account.baseUrl ?? undefined)
        .catch(toApiError);

      const saved = reconnectGitAccount(id, {
        username: validated.username,
        token,
        scopes: validated.scopes,
      });

      return reply.status(200).send({
        account: toPublicAccount(saved),
        writeScopes: validated.writeScopes,
        scopesUnknown: validated.scopesUnknown,
      });
    },
  );

  app.delete('/api/git-accounts/:id', async (request, reply) => {
    requireRole(request, 'admin');
    requireSameOrigin(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    requireAccount(id);

    const projectCount = countProjectsForAccount(id);
    if (projectCount > 0) {
      throw conflict(
        'GIT_ACCOUNT_HAS_PROJECTS',
        `${projectCount} imported project(s) still use this account. Remove them first.`,
      );
    }

    deleteGitAccount(id);
    return reply.status(204).send();
  });

  app.get('/api/git-accounts/:id/repositories', async (request) => {
    requireAuth(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const account = requireAccount(id);
    if (!isProviderId(account.provider)) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Unknown provider on stored account');
    }
    const provider = getProvider(account.provider);

    const query = listQuerySchema.parse(request.query);
    const token = getAccountToken(account);
    const search = query.search?.toLowerCase();
    const baseUrl = account.baseUrl ?? undefined;

    // Already-imported repositories are excluded from the picker entirely
    // rather than shown greyed out (docs/CONCEPT.md 8.1) — there is nothing
    // left to do with them here.
    const importedIds = new Set(
      db
        .select({ providerRepoId: projects.providerRepoId })
        .from(projects)
        .where(inArray(projects.gitAccountId, [account.id]))
        .all()
        .map((row) => row.providerRepoId),
    );

    let repositories: Awaited<ReturnType<typeof provider.listRepositories>>['repositories'];
    let hasMore: boolean;
    let totalPages: number | undefined;
    try {
      // The provider's repo list has no server-side name filter and no way
      // to exclude already-imported repos, and the requested page is only
      // one slice of the account's repositories — filtering just that slice
      // would hide matches that happen to live on a different page. So we
      // always pull every page first and filter across the full set, then
      // paginate the filtered result ourselves.
      const all: typeof repositories = [];
      for (let providerPage = 1; providerPage <= 20; providerPage++) {
        const result = await provider.listRepositories(
          token,
          { page: providerPage, perPage: 100 },
          baseUrl,
        );
        all.push(...result.repositories);
        if (!result.hasMore) break;
      }
      const matched = all.filter(
        (repo) =>
          !importedIds.has(repo.providerRepoId) &&
          (!search || repo.fullName.toLowerCase().includes(search)),
      );
      const start = (query.page - 1) * query.perPage;
      repositories = matched.slice(start, start + query.perPage);
      hasMore = start + query.perPage < matched.length;
      // Exact here — the fan-out above already pulled every repository.
      totalPages = Math.max(1, Math.ceil(matched.length / query.perPage));
      markAccountValid(account.id);
    } catch (error) {
      if (error instanceof ProviderAuthError) markAccountInvalid(account.id);
      return toApiError(error);
    }

    return {
      repositories,
      page: query.page,
      hasMore,
      totalPages,
    };
  });

  app.post(
    '/api/projects/import',
    {
      // Importing enqueues one scan per repository, so this endpoint can
      // flood the worker just like the manual trigger (docs/CONCEPT.md 6.2).
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      requireAuth(request);
      requireSameOrigin(request);
      const { gitAccountId, repositoryIds } = importSchema.parse(request.body);
      const account = requireAccount(gitAccountId);
      if (!isProviderId(account.provider)) {
        throw new AppError(500, 'INTERNAL_ERROR', 'Unknown provider on stored account');
      }
      const provider = getProvider(account.provider);
      const token = getAccountToken(account);
      const baseUrl = account.baseUrl ?? undefined;

      // Resolve the selected ids against the account's repositories, so a
      // client cannot import a repository this token has no access to.
      const wanted = new Set(repositoryIds);
      const found = new Map<
        string,
        Awaited<ReturnType<typeof provider.listRepositories>>['repositories'][number]
      >();
      try {
        for (let page = 1; page <= 20 && found.size < wanted.size; page++) {
          const result = await provider.listRepositories(token, { page, perPage: 100 }, baseUrl);
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
    },
  );
}
