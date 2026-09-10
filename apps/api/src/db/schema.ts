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

/** Single admin account (docs/CONCEPT.md 6.1: no multi-user in the MVP). */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
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
  provider: text('provider').notNull(), // 'github' only in the MVP
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
    // 'pending' | 'running' | 'done' | 'failed'
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lockedAt: integer('locked_at', { mode: 'timestamp_ms' }),
    lockedBy: text('locked_by'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    errorMessage: text('error_message'),
  },
  (table) => [index('jobs_status_idx').on(table.status)],
);

export interface ScanJobPayload {
  projectId: number;
  trigger: 'manual' | 'scheduled';
}

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
  },
  (table) => [
    // A repository is imported once per connected account; a second import
    // is a 409 conflict, not a duplicate row.
    uniqueIndex('projects_account_repo_unique').on(
      table.gitAccountId,
      table.providerRepoId,
    ),
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
    // 'completed_with_warnings' | 'failed'
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
  },
  (table) => [
    uniqueIndex('vulns_project_fingerprint_unique').on(
      table.projectId,
      table.fingerprint,
    ),
    index('vulns_project_status_idx').on(table.projectId, table.status),
  ],
);
