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
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ---- response types ----
//
// Defined once in packages/shared and re-exported here, so the frontend and
// the API can never drift apart on a response shape (docs/CONCEPT.md 0, 3.4).

export type {
  ConnectResult,
  CurrentUser,
  FindingStatus,
  GitAccount,
  GitAccountsList,
  GitProviderId,
  ImportResult,
  PackageEntry,
  Project,
  ProjectSettingsUpdate,
  ProviderInfo,
  ProvidersList,
  Repository,
  RepositoryPage,
  Scan,
  ScanEvent,
  ScanQueued,
  ScanState,
  ScanStatus,
  ScannerStatus,
  Secret,
  SetupStatus,
  Severity,
  UpdateType,
  VersionInfo,
  Vulnerability,
} from '@lazysentry/shared';
