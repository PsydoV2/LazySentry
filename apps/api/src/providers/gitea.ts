// Gitea provider — always self-hosted (no public SaaS default), base URL is
// required. The token is sent as `Authorization: token <token>` only, never
// in the URL (docs/CONCEPT.md 0.3, 6.2). Field names below mirror GitHub's
// API almost exactly (id, name, full_name, default_branch, clone_url,
// private, language, updated_at) — Gitea's API is deliberately
// GitHub-compatible.

import {
  ProviderAuthError,
  ProviderRequestError,
  type GitProvider,
  type ProviderAccount,
  type ProviderRepository,
  type RepositoryPage,
} from './types.js';

const REQUEST_TIMEOUT_MS = 15_000;

interface GiteaUser {
  login: string;
}

interface GiteaRepo {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  clone_url: string;
  private: boolean;
  language: string | null;
  updated_at: string | null;
}

function apiBase(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/v1`;
}

async function giteaFetch(
  path: string,
  token: string,
  baseUrl: string,
): Promise<{ body: unknown; headers: Headers }> {
  let response: Response;
  try {
    response = await fetch(`${apiBase(baseUrl)}${path}`, {
      headers: {
        // Gitea requires the literal word "token" before the key, unlike
        // GitHub/GitLab's bearer-style headers.
        Authorization: `token ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // The cause may hold connection details but never the token, which is
    // only ever in the headers.
    const reason = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(`Could not reach Gitea: ${reason}`);
  }

  if (response.status === 401) {
    throw new ProviderAuthError(
      'Gitea rejected this token. It may be expired, revoked, or mistyped.',
    );
  }
  if (response.status === 403) {
    throw new ProviderAuthError('This token does not have permission for that request.');
  }
  if (!response.ok) {
    throw new ProviderRequestError(`Gitea request failed with status ${response.status}`);
  }

  return { body: await response.json(), headers: response.headers };
}

function toRepository(repo: GiteaRepo): ProviderRepository {
  return {
    providerRepoId: String(repo.id),
    name: repo.name,
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    cloneUrl: repo.clone_url,
    isPrivate: repo.private,
    language: repo.language,
    updatedAt: repo.updated_at,
  };
}

export const giteaProvider: GitProvider = {
  id: 'gitea',
  label: 'Gitea',
  supportsCustomBaseUrl: true,
  baseUrlRequired: true,
  // No public SaaS default exists (every instance is self-hosted); the
  // connect form requires baseUrl instead of offering a fallback.
  defaultBaseUrl: '',
  // Gitea's own documented convention for git-over-HTTP with a personal
  // access token inverts the usual pattern: the token goes in the username
  // slot and this fixed string is the password
  // (https://docs.gitea.com/development/api-usage — `{TOKEN}:x-oauth-basic`).
  cloneAuth: (token) => ({ username: token, password: 'x-oauth-basic' }),

  async validateToken(token: string, baseUrl?: string): Promise<ProviderAccount> {
    if (!baseUrl) {
      throw new ProviderRequestError('A base URL is required to connect a Gitea account');
    }
    const { body } = await giteaFetch('/user', token, baseUrl);
    const user = body as GiteaUser;
    if (typeof user?.login !== 'string') {
      throw new ProviderRequestError('Unexpected response from Gitea');
    }

    // Gitea has no endpoint to introspect a given token's own scopes, so
    // absence of write scopes here is not proof the token is read-only
    // (same honesty as GitHub's fine-grained-token case).
    return {
      username: user.login,
      scopes: [],
      writeScopes: [],
      scopesUnknown: true,
    };
  },

  async listRepositories(
    token: string,
    { page, perPage },
    baseUrl?: string,
  ): Promise<RepositoryPage> {
    if (!baseUrl) {
      throw new ProviderRequestError('A base URL is required to list Gitea repositories');
    }
    const query = new URLSearchParams({ page: String(page), limit: String(perPage) });
    const { body, headers } = await giteaFetch(`/user/repos?${query}`, token, baseUrl);
    const repos = Array.isArray(body) ? (body as GiteaRepo[]) : [];
    const totalCountHeader = headers.get('x-total-count');
    const totalCount = totalCountHeader ? Number.parseInt(totalCountHeader, 10) : undefined;
    return {
      repositories: repos.map(toRepository),
      hasMore:
        totalCount !== undefined ? page * perPage < totalCount : repos.length === perPage,
      totalPages: totalCount !== undefined ? Math.max(1, Math.ceil(totalCount / perPage)) : undefined,
    };
  },
};
