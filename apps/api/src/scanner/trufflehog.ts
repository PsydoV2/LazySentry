// Wrapper around the trufflehog binary. Exit codes are semantic
// (docs/CONCEPT.md 5.6): 183 means "verified credentials found" and is the
// normal success case, not an error.
//
// The raw secret (`Raw` below) is parsed here and handed to the caller in
// memory, but it must never be logged, thrown in an exception message, or
// written anywhere — the caller's only job with it is to compute a
// fingerprint and a redacted preview before discarding it (docs/CONCEPT.md
// 4.3, rule 1). This module itself never logs stdout/stderr content that
// could contain a raw finding.

import { config } from '../config.js';
import { execute } from './exec.js';

/**
 * Builds the `file://` URI trufflehog expects for a local scan directory.
 *
 * Deliberately not `pathToFileURL`: its RFC-8089-correct Windows output
 * (`file:///C:/Users/...`, three slashes) trips a bug in trufflehog's own
 * URL handling — it re-prepends the *scanning process's own* drive letter in
 * front of the path it was given, producing `file://E:/C:/Users/...` when
 * the worker's cwd happens to be on a different drive than scanDir —
 * verified empirically against v3.97.4, not documented upstream. The
 * two-slash form (`file://C:/Users/...`, drive letter directly after the
 * scheme, no extra root slash) does not hit that path and works reliably.
 * scanDir is always an OS-native absolute path from `newScanDir()`, so both
 * branches below are a straight string transform, no URL parsing needed.
 */
export function toTruffleHogUri(scanDir: string): string {
  if (process.platform === 'win32') {
    return `file://${scanDir.replace(/\\/g, '/')}`;
  }
  // POSIX: scanDir already starts with '/', so this is exactly the
  // three-slash RFC-8089 form shown in docs/CONCEPT.md 5.1.
  return `file://${scanDir}`;
}

const TRUFFLEHOG_TIMEOUT_MS = 15 * 60 * 1000;

// Shape of one NDJSON line from `trufflehog git ... --json` (verified
// against v3.97.4). Only the fields we persist are declared.
export interface TruffleHogFinding {
  DetectorName: string;
  Verified: boolean;
  Raw: string;
  SourceMetadata?: {
    Data?: {
      Git?: {
        commit?: string;
        file?: string;
        line?: number;
        email?: string; // "Author Name <email>"
        timestamp?: string;
      };
    };
  };
}

export type TruffleHogOutcome =
  | { kind: 'completed'; findings: TruffleHogFinding[] }
  | { kind: 'failed'; message: string };

export interface TruffleHogOptions {
  /** Only scan commits after this one (docs/CONCEPT.md 5.4). Omit for a full-history scan. */
  sinceCommit?: string;
  /** false → `--no-verification`, so no outbound requests to third-party APIs (docs/CONCEPT.md 5.5). */
  verify: boolean;
}

export async function runTruffleHog(
  scanDir: string,
  options: TruffleHogOptions,
): Promise<TruffleHogOutcome> {
  const args = [
    'git',
    toTruffleHogUri(scanDir),
    '--json',
    '--results=verified,unknown',
    // The binary is pinned to an exact version for reproducibility
    // (docs/CONCEPT.md 3.2) — trufflehog's own self-updater must never
    // silently replace it. On Windows this also fails outright with an
    // EBUSY-style "file in use" error since the running process still
    // holds its own executable open.
    '--no-update',
  ];
  if (options.sinceCommit) {
    args.push(`--since-commit=${options.sinceCommit}`);
  }
  if (!options.verify) {
    args.push('--no-verification');
  }

  const result = await execute(config.TRUFFLEHOG_PATH, args, {
    timeoutMs: TRUFFLEHOG_TIMEOUT_MS,
  });

  if (result.spawnError) {
    return {
      kind: 'failed',
      message: `could not start trufflehog (${result.spawnError}); TRUFFLEHOG_PATH=${config.TRUFFLEHOG_PATH}`,
    };
  }
  if (result.timedOut) {
    return { kind: 'failed', message: 'trufflehog timed out' };
  }

  switch (result.exitCode) {
    case 0: // nothing found
    case 183: // verified credentials found — the normal case, not an error
      return { kind: 'completed', findings: parseFindings(result.stdout) };
    default:
      return {
        kind: 'failed',
        // stderr is trufflehog's own diagnostic log, not finding data — safe
        // to include, unlike stdout which may contain raw secrets.
        message: `trufflehog exited with code ${result.exitCode}: ${result.stderr.trim().slice(0, 500)}`,
      };
  }
}

/**
 * trufflehog's `--json` output is NDJSON: one finding object per line.
 * Lines that are not a finding (or fail to parse) are skipped rather than
 * aborting the whole scan on one malformed line.
 */
function parseFindings(stdout: string): TruffleHogFinding[] {
  const findings: TruffleHogFinding[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<TruffleHogFinding>;
      if (typeof parsed.Raw === 'string' && typeof parsed.DetectorName === 'string') {
        findings.push(parsed as TruffleHogFinding);
      }
    } catch {
      // Not a finding line (e.g. a stray log line) — ignore it.
    }
  }
  return findings;
}
