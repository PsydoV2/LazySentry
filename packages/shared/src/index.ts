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

/**
 * Activity-based sustainability signal (docs/CONCEPT.md 2.2): purely how
 * recently the default branch was committed to, never a judgement of code
 * quality or importance. `unknown` means no successful clone has captured a
 * commit date yet — distinct from `dead`, never guessed (11. "kein falsches
 * Grün" applies here too).
 */
export type SustainabilityStatus = 'active' | 'aging' | 'stale' | 'dead' | 'unknown';

const SUSTAINABILITY_THRESHOLDS_DAYS = {
  active: 180,
  aging: 365,
  stale: 730,
} as const;

/**
 * Derives the sustainability status from the committer date of the cloned
 * HEAD (`projects.lastCommitAt`) — shared by the API's project DTO and any
 * other consumer so the thresholds live in exactly one place.
 */
export function sustainabilityStatusFor(
  lastCommitAt: number | null,
  now: number = Date.now(),
): SustainabilityStatus {
  if (lastCommitAt === null) return 'unknown';
  const days = (now - lastCommitAt) / (24 * 60 * 60 * 1000);
  if (days <= SUSTAINABILITY_THRESHOLDS_DAYS.active) return 'active';
  if (days <= SUSTAINABILITY_THRESHOLDS_DAYS.aging) return 'aging';
  if (days <= SUSTAINABILITY_THRESHOLDS_DAYS.stale) return 'stale';
  return 'dead';
}

// ---- setup & session ----

export interface SetupStatus {
  adminAccountExists: boolean;
  gitAccountConnected: boolean;
  complete: boolean;
}

/** Admin manages git accounts and users; member does everything else
 * (docs/CONCEPT.md 2.6). No team/project-level isolation between them. */
export type UserRole = 'admin' | 'member';

export interface CurrentUser {
  id: number;
  username: string;
  role: UserRole;
}

// ---- users (docs/CONCEPT.md 2.6) ----

export interface AppUser {
  id: number;
  username: string;
  role: UserRole;
  createdAt: number;
  lastLoginAt: number | null;
}

/** GET /api/users — admin only. */
export interface UsersList {
  users: AppUser[];
}

/** POST /api/users — admin only, no self-signup. */
export interface CreateUserInput {
  username: string;
  password: string;
  role: UserRole;
}

/** PATCH /api/users/:id — admin only. */
export interface UpdateUserRoleInput {
  role: UserRole;
}

/** Provider ids implemented today; the interface behind them stays abstract
 * so a future one is a new file, not a rewrite (docs/CONCEPT.md 2.2). */
export type GitProviderId = 'github' | 'gitlab' | 'gitea';

/** GET /api/providers — what the connect form can offer. */
export interface ProviderInfo {
  id: GitProviderId;
  label: string;
  supportsCustomBaseUrl: boolean;
  defaultBaseUrl: string;
  /** True when there is no public SaaS default (Gitea) — the connect form must require it. */
  baseUrlRequired: boolean;
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
  /** User-supplied, distinguishes two accounts that share a username (6.2). */
  label: string | null;
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
  /** Dashboard organization: pinned always outranks a section placement —
   * the two are mutually exclusive, never both set. */
  pinned: boolean;
  sectionId: number | null;
  /** Position within whichever group (pinned / this section / neither) the
   * project currently belongs to — meaningless compared across groups. */
  sortOrder: number;
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
  /** Committer date of the cloned HEAD, read straight out of the clone
   * (docs/CONCEPT.md 5.1) — null before the first successful clone. */
  lastCommitAt: number | null;
  /** Derived from lastCommitAt via sustainabilityStatusFor — sent from the
   * API rather than recomputed per-consumer so "now" is consistent. */
  sustainabilityStatus: SustainabilityStatus;
  /** Web URL for "view repo" links — derived from the stored clone URL with
   * any credentials and the trailing .git stripped, never the clone URL
   * itself (which stays server-side only). Null when it couldn't be parsed. */
  repoUrl: string | null;
}

export interface ProjectSettingsUpdate {
  scanSecretsEnabled?: boolean;
  verifySecretsEnabled?: boolean;
  /** Setting `pinned: true` clears any section placement, and setting a
   * `sectionId` clears pinned — the two are mutually exclusive. */
  pinned?: boolean;
  sectionId?: number | null;
}

/** 202 response of POST /api/projects/:id/scans. */
export interface ScanQueued {
  jobId: number;
  status: string;
}

// ---- dashboard organization: pin / sections / manual order ----

/** A user-defined group on the homepage, collapsible and independently
 * reorderable, sitting between the pinned projects and the leftover ones. */
export interface ProjectSection {
  id: number;
  name: string;
  sortOrder: number;
  collapsed: boolean;
}

export interface SectionCreate {
  name: string;
}

export interface SectionUpdate {
  name?: string;
  collapsed?: boolean;
}

/** POST /api/sections/reorder and POST /api/projects/reorder both take the
 * new full ordering of one group's members as a plain id list. */
export interface SectionReorder {
  ids: number[];
}

/**
 * The result of a drag-and-drop move: the complete new ordering of one
 * target group — pinned, a specific section, or the leftover group when
 * `sectionId` is null — as opposed to a delta for a single project, since a
 * drop always repositions every member of the group it lands in.
 */
