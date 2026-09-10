// GitHub provider. The token is passed in the Authorization header only and
// must never appear in a log line, error message or URL.

import {
  ProviderAuthError,
  ProviderRequestError,
  type GitProvider,
  type ProviderAccount,
  type ProviderRepository,
  type RepositoryPage,
} from './types.js';

const API_BASE = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Classic PAT scopes that grant write access. The setup docs recommend a
 * fine-grained token with Contents+Metadata read only (docs/CONCEPT.md 6.2);
 * anything here is reported back so the UI can warn.
 */
const WRITE_SCOPE_PATTERN =
  /^(repo|write:|delete:|admin:|delete_repo|workflow|gist|user$|project$)/;

interface GitHubUser {
  login: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  clone_url: string;
  private: boolean;
  language: string | null;
  updated_at: string | null;
}

async function githubFetch(
  path: string,
  token: string,
): Promise<{ body: unknown; headers: Headers }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'LazySentry',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // The cause may hold connection details but never the token, which is
    // only ever in the headers.
    const reason = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(`Could not reach GitHub: ${reason}`);
  }

  if (response.status === 401) {
    throw new ProviderAuthError(
      'GitHub rejected this token. It may be expired, revoked, or mistyped.',
    );
  }
  if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    throw new ProviderAuthError(
      remaining === '0'
        ? 'GitHub API rate limit exceeded. Try again later.'
        : 'This token does not have permission for that request.',
    );
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      `GitHub request failed with status ${response.status}`,
    );
  }

  return { body: await response.json(), headers: response.headers };
}

function parseScopes(headers: Headers): {
  scopes: string[];
  scopesUnknown: boolean;
} {
  // Classic PATs report their scopes here. Fine-grained tokens do not send
  // the header at all, so their permissions cannot be enumerated this way.
  const raw = headers.get('x-oauth-scopes');
  if (raw === null) return { scopes: [], scopesUnknown: true };
  const scopes = raw
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
  return { scopes, scopesUnknown: false };
}

function toRepository(repo: GitHubRepo): ProviderRepository {
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

export const githubProvider: GitProvider = {
  id: 'github',

  async validateToken(token: string): Promise<ProviderAccount> {
    const { body, headers } = await githubFetch('/user', token);
    const user = body as GitHubUser;
    if (typeof user?.login !== 'string') {
      throw new ProviderRequestError('Unexpected response from GitHub');
    }
    const { scopes, scopesUnknown } = parseScopes(headers);
    return {
      username: user.login,
      scopes,
      writeScopes: scopes.filter((scope) => WRITE_SCOPE_PATTERN.test(scope)),
      scopesUnknown,
    };
  },

  async listRepositories(
    token: string,
    { page, perPage },
  ): Promise<RepositoryPage> {
    const query = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      sort: 'updated',
      affiliation: 'owner,collaborator,organization_member',
    });
    const { body } = await githubFetch(`/user/repos?${query}`, token);
    const repos = Array.isArray(body) ? (body as GitHubRepo[]) : [];
    return {
      repositories: repos.map(toRepository),
      // A full page means there is probably another one; GitHub's Link
      // header would be exact, but this is enough for a paginated picker.
      hasMore: repos.length === perPage,
    };
  },
};
