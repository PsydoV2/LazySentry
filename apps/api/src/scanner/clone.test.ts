import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cloneEnv, cloneRepository, removeScanDir } from './clone.js';
import { execute } from './exec.js';

describe('cloneEnv', () => {
  it('adds no credentials for an anonymous (public, no-token) clone', () => {
    const env = cloneEnv('https://github.com/acme/demo.git', undefined);
    expect(env.GIT_CONFIG_COUNT).toBeUndefined();
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('scopes the auth header to the clone URL\'s own origin, not a hardcoded host', () => {
    // The extraheader must never leak to a different host than the one this
    // token belongs to (docs/CONCEPT.md 6.2) — and now that repositories can
    // come from more than one provider, that host is no longer always
    // github.com.
    const env = cloneEnv('https://gitlab.example.com/group/project.git', {
      username: 'oauth2',
      password: 'secret-token',
    });
    expect(env.GIT_CONFIG_KEY_0).toBe('http.https://gitlab.example.com/.extraheader');

    const basic = Buffer.from('oauth2:secret-token').toString('base64');
    expect(env.GIT_CONFIG_VALUE_0).toBe(`Authorization: Basic ${basic}`);
  });

  it('never puts the raw token anywhere but the base64 header value', () => {
    const env = cloneEnv('https://github.com/acme/demo.git', {
      username: 'x-access-token',
      password: 'secret-token',
    });
    expect(env.GIT_CONFIG_KEY_0).not.toContain('secret-token');
    expect(JSON.stringify(env)).not.toContain('"secret-token"');
  });

  it('uses the provider-specific basic-auth credentials', () => {
    const github = cloneEnv('https://github.com/acme/demo.git', {
      username: 'x-access-token',
      password: 't',
    });
    expect(github.GIT_CONFIG_VALUE_0).toBe(
      `Authorization: Basic ${Buffer.from('x-access-token:t').toString('base64')}`,
    );

    const gitlab = cloneEnv('https://gitlab.com/acme/demo.git', {
      username: 'oauth2',
      password: 't',
    });
    expect(gitlab.GIT_CONFIG_VALUE_0).toBe(
      `Authorization: Basic ${Buffer.from('oauth2:t').toString('base64')}`,
    );

    // Gitea inverts the pattern: token as username, fixed password.
    const gitea = cloneEnv('https://gitea.example.com/acme/demo.git', {
      username: 't',
      password: 'x-oauth-basic',
    });
    expect(gitea.GIT_CONFIG_VALUE_0).toBe(
      `Authorization: Basic ${Buffer.from('t:x-oauth-basic').toString('base64')}`,
    );
  });
});

describe('cloneRepository', () => {
  const dirsToClean: string[] = [];

  afterEach(async () => {
    while (dirsToClean.length > 0) {
      await removeScanDir(dirsToClean.pop()!);
    }
  });

  it('captures the committer date of HEAD alongside the commit sha (sustainability score, docs/CONCEPT.md 2.2)', async () => {
    const sourceDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-source-'));
    dirsToClean.push(sourceDir);
    const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com' };
    await execute('git', ['-C', sourceDir, 'init', '--quiet'], { timeoutMs: 10_000, env });
    await execute('git', ['-C', sourceDir, 'config', 'user.email', 't@example.com'], {
      timeoutMs: 10_000,
    });
    await execute('git', ['-C', sourceDir, 'config', 'user.name', 'Test'], { timeoutMs: 10_000 });
    await execute('git', ['-C', sourceDir, 'commit', '--allow-empty', '-m', 'initial'], {
      timeoutMs: 10_000,
      env: { ...env, GIT_COMMITTER_DATE: '2024-03-01T12:00:00Z', GIT_AUTHOR_DATE: '2024-03-01T12:00:00Z' },
    });
    const revParse = await execute('git', ['-C', sourceDir, 'rev-parse', 'HEAD'], {
      timeoutMs: 10_000,
    });
    const expectedSha = revParse.stdout.trim();

    const targetDir = path.join(tmpdir(), `lazysentry-clone-target-${Date.now()}`);
    dirsToClean.push(targetDir);
    const { commitSha, lastCommitAt } = await cloneRepository(sourceDir, targetDir);

    expect(commitSha).toBe(expectedSha);
    expect(lastCommitAt).not.toBeNull();
    expect(lastCommitAt!.toISOString()).toBe('2024-03-01T12:00:00.000Z');
  });
});
