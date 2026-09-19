// Database schema following docs/CONCEPT.md section 4. Tables are added in
// the order the implementation steps need them (settings, git_accounts,
// secrets and jobs arrive with steps 2–4), each as its own migration.

import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Multiple named accounts sharing one instance, no team isolation
 * (docs/CONCEPT.md 2.6). The first account created (setup wizard) is always
 * 'admin'; further accounts are created by an admin in Settings.
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // 'admin' | 'member' — admin additionally manages git accounts and users.
  role: text('role').notNull().default('member'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueEncrypted: text('value_encrypted').notNull(),
  isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false),
});

export const gitAccounts = sqliteTable('git_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(), // 'github' | 'gitlab'
  // Null means the provider's public SaaS instance (github.com / gitlab.com);
  // set for a self-hosted GitLab instance. Multiple accounts — including
  // several for the same provider — are supported side by side.
  baseUrl: text('base_url'),
  username: text('username').notNull(),
  tokenEncrypted: text('token_encrypted').notNull(),
  tokenScopes: text('token_scopes', { mode: 'json' }).$type<string[]>(),
  // 'valid' | 'invalid' — set to 'invalid' when a clone fails with 401/403
  // so the UI can prompt for reconnect (docs/CONCEPT.md 6.2).
  status: text('status').notNull().default('valid'),
  connectedAt: integer('connected_at', { mode: 'timestamp_ms' }).notNull(),
  lastValidatedAt: integer('last_validated_at', { mode: 'timestamp_ms' }),
});

