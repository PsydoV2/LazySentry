// Fleet pulse (docs/CONCEPT.md 2.2): a single narrow strip on the dashboard
// instead of a dedicated trends page — deliberately no permanent nav item.
// The finding count and sustainability bar are live (computed from the same
// `projects` list the dashboard grid already fetched); only the sparkline's
// shape needs history, from the lightweight daily fleet snapshot. Clicking
// "Open trends" is the only way to reach the fuller two-chart view.

import { useQuery } from '@tanstack/react-query';
import type { FleetTrendPoints, Project } from '@lazysentry/shared';
import { sustainabilityStatusFor } from '@lazysentry/shared';
import { api } from '../lib/api';
import { linePath } from '../lib/stacked-area';
import type { Route } from '../lib/router';
import { IconChevronRight, IconTrendingUp } from './icons';

const SPARKLINE_WIDTH = 140;
const SPARKLINE_HEIGHT = 36;

const SUSTAIN_COLOR: Record<string, string> = {
  active: 'var(--signal-ok)',
  aging: 'var(--signal-medium)',
  stale: 'var(--text-subtle)',
  dead: 'var(--signal-critical)',
  unknown: 'var(--border-strong)',
};

export function FleetPulseStrip({
  projects,
  navigate,
}: {
  projects: Project[];
  navigate: (route: Route) => void;
}) {
  const trends = useQuery({
    queryKey: ['fleet-trends', '30d'],
    queryFn: () => api.get<FleetTrendPoints>('/api/fleet/trends?range=30d'),
    staleTime: 60_000,
  });

  const totalOpen = projects.reduce(
    (sum, p) => sum + p.countVulnCritical + p.countVulnHigh + p.countVulnMedium + p.countVulnLow,
    0,
  );

  const points = trends.data?.points ?? [];
  const hasHistory = points.length >= 2;
  const sparklineTotals = points.map(
    (p) => p.countVulnCritical + p.countVulnHigh + p.countVulnMedium + p.countVulnLow,
  );
  const delta = hasHistory ? totalOpen - sparklineTotals[0]! : null;

  const sustainCounts: Record<string, number> = {
    active: 0,
    aging: 0,
    stale: 0,
    dead: 0,
    unknown: 0,
  };
  for (const project of projects) {
    sustainCounts[sustainabilityStatusFor(project.lastCommitAt)]! += 1;
  }
  const sustainTotal = projects.length || 1;
  const notableSustain = ['stale', 'dead']
    .filter((status) => sustainCounts[status]! > 0)
    .map((status) => `${sustainCounts[status]} ${status}`)
    .join(', ');

  return (
    <div className="fleet-pulse">
      <div className="fleet-pulse-left">
        <div className="fleet-pulse-block">
          <span className="fleet-pulse-label">Fleet pulse</span>
          <span className="fleet-pulse-sublabel">last 30 days</span>
        </div>

        <div className="fleet-pulse-block fleet-pulse-sparkline-block">
          {hasHistory ? (
            <svg
              width={SPARKLINE_WIDTH}
              height={SPARKLINE_HEIGHT}
              viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
              role="img"
              aria-label={`${totalOpen} open findings fleet-wide`}
            >
              <polyline
                points={linePath(sparklineTotals, SPARKLINE_WIDTH, SPARKLINE_HEIGHT)}
                fill="none"
                stroke="var(--signal-critical)"
                strokeWidth={1.6}
              />
            </svg>
          ) : (
            <span className="subtle">Collecting trend data…</span>
          )}
          <div className="fleet-pulse-count">
            <strong>
              {totalOpen} open finding{totalOpen === 1 ? '' : 's'}
            </strong>
            {delta !== null && (
              <span className={delta <= 0 ? 'fleet-pulse-delta-down' : 'fleet-pulse-delta-up'}>
                {delta > 0 ? '+' : ''}
                {delta} this month
              </span>
            )}
          </div>
        </div>

        <div className="fleet-pulse-divider" aria-hidden="true" />

        <div className="fleet-pulse-block fleet-pulse-sustain-block">
          <div className="fleet-pulse-sustain-bar">
            {Object.entries(sustainCounts)
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <span
                  key={status}
                  style={{ width: `${(count / sustainTotal) * 100}%`, background: SUSTAIN_COLOR[status] }}
                />
              ))}
          </div>
          <span className="subtle">{notableSustain || 'All active'}</span>
        </div>
      </div>

      <div className="fleet-pulse-right">
        <button
          type="button"
          className="fleet-pulse-link"
          onClick={() => navigate({ name: 'trends' })}
        >
          <IconTrendingUp />
          Open trends
          <IconChevronRight />
        </button>
      </div>
    </div>
  );
}
