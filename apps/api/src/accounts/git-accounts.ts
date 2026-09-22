// Storage for connected git accounts. Several accounts can be connected at
// once — including several for the same provider (e.g. a personal and a
// work GitHub account) — each project points at exactly one of them via
// `git_account_id`. The token is encrypted at rest (docs/CONCEPT.md 4.2) and
// only decrypted where it is actually used: the provider API calls and the
// clone step.

import { and, eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { gitAccounts, projects } from '../db/schema.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import type { ProviderId } from '../providers/types.js';

export type GitAccount = typeof gitAccounts.$inferSelect;

/** Account data safe to send to the client — never includes the token. */
export interface PublicGitAccount {
  id: number;
  provider: string;
  baseUrl: string | null;
  username: string;
  label: string | null;
  scopes: string[];
  status: string;
  connectedAt: number;
  lastValidatedAt: number | null;
}

export function toPublicAccount(account: GitAccount): PublicGitAccount {
  return {
    id: account.id,
    provider: account.provider,
    baseUrl: account.baseUrl,
    username: account.username,
    label: account.label,
    scopes: account.tokenScopes ?? [],
    status: account.status,
    connectedAt: account.connectedAt.getTime(),
    lastValidatedAt: account.lastValidatedAt?.getTime() ?? null,
  };
}

export function listGitAccounts(): GitAccount[] {
  return db.select().from(gitAccounts).orderBy(gitAccounts.id).all();
}

export function getGitAccountById(id: number): GitAccount | undefined {
  return db.select().from(gitAccounts).where(eq(gitAccounts.id, id)).get();
}

/**
 * Same (provider, base URL, username, label) already connected — a 409, not
 * a duplicate row. `label` is part of the key because a provider's token
 * validation reports the token holder's own login, not which resource owner
 * the token is actually scoped to (e.g. a GitHub fine-grained PAT scoped to
 * an organization still reports the user's personal login via `/user`) — so
 * two genuinely different connections for the same user are only
 * distinguishable by the label the person gives them.
 */
export function findMatchingAccount(
  provider: ProviderId,
  baseUrl: string | null,
  username: string,
  label: string | null,
): GitAccount | undefined {
  return db
    .select()
    .from(gitAccounts)
    .where(and(eq(gitAccounts.provider, provider), eq(gitAccounts.username, username)))
    .all()
    .find((row) => row.baseUrl === baseUrl && row.label === label);
}

export function createGitAccount(input: {
  provider: ProviderId;
  baseUrl: string | null;
  username: string;
  label: string | null;
  token: string;
  scopes: string[];
}): GitAccount {
  const now = new Date();
  return db
    .insert(gitAccounts)
    .values({
      provider: input.provider,
      baseUrl: input.baseUrl,
      username: input.username,
      label: input.label,
      tokenEncrypted: encrypt(input.token, config.encryptionKey),
      tokenScopes: input.scopes,
      status: 'valid',
      connectedAt: now,
      lastValidatedAt: now,
    })
    .returning()
    .get();
}

/**
 * Replaces the token on an existing account in place, so projects that
 * already point at it keep working (docs/CONCEPT.md 6.2 reconnect flow).
 */
export function reconnectGitAccount(
  id: number,
  input: { username: string; token: string; scopes: string[] },
): GitAccount {
  return db
    .update(gitAccounts)
    .set({
      username: input.username,
      tokenEncrypted: encrypt(input.token, config.encryptionKey),
      tokenScopes: input.scopes,
      status: 'valid',
      lastValidatedAt: new Date(),
    })
    .where(eq(gitAccounts.id, id))
    .returning()
    .get();
}

/** Number of imported projects still pointing at this account. */
export function countProjectsForAccount(accountId: number): number {
  return db
    .select()
    .from(projects)
    .where(eq(projects.gitAccountId, accountId))
    .all().length;
}

export function deleteGitAccount(id: number): void {
  db.delete(gitAccounts).where(eq(gitAccounts.id, id)).run();
}

export function getAccountToken(account: GitAccount): string {
  return decrypt(account.tokenEncrypted, config.encryptionKey);
}

/**
 * Marks the account as invalid after the provider rejected its credentials,
 * so the UI can ask for a reconnect instead of showing a generic scan error
 * (docs/CONCEPT.md 6.2).
 */
export function markAccountInvalid(accountId: number): void {
  db.update(gitAccounts)
    .set({ status: 'invalid' })
    .where(eq(gitAccounts.id, accountId))
    .run();
}

export function markAccountValid(accountId: number): void {
  db.update(gitAccounts)
    .set({ status: 'valid', lastValidatedAt: new Date() })
    .where(eq(gitAccounts.id, accountId))
    .run();
}