export interface ProjectReorder {
  ids: number[];
  pinned: boolean;
  sectionId: number | null;
}

// ---- instance settings (roadmap Phase 3, docs/CONCEPT.md 2.3) ----

/** GET /api/settings */
export interface AppSettings {
  /** 0 = disabled — one global interval for every project (§2.3 decision). */
  scanScheduleIntervalHours: number;
  /** Hour of day (0-23, server-local) the schedule is anchored to — "every 6
   * hours" fires at anchorHour, anchorHour+6, etc.; "daily"/"weekly" fire
   * once at anchorHour. Ignored while the schedule is off. */
  scanScheduleAnchorHour: number;
  /** 0=Sunday..6=Saturday. Only meaningful when scanScheduleIntervalHours is
   * the weekly preset (168) — ignored otherwise. */
  scanScheduleWeekday: number;
}

export interface AppSettingsUpdate {
  scanScheduleIntervalHours?: number;
  scanScheduleAnchorHour?: number;
  scanScheduleWeekday?: number;
}

/** Hours of day (0-23) a scan-schedule interval fires at, anchored to
 * `anchorHour` — e.g. every-6-hours anchored at 02 fires at 02/08/14/20. A
 * daily or weekly schedule fires once, at `anchorHour` itself. Shared by the
 * scheduler (apps/api/src/scan/schedule.ts) and the settings UI's hint text,
 * so the two can never disagree about when a schedule actually runs. */
export function scanScheduleHoursOfDay(intervalHours: number, anchorHour: number): number[] {
  if (intervalHours >= 24) return [anchorHour];
  const hours: number[] = [];
  for (let hour = anchorHour % intervalHours; hour < 24; hour += intervalHours) {
    hours.push(hour);
  }
  return hours;
}

// ---- notification channels (roadmap Phase 3, docs/CONCEPT.md 2.3) ----
//
// Several can be configured at once, including several of the same
// platform (e.g. two Slack channels) — every one receives every scan
// notification. The interface behind a platform id stays abstract so a
// future one is a new file, not a rewrite (apps/api/src/notifications).

export type NotificationPlatformId = 'discord' | 'slack' | 'webhook';

/** GET /api/notification-platforms — what the "add channel" form can offer. */
export interface NotificationPlatformInfo {
  id: NotificationPlatformId;
  label: string;
}

export interface NotificationPlatformsList {
  platforms: NotificationPlatformInfo[];
}

/** A configured notification channel — deliberately never carries the
 * webhook URL itself once saved, same as a git account's token. */
export interface NotificationChannel {
  id: number;
  platform: NotificationPlatformId;
  /** Admin-chosen name to tell two channels of the same platform apart;
   * null falls back to the platform's own label in the UI. */
  label: string | null;
  createdAt: number;
}

/** GET /api/notification-channels */
export interface NotificationChannelsList {
  channels: NotificationChannel[];
}

/** POST /api/notification-channels */
export interface CreateNotificationChannelInput {
  platform: NotificationPlatformId;
  url: string;
  label?: string;
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
  /** Declared license as reported by the registry, e.g. an SPDX expression.
   * Null when unknown — never a guess (docs/CONCEPT.md 2.5). */
  license: string | null;
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
  /** User-driven mute (Phase 3) — distinct from `status`, which reconciliation
   * alone controls. Set means excluded from dashboard counts and notifications
   * until explicitly cleared. */
  suppressedAt: number | null;
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
  /** User-driven mute (Phase 3) — see the identical field on Vulnerability. */
  suppressedAt: number | null;
}

/** PATCH /api/projects/:id/vulnerabilities/:vulnId and the secrets equivalent. */
export interface SuppressionUpdate {
  suppressed: boolean;
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

// ---- audit log (docs/CONCEPT.md 2.2, 4, 6.2) ----
//
// Security-relevant, state-changing actions only — not every GET request and
// not routine finding suppression (noise, no security value). Admin-only.

export const AUDIT_LOG_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'user.create',
  'user.role_change',
  'user.delete',
  'git_account.connect',
  'git_account.reconnect',
  'git_account.delete',
  'project.import',
  'project.delete',
  'scan.trigger',
  'scan.cancel',
  'settings.update',
  'notification_channel.create',
  'notification_channel.delete',
] as const;

export type AuditLogAction = (typeof AUDIT_LOG_ACTIONS)[number];

export interface AuditLogEntry {
  id: number;
  /** Null when the acting user was later deleted, or for a failed login
   * attempt that never resolved to an account. */
  userId: number | null;
  /** Snapshot of the username at the time of the action — survives a later
   * user deletion or rename, unlike a join against `users`. */
  username: string | null;
  ip: string | null;
  action: AuditLogAction;
  resourceType: string | null;
  resourceId: string | null;
  /** Small, non-secret context, e.g. { fullName } or { from, to }. Never a
   * token, password or raw secret (docs/CONCEPT.md 4.3's rule applies here
   * too: nothing sensitive gets a second home outside its own table). */
  meta: Record<string, unknown> | null;
  createdAt: number;
}

/** GET /api/audit-log — admin only, newest first, cursor-paginated. */
export interface AuditLogList {
  entries: AuditLogEntry[];
  hasMore: boolean;
}