export const jobs = sqliteTable(
  'jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(), // 'scan'
    payload: text('payload', { mode: 'json' }).$type<ScanJobPayload>().notNull(),
    // 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lockedAt: integer('locked_at', { mode: 'timestamp_ms' }),
    lockedBy: text('locked_by'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    errorMessage: text('error_message'),
    // Set by the API when a user asks to stop this job; the worker polls it
    // while running and aborts the in-flight scan (docs/CONCEPT.md 0.1 — a
    // DB flag rather than an in-process signal, since api and worker are two
    // separate processes sharing only the database).
    cancelRequested: integer('cancel_requested', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => [index('jobs_status_idx').on(table.status)],
);

export interface ScanJobPayload {
  projectId: number;
  trigger: 'manual' | 'scheduled';
  /**
   * Full rescan: ignore last_scanned_commit_sha and walk the entire history
   * again instead of only new commits (docs/CONCEPT.md 5.4). Absent on the
   * normal incremental path.
   */
  fullRescan?: boolean;
}

/**
 * User-defined dashboard groups (not in docs/CONCEPT.md — a homepage
 * organization feature layered on top of the urgency-sorted grid). A
 * project belongs to at most one section, and never both a section and
 * pinned at once — pinning always wins the top slot, so the two placements
 * are kept mutually exclusive rather than tracked as overlapping state.
 */
export const projectSections = sqliteTable('project_sections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  collapsed: integer('collapsed', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Dashboard organization (see projectSections above). `sortOrder` is
    // only meaningful relative to the other projects sharing this project's
    // current placement (pinned, a given section, or neither) — it is
    // reassigned to the target group's next slot whenever pinned/sectionId
    // changes, never compared across groups.
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    sectionId: integer('section_id').references(() => projectSections.id, {
      onDelete: 'set null',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    // Null only for the hardcoded step-1 development project.
    gitAccountId: integer('git_account_id').references(() => gitAccounts.id, {
      onDelete: 'cascade',
    }),
    providerRepoId: text('provider_repo_id'),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    defaultBranch: text('default_branch'),
    cloneUrl: text('clone_url').notNull(),
    isPrivate: integer('is_private', { mode: 'boolean' })
      .notNull()
      .default(false),
    addedAt: integer('added_at', { mode: 'timestamp_ms' }).notNull(),
    scanSecretsEnabled: integer('scan_secrets_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    verifySecretsEnabled: integer('verify_secrets_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    // Denormalized counters for the dashboard grid.
    lastScanId: integer('last_scan_id'),
    lastScanAt: integer('last_scan_at', { mode: 'timestamp_ms' }),
    lastScanStatus: text('last_scan_status'),
    countVulnCritical: integer('count_vuln_critical').notNull().default(0),
    countVulnHigh: integer('count_vuln_high').notNull().default(0),
    countVulnMedium: integer('count_vuln_medium').notNull().default(0),
    countVulnLow: integer('count_vuln_low').notNull().default(0),
    countSecretsVerified: integer('count_secrets_verified').notNull().default(0),
    countSecretsUnknown: integer('count_secrets_unknown').notNull().default(0),
    countOutdatedMajor: integer('count_outdated_major').notNull().default(0),
    countOutdatedMinor: integer('count_outdated_minor').notNull().default(0),
    countOutdatedPatch: integer('count_outdated_patch').notNull().default(0),
    lastScannedCommitSha: text('last_scanned_commit_sha'),
    // Committer date of the cloned HEAD, read straight out of the clone
    // (docs/CONCEPT.md 5.1) — feeds sustainabilityStatusFor() (2.2). Null
    // until the first successful clone.
    lastCommitAt: integer('last_commit_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    // A repository is imported once per connected account; a second import
    // is a 409 conflict, not a duplicate row.
    uniqueIndex('projects_account_repo_unique').on(
      table.gitAccountId,
      table.providerRepoId,
    ),
    index('projects_section_idx').on(table.sectionId),
  ],
);

export const scans = sqliteTable(
  'scans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Overall status: 'queued' | 'running' | 'completed' |
    // 'completed_with_warnings' | 'failed' | 'cancelled'
    status: text('status').notNull(),
    // Per-scanner status so a scan can be partially successful (5.7):
    // 'pending' | 'completed' | 'completed_empty' | 'failed' | 'skipped'
    depsStatus: text('deps_status').notNull().default('pending'),
    secretsStatus: text('secrets_status').notNull().default('pending'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    commitSha: text('commit_sha'),
    trigger: text('trigger').notNull(), // 'manual' | 'scheduled'
    scannerVersions: text('scanner_versions', { mode: 'json' }).$type<
      Record<string, string>
    >(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),
  },
  (table) => [index('scans_project_idx').on(table.projectId)],
);

export const packages = sqliteTable(
  'packages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scanId: integer('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    ecosystem: text('ecosystem').notNull(),
    name: text('name').notNull(),
    versionInstalled: text('version_installed').notNull(),
    versionLatest: text('version_latest'),
    // 'none' | 'patch' | 'minor' | 'major' | 'unknown'
    updateType: text('update_type').notNull().default('unknown'),
    isDirect: integer('is_direct', { mode: 'boolean' }),
    sourceFile: text('source_file'),
    // Raw declared license as reported by the registry (e.g. an SPDX
    // expression) — null when the registry has none or the ecosystem isn't
    // supported yet (docs/CONCEPT.md 2.5). Display only, no policy/allowlist.
    license: text('license'),
  },
  (table) => [index('packages_scan_idx').on(table.scanId)],
);

export const vulnerabilities = sqliteTable(
  'vulnerabilities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    packageId: integer('package_id').references(() => packages.id, {
      onDelete: 'set null',
    }),
    osvId: text('osv_id').notNull(),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>(),
    // 'critical' | 'high' | 'medium' | 'low' | 'unknown'
    severity: text('severity').notNull().default('unknown'),
    cvssScore: real('cvss_score'),
    summary: text('summary'),
    fixedVersion: text('fixed_version'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    fingerprint: text('fingerprint').notNull(),
    status: text('status').notNull().default('open'), // 'open' | 'resolved'
    firstSeenScanId: integer('first_seen_scan_id').notNull(),
    lastSeenScanId: integer('last_seen_scan_id').notNull(),
    resolvedScanId: integer('resolved_scan_id'),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    // User-driven mute (roadmap Phase 3, docs/CONCEPT.md 2.3) — distinct from
    // `status`, which is scan-reconciliation-driven only. Never touched by
    // reconciliation, so it survives every future scan of the same finding
    // until explicitly cleared.
    suppressedAt: integer('suppressed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('vulns_project_fingerprint_unique').on(
      table.projectId,
      table.fingerprint,
    ),
    index('vulns_project_status_idx').on(table.projectId, table.status),
  ],
);

/**
 * Registry response cache (docs/CONCEPT.md 5.3): "latest version" lookups
 * are cached per ecosystem+package for 24h so a scan of a large dependency
 * tree does not fire hundreds of near-identical HTTP requests. A plain
 * SQLite table rather than an in-memory cache — it must survive worker
 * restarts and be shared if the API process ever queries it too.
 */
export const registryCache = sqliteTable(
  'registry_cache',
  {
    ecosystem: text('ecosystem').notNull(),
    packageName: text('package_name').notNull(),
    // Null means "looked up, but the registry had no answer" (e.g. 404) —
    // distinct from "never looked up" (no row at all).
    latestVersion: text('latest_version'),
    // Declared license from the same registry response, cached alongside the
    // version so license lookups never cost a second HTTP request (2.5).
    license: text('license'),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('registry_cache_ecosystem_package_unique').on(
      table.ecosystem,
      table.packageName,
    ),
  ],
);

export const secrets = sqliteTable(
  'secrets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    detectorType: text('detector_type').notNull(),
    filePath: text('file_path').notNull(),
    commitSha: text('commit_sha').notNull(),
    line: integer('line'),
    isVerified: integer('is_verified', { mode: 'boolean' })
      .notNull()
      .default(false),
    // First 4 + last 4 characters of the raw secret, rest masked — never the
    // raw value itself (docs/CONCEPT.md 4.3, rule 1).
    redacted: text('redacted').notNull(),
    fingerprint: text('fingerprint').notNull(),
    status: text('status').notNull().default('open'), // 'open' | 'resolved'
    commitAuthor: text('commit_author'),
    commitDate: integer('commit_date', { mode: 'timestamp_ms' }),
    firstSeenScanId: integer('first_seen_scan_id').notNull(),
    lastSeenScanId: integer('last_seen_scan_id').notNull(),
    resolvedScanId: integer('resolved_scan_id'),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    // User-driven mute (roadmap Phase 3, docs/CONCEPT.md 2.3) — distinct from
    // `status`, which is scan-reconciliation-driven only. Never touched by
    // reconciliation, so it survives every future scan of the same finding
    // until explicitly cleared.
    suppressedAt: integer('suppressed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('secrets_project_fingerprint_unique').on(
      table.projectId,
      table.fingerprint,
    ),
    index('secrets_project_status_idx').on(table.projectId, table.status),
  ],
);

/**
 * Configured notification channels (roadmap Phase 3, docs/CONCEPT.md 2.3).
 * Several can be connected at once, including several of the same platform
 * (e.g. two Slack channels) — every one receives every scan notification,
 * same "no per-project config" philosophy as the scan schedule.
 */
export const notificationChannels = sqliteTable('notification_channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  platform: text('platform').notNull(), // 'discord' | 'slack' | 'webhook'
  // Admin-chosen name to tell two channels of the same platform apart; null
  // falls back to the platform's own label in the UI.
  label: text('label'),
  urlEncrypted: text('url_encrypted').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Security-relevant, state-changing actions only (docs/CONCEPT.md 2.2, 6.2) —
 * not every GET request and not routine finding suppression. `username` is a
 * snapshot at the time of the action rather than a join against `users`, so
 * the entry stays legible after the acting user is later deleted or renamed.
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    username: text('username'),
    ip: text('ip'),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    // Small, non-secret context (e.g. { fullName } or { from, to }) — never a
    // token, password or raw secret (docs/CONCEPT.md 4.3's rule applies here
    // too).
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('audit_log_created_at_idx').on(table.createdAt)],
);
