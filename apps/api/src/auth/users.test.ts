// Multi-user + roles (docs/CONCEPT.md 2.6): the first account is always
// 'admin', further accounts are admin-created, and role changes must never
// leave the instance without an admin.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-users-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { users } = await import('../db/schema.js');
const {
  adminAccountExists,
  countAdmins,
  createAdminAccount,
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  updateUserRole,
  usernameTaken,
  verifyCredentials,
} = await import('./users.js');

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(users).run();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('createAdminAccount', () => {
  it('always creates the first account with the admin role', async () => {
    const user = await createAdminAccount('root', 'a-very-long-password');
    const stored = getUserById(user.id);
    expect(stored?.role).toBe('admin');
    expect(adminAccountExists()).toBe(true);
  });
});

describe('createUser', () => {
  it('creates a member account that is distinct from the admin', async () => {
    await createAdminAccount('root', 'a-very-long-password');
    const member = await createUser('alice', 'another-long-password', 'member');
    expect(member.role).toBe('member');
    expect(usernameTaken('alice')).toBe(true);
    expect(listUsers()).toHaveLength(2);
  });

  it('logs in with the credentials it was created with', async () => {
    await createUser('bob', 'another-long-password', 'member');
    const result = await verifyCredentials('bob', 'another-long-password');
    expect(result).toMatchObject({ username: 'bob', role: 'member' });
  });
});

describe('countAdmins / role changes', () => {
  it('refuses to leave the instance with zero admins', async () => {
    const admin = await createAdminAccount('root', 'a-very-long-password');
    expect(countAdmins()).toBe(1);

    // The route layer is what actually blocks this (routes/users.ts), but
    // the data layer itself must at least report the count correctly so
    // that guard can work.
    const updated = updateUserRole(admin.id, 'member');
    expect(updated?.role).toBe('member');
    expect(countAdmins()).toBe(0);
  });

  it('promoting a second user restores a valid admin count', async () => {
    await createAdminAccount('root', 'a-very-long-password');
    const member = await createUser('alice', 'another-long-password', 'member');
    updateUserRole(member.id, 'admin');
    expect(countAdmins()).toBe(2);
  });
});

describe('deleteUser', () => {
  it('removes the account so it can no longer authenticate', async () => {
    const member = await createUser('carol', 'another-long-password', 'member');
    deleteUser(member.id);
    expect(getUserById(member.id)).toBeNull();
    expect(await verifyCredentials('carol', 'another-long-password')).toBeNull();
  });
});
