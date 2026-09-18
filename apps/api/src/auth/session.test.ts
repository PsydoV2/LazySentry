// CSRF origin check (docs/CONCEPT.md 6.2) and the admin-only role guard
// (docs/CONCEPT.md 2.6). Getting the origin check wrong either blocks every
// legitimate request behind a reverse proxy or lets a cross-site POST
// through; getting the role guard wrong exposes git-account or user
// management to a non-admin, so both are pinned down here.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-session-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, runMigrations } = await import('../db/client.js');
const { requireRole, requireSameOrigin } = await import('./session.js');
const { createAdminAccount, createUser } = await import('./users.js');

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

function requestWith(headers: Record<string, string | undefined>) {
  return { headers } as unknown as FastifyRequest;
}

describe('requireSameOrigin', () => {
  it('allows a request whose Origin matches the Host it was sent to', () => {
    expect(() =>
      requireSameOrigin(
        requestWith({ origin: 'http://localhost:5173', host: 'localhost:5173' }),
      ),
    ).not.toThrow();

    // Behind a reverse proxy the browser addresses the public host.
    expect(() =>
      requireSameOrigin(
        requestWith({
          origin: 'https://sentry.example.com',
          host: 'sentry.example.com',
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a cross-site Origin', () => {
    expect(() =>
      requireSameOrigin(
        requestWith({ origin: 'https://evil.example', host: 'localhost:3000' }),
      ),
    ).toThrow(/origin is not allowed/);
  });

  it('rejects an unparseable Origin instead of letting it through', () => {
    expect(() =>
      requireSameOrigin(requestWith({ origin: 'null', host: 'localhost:3000' })),
    ).toThrow(/origin is not allowed/);
  });

  it('allows non-browser clients that send no Origin at all', () => {
    // curl and scripts cannot be used for a cross-site attack.
    expect(() =>
      requireSameOrigin(requestWith({ host: 'localhost:3000' })),
    ).not.toThrow();
  });
});

function requestWithSession(userId: number | undefined) {
  return { headers: {}, session: { userId } } as unknown as FastifyRequest;
}

describe('requireRole', () => {
  it('allows an admin through', async () => {
    const admin = await createAdminAccount('root', 'a-very-long-password');
    expect(() => requireRole(requestWithSession(admin.id), 'admin')).not.toThrow();
  });

  it('rejects a member requesting admin-only access', async () => {
    const member = await createUser('alice', 'another-long-password', 'member');
    expect(() => requireRole(requestWithSession(member.id), 'admin')).toThrow(/Forbidden/);
  });

  it('rejects a request with no session at all', () => {
    expect(() => requireRole(requestWithSession(undefined), 'admin')).toThrow();
  });

  it('rejects a session whose user no longer exists (deleted account)', () => {
    expect(() => requireRole(requestWithSession(999_999), 'admin')).toThrow(/Forbidden/);
  });
});
