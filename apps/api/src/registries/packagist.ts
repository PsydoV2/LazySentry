// Packagist registry lookup (docs/CONCEPT.md 5.3). The p2 endpoint returns
// every published version newest-first, including prereleases and dev
// branches (e.g. "dev-main") — the first entry is not necessarily a stable
// release, so we pick the first one that parses as stable semver ourselves.

import semver from 'semver';
import { fetchWithTimeout, type RegistryClient } from './types.js';

interface PackagistResponse {
  packages: Record<string, { version: string }[]>;
}

export const packagistRegistry: RegistryClient = {
  async getLatestVersion(packageName: string): Promise<string | null> {
    const url = `https://repo.packagist.org/p2/${packageName}.json`;
    const response = await fetchWithTimeout(url);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Packagist returned ${response.status} for ${packageName}`);
    }
    const body = (await response.json()) as PackagistResponse;
    const versions = body.packages[packageName] ?? [];

    for (const entry of versions) {
      // Composer tags are conventionally "v1.2.3"; semver.clean() strips
      // the leading "v" and rejects anything that is not a stable release
      // (a "dev-main" branch or a "-RC1"/"-beta" prerelease tag).
      const stable = semver.clean(entry.version, { loose: true });
      if (stable && !semver.prerelease(stable)) return stable;
    }
    return null;
  },
};
