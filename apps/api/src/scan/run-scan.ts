// Executes one scan end-to-end: clone → osv-scanner → persist + reconcile
// (docs/CONCEPT.md 5.1, 4.1). Secret scanning is added in step 4.

import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { packages, projects, scans, vulnerabilities } from '../db/schema.js';
import { vulnerabilityFingerprint } from '../lib/fingerprint.js';
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
import { SCANNER_VERSIONS } from '../scanner/versions.js';

export async function runScan(
  projectId: number,
  trigger: 'manual' | 'scheduled',
): Promise<{ scanId: number; status: string }> {
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
      // TruffleHog integration is step 4:
      secretsStatus: 'skipped',
    })
    .returning({ id: scans.id })
    .get();
  const scanId = scanRow.id;

  let status = 'failed';
  let depsStatus = 'pending';
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let commitSha: string | null = null;

  const scanDir = newScanDir();
  try {
    // Private repositories need the connected account's token; the hardcoded
    // development project has no account and clones anonymously.
    const account = project.gitAccountId === null ? undefined : getGitAccount();
    const token = account ? getAccountToken(account) : undefined;

    try {
      ({ commitSha } = await cloneRepository(project.cloneUrl, scanDir, token));
    } catch (cloneError) {
      // A revoked token affects every project, so flag the account instead of
      // only this scan — the UI then asks for a reconnect (CONCEPT 6.2).
      if (cloneError instanceof CloneError && cloneError.isAuthFailure && account) {
        markAccountInvalid(account.id);
        errorCode = 'ACCOUNT_TOKEN_INVALID';
      }
      throw cloneError;
    }
    db.update(scans).set({ commitSha }).where(eq(scans.id, scanId)).run();

    const osv = await runOsvScanner(scanDir);
    depsStatus = osv.kind;
    switch (osv.kind) {
      case 'completed':
        persistDependencyResults(projectId, scanId, osv.output);
        status = 'completed';
        break;
      case 'completed_empty':
        // No lockfiles found. Existing findings are left untouched — nothing
        // was scanned, so nothing may be marked resolved (no false green).
        status = 'completed_with_warnings';
        break;
      case 'failed':
        status = 'failed';
        errorCode = 'DEPS_SCAN_FAILED';
        errorMessage = osv.message;
        break;
    }
  } catch (error) {
    status = 'failed';
    errorCode = errorCode ?? 'SCAN_FAILED';
    errorMessage = error instanceof Error ? error.message : String(error);
    if (depsStatus === 'pending') depsStatus = 'failed';
  } finally {
    // Always remove the temp directory, also on failure (rule 4).
    await removeScanDir(scanDir);
  }

  const finishedAt = new Date();
  db.update(scans)
    .set({
      status,
      depsStatus,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      errorCode,
      errorMessage,
    })
    .where(eq(scans.id, scanId))
    .run();

  updateProjectAfterScan(projectId, scanId, status, finishedAt, commitSha);

  return { scanId, status };
}

/**
 * Writes the package inventory and upserts vulnerabilities keyed by
 * (project_id, fingerprint), then marks findings not seen in this scan as
 * resolved — all in one transaction (docs/CONCEPT.md 4.1).
 */
function persistDependencyResults(
  projectId: number,
  scanId: number,
  output: OsvScannerOutput,
): void {
  const now = new Date();
  db.transaction((tx) => {
    for (const result of output.results ?? []) {
      for (const entry of result.packages) {
        const packageRow = tx
          .insert(packages)
          .values({
            scanId,
            ecosystem: entry.package.ecosystem,
            name: entry.package.name,
            versionInstalled: entry.package.version,
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

function updateProjectAfterScan(
  projectId: number,
  scanId: number,
  status: string,
  finishedAt: Date,
  commitSha: string | null,
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

  db.update(projects)
    .set({
      lastScanId: scanId,
      lastScanAt: finishedAt,
      lastScanStatus: status,
      countVulnCritical: bySeverity['critical'] ?? 0,
      countVulnHigh: bySeverity['high'] ?? 0,
      countVulnMedium: bySeverity['medium'] ?? 0,
      countVulnLow: bySeverity['low'] ?? 0,
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
