import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitlabProvider } from './gitlab.js';
import { ProviderAuthError, ProviderRequestError } from './types.js';

function mockFetch(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  const spy = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    responder(String(input), init ?? {}),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function json(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gitlabProvider.validateToken', () => {
  it('sends the token in the PRIVATE-TOKEN header only, never in the URL', async () => {
    const spy = mockFetch((url) =>
      url.includes('/personal_access_tokens/self')
        ? json({ scopes: ['read_api'] })
        : json({ username: 'octocat' }),
    );
    await gitlabProvider.validateToken('secret-token');

    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).not.toContain('secret-token');
    expect((init?.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('secret-token');
  });

  it('defaults to gitlab.com when no base URL is given', async () => {
    const spy = mockFetch(() => json({ username: 'octocat' }));
    await gitlabProvider.validateToken('t');
    expect(String(spy.mock.calls[0]![0])).toMatch(/^https:\/\/gitlab\.com\/api\/v4\//);
  });

  it('targets a self-hosted instance when a base URL is given', async () => {
    const spy = mockFetch(() => json({ username: 'octocat' }));
    await gitlabProvider.validateToken('t', 'https://gitlab.example.com');
    expect(String(spy.mock.calls[0]![0])).toMatch(
      /^https:\/\/gitlab\.example\.com\/api\/v4\//,
    );
  });

  it('reports token scopes and flags write access', async () => {
    mockFetch((url) =>
      url.includes('/personal_access_tokens/self')
        ? json({ scopes: ['read_api', 'api'] })
        : json({ username: 'octocat' }),
    );
    const account = await gitlabProvider.validateToken('t');

    expect(account.username).toBe('octocat');
    expect(account.scopes).toEqual(['read_api', 'api']);
    expect(account.writeScopes).toEqual(['api']);
    expect(account.scopesUnknown).toBe(false);
  });

  it('does not flag a read-only token', async () => {
    mockFetch((url) =>
      url.includes('/personal_access_tokens/self')
        ? json({ scopes: ['read_api', 'read_repository'] })
        : json({ username: 'octocat' }),
    );
    const account = await gitlabProvider.validateToken('t');
    expect(account.writeScopes).toEqual([]);
  });

  it('marks scopes as unknown when the token-introspection endpoint is unavailable', async () => {
    // Older GitLab instances (< 16.0) do not have this endpoint at all.
    mockFetch((url) =>
      url.includes('/personal_access_tokens/self')
        ? json({ message: '404 Not Found' }, { status: 404 })
        : json({ username: 'octocat' }),
    );
    const account = await gitlabProvider.validateToken('t');

    expect(account.scopes).toEqual([]);
    expect(account.writeScopes).toEqual([]);
    expect(account.scopesUnknown).toBe(true);
  });

  it('maps a rejected token to ProviderAuthError', async () => {
    mockFetch(() => json({ message: '401 Unauthorized' }, { status: 401 }));
    await expect(gitlabProvider.validateToken('t')).rejects.toBeInstanceOf(
      ProviderAuthError,
    );
  });

  it('reports a transport failure as ProviderRequestError', async () => {
    mockFetch(() => {
      throw new Error('getaddrinfo ENOTFOUND gitlab.com');
    });
    await expect(gitlabProvider.validateToken('t')).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
  });

  it('rejects a response that is not shaped like a user', async () => {
    mockFetch(() => json({ unexpected: true }));
    await expect(gitlabProvider.validateToken('t')).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
  });
});

describe('gitlabProvider.listRepositories', () => {
  const project = {
    id: 42,
    name: 'demo',
    path_with_namespace: 'acme/demo',
    default_branch: 'main',
    http_url_to_repo: 'https://gitlab.com/acme/demo.git',
    visibility: 'private',
  };

  it('maps the provider payload onto the shared repository shape', async () => {
    mockFetch(() => json([project]));
    const page = await gitlabProvider.listRepositories('t', { page: 1, perPage: 30 });

    expect(page.repositories).toEqual([
      {
        providerRepoId: '42',
        name: 'demo',
        fullName: 'acme/demo',
        defaultBranch: 'main',
        cloneUrl: 'https://gitlab.com/acme/demo.git',
        isPrivate: true,
        language: null,
        updatedAt: null,
      },
    ]);
  });

  it('treats a public project as not private', async () => {
    mockFetch(() => json([{ ...project, visibility: 'public' }]));
    const page = await gitlabProvider.listRepositories('t', { page: 1, perPage: 30 });
    expect(page.repositories[0]!.isPrivate).toBe(false);
  });

  it('uses the x-next-page header for pagination rather than guessing from page size', async () => {
    mockFetch(() => json([project], { headers: { 'x-next-page': '2' } }));
    const first = await gitlabProvider.listRepositories('t', { page: 1, perPage: 30 });
    expect(first.hasMore).toBe(true);

    mockFetch(() => json([project], { headers: { 'x-next-page': '' } }));
    const last = await gitlabProvider.listRepositories('t', { page: 2, perPage: 30 });
    expect(last.hasMore).toBe(false);
  });
});
