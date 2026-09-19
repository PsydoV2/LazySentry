// Audit log (docs/CONCEPT.md 2.2, 4, 6.2): the actor comes from the session
// unless explicitly overridden (a failed login has no session yet), and a
// logging failure must never surface as an error to the caller.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-audit-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { auditLog, users } = await import('../db/schema.js');
const { createUser } = await import('../auth/users.js');
const { listAuditLog, recordAuditLog } = await import('./log.js');

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(auditLog).run();
  db.delete(users).run();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

function fakeRequest(overrides: Partial<{ userId: number; username: string; ip: string }> = {}) {
  return {
    session: { userId: overrides.userId, username: overrides.username },
    ip: overrides.ip ?? '203.0.113.4',
    log: { error: () => {} },
  } as unknown as FastifyRequest;
}

describe('recordAuditLog', () => {
  it('derives the actor and IP from the session by default', async () => {
    // audit_log.user_id has a foreign key to users — needs a real row.
    const alice = await createUser('alice', 'a-very-long-password', 'member');
    recordAuditLog(fakeRequest({ userId: alice.id, username: 'alice', ip: '10.0.0.1' }), {
      action: 'project.delete',
      resourceType: 'project',
      resourceId: 42,
      meta: { fullName: 'acme/demo' },
    });

    const { entries } = listAuditLog({});
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: alice.id,
      username: 'alice',
      ip: '10.0.0.1',
      action: 'project.delete',
      resourceType: 'project',
      resourceId: '42',
      meta: { fullName: 'acme/demo' },
    });
  });

  it('uses the explicit actor override instead of the (nonexistent) session', () => {
    // A failed login attempt: no session exists yet, so the actor is passed
    // in directly with whatever username was attempted.
    recordAuditLog(fakeRequest(), {
      action: 'auth.login_failed',
      actor: { userId: null, username: 'bob' },
    });

    const { entries } = listAuditLog({});
    expect(entries[0]).toMatchObject({ userId: null, username: 'bob' });
  });

  it('never throws when the write itself fails', () => {
    // A circular `meta` object makes the underlying JSON.stringify (drizzle's
    // json column mode) throw inside the db call — recordAuditLog must
    // swallow that rather than let it break the request it is auditing.
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() =>
      recordAuditLog(fakeRequest(), {
        action: 'scan.trigger',
        meta: circular,
        actor: { userId: null, username: 'alice' },
      }),
    ).not.toThrow();
    expect(listAuditLog({}).entries).toHaveLength(0);
  });
});

describe('listAuditLog', () => {
  it('returns newest first and paginates with a cursor', () => {
    for (let i = 0; i < 5; i++) {
      recordAuditLog(fakeRequest(), {
        action: 'scan.trigger',
        resourceId: i,
        actor: { userId: null, username: 'alice' },
      });
    }

    const firstPage = listAuditLog({ limit: 2 });
    expect(firstPage.entries.map((e) => e.resourceId)).toEqual(['4', '3']);
    expect(firstPage.hasMore).toBe(true);

    const secondPage = listAuditLog({ limit: 2, beforeId: firstPage.entries[1]!.id });
    expect(secondPage.entries.map((e) => e.resourceId)).toEqual(['2', '1']);

    const lastPage = listAuditLog({ limit: 2, beforeId: secondPage.entries[1]!.id });
    expect(lastPage.entries.map((e) => e.resourceId)).toEqual(['0']);
    expect(lastPage.hasMore).toBe(false);
  });
});
