// Provider abstraction. GitHub and GitLab are implemented — the interface
// is what lets a new provider (Bitbucket, Gitea, …) be a new file instead of
// a rewrite of everything that talks to "the" git account.

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
  /** Exact total when the provider reports it; omitted otherwise. */
  totalPages?: number;
}

export type ProviderId = 'github' | 'gitlab';

export interface GitProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Whether this provider can point at a self-hosted instance. */
  readonly supportsCustomBaseUrl: boolean;
  /** Used when the account did not specify a base URL. */
  readonly defaultBaseUrl: string;
  /** HTTP Basic auth username to pair with the token when cloning (0.3, 6.2). */
  readonly cloneAuthUsername: string;
  validateToken(token: string, baseUrl?: string): Promise<ProviderAccount>;
  listRepositories(
    token: string,
    options: { page: number; perPage: number },
    baseUrl?: string,
  ): Promise<RepositoryPage>;
}

/** Provider rejected the credentials — distinct from a transport failure. */
export class ProviderAuthError extends Error {}
/** Provider reachable but the request failed. */
export class ProviderRequestError extends Error {}
