// Pinned scanner versions — single source of truth, shown in the UI and
// recorded in scans.scanner_versions (docs/CONCEPT.md 3.2). The Dockerfile
// must copy exactly these versions.

export const SCANNER_VERSIONS = {
  'osv-scanner': '2.5.1',
  // trufflehog is added in implementation step 4
} as const;
