// User account management (docs/CONCEPT.md 2.6, 6.1): multiple named accounts
// sharing one instance, no team isolation. The very first account is created
// by the setup wizard and is always 'admin'; every account after that is
// created by an admin in Settings — there is no self-signup.

import argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

export type Role = 'admin' | 'member';

// Argon2id with parameters at or above the OWASP baseline.
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(64, 'Username must be at most 64 characters')
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'Username may only contain letters, digits, dots, underscores and hyphens',
  );

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(1024, 'Password must be at most 1024 characters');

export const roleSchema = z.enum(['admin', 'member']);

export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  createdAt: Date;
  lastLoginAt: Date | null;
}

function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role as Role,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
  };
}

export function adminAccountExists(): boolean {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .get();
  return (row?.count ?? 0) > 0;
}

/** Setup wizard only — the first account on the instance, always 'admin'. */
export async function createAdminAccount(
  username: string,
  password: string,
): Promise<{ id: number; username: string }> {
  const passwordHash = await argon2.hash(password, HASH_OPTIONS);
  return db
    .insert(users)
    .values({ username, passwordHash, role: 'admin', createdAt: new Date() })
    .returning({ id: users.id, username: users.username })
    .get();
}

/** Verifies credentials in constant-ish time whether or not the user exists. */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<{ id: number; username: string; role: Role } | null> {
  const user = db.select().from(users).where(eq(users.username, username)).get();
  if (!user) {
    // Hash anyway so a missing user is not distinguishable by response time.
    await argon2.hash(password, HASH_OPTIONS);
    return null;
  }
  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) return null;

  db.update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id))
    .run();
  return { id: user.id, username: user.username, role: user.role as Role };
}

export function getUserById(id: number): PublicUser | null {
  const row = db.select().from(users).where(eq(users.id, id)).get();
  return row ? toPublicUser(row) : null;
}

export function usernameTaken(username: string): boolean {
  return db.select().from(users).where(eq(users.username, username)).get() !== undefined;
}

export function listUsers(): PublicUser[] {
  return db.select().from(users).all().map(toPublicUser);
}

export function countAdmins(): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.role, 'admin'))
    .get();
  return row?.count ?? 0;
}

/** Admin-only (docs/CONCEPT.md 2.6) — no self-signup after the first account. */
export async function createUser(
  username: string,
  password: string,
  role: Role,
): Promise<PublicUser> {
  const passwordHash = await argon2.hash(password, HASH_OPTIONS);
  const row = db
    .insert(users)
    .values({ username, passwordHash, role, createdAt: new Date() })
    .returning()
    .get();
  return toPublicUser(row);
}

export function updateUserRole(id: number, role: Role): PublicUser | null {
  const row = db.update(users).set({ role }).where(eq(users.id, id)).returning().get();
  return row ? toPublicUser(row) : null;
}

export function deleteUser(id: number): void {
  db.delete(users).where(eq(users.id, id)).run();
}
