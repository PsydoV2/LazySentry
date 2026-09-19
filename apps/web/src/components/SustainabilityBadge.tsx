// Sustainability/dead-project signal (docs/CONCEPT.md 2.2): purely
// informational, never part of the card's urgency color (8.0/8.1 reserve
// color for severity/status) — a neutral pill, and only from `stale` on, so
// an actively maintained project shows nothing extra.

import type { SustainabilityStatus } from '@lazysentry/shared';
import { IconClock } from './icons';

const LABEL: Partial<Record<SustainabilityStatus, string>> = {
  stale: 'Inactive 1y+',
  dead: 'Inactive 2y+',
};

export function SustainabilityBadge({ status }: { status: SustainabilityStatus }) {
  const label = LABEL[status];
  if (!label) return null;
  return (
    <span className="pill pill-neutral" title="No commits on the default branch in a while">
      <IconClock className="pill-icon" />
      {label}
    </span>
  );
}
