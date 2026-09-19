// Checksum verification of the scanner binaries (docs/CONCEPT.md 2.2, 6.2).
// A mismatch against a pinned checksum is treated as a compromise indicator,
// not a normal operating state — the worker refuses to start rather than
// scanning untrusted repo content with a binary it can no longer vouch for
// (threat model 6.1: the worker is the highest blast-radius process in the
// system). No checksum pinned yet for a version is a visible warning, not a
// silent pass (rule 11 — "kein falsches Grün").

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { SCANNER_CHECKSUMS, SCANNER_VERSIONS } from './versions.js';

export interface ChecksumResult {
  name: keyof typeof SCANNER_VERSIONS;
  status: 'verified' | 'mismatch' | 'unpinned' | 'binary_not_found';
  expected?: string;
  actual?: string;
}

/**
 * Resolves a configured binary path to an actual file to hash. `spawn`
 * already resolves a bare command name against PATH itself when executing
 * it, but hashing needs the resolved file directly — done here in plain JS
 * rather than shelling out to `which` (rule 3: no unnecessary subprocess).
 */
function resolveBinaryPath(binaryPath: string): string | null {
  if (binaryPath.includes('/') || binaryPath.includes(path.sep)) {
    return existsSync(binaryPath) ? binaryPath : null;
  }
  const dirs = (process.env.PATH ?? '').split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir, binaryPath);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export async function checkScannerChecksums(
  binaries: { name: keyof typeof SCANNER_VERSIONS; binaryPath: string }[],
): Promise<ChecksumResult[]> {
  const results: ChecksumResult[] = [];
  for (const { name, binaryPath } of binaries) {
    const expected = SCANNER_CHECKSUMS[name];
    const resolved = resolveBinaryPath(binaryPath);
    if (!resolved) {
      results.push({ name, status: 'binary_not_found' });
      continue;
    }
    // Always computed, even when unpinned: print-scanner-checksums.ts is the
    // tool that produces the value to pin in the first place, and it reuses
    // this same function against an empty SCANNER_CHECKSUMS.
    const actual = await sha256File(resolved);
    if (!expected) {
      results.push({ name, status: 'unpinned', actual });
      continue;
    }
    results.push({
      name,
      status: actual === expected ? 'verified' : 'mismatch',
      expected,
      actual,
    });
  }
  return results;
}
