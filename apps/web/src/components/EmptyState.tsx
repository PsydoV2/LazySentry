// Shared empty state for tab content (docs/CONCEPT.md 8.0/8.3): a centered
// neutral icon chip with a line of text under it, used wherever a tab has
// nothing to show yet — "not scanned", "nothing found", "no matches". No
// severity color here on purpose, even for a clean "nothing found" result —
// color is reserved for the dashboard's urgency signal (8.1), not repeated
// on every empty tab.

import type { ComponentType, SVGProps } from 'react';

export function EmptyState({
  icon: Icon,
  message,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  message: string;
}) {
  return (
    <div className="tab-empty-state">
      <span className="tab-empty-state-icon" aria-hidden="true">
        <Icon />
      </span>
      <p className="tab-empty-state-text muted">{message}</p>
    </div>
  );
}
