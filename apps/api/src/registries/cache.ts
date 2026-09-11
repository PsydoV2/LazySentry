// 24h cache for registry lookups (docs/CONCEPT.md 5.3): a large dependency
// tree would otherwise fire one HTTP request per package on every single
// scan.

import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { registryCache } from '../db/schema.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CacheLookup {
  /** true when a usable (fresh) cache entry exists — including a cached "not found". */
  hit: boolean;
  latestVersion: string | null;
}

export function getCached(ecosystem: string, packageName: string): CacheLookup {
  const row = db
    .select()
    .from(registryCache)
    .where(
      and(
        eq(registryCache.ecosystem, ecosystem),
        eq(registryCache.packageName, packageName),
      ),
    )
    .get();
  if (!row) return { hit: false, latestVersion: null };

  const age = Date.now() - row.fetchedAt.getTime();
  if (age > CACHE_TTL_MS) return { hit: false, latestVersion: null };
  return { hit: true, latestVersion: row.latestVersion };
}

/**
 * Only successful registry answers are cached (including a confirmed "not
 * found" 404) — a network error or timeout is never written here, so the
 * next scan retries instead of being stuck with a stale failure for 24h.
 */
export function setCached(
  ecosystem: string,
  packageName: string,
  latestVersion: string | null,
): void {
  db.insert(registryCache)
    .values({ ecosystem, packageName, latestVersion, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [registryCache.ecosystem, registryCache.packageName],
      set: { latestVersion, fetchedAt: new Date() },
    })
    .run();
}
