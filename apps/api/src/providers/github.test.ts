import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubProvider } from './github.js';
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

describe('githubProvider.validateToken', () => {
  it('sends the token in the Authorization header and never in the URL', async () => {
    const spy = mockFetch(() => json({ login: 'octocat' }));
    await githubProvider.validateToken('secret-token');

    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).not.toContain('secret-token');
    expect(
      (init?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer secret-token');
  });

  it('reports classic token scopes and flags write access', async () => {
    mockFetch(() =>
      json(
        { login: 'octocat' },
        { headers: { 'x-oauth-scopes': 'repo, read:org, gist' } },
      ),
    );
    const account = await githubProvider.validateToken('t');

    expect(account.username).toBe('octocat');
    expect(account.scopes).toEqual(['repo', 'read:org', 'gist']);
    expect(account.writeScopes).toEqual(['repo', 'gist']);
    expect(account.scopesUnknown).toBe(false);
  });

  it('does not flag a read-only classic token', async () => {
    mockFetch(() =>
      json(
        { login: 'octocat' },
        { headers: { 'x-oauth-scopes': 'read:org, public_repo' } },
      ),
    );
    const account = await githubProvider.validateToken('t');
    expect(account.writeScopes).toEqual([]);
  });

  it('marks fine-grained tokens as unverifiable rather than claiming they are read-only', async () => {
    // GitHub sends no x-oauth-scopes header for fine-grained tokens, so an
    // empty writeScopes list here is not evidence that the token cannot write.
    mockFetch(() => json({ login: 'octocat' }));
    const account = await githubProvider.validateToken('t');

    expect(account.scopes).toEqual([]);
    expect(account.writeScopes).toEqual([]);
    expect(account.scopesUnknown).toBe(true);
  });

  it('maps a rejected token to ProviderAuthError', async () => {
    mockFetch(() => json({ message: 'Bad credentials' }, { status: 401 }));
    await expect(githubProvider.validateToken('t')).rejects.toBeInstanceOf(
      ProviderAuthError,
    );
  });

  it('distinguishes a rate limit from a permission problem', async () => {
    mockFetch(() =>
      json({}, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
    );
    await expect(githubProvider.validateToken('t')).rejects.toThrow(
      /rate limit/i,
    );

    mockFetch(() =>
      json({}, { status: 403, headers: { 'x-ratelimit-remaining': '42' } }),
    );
    await expect(githubProvider.validateToken('t')).rejects.toThrow(
      /permission/i,
    );
  });

  it('reports a transport failure as ProviderRequestError', async () => {
    mockFetch(() => {
      throw new Error('getaddrinfo ENOTFOUND api.github.com');
    });
    await expect(githubProvider.validateToken('t')).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
  });

  it('rejects a response that is not shaped like a user', async () => {
    mockFetch(() => json({ unexpected: true }));
    await expect(githubProvider.validateToken('t')).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
  });
});

describe('githubProvider.listRepositories', () => {
  const repo = {
    id: 42,
    name: 'demo',
    full_name: 'acme/demo',
    default_branch: 'main',
    clone_url: 'https://github.com/acme/demo.git',
    private: true,
    language: 'TypeScript',
    updated_at: '2026-01-02T03:04:05Z',
  };

  it('maps the provider payload onto the shared repository shape', async () => {
    mockFetch(() => json([repo]));
    const page = await githubProvider.listRepositories('t', {
      page: 1,
      perPage: 30,
    });

    expect(page.repositories).toEqual([
      {
        providerRepoId: '42',
        name: 'demo',
        fullName: 'acme/demo',
        defaultBranch: 'main',
        cloneUrl: 'https://github.com/acme/demo.git',
        isPrivate: true,
        language: 'TypeScript',
        updatedAt: '2026-01-02T03:04:05Z',
      },
    ]);
  });

  it('signals another page only when the current one is full', async () => {
    mockFetch(() => json([repo, repo]));
    const full = await githubProvider.listRepositories('t', {
      page: 1,
      perPage: 2,
    });
    expect(full.hasMore).toBe(true);

    mockFetch(() => json([repo]));
    const partial = await githubProvider.listRepositories('t', {
      page: 1,
      perPage: 2,
    });
    expect(partial.hasMore).toBe(false);
  });

  it('requests the page and size it was given', async () => {
    const spy = mockFetch(() => json([]));
    await githubProvider.listRepositories('t', { page: 3, perPage: 50 });

    const url = new URL(String(spy.mock.calls[0]![0]));
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('per_page')).toBe('50');
  });
});
