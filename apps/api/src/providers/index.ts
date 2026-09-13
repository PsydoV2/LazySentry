// Registry mapping a stored provider id to its implementation. Every
// consumer that needs "the provider for this account" goes through here
// instead of branching on `provider === 'github'` itself.

import { githubProvider } from './github.js';
import { gitlabProvider } from './gitlab.js';
import type { GitProvider, ProviderId } from './types.js';

const PROVIDERS: Record<ProviderId, GitProvider> = {
  github: githubProvider,
  gitlab: gitlabProvider,
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDERS;
}

export function getProvider(id: ProviderId): GitProvider {
  return PROVIDERS[id];
}

export * from './types.js';
