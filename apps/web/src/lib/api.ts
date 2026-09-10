// Thin API client. Errors always arrive as { error: { code, message } }
// (docs/CONCEPT.md 3.4), so they are unwrapped into a typed ApiError here and
// every caller can just read `.message`.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `Request failed with status ${response.status}`,
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ---- response types ----

export interface SetupStatus {
  adminAccountExists: boolean;
  gitAccountConnected: boolean;
  complete: boolean;
}

export interface CurrentUser {
  id: number;
  username: string;
}

export interface GitAccount {
  id: number;
  provider: string;
  username: string;
  scopes: string[];
  status: string;
  connectedAt: number;
  lastValidatedAt: number | null;
}

export interface ConnectResult {
  account: GitAccount;
  writeScopes: string[];
  scopesUnknown: boolean;
}

export interface Repository {
  providerRepoId: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  language: string | null;
  updatedAt: string | null;
  imported: boolean;
}

export interface RepositoryPage {
  repositories: Repository[];
  page: number;
  hasMore: boolean;
}

export interface Project {
  id: number;
  fullName: string;
  name: string;
  isPrivate: boolean;
  lastScanId: number | null;
  lastScanAt: number | null;
  lastScanStatus: string | null;
  countVulnCritical: number;
  countVulnHigh: number;
  countVulnMedium: number;
  countVulnLow: number;
  countSecretsVerified: number;
  countSecretsUnknown: number;
}

export interface Vulnerability {
  id: number;
  osvId: string;
  aliases: string[] | null;
  severity: string;
  cvssScore: number | null;
  summary: string | null;
  fixedVersion: string | null;
  status: string;
}
