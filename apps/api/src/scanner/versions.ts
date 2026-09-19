// Pinned scanner versions — single source of truth, shown in the UI and
// recorded in scans.scanner_versions (docs/CONCEPT.md 3.2). The Dockerfile
// must copy exactly these versions.

export const SCANNER_VERSIONS = {
  'osv-scanner': '2.5.1',
  trufflehog: '3.97.4',
} as const;

/**
 * SHA-256 of the binaries actually copied into the runtime image for the
 * versions above (docs/CONCEPT.md 2.2, 6.2) — checked at worker startup
 * (scanner/checksum.ts) against what is on disk. Deliberately pinned to the
 * artifact this image actually ships (compute it from the built image with
 * `scripts/print-scanner-checksums.ts`), not to a vendor-published release
 * checksum for a different build target — those are not guaranteed to be
 * byte-identical to the binary embedded in a given ghcr.io image tag.
 *
 * Left unset here on purpose: filling in a value that was never verified
 * against this project's own build would be worse than no check at all —
 * a false "verified" is exactly the "falsches Grün" rule 11 forbids. Update
 * this whenever SCANNER_VERSIONS/Dockerfile pins change (release checklist).
 * Until a version has an entry, checkScannerChecksums logs a visible warning
 * instead of silently skipping the check.
 */
export const SCANNER_CHECKSUMS: Partial<Record<keyof typeof SCANNER_VERSIONS, string>> = {
  // 'osv-scanner': 'sha256 of /usr/local/bin/osv-scanner in the built image',
  // trufflehog: 'sha256 of /usr/local/bin/trufflehog in the built image',
};
