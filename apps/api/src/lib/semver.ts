// Classifies how far behind the latest release an installed version is
// (docs/CONCEPT.md 5.3). Uses the `semver` package rather than hand-rolled
// parsing — version strings in the wild are full of edge cases (leading
// "v", build metadata, four-part versions) that a naive comparison gets
// wrong silently.

import semver from 'semver';

export type UpdateType = 'none' | 'patch' | 'minor' | 'major' | 'unknown';

/** semver.parse() first (keeps prerelease info intact for comparison),
 * falling back to coerce() for the loose cases parse() rejects outright
 * (e.g. "4.17", missing the patch component). */
function parseVersion(raw: string): semver.SemVer | null {
  return semver.parse(raw, { loose: true }) ?? semver.coerce(raw, { loose: true });
}

/**
 * "unknown" rather than a guess for anything that is not parseable semver —
 * CONCEPT.md 5.3 is explicit that non-semver versions must not be
 * classified by guesswork.
 */
export function classifyUpdate(
  installedVersion: string,
  latestVersion: string | null,
): UpdateType {
  if (latestVersion === null) return 'unknown';

  const installed = parseVersion(installedVersion);
  const latest = parseVersion(latestVersion);
  if (!installed || !latest) return 'unknown';

  if (semver.gte(installed, latest)) return 'none';
  if (installed.major !== latest.major) return 'major';
  if (installed.minor !== latest.minor) return 'minor';
  if (installed.patch !== latest.patch) return 'patch';
  return 'none';
}
