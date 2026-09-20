// GitLab provider — gitlab.com by default, or a self-hosted instance when
// the account specifies a base URL. The token is passed in the
// `PRIVATE-TOKEN` header only and must never appear in a log line, error
// message or URL (same rule as GitHub, docs/CONCEPT.md 0.3, 6.2).

import {
  ProviderAuthError,
  ProviderRequestError,
  type GitProvider,
  type ProviderAccount,
  type ProviderRepository,
  type RepositoryPage,
} from './types.js';

const DEFAULT_BASE_URL = 'https://gitlab.com';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * GitLab personal/project access token scopes that grant write access.
 * `api` is full read-write; `read_api` and `read_repository` are read-only.
 */
const WRITE_SCOPE_PATTERN = /^(api|write_repository|write_registry|admin_mode|sudo)$/;

interface GitLabUser {
  username: string;
}

interface GitLabTokenSelf {
  scopes?: string[];
}

interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  default_branch: string | null;
  http_url_to_repo: string;
  visibility: string;
  namespace?: { path?: string };
  archived?: boolean;
}

function apiBase(baseUrl: string | undefined): string {
  return `${(baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')}/api/v4`;
}

async function gitlabFetch(
  path: string,
  token: string,
  baseUrl: string | undefined,
): Promise<{ body: unknown; headers: Headers; status: number }> {
  let response: Response;
  try {
    response = await fetch(`${apiBase(baseUrl)}${path}`, {
      headers: {
        'PRIVATE-TOKEN': token,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // The cause may hold connection details but never the token, which is
    // only ever in the headers.
    const reason = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(`Could not reach GitLab: ${reason}`);
  }

  if (response.status === 401) {
    throw new ProviderAuthError(
      'GitLab rejected this token. It may be expired, revoked, or mistyped.',
    );
  }
  if (response.status === 403) {
    throw new ProviderAuthError(
      'This token does not have permission for that request.',
    );
  }
  const status = response.status;
  const body = status === 204 ? null : await response.json();
  return { body, headers: response.headers, status };
}

function toRepository(project: GitLabProject): ProviderRepository {
  return {
    providerRepoId: String(project.id),
    name: project.name,
    fullName: project.path_with_namespace,
    defaultBranch: project.default_branch ?? 'main',
    cloneUrl: project.http_url_to_repo,
    isPrivate: project.visibility !== 'public',
    language: null, // GitLab's project list endpoint does not report this.
    updatedAt: null,
  };
}

export const gitlabProvider: GitProvider = {
  id: 'gitlab',
  label: 'GitLab',
  supportsCustomBaseUrl: true,
  baseUrlRequired: false,
  defaultBaseUrl: DEFAULT_BASE_URL,
  cloneAuth: (token) => ({ username: 'oauth2', password: token }),

  async validateToken(token: string, baseUrl?: string): Promise<ProviderAccount> {
    const { body } = await gitlabFetch('/user', token, baseUrl);
    const user = body as GitLabUser;
    if (typeof user?.username !== 'string') {
      throw new ProviderRequestError('Unexpected response from GitLab');
    }

    // Best-effort scope lookup: this endpoint needs GitLab >= 16.0 and the
    // `read_api` scope. Older instances or narrower tokens 404/403 here —
    // that does not mean the token itself is bad, just that its scopes
    // cannot be enumerated (mirrors GitHub's fine-grained-token case).
    let scopes: string[] = [];
    let scopesUnknown = true;
    try {
      const { body: tokenBody, status } = await gitlabFetch(
        '/personal_access_tokens/self',
        token,
        baseUrl,
      );
      if (status === 200) {
        const parsed = (tokenBody as GitLabTokenSelf).scopes;
        if (Array.isArray(parsed)) {
          scopes = parsed;
          scopesUnknown = false;
        }
      }
    } catch {
      // Ignore — scopesUnknown stays true.
    }

    return {
      username: user.username,
      scopes,
      writeScopes: scopes.filter((scope) => WRITE_SCOPE_PATTERN.test(scope)),
      scopesUnknown,
    };
  },

  async listRepositories(
    token: string,
    { page, perPage },
    baseUrl?: string,
  ): Promise<RepositoryPage> {
    const query = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      membership: 'true',
      order_by: 'last_activity_at',
      simple: 'true',
    });
    const { body, headers } = await gitlabFetch(`/projects?${query}`, token, baseUrl);
    const projects = Array.isArray(body) ? (body as GitLabProject[]) : [];
    // GitLab reports exact pagination via headers, unlike GitHub's list
    // endpoint — use it when present instead of guessing from a full page.
    const nextPage = headers.get('x-next-page');
    const totalPagesHeader = headers.get('x-total-pages');
    return {
      repositories: projects.map(toRepository),
      hasMore: nextPage !== null && nextPage !== '',
      totalPages: totalPagesHeader ? Number.parseInt(totalPagesHeader, 10) : undefined,
    };
  },
};
