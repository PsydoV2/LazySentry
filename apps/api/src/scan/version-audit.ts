// Resolves "latest version" for every package in a scan's inventory
// (docs/CONCEPT.md 5.3) so packages.version_latest / update_type can be
// filled in alongside the CVE data osv-scanner already provides.
//
// This runs before the DB transaction that persists packages: better-sqlite3
// transactions are synchronous, but registry lookups are not, so all network
// I/O happens up front and the transaction only ever does synchronous
// inserts against the results collected here.

import { classifyUpdate, type UpdateType } from '../lib/semver.js';
import { getCached, setCached } from '../registries/cache.js';
import { getRegistryClient } from '../registries/index.js';

export interface VersionAuditResult {
  versionLatest: string | null;
  updateType: UpdateType;
}

export interface PackageRef {
  ecosystem: string;
  name: string;
  versionInstalled: string;
}

const CONCURRENCY = 8;

/**
 * One result per (ecosystem, name) — a package version may appear more than
 * once (multiple lockfiles, duplicate transitive versions), so the map key
 * intentionally ignores versionInstalled: the *latest* version from the
 * registry is the same regardless of which installed version asked for it.
 */
export async function auditPackageVersions(
  refs: PackageRef[],
): Promise<Map<string, VersionAuditResult>> {
  const uniqueByKey = new Map<string, PackageRef>();
  for (const ref of refs) {
    uniqueByKey.set(cacheKey(ref.ecosystem, ref.name), ref);
  }

  const results = new Map<string, VersionAuditResult>();
  const queue = [...uniqueByKey.values()];

  async function worker(): Promise<void> {
    let ref: PackageRef | undefined;
    while ((ref = queue.pop())) {
      const latestVersion = await resolveLatestVersion(ref.ecosystem, ref.name);
      results.set(cacheKey(ref.ecosystem, ref.name), {
        versionLatest: latestVersion,
        updateType: classifyUpdate(ref.versionInstalled, latestVersion),
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()),
  );
  return results;
}

export function cacheKey(ecosystem: string, name: string): string {
  return `${ecosystem}::${name}`;
}

async function resolveLatestVersion(
  ecosystem: string,
  packageName: string,
): Promise<string | null> {
  const cached = getCached(ecosystem, packageName);
  if (cached.hit) return cached.latestVersion;

  const client = getRegistryClient(ecosystem);
  if (!client) return null; // ecosystem not supported yet — 'unknown', not a guess

  try {
    const latestVersion = await client.getLatestVersion(packageName);
    setCached(ecosystem, packageName, latestVersion);
    return latestVersion;
  } catch {
    // Network/timeout failure: don't cache it, so the next scan retries
    // instead of being stuck with "no data" for a full 24h.
    return null;
  }
}
