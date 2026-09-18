// Shared Zod schemas and derived types used by both the API and the web app.
// API response types live here so the frontend never re-declares them.
//
// Two conventions hold for every type below (docs/CONCEPT.md 3.4):
//   * Success responses are the plain object or array — no { data } envelope.
//   * Timestamps cross the wire as epoch milliseconds, never as Date or an
//     ISO string. The database stores them as integers; serializing them as
//     numbers keeps the frontend from having to parse anything.

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Every error response has exactly this shape (see docs/CONCEPT.md 3.4). */
export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

// ---- domain vocabularies ----

/** Overall result of a scan (docs/CONCEPT.md 5.7: partial success exists). */
export type ScanStatus =
  | 'running'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'cancelled';

/**
 * Per-scanner outcome, so "nothing was checked" never looks like "nothing
 * was found" (docs/CONCEPT.md 5.6, 11). `completed_empty` is osv-scanner's
 * exit code 128: no lockfiles at all.
 */
export type ScannerStatus =
  | 'pending'
  | 'completed'
  | 'completed_empty'
  | 'failed'
  | 'skipped';

/**
 * What the project is doing *right now*, derived from the job queue rather
 * than from the last finished scan — this is what drives the `scanning`
 * card state (docs/CONCEPT.md 8.1).
 */
export type ScanState = 'idle' | 'queued' | 'running';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export type UpdateType = 'none' | 'patch' | 'minor' | 'major' | 'unknown';

/** Findings are reconciled per project, not per scan (docs/CONCEPT.md 4.1). */
export type FindingStatus = 'open' | 'resolved';

export type ScanTrigger = 'manual' | 'scheduled';

// ---- setup & session ----

export interface SetupStatus {
  adminAccountExists: boolean;
  gitAccountConnected: boolean;
  complete: boolean;
}

export interface CurrentUser {
  id: number;
  username: string;
}

/** Provider ids implemented today; the interface behind them stays abstract
 * so a future one is a new file, not a rewrite (docs/CONCEPT.md 2.2). */
export type GitProviderId = 'github' | 'gitlab';

/** GET /api/providers — what the connect form can offer. */
export interface ProviderInfo {
  id: GitProviderId;
  label: string;
  supportsCustomBaseUrl: boolean;
  defaultBaseUrl: string;
}

export interface ProvidersList {
  providers: ProviderInfo[];
}

/**
 * Connected git account — deliberately never carries the token itself.
 * Several can be connected at once, including several for the same
 * provider (e.g. a personal and a work GitHub account).
 */
export interface GitAccount {
  id: number;
  provider: string;
  /** Set only for a self-hosted instance (e.g. a private GitLab). */
  baseUrl: string | null;
  username: string;
  scopes: string[];
  /** 'valid' | 'invalid' — invalid asks the UI for a reconnect (6.2). */
  status: string;
  connectedAt: number;
  lastValidatedAt: number | null;
}

/** GET /api/git-accounts */
export interface GitAccountsList {
  accounts: GitAccount[];
}

export interface ConnectResult {
  account: GitAccount;
  /** Write scopes present on the token; the UI warns about them (6.2). */
  writeScopes: string[];
  scopesUnknown: boolean;
}

// ---- provider repositories & import ----

export interface Repository {
  providerRepoId: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  language: string | null;
  updatedAt: string | null;
  /** Already imported — greyed out rather than hidden (8.1). */
  imported: boolean;
}

export interface RepositoryPage {
  repositories: Repository[];
  page: number;
  hasMore: boolean;
  /** Exact total when the provider (or the search fan-out) reports it. */
  totalPages?: number;
}

/** GET /api/version — the update notice (docs/CONCEPT.md is silent on this;
 * self-hosted instances have no auto-update, so this is a manual-update hint). */
export interface VersionInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}

export interface ImportResult {
  imported: { id: number; fullName: string }[];
  /** Full names skipped because they were already imported. */
  skipped: string[];
}

// ---- projects ----

export interface Project {
  id: number;
  name: string;
  fullName: string;
  defaultBranch: string | null;
  isPrivate: boolean;
  addedAt: number;
  scanSecretsEnabled: boolean;
  verifySecretsEnabled: boolean;
  scanState: ScanState;
  lastScanId: number | null;
  lastScanAt: number | null;
  lastScanStatus: ScanStatus | null;
  /** Set only when lastScanStatus is 'failed' — the card's tooltip (8.1). */
  lastScanErrorMessage: string | null;
  countVulnCritical: number;
  countVulnHigh: number;
  countVulnMedium: number;
  countVulnLow: number;
  countSecretsVerified: number;
  countSecretsUnknown: number;
  countOutdatedMajor: number;
  countOutdatedMinor: number;
  countOutdatedPatch: number;
  lastScannedCommitSha: string | null;
}

export interface ProjectSettingsUpdate {
  scanSecretsEnabled?: boolean;
  verifySecretsEnabled?: boolean;
}

/** 202 response of POST /api/projects/:id/scans. */
export interface ScanQueued {
  jobId: number;
  status: string;
}

// ---- scans & findings ----

export interface Scan {
  id: number;
  projectId: number;
  status: ScanStatus;
  depsStatus: ScannerStatus;
  secretsStatus: ScannerStatus;
  startedAt: number | null;
  finishedAt: number | null;
  commitSha: string | null;
  trigger: ScanTrigger;
  /** e.g. { "osv-scanner": "2.5.1", "trufflehog": "3.97.4" } (3.2). */
  scannerVersions: Record<string, string> | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
}

/** One entry of a scan's package inventory (osv-scanner --all-packages). */
export interface PackageEntry {
  id: number;
  scanId: number;
  ecosystem: string;
  name: string;
  versionInstalled: string;
  versionLatest: string | null;
  updateType: UpdateType;
  isDirect: boolean | null;
  sourceFile: string | null;
}

export interface Vulnerability {
  id: number;
  projectId: number;
  osvId: string;
  aliases: string[];
  severity: Severity;
  cvssScore: number | null;
  summary: string | null;
  fixedVersion: string | null;
  publishedAt: number | null;
  status: FindingStatus;
  firstSeenScanId: number;
  lastSeenScanId: number;
  resolvedAt: number | null;
  // Denormalized from the package this vulnerability was found in, so the
  // dependencies table does not need a second request to name it.
  packageName: string | null;
  packageEcosystem: string | null;
  packageVersion: string | null;
}

export interface Secret {
  id: number;
  projectId: number;
  detectorType: string;
  filePath: string;
  commitSha: string;
  line: number | null;
  /** True = the credential worked at scan time (docs/CONCEPT.md 5.5). */
  isVerified: boolean;
  /** Masked preview such as "AKIA…IFXG" — never the raw value (4.3). */
  redacted: string;
  status: FindingStatus;
  commitAuthor: string | null;
  commitDate: number | null;
  firstSeenScanId: number;
  lastSeenScanId: number;
  resolvedAt: number | null;
}

// ---- live updates (docs/CONCEPT.md 3.5) ----

export const SCAN_EVENT_TYPES = [
  'scan.started',
  'scan.completed',
  'scan.failed',
  'scan.cancelled',
] as const;

export type ScanEventType = (typeof SCAN_EVENT_TYPES)[number];

/**
 * Payload of a Server-Sent Event on /api/events. `scanId` is null when a
 * queued job failed before a scan record was ever created.
 */
export interface ScanEvent {
  type: ScanEventType;
  projectId: number;
  scanId: number | null;
  status: ScanStatus;
}
