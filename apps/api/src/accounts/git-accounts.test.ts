import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Point the database at a throwaway file before the client module is imported.
const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
// config.ts refuses to load without a master key (docs/CONCEPT.md 4.2).
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { gitAccounts, projects } = await import('../db/schema.js');
const {
  countProjectsForAccount,
  createGitAccount,
  deleteGitAccount,
  findMatchingAccount,
  getAccountToken,
  listGitAccounts,
  reconnectGitAccount,
} = await import('./git-accounts.js');

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(projects).run();
  db.delete(gitAccounts).run();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

function connect(overrides: Partial<Parameters<typeof createGitAccount>[0]> = {}) {
  return createGitAccount({
    provider: 'github',
    baseUrl: null,
    username: 'octocat',
    token: 'secret-token',
    scopes: [],
    ...overrides,
  });
}

describe('createGitAccount', () => {
  it('allows several accounts side by side, including two for the same provider', () => {
    const personal = connect({ username: 'personal' });
    const work = connect({ username: 'work' });

    expect(personal.id).not.toBe(work.id);
    expect(listGitAccounts().map((a) => a.username).sort()).toEqual(['personal', 'work']);
  });

  it('allows the same provider at different self-hosted base URLs', () => {
    connect({ provider: 'gitlab', baseUrl: 'https://gitlab.example.com', username: 'me' });
    connect({ provider: 'gitlab', baseUrl: 'https://gitlab.other.test', username: 'me' });

    expect(listGitAccounts()).toHaveLength(2);
  });

  it('never stores the raw token', () => {
    const account = connect();
    expect(account.tokenEncrypted).not.toContain('secret-token');
    expect(getAccountToken(account)).toBe('secret-token');
  });
});

describe('findMatchingAccount', () => {
  it('finds an existing connection by provider, base URL and username', () => {
    connect({ provider: 'gitlab', baseUrl: 'https://gitlab.example.com', username: 'me' });

    expect(
      findMatchingAccount('gitlab', 'https://gitlab.example.com', 'me'),
    ).toBeDefined();
    expect(findMatchingAccount('gitlab', null, 'me')).toBeUndefined();
    expect(findMatchingAccount('github', null, 'me')).toBeUndefined();
  });
});

describe('reconnectGitAccount', () => {
  it('replaces the token in place so existing projects keep pointing at the same row', () => {
    const account = connect();
    const reconnected = reconnectGitAccount(account.id, {
      username: 'octocat',
      token: 'new-token',
      scopes: ['repo'],
    });

    expect(reconnected.id).toBe(account.id);
    expect(reconnected.status).toBe('valid');
    expect(getAccountToken(reconnected)).toBe('new-token');
    expect(listGitAccounts()).toHaveLength(1);
  });
});

describe('deleteGitAccount / countProjectsForAccount', () => {
  it('counts projects that still reference an account', () => {
    const account = connect();
    expect(countProjectsForAccount(account.id)).toBe(0);

    db.insert(projects)
      .values({
        gitAccountId: account.id,
        providerRepoId: '1',
        name: 'demo',
        fullName: 'octocat/demo',
        cloneUrl: 'https://github.com/octocat/demo.git',
        addedAt: new Date(),
      })
      .run();

    expect(countProjectsForAccount(account.id)).toBe(1);
  });

  it('removes an account with no projects left', () => {
    const account = connect();
    deleteGitAccount(account.id);
    expect(listGitAccounts()).toHaveLength(0);
  });
});
