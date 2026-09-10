// Provider abstraction. Only GitHub is implemented in the MVP
// (docs/CONCEPT.md 2.2) — the interface exists so adding GitLab later is a
// new file rather than a rewrite, not because other providers are planned now.

export interface ProviderAccount {
  username: string;
  /** Scopes reported by the provider; empty when it does not expose them. */
  scopes: string[];
  /** Scopes that grant write access — surfaced as a warning in the UI. */
  writeScopes: string[];
  /**
   * True when the provider cannot enumerate the token's permissions, so the
   * absence of writeScopes is not proof that the token is read-only.
   */
  scopesUnknown: boolean;
}

export interface ProviderRepository {
  providerRepoId: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  cloneUrl: string;
  isPrivate: boolean;
  language: string | null;
  updatedAt: string | null;
}

export interface RepositoryPage {
  repositories: ProviderRepository[];
  hasMore: boolean;
}

export interface GitProvider {
  readonly id: 'github';
  validateToken(token: string): Promise<ProviderAccount>;
  listRepositories(
    token: string,
    options: { page: number; perPage: number },
  ): Promise<RepositoryPage>;
}

/** Provider rejected the credentials — distinct from a transport failure. */
export class ProviderAuthError extends Error {}
/** Provider reachable but the request failed. */
export class ProviderRequestError extends Error {}
