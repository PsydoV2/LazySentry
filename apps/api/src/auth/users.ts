// Admin account management. Single account by design (docs/CONCEPT.md 6.1);
// there is no default password — the setup wizard is the only way to create
// it, and it is locked once an account exists (6.2).

import argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

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

export function adminAccountExists(): boolean {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .get();
  return (row?.count ?? 0) > 0;
}

export async function createAdminAccount(
  username: string,
  password: string,
): Promise<{ id: number; username: string }> {
  const passwordHash = await argon2.hash(password, HASH_OPTIONS);
  return db
    .insert(users)
    .values({ username, passwordHash, createdAt: new Date() })
    .returning({ id: users.id, username: users.username })
    .get();
}

/** Verifies credentials in constant-ish time whether or not the user exists. */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<{ id: number; username: string } | null> {
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
  return { id: user.id, username: user.username };
}
