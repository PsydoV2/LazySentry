// Overview tab (docs/CONCEPT.md 8.2): scan history plus a manual trigger.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project } from '@lazysentry/shared';
import { api, ApiError, type Scan } from '../lib/api';
import { formatDateTime, formatDuration, relativeTime, shortSha } from '../lib/format';
import { scanNotes } from '../lib/scan-messages';
import { SustainabilityBadge } from './SustainabilityBadge';

export function OverviewTab({ project }: { project: Project }) {
  const queryClient = useQueryClient();

  const scans = useQuery({
    queryKey: ['project', project.id, 'scans'],
    queryFn: () => api.get<Scan[]>(`/api/projects/${project.id}/scans`),
  });

  const triggerScan = useMutation({
    mutationFn: () => api.post(`/api/projects/${project.id}/scans`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const latest = scans.data?.[0];

  return (
    <div className="stack">
      <div className="card stack">
        <div className="spread">
          <div className="stack" style={{ gap: 4 }}>
            <h2>Latest scan</h2>
            {latest ? (
              <span className="subtle">
                Commit {shortSha(latest.commitSha)} · {formatDateTime(latest.startedAt)}
                {latest.scannerVersions &&
                  ` · ${Object.entries(latest.scannerVersions)
                    .map(([tool, version]) => `${tool} ${version}`)
                    .join(', ')}`}
              </span>
            ) : (
              <span className="subtle">This project has not been scanned yet.</span>
            )}
            <span className="row" style={{ gap: 6 }}>
              <span className="subtle">
                Last commit{' '}
                {project.lastCommitAt ? relativeTime(project.lastCommitAt) : 'unknown'}
              </span>
              <SustainabilityBadge status={project.sustainabilityStatus} />
            </span>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={triggerScan.isPending || project.scanState !== 'idle'}
            onClick={() => triggerScan.mutate()}
          >
            {project.scanState === 'idle' ? 'Run scan now' : 'Scan in progress…'}
          </button>
        </div>

        {triggerScan.isError && (
          <p className="notice notice-error">
            {triggerScan.error instanceof ApiError
              ? triggerScan.error.message
              : 'Could not queue a scan'}
          </p>
        )}

        {latest &&
          scanNotes(latest).map((note) => (
            <p
              key={note}
              className={`notice ${
                latest.status === 'failed' ? 'notice-error' : 'notice-warning'
              }`}
            >
              {note}
            </p>
          ))}
      </div>

      <div className="stack">
        <h2>Scan history</h2>
        {scans.isLoading && <p className="muted">Loading…</p>}
        {scans.data?.length === 0 && (
          <p className="muted">No scans yet.</p>
        )}
        {scans.data && scans.data.length > 0 && (
          <div className="list">
            {scans.data.map((scan) => (
              <div key={scan.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                <div className="stack" style={{ flex: 1, gap: 2 }}>
                  <span className="row">
                    <ScanStatusPill scan={scan} />
                    <span className="mono subtle">{shortSha(scan.commitSha)}</span>
                  </span>
                  {scanNotes(scan).map((note) => (
                    <span key={note} className="subtle">
                      {note}
                    </span>
                  ))}
                </div>
                <span className="subtle">{formatDateTime(scan.startedAt)}</span>
                <span className="subtle">{formatDuration(scan.durationMs)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScanStatusPill({ scan }: { scan: Scan }) {
  const { label, className } = {
    running: { label: 'Running', className: 'pill-info' },
    completed: { label: 'Completed', className: 'pill-ok' },
    completed_with_warnings: { label: 'Completed with warnings', className: 'pill-medium' },
    failed: { label: 'Failed', className: 'pill-critical' },
    cancelled: { label: 'Cancelled', className: 'pill-neutral' },
  }[scan.status];
  return <span className={`pill ${className}`}>{label}</span>;
}
