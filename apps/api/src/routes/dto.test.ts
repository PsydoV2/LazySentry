import { describe, expect, it } from 'vitest';
import { toProjectDto, toScanDto, toSecretDto, toVulnerabilityDto } from './dto.js';
import type { packages, projects, scans, secrets, vulnerabilities } from '../db/schema.js';

const scannedAt = new Date('2026-09-11T10:00:00.000Z');

const projectRow: typeof projects.$inferSelect = {
  id: 1,
  gitAccountId: 1,
  providerRepoId: '42',
  name: 'demo',
  fullName: 'acme/demo',
  defaultBranch: 'main',
  cloneUrl: 'https://github.com/acme/demo',
  isPrivate: false,
  addedAt: new Date('2026-09-01T00:00:00.000Z'),
  scanSecretsEnabled: true,
  verifySecretsEnabled: false,
  lastScanId: 7,
  lastScanAt: scannedAt,
  lastScanStatus: 'completed',
  countVulnCritical: 1,
  countVulnHigh: 2,
  countVulnMedium: 3,
  countVulnLow: 4,
  countSecretsVerified: 1,
  countSecretsUnknown: 2,
  countOutdatedMajor: 5,
  countOutdatedMinor: 6,
  countOutdatedPatch: 7,
  lastScannedCommitSha: 'abc123',
};

describe('response mapping', () => {
  it('sends timestamps as epoch milliseconds, not Date objects', () => {
    const dto = toProjectDto(projectRow, 'idle');

    // Returning the row as-is would serialize to an ISO string, which every
    // consumer would then have to parse (docs/CONCEPT.md 3.4).
    expect(dto.lastScanAt).toBe(scannedAt.getTime());
    expect(dto.addedAt).toBe(projectRow.addedAt.getTime());
    expect(JSON.parse(JSON.stringify(dto)).lastScanAt).toBe(scannedAt.getTime());
  });

  it('keeps a never-scanned project distinguishable from a clean one', () => {
    const dto = toProjectDto(
      { ...projectRow, lastScanId: null, lastScanAt: null, lastScanStatus: null },
      'queued',
    );
    expect(dto.lastScanAt).toBeNull();
    expect(dto.lastScanStatus).toBeNull();
    expect(dto.scanState).toBe('queued');
  });

  it('never exposes the clone url or account id of a project', () => {
    const dto = toProjectDto(projectRow, 'idle') as Record<string, unknown>;
    expect(dto['cloneUrl']).toBeUndefined();
    expect(dto['gitAccountId']).toBeUndefined();
  });

  it('carries per-scanner status so a partial scan stays visible', () => {
    const scanRow: typeof scans.$inferSelect = {
      id: 7,
      projectId: 1,
      status: 'completed_with_warnings',
      depsStatus: 'completed_empty',
      secretsStatus: 'completed',
      startedAt: scannedAt,
      finishedAt: scannedAt,
      commitSha: 'abc123',
      trigger: 'manual',
      scannerVersions: { 'osv-scanner': '2.5.1' },
      errorCode: null,
      errorMessage: null,
      durationMs: 1234,
    };
    const dto = toScanDto(scanRow);

    expect(dto.depsStatus).toBe('completed_empty');
    expect(dto.secretsStatus).toBe('completed');
    expect(dto.startedAt).toBe(scannedAt.getTime());
    expect(dto.scannerVersions).toEqual({ 'osv-scanner': '2.5.1' });
  });

  it('names the package a vulnerability was found in, and tolerates a missing one', () => {
    const vulnRow: typeof vulnerabilities.$inferSelect = {
      id: 3,
      projectId: 1,
      packageId: 9,
      osvId: 'GHSA-xxxx',
      aliases: ['CVE-2026-0001'],
      severity: 'high',
      cvssScore: 8.1,
      summary: 'Prototype pollution',
      fixedVersion: '2.0.1',
      publishedAt: scannedAt,
      fingerprint: 'fp',
      status: 'open',
      firstSeenScanId: 7,
      lastSeenScanId: 7,
      resolvedScanId: null,
      resolvedAt: null,
    };
    const packageRow: Pick<
      typeof packages.$inferSelect,
      'name' | 'ecosystem' | 'versionInstalled'
    > = { name: 'lodash', ecosystem: 'npm', versionInstalled: '1.0.0' };

    const withPackage = toVulnerabilityDto(vulnRow, packageRow);
    expect(withPackage.packageName).toBe('lodash');
    expect(withPackage.packageVersion).toBe('1.0.0');
    expect(withPackage.publishedAt).toBe(scannedAt.getTime());

    // The package snapshot is per scan and may be gone for an old finding.
    const withoutPackage = toVulnerabilityDto(vulnRow, null);
    expect(withoutPackage.packageName).toBeNull();
    expect(withoutPackage.osvId).toBe('GHSA-xxxx');
  });

  it('exposes only the masked secret preview, never a fingerprint', () => {
    const secretRow: typeof secrets.$inferSelect = {
      id: 2,
      projectId: 1,
      detectorType: 'AWS',
      filePath: 'config/dev.env',
      commitSha: 'deadbeef',
      line: 12,
      isVerified: true,
      redacted: 'AKIA…IFXG',
      fingerprint: 'fp',
      status: 'open',
      commitAuthor: 'Someone <someone@example.test>',
      commitDate: scannedAt,
      firstSeenScanId: 7,
      lastSeenScanId: 7,
      resolvedScanId: null,
      resolvedAt: null,
    };
    const dto = toSecretDto(secretRow) as Record<string, unknown>;

    expect(dto['redacted']).toBe('AKIA…IFXG');
    expect(dto['fingerprint']).toBeUndefined();
    expect(dto['commitDate']).toBe(scannedAt.getTime());
  });
});
