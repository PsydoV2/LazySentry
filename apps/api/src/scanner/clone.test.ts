import { describe, expect, it } from 'vitest';
import { cloneEnv } from './clone.js';

describe('cloneEnv', () => {
  it('adds no credentials for an anonymous (public, no-token) clone', () => {
    const env = cloneEnv('https://github.com/acme/demo.git', undefined, 'x-access-token');
    expect(env.GIT_CONFIG_COUNT).toBeUndefined();
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('scopes the auth header to the clone URL\'s own origin, not a hardcoded host', () => {
    // The extraheader must never leak to a different host than the one this
    // token belongs to (docs/CONCEPT.md 6.2) — and now that repositories can
    // come from more than one provider, that host is no longer always
    // github.com.
    const env = cloneEnv(
      'https://gitlab.example.com/group/project.git',
      'secret-token',
      'oauth2',
    );
    expect(env.GIT_CONFIG_KEY_0).toBe('http.https://gitlab.example.com/.extraheader');

    const basic = Buffer.from('oauth2:secret-token').toString('base64');
    expect(env.GIT_CONFIG_VALUE_0).toBe(`Authorization: Basic ${basic}`);
  });

  it('never puts the raw token anywhere but the base64 header value', () => {
    const env = cloneEnv('https://github.com/acme/demo.git', 'secret-token', 'x-access-token');
    expect(env.GIT_CONFIG_KEY_0).not.toContain('secret-token');
    expect(JSON.stringify(env)).not.toContain('"secret-token"');
  });

  it('uses the provider-specific basic-auth username', () => {
    const github = cloneEnv('https://github.com/acme/demo.git', 't', 'x-access-token');
    expect(github.GIT_CONFIG_VALUE_0).toBe(
      `Authorization: Basic ${Buffer.from('x-access-token:t').toString('base64')}`,
    );

    const gitlab = cloneEnv('https://gitlab.com/acme/demo.git', 't', 'oauth2');
    expect(gitlab.GIT_CONFIG_VALUE_0).toBe(
      `Authorization: Basic ${Buffer.from('oauth2:t').toString('base64')}`,
    );
  });
});
