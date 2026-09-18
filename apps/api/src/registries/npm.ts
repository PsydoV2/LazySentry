// npm registry lookup (docs/CONCEPT.md 5.3, 2.5).

import { fetchWithTimeout, type PackageInfo, type RegistryClient } from './types.js';

// npm's `license` field is a plain SPDX string on modern packages, but older
// ones use the deprecated `{ type, url }` object or `licenses: [{ type }]`
// array form — all three are still seen in the wild.
interface NpmLatestResponse {
  version?: string;
  license?: string | { type?: string };
  licenses?: { type?: string }[];
}

function licenseFrom(body: NpmLatestResponse): string | null {
  if (typeof body.license === 'string') return body.license;
  if (body.license?.type) return body.license.type;
  if (body.licenses?.[0]?.type) return body.licenses[0].type;
  return null;
}

export const npmRegistry: RegistryClient = {
  async getPackageInfo(packageName: string): Promise<PackageInfo | null> {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
    const response = await fetchWithTimeout(url);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`npm registry returned ${response.status} for ${packageName}`);
    }
    const body = (await response.json()) as NpmLatestResponse;
    return { latestVersion: body.version ?? null, license: licenseFrom(body) };
  },
};
