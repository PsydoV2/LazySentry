// Maps an OSV ecosystem string (docs/CONCEPT.md 5.3) to its registry
// client. An ecosystem with no entry here is not a missing feature to
// silently work around — it means "not implemented yet", so the caller
// must treat it as 'unknown', never guess.

import { npmRegistry } from './npm.js';
import { packagistRegistry } from './packagist.js';
import type { RegistryClient } from './types.js';

const REGISTRIES: Record<string, RegistryClient> = {
  npm: npmRegistry,
  Packagist: packagistRegistry,
};

export function getRegistryClient(ecosystem: string): RegistryClient | undefined {
  return REGISTRIES[ecosystem];
}

export type { RegistryClient } from './types.js';
