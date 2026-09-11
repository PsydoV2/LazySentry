// Human-readable notes for a scan's per-scanner outcome (docs/CONCEPT.md
// 5.7): "no lockfiles" is the most common non-error state and must never
// read like a clean scan, nor like a red error.

import type { Scan } from '@lazysentry/shared';

export function scanNotes(scan: Scan): string[] {
  if (scan.status === 'failed') {
    return [scan.errorMessage ? `Scan failed: ${scan.errorMessage}` : 'Scan failed'];
  }

  if (scan.status === 'cancelled') return ['Scan cancelled'];

  if (scan.status === 'running') return [];

  // The one combination the spec calls out verbatim.
  if (scan.depsStatus === 'completed_empty' && scan.secretsStatus === 'completed') {
    return [
      'No supported lockfiles found — dependency scanning skipped. Secret scanning completed.',
    ];
  }

  const notes: string[] = [];
  if (scan.depsStatus === 'completed_empty') {
    notes.push('No supported lockfiles found — dependency scanning skipped.');
  } else if (scan.depsStatus === 'failed') {
    notes.push('Dependency scanning failed.');
  } else if (scan.depsStatus === 'skipped') {
    notes.push('Dependency scanning skipped.');
  }

  if (scan.secretsStatus === 'failed') {
    notes.push('Secret scanning failed.');
  } else if (scan.secretsStatus === 'skipped') {
    notes.push('Secret scanning skipped.');
  }

  return notes;
}
