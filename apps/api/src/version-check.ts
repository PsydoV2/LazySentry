// Update notice: this is a self-hosted, manually-updated instance with no
// auto-update, so the most we can do is tell the admin a newer release
// exists. Checks the project's public GitHub tags for the newest vX.Y.Z,
// cached in memory so every dashboard load doesn't hit GitHub. Never throws —
// a failed check just means no notice, not a broken app.
//
// Uses the `semver` package rather than hand-rolled parsing, same reasoning
// as lib/semver.ts: version strings are full of edge cases a naive
// comparison gets wrong silently.

import semver from 'semver';

const REPO = 'PsydoV2/LazySentry';
const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;

async function fetchLatestTag(): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${REPO}/tags?per_page=30`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LazySentry' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const body: unknown = await response.json().catch(() => null);
  if (!Array.isArray(body)) return null;

  let latest: string | null = null;
  for (const entry of body) {
    const name = (entry as { name?: unknown } | null)?.name;
    // Prereleases (v2.0.0-rc1) are valid semver but never something to
    // nudge a self-hoster toward — only stable tags count as "latest".
    if (typeof name !== 'string' || !semver.valid(name) || semver.prerelease(name)) {
      continue;
    }
    if (!latest || semver.gt(name, latest)) latest = name;
  }
  return latest;
}

export interface VersionCheckResult {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}

let cache: { latest: string | null; fetchedAt: number } | null = null;

/** Test-only: the in-memory cache above otherwise leaks state between cases. */
export function resetVersionCheckCache(): void {
  cache = null;
}

export async function checkForUpdate(currentVersion: string): Promise<VersionCheckResult> {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    cache = { latest: await fetchLatestTag(), fetchedAt: now };
  }

  const updateAvailable =
    semver.valid(currentVersion) !== null &&
    cache.latest !== null &&
    semver.gt(cache.latest, currentVersion);

  return { current: currentVersion, latest: cache.latest, updateAvailable };
}
