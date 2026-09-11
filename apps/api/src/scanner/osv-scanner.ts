// Wrapper around the osv-scanner binary. Exit codes are semantic
// (docs/CONCEPT.md 5.6): 1 means "vulnerabilities found" and is the normal
// success case, 128 means "no lockfiles found" and is its own state — never
// to be shown as "clean".

import { config } from '../config.js';
import { execute } from './exec.js';

const OSV_TIMEOUT_MS = 10 * 60 * 1000;

// Shape of `osv-scanner --format json` output (verified against v2.5.1).
export interface OsvScannerOutput {
  results?: OsvResult[];
}

export interface OsvResult {
  source: { path: string; type: string };
  packages: OsvPackageEntry[];
}

export interface OsvPackageEntry {
  package: { name: string; version: string; ecosystem: string };
  dependency_groups?: string[];
  groups?: { ids: string[]; aliases?: string[]; max_severity?: string }[];
  vulnerabilities?: OsvVulnerability[];
}

export interface OsvVulnerability {
  id: string;
  aliases?: string[];
  summary?: string;
  published?: string;
  severity?: { type: string; score: string }[];
  affected?: {
    package?: { name?: string; ecosystem?: string };
    ranges?: { type: string; events: { introduced?: string; fixed?: string }[] }[];
  }[];
}

export type OsvScanOutcome =
  | { kind: 'completed'; output: OsvScannerOutput }
  | { kind: 'completed_empty' }
  | { kind: 'failed'; message: string };

export async function runOsvScanner(scanDir: string): Promise<OsvScanOutcome> {
  const result = await execute(
    config.OSV_SCANNER_PATH,
    ['scan', 'source', '-r', scanDir, '--format', 'json', '--all-packages'],
    { timeoutMs: OSV_TIMEOUT_MS },
  );

  if (result.spawnError) {
    // Naming the configured path turns "scan failed" into something the
    // operator can actually act on.
    return {
      kind: 'failed',
      message: `could not start osv-scanner (${result.spawnError}); OSV_SCANNER_PATH=${config.OSV_SCANNER_PATH}`,
    };
  }
  if (result.timedOut) {
    return { kind: 'failed', message: 'osv-scanner timed out' };
  }

  switch (result.exitCode) {
    case 0: // no vulnerabilities
    case 1: {
      // vulnerabilities found — the normal case, not an error
      try {
        return {
          kind: 'completed',
          output: JSON.parse(result.stdout) as OsvScannerOutput,
        };
      } catch {
        return { kind: 'failed', message: 'osv-scanner returned invalid JSON' };
      }
    }
    case 128: // no packages/lockfiles found — a distinct state, not "clean"
      return { kind: 'completed_empty' };
    default:
      return {
        kind: 'failed',
        message: `osv-scanner exited with code ${result.exitCode}: ${result.stderr.trim().slice(0, 500)}`,
      };
  }
}
