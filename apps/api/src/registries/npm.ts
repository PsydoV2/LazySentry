// npm registry lookup (docs/CONCEPT.md 5.3).

import { fetchWithTimeout, type RegistryClient } from './types.js';

export const npmRegistry: RegistryClient = {
  async getLatestVersion(packageName: string): Promise<string | null> {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
    const response = await fetchWithTimeout(url);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`npm registry returned ${response.status} for ${packageName}`);
    }
    const body = (await response.json()) as { version?: string };
    return body.version ?? null;
  },
};
