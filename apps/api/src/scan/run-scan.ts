// Executes one scan end-to-end: clone → trufflehog → osv-scanner → persist +
// reconcile (docs/CONCEPT.md 5.1, 4.1).

import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  packages,
  projects,
  scans,
  secrets,
  vulnerabilities,
  type ScanJobPayload,
} from '../db/schema.js';
import { secretFingerprint, vulnerabilityFingerprint } from '../lib/fingerprint.js';
import { redactSecret } from '../lib/redact.js';
import { classifySeverity } from '../lib/severity.js';
import {
  getAccountToken,
  getGitAccount,
  markAccountInvalid,
} from '../accounts/git-accounts.js';
import {
  CloneError,
  cloneRepository,
  newScanDir,
  removeScanDir,
} from '../scanner/clone.js';
import {
  runOsvScanner,
  type OsvPackageEntry,
  type OsvScannerOutput,
  type OsvVulnerability,
} from '../scanner/osv-scanner.js';
import { runTruffleHog, type TruffleHogFinding } from '../scanner/trufflehog.js';
import { SCANNER_VERSIONS } from '../scanner/versions.js';
import {
  auditPackageVersions,
  cacheKey,
  type VersionAuditResult,
} from './version-audit.js';

/** Thrown internally to unwind the pipeline once a cancel has been requested. */
class ScanCancelledError extends Error {}

function checkCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ScanCancelledError('Scan cancelled');
}

