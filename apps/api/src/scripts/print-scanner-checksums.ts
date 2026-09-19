// Release helper for docs/CONCEPT.md 2.2/6.2: hashes the scanner binaries
// actually present at OSV_SCANNER_PATH/TRUFFLEHOG_PATH and prints a
// ready-to-paste SCANNER_CHECKSUMS object. Run this against the *built*
// runtime image — not locally — so the pinned checksum matches the exact
// artifact the image ships, e.g.:
//
//   docker build -t lazysentry:checksum-check .
//   docker run --rm --entrypoint node lazysentry:checksum-check \
//     dist/scripts/print-scanner-checksums.js
//
// Paste the result into apps/api/src/scanner/versions.ts (SCANNER_CHECKSUMS)
// whenever SCANNER_VERSIONS or the Dockerfile's pinned image tags change.

import { config } from '../config.js';
import { checkScannerChecksums } from '../scanner/checksum.js';
import { SCANNER_VERSIONS } from '../scanner/versions.js';

const results = await checkScannerChecksums([
  { name: 'osv-scanner', binaryPath: config.OSV_SCANNER_PATH },
  { name: 'trufflehog', binaryPath: config.TRUFFLEHOG_PATH },
]);

console.log(`# Pinned versions: ${JSON.stringify(SCANNER_VERSIONS)}`);
console.log('export const SCANNER_CHECKSUMS = {');
for (const result of results) {
  if (result.status === 'binary_not_found') {
    console.error(`  // ${result.name}: binary not found — is it on PATH?`);
    continue;
  }
  console.log(`  '${result.name}': '${result.actual}',`);
}
console.log('} as const;');
