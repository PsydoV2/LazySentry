// Update notice: this is a self-hosted, manually-updated instance with no
// auto-update, so the most we can do is tell the admin a newer release
// exists. Checks the project's public GitHub tags for the newest vX.Y.Z,
// cached in memory so every dashboard load doesn't hit GitHub. Never throws —
// a failed check just means no notice, not a broken app.

const REPO = 'PsydoV2/LazySentry';
const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;

type Version = readonly [number, number, number];

function parseVersion(raw: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

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

  let latest: { raw: string; parsed: Version } | null = null;
  for (const entry of body) {
    const name = (entry as { name?: unknown } | null)?.name;
    if (typeof name !== 'string') continue;
    const parsed = parseVersion(name);
    if (!parsed) continue;
    if (!latest || compareVersions(parsed, latest.parsed) > 0) {
      latest = { raw: name, parsed };
    }
  }
  return latest?.raw ?? null;
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

  const current = parseVersion(currentVersion);
  const latestParsed = cache.latest ? parseVersion(cache.latest) : null;
  const updateAvailable =
    current !== null &&
    latestParsed !== null &&
    compareVersions(latestParsed, current) > 0;

  return { current: currentVersion, latest: cache.latest, updateAvailable };
}
