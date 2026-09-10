// Storage for connected git accounts. The token is encrypted at rest
// (docs/CONCEPT.md 4.2) and only decrypted where it is actually used: the
// provider API calls and the clone step.

import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { gitAccounts } from '../db/schema.js';
import { decrypt, encrypt } from '../lib/crypto.js';

export type GitAccount = typeof gitAccounts.$inferSelect;

/** Account data safe to send to the client — never includes the token. */
export interface PublicGitAccount {
  id: number;
  provider: string;
  username: string;
  scopes: string[];
  status: string;
  connectedAt: number;
  lastValidatedAt: number | null;
}

export function toPublicAccount(account: GitAccount): PublicGitAccount {
  return {
    id: account.id,
    provider: account.provider,
    username: account.username,
    scopes: account.tokenScopes ?? [],
    status: account.status,
    connectedAt: account.connectedAt.getTime(),
    lastValidatedAt: account.lastValidatedAt?.getTime() ?? null,
  };
}

export function getGitAccount(): GitAccount | undefined {
  // Single account in the MVP; the oldest row wins if one ever slipped in.
  return db.select().from(gitAccounts).orderBy(gitAccounts.id).get();
}

export function saveGitAccount(input: {
  provider: 'github';
  username: string;
  token: string;
  scopes: string[];
}): GitAccount {
  const now = new Date();
  const values = {
    provider: input.provider,
    username: input.username,
    tokenEncrypted: encrypt(input.token, config.encryptionKey),
    tokenScopes: input.scopes,
    status: 'valid',
    connectedAt: now,
    lastValidatedAt: now,
  };

  const existing = getGitAccount();
  if (existing) {
    // Reconnecting replaces the token in place so imported projects keep
    // pointing at the same account row.
    return db
      .update(gitAccounts)
      .set(values)
      .where(eq(gitAccounts.id, existing.id))
      .returning()
      .get();
  }
  return db.insert(gitAccounts).values(values).returning().get();
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
