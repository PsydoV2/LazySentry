// Dashboard grid (docs/CONCEPT.md 8.1): project cards sorted by urgency,
// empty state for a fresh instance. The account/sign-out chrome now lives in
// the floating UserMenu (App.tsx) instead of a top bar.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImportDialog } from '../components/ImportDialog';
import { ProjectCard } from '../components/ProjectCard';
import { api, type Project } from '../lib/api';
import { sortByUrgency } from '../lib/card-state';
import { useScanEvents } from '../lib/events';
import { relativeTime } from '../lib/format';
import type { Route } from '../lib/router';

export function Dashboard({
  navigate,
}: {
  navigate: (route: Route) => void;
}) {
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);

  // Scan progress arrives over SSE instead of being polled (3.5).
  useScanEvents();

  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/api/projects'),
    // Counters refresh over SSE rather than on every tab focus (8.4).
    staleTime: 30_000,
  });

  const triggerScan = useMutation({
    mutationFn: (projectId: number) =>
      api.post(`/api/projects/${projectId}/scans`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const cancelScan = useMutation({
    mutationFn: (projectId: number) =>
      api.post(`/api/projects/${projectId}/scans/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const sorted = projects.data ? sortByUrgency(projects.data) : undefined;
  const lastScan = sorted
    ?.map((project) => project.lastScanAt)
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)[0];

  return (
    <main className="page stack">
      <div className="dashboard-heading">
        <div>
          <h1>Projects</h1>
          <span className="subtle">
            {sorted &&
              `${sorted.length} project${sorted.length === 1 ? '' : 's'}` +
                (lastScan ? ` · last scan ${relativeTime(lastScan)}` : '')}
          </span>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setImporting(true)}
        >
          Import project
        </button>
      </div>

      {projects.isLoading && <p className="muted">Loading…</p>}

      {sorted?.length === 0 && (
        <div className="empty-state stack">
          <h2>No projects yet</h2>
          <p className="muted">Import your first repository to get started.</p>
          <div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setImporting(true)}
            >
              Import project
            </button>
          </div>
        </div>
      )}

      {sorted && sorted.length > 0 && (
        <div className="project-grid">
          {sorted.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => navigate({ name: 'project', id: project.id })}
              onScanNow={() => triggerScan.mutate(project.id)}
              onCancelScan={() => cancelScan.mutate(project.id)}
              scanDisabled={triggerScan.isPending}
            />
          ))}
        </div>
      )}

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </main>
  );
}