export async function runScan(
  payload: ScanJobPayload,
  signal?: AbortSignal,
): Promise<{ scanId: number; status: string }> {
  const { projectId, trigger } = payload;
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) {
    throw new Error(`project ${projectId} not found`);
  }

  const startedAt = new Date();
  const scanRow = db
    .insert(scans)
    .values({
      projectId,
      status: 'running',
      trigger,
      startedAt,
      scannerVersions: SCANNER_VERSIONS,
      secretsStatus: project.scanSecretsEnabled ? 'pending' : 'skipped',
    })
    .returning({ id: scans.id })
    .get();
  const scanId = scanRow.id;

  let status = 'failed';
  let depsStatus = 'pending';
  let secretsStatus = project.scanSecretsEnabled ? 'pending' : 'skipped';
  const failures: { code: string; message: string }[] = [];
  let commitSha: string | null = null;

  const scanDir = newScanDir();
  try {
    checkCancelled(signal);

    // Private repositories need the connected account's token; the hardcoded
    // development project has no account and clones anonymously.
    const account = project.gitAccountId === null ? undefined : getGitAccount();
    const token = account ? getAccountToken(account) : undefined;

    try {
      ({ commitSha } = await cloneRepository(project.cloneUrl, scanDir, token, signal));
    } catch (cloneError) {
      if (cloneError instanceof CloneError && cloneError.isCancelled) {
        throw new ScanCancelledError();
      }
      // A revoked token affects every project, so flag the account instead of
      // only this scan — the UI then asks for a reconnect (CONCEPT 6.2).
      if (cloneError instanceof CloneError && cloneError.isAuthFailure && account) {
        markAccountInvalid(account.id);
        failures.push({ code: 'ACCOUNT_TOKEN_INVALID', message: cloneError.message });
      }
      throw cloneError;
    }
    db.update(scans).set({ commitSha }).where(eq(scans.id, scanId)).run();

    if (project.scanSecretsEnabled) {
      // The commit this project was scanned up to *before* this run — unset
      // on the very first scan and on an explicitly requested full rescan,
      // which both mean "scan the full history" (docs/CONCEPT.md 5.4).
      const sinceCommit = payload.fullRescan
        ? undefined
        : (project.lastScannedCommitSha ?? undefined);
      const trufflehog = await runTruffleHog(
        scanDir,
        { sinceCommit, verify: project.verifySecretsEnabled },
        signal,
      );
      if (trufflehog.kind === 'cancelled') throw new ScanCancelledError();
      secretsStatus = trufflehog.kind;
      if (trufflehog.kind === 'completed') {
        persistSecretResults(projectId, scanId, trufflehog.findings, {
          isFullScan: sinceCommit === undefined,
        });
      } else {
        failures.push({ code: 'SECRETS_SCAN_FAILED', message: trufflehog.message });
      }
    }

    checkCancelled(signal);
    const osv = await runOsvScanner(scanDir, signal);
    if (osv.kind === 'cancelled') throw new ScanCancelledError();
    depsStatus = osv.kind;
    switch (osv.kind) {
      case 'completed': {
        // Registry lookups are async; better-sqlite3 transactions are not
        // (docs/CONCEPT.md 0.3), so every lookup happens before the
        // synchronous persist step below even opens one.
        const versions = await auditPackageVersions(collectPackageRefs(osv.output));
        persistDependencyResults(projectId, scanId, osv.output, versions);
        break;
      }
      case 'completed_empty':
        // No lockfiles found. Existing findings are left untouched — nothing
        // was scanned, so nothing may be marked resolved (no false green).
        break;
      case 'failed':
        failures.push({ code: 'DEPS_SCAN_FAILED', message: osv.message });
        break;
    }

    // A scan can be partially successful (docs/CONCEPT.md 5.7): only when
    // neither scanner produced usable results is the whole scan a failure.
    // A skipped scanner (secrets disabled for this project) counts as "not a
    // problem", not as a failure to fold in here.
    const depsOk = depsStatus === 'completed';
    const secretsOk = secretsStatus === 'completed' || secretsStatus === 'skipped';
    if (!depsOk && !secretsOk) {
      status = 'failed';
    } else if (depsStatus === 'completed_empty' || failures.length > 0) {
      status = 'completed_with_warnings';
    } else {
      status = 'completed';
    }
  } catch (error) {
    if (error instanceof ScanCancelledError) {
      // A deliberate stop, not a failure (rule 2 — semantics matter): no
      // failure entries, and whatever scanner never got to run is 'skipped'
      // rather than 'failed'.
      status = 'cancelled';
    } else {
      // Clone failed, or something unexpected escaped both scanner wrappers —
      // there is nothing usable from this scan at all.
      status = 'failed';
      if (failures.length === 0) {
        failures.push({
          code: 'SCAN_FAILED',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (depsStatus === 'pending') depsStatus = status === 'cancelled' ? 'skipped' : 'failed';
    if (secretsStatus === 'pending') secretsStatus = status === 'cancelled' ? 'skipped' : 'failed';
  } finally {
    // Always remove the temp directory, also on failure (rule 4).
    await removeScanDir(scanDir);
  }

  const errorCode =
    status === 'cancelled'
      ? 'SCAN_CANCELLED'
      : failures.length === 0
        ? null
        : failures.length === 1
          ? failures[0]!.code
          : 'SCAN_PARTIALLY_FAILED';
  const errorMessage =
    status === 'cancelled'
      ? 'Cancelled by user'
      : failures.length === 0
        ? null
        : failures.map((f) => f.message).join(' | ');

  const finishedAt = new Date();
  db.update(scans)
    .set({
      status,
      depsStatus,
      secretsStatus,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      errorCode,
      errorMessage,
    })
    .where(eq(scans.id, scanId))
    .run();

  // Only advance the incremental-scan marker once trufflehog actually
  // covered up to this commit. Leaving it untouched after a failed or
  // skipped secrets scan means the next run either retries the same range
  // or (secrets scanning re-enabled later) falls back to a full-history
  // scan instead of silently skipping everything before it
  // (docs/CONCEPT.md 5.4).
  const scannedCommitSha = secretsStatus === 'completed' ? commitSha : null;
  updateProjectAfterScan(projectId, scanId, status, finishedAt, scannedCommitSha, {
    // Package rows are a per-scan snapshot, not reconciled like findings
    // (5.4/4.1) — if this scan didn't produce a fresh inventory (no
    // lockfiles, or the deps scanner failed), there are 0 rows for this
    // scanId. Recomputing the outdated counts from that would wipe out a
    // perfectly good previous count for no reason.
    hasFreshPackageInventory: depsStatus === 'completed',
  });

  return { scanId, status };
}

/** Every (ecosystem, name, installed version) triple in the inventory, for the version audit. */
function collectPackageRefs(
  output: OsvScannerOutput,
): { ecosystem: string; name: string; versionInstalled: string }[] {
  const refs: { ecosystem: string; name: string; versionInstalled: string }[] = [];
  for (const result of output.results ?? []) {
    for (const entry of result.packages) {
      refs.push({
        ecosystem: entry.package.ecosystem,
        name: entry.package.name,
        versionInstalled: entry.package.version,
      });
    }
  }
  return refs;
}

/**
 * Writes the package inventory (including the version-audit result looked
 * up beforehand) and upserts vulnerabilities keyed by (project_id,
 * fingerprint), then marks findings not seen in this scan as resolved — all
 * in one transaction (docs/CONCEPT.md 4.1).
 */
function persistDependencyResults(
  projectId: number,
  scanId: number,
  output: OsvScannerOutput,
  versions: Map<string, VersionAuditResult>,
): void {
  const now = new Date();
  db.transaction((tx) => {
    for (const result of output.results ?? []) {
      for (const entry of result.packages) {
        const audit = versions.get(cacheKey(entry.package.ecosystem, entry.package.name));
        const packageRow = tx
          .insert(packages)
          .values({
            scanId,
            ecosystem: entry.package.ecosystem,
            name: entry.package.name,
            versionInstalled: entry.package.version,
            versionLatest: audit?.versionLatest ?? null,
            updateType: audit?.updateType ?? 'unknown',
            sourceFile: result.source.path,
          })
          .returning({ id: packages.id })
          .get();

        for (const vuln of entry.vulnerabilities ?? []) {
          const fp = vulnerabilityFingerprint(
            entry.package.ecosystem,
            entry.package.name,
            vuln.id,
          );
          const cvssScore = maxSeverityFor(entry, vuln);
          tx.insert(vulnerabilities)
            .values({
              projectId,
              packageId: packageRow.id,
              osvId: vuln.id,
              aliases: vuln.aliases ?? [],
              severity: classifySeverity(cvssScore),
              cvssScore,
              summary: vuln.summary ?? null,
              fixedVersion: fixedVersionFor(entry, vuln),
              publishedAt: vuln.published ? new Date(vuln.published) : null,
              fingerprint: fp,
              status: 'open',
              firstSeenScanId: scanId,
              lastSeenScanId: scanId,
            })
            .onConflictDoUpdate({
              target: [vulnerabilities.projectId, vulnerabilities.fingerprint],
              set: {
                packageId: packageRow.id,
                aliases: vuln.aliases ?? [],
                severity: classifySeverity(cvssScore),
                cvssScore,
                summary: vuln.summary ?? null,
                fixedVersion: fixedVersionFor(entry, vuln),
                lastSeenScanId: scanId,
                // Finding is present again — reopen if it was resolved.
                status: 'open',
                resolvedScanId: null,
                resolvedAt: null,
              },
            })
            .run();
        }
      }
    }

    // Open findings not seen by this scan are resolved now.
    tx.update(vulnerabilities)
      .set({ status: 'resolved', resolvedScanId: scanId, resolvedAt: now })
      .where(
        and(
          eq(vulnerabilities.projectId, projectId),
          eq(vulnerabilities.status, 'open'),
          ne(vulnerabilities.lastSeenScanId, scanId),
        ),
      )
      .run();
  });
}

/**
 * Upserts secret findings keyed by (project_id, fingerprint). On a full
 * (non-incremental) scan, open findings not seen this run are marked
 * resolved, mirroring persistDependencyResults. On an incremental scan
 * (`--since-commit` was used) that step is skipped entirely: a secret from
 * earlier history does not disappear just because this run only looked at
 * new commits (docs/CONCEPT.md 5.4).
 *
 * The raw secret (`finding.Raw`) is used only to derive the fingerprint and
 * the redacted preview below — it is never assigned to a variable that
 * outlives this loop iteration, put in an error message, or logged
 * (docs/CONCEPT.md 4.3, rule 1).
 */
function persistSecretResults(
  projectId: number,
  scanId: number,
  findings: TruffleHogFinding[],
  options: { isFullScan: boolean },
): void {
  const now = new Date();
  db.transaction((tx) => {
    for (const finding of findings) {
      const git = finding.SourceMetadata?.Data?.Git;
      const filePath = git?.file ?? 'unknown';
      const commitSha = git?.commit ?? 'unknown';
      const fp = secretFingerprint(finding.DetectorName, filePath, commitSha, finding.Raw);
      const redacted = redactSecret(finding.Raw);
      const commitDate = git?.timestamp ? new Date(git.timestamp) : null;

      tx.insert(secrets)
        .values({
          projectId,
          detectorType: finding.DetectorName,
          filePath,
          commitSha,
          line: git?.line ?? null,
          isVerified: finding.Verified,
          redacted,
          fingerprint: fp,
          status: 'open',
          commitAuthor: git?.email ?? null,
          commitDate: commitDate && !Number.isNaN(commitDate.getTime()) ? commitDate : null,
          firstSeenScanId: scanId,
          lastSeenScanId: scanId,
        })
        .onConflictDoUpdate({
          target: [secrets.projectId, secrets.fingerprint],
          set: {
            isVerified: finding.Verified,
            redacted,
            lastSeenScanId: scanId,
            // Finding is present again — reopen if it was resolved.
            status: 'open',
            resolvedScanId: null,
            resolvedAt: null,
          },
        })
        .run();
    }

    if (options.isFullScan) {
      tx.update(secrets)
        .set({ status: 'resolved', resolvedScanId: scanId, resolvedAt: now })
        .where(
          and(
            eq(secrets.projectId, projectId),
            eq(secrets.status, 'open'),
            ne(secrets.lastSeenScanId, scanId),
          ),
        )
        .run();
    }
  });
}

function updateProjectAfterScan(
  projectId: number,
  scanId: number,
  status: string,
  finishedAt: Date,
  commitSha: string | null,
  options: { hasFreshPackageInventory: boolean },
): void {
  const counts = db
    .select({
      severity: vulnerabilities.severity,
      count: sql<number>`count(*)`,
    })
    .from(vulnerabilities)
    .where(
      and(
        eq(vulnerabilities.projectId, projectId),
        eq(vulnerabilities.status, 'open'),
      ),
    )
    .groupBy(vulnerabilities.severity)
    .all();
  const bySeverity = Object.fromEntries(counts.map((c) => [c.severity, c.count]));

  const secretCounts = db
    .select({
      isVerified: secrets.isVerified,
      count: sql<number>`count(*)`,
    })
    .from(secrets)
    .where(and(eq(secrets.projectId, projectId), eq(secrets.status, 'open')))
    .groupBy(secrets.isVerified)
    .all();
  const verifiedCount = secretCounts.find((c) => c.isVerified)?.count ?? 0;
  const unknownCount = secretCounts.find((c) => !c.isVerified)?.count ?? 0;

  // Packages aren't reconciled across scans the way findings are (5.4/4.1) —
  // each scan's rows are its own inventory snapshot — so "outdated" counts
  // come from this scan only, not a project-wide open/resolved status. Only
  // recomputed when this scan actually produced a fresh inventory.
  let outdatedCounts: Partial<{
    countOutdatedMajor: number;
    countOutdatedMinor: number;
    countOutdatedPatch: number;
  }> = {};
  if (options.hasFreshPackageInventory) {
    const updateCounts = db
      .select({
        updateType: packages.updateType,
        count: sql<number>`count(*)`,
      })
      .from(packages)
      .where(eq(packages.scanId, scanId))
      .groupBy(packages.updateType)
      .all();
    const byUpdateType = Object.fromEntries(updateCounts.map((c) => [c.updateType, c.count]));
    outdatedCounts = {
      countOutdatedMajor: byUpdateType['major'] ?? 0,
      countOutdatedMinor: byUpdateType['minor'] ?? 0,
      countOutdatedPatch: byUpdateType['patch'] ?? 0,
    };
  }

  db.update(projects)
    .set({
      lastScanId: scanId,
      lastScanAt: finishedAt,
      lastScanStatus: status,
      countVulnCritical: bySeverity['critical'] ?? 0,
      countVulnHigh: bySeverity['high'] ?? 0,
      countVulnMedium: bySeverity['medium'] ?? 0,
      countVulnLow: bySeverity['low'] ?? 0,
      countSecretsVerified: verifiedCount,
      countSecretsUnknown: unknownCount,
      ...outdatedCounts,
      ...(commitSha ? { lastScannedCommitSha: commitSha } : {}),
    })
    .where(eq(projects.id, projectId))
    .run();
}

/** Numeric CVSS score from the result group containing this vulnerability. */
function maxSeverityFor(
  entry: OsvPackageEntry,
  vuln: OsvVulnerability,
): number | null {
  const group = entry.groups?.find((g) => g.ids.includes(vuln.id));
  if (!group?.max_severity) return null;
  const score = Number(group.max_severity);
  return Number.isFinite(score) ? score : null;
}

/** First "fixed" version for the affected entry matching this package. */
function fixedVersionFor(
  entry: OsvPackageEntry,
  vuln: OsvVulnerability,
): string | null {
  for (const affected of vuln.affected ?? []) {
    if (affected.package?.name && affected.package.name !== entry.package.name) {
      continue;
    }
    for (const range of affected.ranges ?? []) {
      for (const event of range.events) {
        if (event.fixed) return event.fixed;
      }
    }
  }
  return null;
}
