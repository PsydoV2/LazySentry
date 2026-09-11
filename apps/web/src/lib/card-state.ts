// Card state and urgency derivation (docs/CONCEPT.md 8.1). Kept separate
// from the component so the grid can sort by it without re-deriving it.

import type { Project } from '@lazysentry/shared';

export type CardState =
  | 'never_scanned'
  | 'queued'
  | 'scanning'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed';

export function cardStateFor(project: Project): CardState {
  if (project.scanState === 'running') return 'scanning';
  if (project.scanState === 'queued') return 'queued';
  if (project.lastScanStatus === null) return 'never_scanned';
  if (project.lastScanStatus === 'failed') return 'failed';
  if (project.lastScanStatus === 'completed_with_warnings') {
    return 'completed_with_warnings';
  }
  return 'completed';
}

/**
 * Lower is more urgent. Card color follows this, not raw severity (8.1): a
 * verified secret always outranks a pile of critical CVEs. States without a
 * finished scan to judge (never scanned, still running, failed) are ranked
 * below anything with an actual result, but a failure still needs a look
 * sooner than "not scanned yet".
 */
export function urgencyRank(project: Project, state: CardState): number {
  if (state === 'completed' || state === 'completed_with_warnings') {
    if (project.countSecretsVerified > 0) return 0;
    if (project.countVulnCritical > 0) return 1;
    const otherFindings =
      project.countVulnHigh +
      project.countVulnMedium +
      project.countVulnLow +
      project.countOutdatedMajor +
      project.countOutdatedMinor +
      project.countOutdatedPatch +
      project.countSecretsUnknown;
    if (otherFindings > 0) return 2;
    return 3; // clean
  }
  if (state === 'failed') return 4;
  if (state === 'scanning' || state === 'queued') return 5;
  return 6; // never_scanned
}

export function sortByUrgency(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const rankDiff =
      urgencyRank(a, cardStateFor(a)) - urgencyRank(b, cardStateFor(b));
    if (rankDiff !== 0) return rankDiff;
    return (b.lastScanAt ?? 0) - (a.lastScanAt ?? 0);
  });
}
