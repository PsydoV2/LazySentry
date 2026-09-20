import { afterEach, describe, expect, it, vi } from 'vitest';
import { giteaProvider } from './gitea.js';
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

describe('giteaProvider.cloneAuth', () => {
  it('puts the token in the username slot with a fixed password, not the other way round', () => {
    // Gitea's own documented convention inverts GitHub/GitLab's pattern:
    // https://docs.gitea.com/development/api-usage
    expect(giteaProvider.cloneAuth('secret-token')).toEqual({
      username: 'secret-token',
      password: 'x-oauth-basic',
    });
  });
});

describe('giteaProvider.validateToken', () => {
  it('rejects when no base URL is given — there is no public SaaS default', async () => {
    await expect(giteaProvider.validateToken('t')).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
  });

  it('sends the token in the Authorization header with the "token" prefix, never in the URL', async () => {
    const spy = mockFetch(() => json({ login: 'octocat' }));
    await giteaProvider.validateToken('secret-token', 'https://gitea.example.com');

    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).not.toContain('secret-token');
    expect((init?.headers as Record<string, string>).Authorization).toBe('token secret-token');
  });

  it('targets the given self-hosted instance', async () => {
    const spy = mockFetch(() => json({ login: 'octocat' }));
    await giteaProvider.validateToken('t', 'https://gitea.example.com');
    expect(String(spy.mock.calls[0]![0])).toBe('https://gitea.example.com/api/v1/user');
  });

  it('cannot enumerate token scopes, so scopesUnknown is always true', async () => {
    mockFetch(() => json({ login: 'octocat' }));
    const account = await giteaProvider.validateToken('t', 'https://gitea.example.com');

    expect(account.username).toBe('octocat');
    expect(account.scopes).toEqual([]);
    expect(account.writeScopes).toEqual([]);
    expect(account.scopesUnknown).toBe(true);
  });

  it('maps a rejected token to ProviderAuthError', async () => {
    mockFetch(() => json({ message: '401 Unauthorized' }, { status: 401 }));
    await expect(
      giteaProvider.validateToken('t', 'https://gitea.example.com'),
    ).rejects.toBeInstanceOf(ProviderAuthError);
  });

  it('reports a transport failure as ProviderRequestError', async () => {
    mockFetch(() => {
      throw new Error('getaddrinfo ENOTFOUND gitea.example.com');
    });
    await expect(
      giteaProvider.validateToken('t', 'https://gitea.example.com'),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it('rejects a response that is not shaped like a user', async () => {
    mockFetch(() => json({ unexpected: true }));
    await expect(
      giteaProvider.validateToken('t', 'https://gitea.example.com'),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });
});

describe('giteaProvider.listRepositories', () => {
  const repo = {
    id: 42,
    name: 'demo',
    full_name: 'acme/demo',
    default_branch: 'main',
    clone_url: 'https://gitea.example.com/acme/demo.git',
    private: true,
    language: 'TypeScript',
    updated_at: '2024-03-01T12:00:00Z',
  };

  it('rejects when no base URL is given', async () => {
    await expect(
      giteaProvider.listRepositories('t', { page: 1, perPage: 30 }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it('maps the provider payload onto the shared repository shape', async () => {
    mockFetch(() => json([repo]));
    const page = await giteaProvider.listRepositories(
      't',
      { page: 1, perPage: 30 },
      'https://gitea.example.com',
    );

    expect(page.repositories).toEqual([
      {
        providerRepoId: '42',
        name: 'demo',
        fullName: 'acme/demo',
        defaultBranch: 'main',
        cloneUrl: 'https://gitea.example.com/acme/demo.git',
        isPrivate: true,
        language: 'TypeScript',
        updatedAt: '2024-03-01T12:00:00Z',
      },
    ]);
  });

  it('uses the x-total-count header for pagination rather than guessing from page size', async () => {
    mockFetch(() => json([repo], { headers: { 'x-total-count': '31' } }));
    const first = await giteaProvider.listRepositories(
      't',
      { page: 1, perPage: 30 },
      'https://gitea.example.com',
    );
    expect(first.hasMore).toBe(true);
    expect(first.totalPages).toBe(2);

    const last = await giteaProvider.listRepositories(
      't',
      { page: 2, perPage: 30 },
      'https://gitea.example.com',
    );
    expect(last.hasMore).toBe(false);
  });
});
