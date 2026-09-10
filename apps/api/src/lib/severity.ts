// Severity classification from a numeric CVSS score, using the standard
// CVSS v3 qualitative rating bands.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export function classifySeverity(cvssScore: number | null | undefined): Severity {
  // Without a score we say "unknown" rather than guessing a band — an
  // unrated finding must not look harmless (docs/CONCEPT.md 11).
  if (cvssScore === null || cvssScore === undefined || !Number.isFinite(cvssScore)) {
    return 'unknown';
  }
  if (cvssScore >= 9.0) return 'critical';
  if (cvssScore >= 7.0) return 'high';
  if (cvssScore >= 4.0) return 'medium';
  if (cvssScore > 0) return 'low';
  return 'unknown';
}
