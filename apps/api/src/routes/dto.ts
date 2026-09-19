// Row → response mapping. Database rows are not API responses: Drizzle hands
// back `Date` objects for timestamp columns, which Fastify would serialize as
// ISO strings, while the shared types (and every consumer) expect epoch
// milliseconds. Mapping here keeps that conversion in one place instead of in
// every route (docs/CONCEPT.md 3.4).

import {
  sustainabilityStatusFor,
  type PackageEntry,
  type Project,
  type ProjectSection,
  type ScanState,
  type Scan,
  type Secret,
  type Vulnerability,
} from '@lazysentry/shared';
import type {
  packages,
  projects,
  projectSections,
  scans,
  secrets,
  vulnerabilities,
} from '../db/schema.js';

type ProjectRow = typeof projects.$inferSelect;
type ProjectSectionRow = typeof projectSections.$inferSelect;
type ScanRow = typeof scans.$inferSelect;
type PackageRow = typeof packages.$inferSelect;
type VulnerabilityRow = typeof vulnerabilities.$inferSelect;
type SecretRow = typeof secrets.$inferSelect;

const ms = (value: Date | null | undefined): number | null =>
  value ? value.getTime() : null;

export function toProjectDto(
  row: ProjectRow,
  scanState: ScanState,
  // Comes from a join on lastScanId, not a column on `projects` itself —
  // the failure reason of a finished scan lives on `scans` (8.1 "failed
  // (mit Grund im Tooltip)").
  lastScanErrorMessage: string | null = null,
): Project {
  return {
    id: row.id,
    name: row.name,
    fullName: row.fullName,
    defaultBranch: row.defaultBranch,
    isPrivate: row.isPrivate,
    addedAt: row.addedAt.getTime(),
    pinned: row.pinned,
    sectionId: row.sectionId,
    sortOrder: row.sortOrder,
    scanSecretsEnabled: row.scanSecretsEnabled,
    verifySecretsEnabled: row.verifySecretsEnabled,
    scanState,
    lastScanId: row.lastScanId,
    lastScanAt: ms(row.lastScanAt),
    lastScanStatus: row.lastScanStatus as Project['lastScanStatus'],
    lastScanErrorMessage,
    countVulnCritical: row.countVulnCritical,
    countVulnHigh: row.countVulnHigh,
    countVulnMedium: row.countVulnMedium,
    countVulnLow: row.countVulnLow,
    countSecretsVerified: row.countSecretsVerified,
    countSecretsUnknown: row.countSecretsUnknown,
    countOutdatedMajor: row.countOutdatedMajor,
    countOutdatedMinor: row.countOutdatedMinor,
    countOutdatedPatch: row.countOutdatedPatch,
    lastScannedCommitSha: row.lastScannedCommitSha,
    lastCommitAt: ms(row.lastCommitAt),
    sustainabilityStatus: sustainabilityStatusFor(ms(row.lastCommitAt)),
  };
}

export function toSectionDto(row: ProjectSectionRow): ProjectSection {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    collapsed: row.collapsed,
  };
}

export function toScanDto(row: ScanRow): Scan {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status as Scan['status'],
    depsStatus: row.depsStatus as Scan['depsStatus'],
    secretsStatus: row.secretsStatus as Scan['secretsStatus'],
    startedAt: ms(row.startedAt),
    finishedAt: ms(row.finishedAt),
    commitSha: row.commitSha,
    trigger: row.trigger as Scan['trigger'],
    scannerVersions: row.scannerVersions ?? null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    durationMs: row.durationMs,
  };
}

export function toPackageDto(row: PackageRow): PackageEntry {
  return {
    id: row.id,
    scanId: row.scanId,
    ecosystem: row.ecosystem,
    name: row.name,
    versionInstalled: row.versionInstalled,
    versionLatest: row.versionLatest,
    updateType: row.updateType as PackageEntry['updateType'],
    isDirect: row.isDirect,
    sourceFile: row.sourceFile,
    license: row.license,
  };
}

/**
 * The package columns come from a left join: a vulnerability keeps its row
 * across scans while package rows are a per-scan snapshot, so the referenced
 * package can be gone (`ON DELETE SET NULL`) for a finding that was resolved
 * long ago.
 */
export function toVulnerabilityDto(
  row: VulnerabilityRow,
  pkg: Pick<PackageRow, 'name' | 'ecosystem' | 'versionInstalled'> | null,
): Vulnerability {
  return {
    id: row.id,
    projectId: row.projectId,
    osvId: row.osvId,
    aliases: row.aliases ?? [],
    severity: row.severity as Vulnerability['severity'],
    cvssScore: row.cvssScore,
    summary: row.summary,
    fixedVersion: row.fixedVersion,
    publishedAt: ms(row.publishedAt),
    status: row.status as Vulnerability['status'],
    firstSeenScanId: row.firstSeenScanId,
    lastSeenScanId: row.lastSeenScanId,
    resolvedAt: ms(row.resolvedAt),
    suppressedAt: ms(row.suppressedAt),
    packageName: pkg?.name ?? null,
    packageEcosystem: pkg?.ecosystem ?? null,
    packageVersion: pkg?.versionInstalled ?? null,
  };
}

export function toSecretDto(row: SecretRow): Secret {
  return {
    id: row.id,
    projectId: row.projectId,
    detectorType: row.detectorType,
    filePath: row.filePath,
    commitSha: row.commitSha,
    line: row.line,
    isVerified: row.isVerified,
    // `redacted` is the masked preview; the raw value is never stored, so
    // there is nothing to strip here (docs/CONCEPT.md 4.3).
    redacted: row.redacted,
    status: row.status as Secret['status'],
    commitAuthor: row.commitAuthor,
    commitDate: ms(row.commitDate),
    firstSeenScanId: row.firstSeenScanId,
    lastSeenScanId: row.lastSeenScanId,
    resolvedAt: ms(row.resolvedAt),
    suppressedAt: ms(row.suppressedAt),
  };
}
