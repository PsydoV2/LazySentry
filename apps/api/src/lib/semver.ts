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
 * Evaluates an npm-style range or comparator ("< 4.17.21", "^2.0.0",
 * ">=1.0.0 <2.0.0") against an installed version for the fleet-wide package
 * query (docs/CONCEPT.md 2.2). `null` — never a guess — when the installed
 * version isn't parseable or the range string itself isn't a valid range,
 * same "unknown, not a guess" rule classifyUpdate follows.
 */
export function matchesVersionRange(
  installedVersion: string,
  range: string,
): boolean | null {
  const installed = parseVersion(installedVersion);
  if (!installed) return null;
  // semver.satisfies() doesn't throw on a malformed range with loose: true —
  // it silently treats it as a range nothing can satisfy, which would read
  // as "no match" instead of "not evaluable". validRange() catches that.
  if (semver.validRange(range, { loose: true }) === null) return null;
  return semver.satisfies(installed, range, { loose: true, includePrerelease: true });
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
