// Fleet-wide trend charts (docs/CONCEPT.md 2.2): deliberately two charts,
// not a general analytics page — severity burndown and sustainability-status
// distribution, both fleet-wide and both sourced from the daily snapshots
// scan/fleet-snapshot.ts captures. Opens as a modal over the dashboard, the
// same pattern as Settings and the audit log, reached from the dashboard's
// "Open trends" link rather than any permanent nav item.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FleetTrendPoint, FleetTrendPoints, FleetTrendsRange } from '@lazysentry/shared';
import { Modal } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { stackedAreaPaths } from '../lib/stacked-area';

const RANGES: { value: FleetTrendsRange; label: string }[] = [
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' },
];

const CHART_WIDTH = 560;
const CHART_HEIGHT = 180;

function dateLabel(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return new Date(2000, (month ?? 1) - 1, day ?? 1).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function FleetTrends({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState<FleetTrendsRange>('90d');

  const trends = useQuery({
    queryKey: ['fleet-trends', range],
    queryFn: () => api.get<FleetTrendPoints>(`/api/fleet/trends?range=${range}`),
  });

  const points = trends.data?.points ?? [];

  return (
    <Modal
      title="Fleet trends"
      subtitle="Severity burndown and sustainability status, fleet-wide, over time — sampled once a day."
      onClose={onClose}
    >
      <div className="stack" style={{ gap: 'var(--space-5)' }}>
        <div className="fleet-trends-range" role="group" aria-label="Time range">
          {RANGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`fleet-trends-range-btn ${range === value ? 'is-active' : ''}`}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {trends.isLoading && <p className="muted">Loading…</p>}
        {trends.isError && (
          <p className="notice notice-error">
            {trends.error instanceof ApiError
              ? trends.error.message
              : 'Could not load fleet trends.'}
          </p>
        )}

        {trends.data && points.length < 2 && (
          <p className="subtle">
            Not enough history yet — a snapshot is captured once a day, starting the day this
            shipped. Check back tomorrow.
          </p>
        )}

        {trends.data && points.length >= 2 && (
          <>
            <SeverityBurndownChart points={points} />
            <SustainabilityDistributionChart points={points} />
          </>
        )}
      </div>
    </Modal>
  );
}

const SEVERITY_SERIES: { key: keyof FleetTrendPoint; label: string; color: string }[] = [
  { key: 'countVulnCritical', label: 'Critical', color: 'var(--signal-critical)' },
  { key: 'countVulnHigh', label: 'High', color: 'var(--signal-high)' },
  { key: 'countVulnMedium', label: 'Medium', color: 'var(--signal-medium)' },
  { key: 'countVulnLow', label: 'Low', color: 'var(--text-subtle)' },
];

function SeverityBurndownChart({ points }: { points: FleetTrendPoint[] }) {
  const series = SEVERITY_SERIES.map(({ key }) => points.map((p) => p[key] as number));
  const paths = stackedAreaPaths(series, CHART_WIDTH, CHART_HEIGHT);
  const latest = points[points.length - 1]!;
  const totalNow =
    latest.countVulnCritical + latest.countVulnHigh + latest.countVulnMedium + latest.countVulnLow;

  return (
    <div className="fleet-chart">
      <div className="fleet-chart-head">
        <h3>Severity burndown</h3>
        <span className="subtle">Open vulnerabilities across all projects</span>
      </div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="fleet-chart-svg" role="img"
        aria-label={`${totalNow} open vulnerabilities today`}>
        {paths.map((d, i) => (
          <path key={SEVERITY_SERIES[i]!.key} d={d} fill={SEVERITY_SERIES[i]!.color} opacity={0.85} />
        ))}
      </svg>
      <div className="fleet-chart-axis">
        <span>{dateLabel(points[0]!.date)}</span>
        <span>{dateLabel(points[points.length - 1]!.date)}</span>
      </div>
      <div className="fleet-chart-legend">
        {SEVERITY_SERIES.map(({ key, label, color }) => (
          <span key={key} className="fleet-chart-legend-item">
            <span className="fleet-chart-legend-dot" style={{ background: color }} />
            {label} ({latest[key] as number})
          </span>
        ))}
      </div>
    </div>
  );
}

const SUSTAINABILITY_SERIES: { key: keyof FleetTrendPoint; label: string; color: string }[] = [
  { key: 'countSustainActive', label: 'Active', color: 'var(--signal-ok)' },
  { key: 'countSustainAging', label: 'Aging', color: 'var(--signal-medium)' },
  { key: 'countSustainStale', label: 'Stale', color: 'var(--text-subtle)' },
  { key: 'countSustainDead', label: 'Dead', color: 'var(--signal-critical)' },
  { key: 'countSustainUnknown', label: 'Unknown', color: 'var(--border-strong)' },
];

function SustainabilityDistributionChart({ points }: { points: FleetTrendPoint[] }) {
  const series = SUSTAINABILITY_SERIES.map(({ key }) => points.map((p) => p[key] as number));
  const paths = stackedAreaPaths(series, CHART_WIDTH, CHART_HEIGHT);
  const latest = points[points.length - 1]!;

  return (
    <div className="fleet-chart">
      <div className="fleet-chart-head">
        <h3>Sustainability distribution</h3>
        <span className="subtle">Projects by activity status over time</span>
      </div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="fleet-chart-svg" role="img"
        aria-label="Project sustainability status distribution over time">
        {paths.map((d, i) => (
          <path
            key={SUSTAINABILITY_SERIES[i]!.key}
            d={d}
            fill={SUSTAINABILITY_SERIES[i]!.color}
            opacity={0.85}
          />
        ))}
      </svg>
      <div className="fleet-chart-axis">
        <span>{dateLabel(points[0]!.date)}</span>
        <span>{dateLabel(points[points.length - 1]!.date)}</span>
      </div>
      <div className="fleet-chart-legend">
        {SUSTAINABILITY_SERIES.filter(({ key }) => (latest[key] as number) > 0).map(
          ({ key, label, color }) => (
            <span key={key} className="fleet-chart-legend-item">
              <span className="fleet-chart-legend-dot" style={{ background: color }} />
              {label} ({latest[key] as number})
            </span>
          ),
        )}
      </div>
    </div>
  );
}
