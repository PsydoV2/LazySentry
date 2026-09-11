// Dashboard grid (docs/CONCEPT.md 8.1): header with import + global state,
// project cards sorted by urgency, empty state for a fresh instance.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImportDialog } from '../components/ImportDialog';
import { ProjectCard } from '../components/ProjectCard';
import { api, type CurrentUser, type Project } from '../lib/api';
import { sortByUrgency } from '../lib/card-state';
import { useScanEvents } from '../lib/events';
import { relativeTime } from '../lib/format';
import type { Route } from '../lib/router';

export function Dashboard({
  user,
  onSignedOut,
  navigate,
}: {
  user: CurrentUser;
  onSignedOut: () => void;
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

  const signOut = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: onSignedOut,
  });

  const sorted = projects.data ? sortByUrgency(projects.data) : undefined;
  const lastScan = sorted
    ?.map((project) => project.lastScanAt)
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)[0];

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <h1>LazySentry</h1>
          <span className="subtle">
            {sorted &&
              `${sorted.length} project${sorted.length === 1 ? '' : 's'}` +
                (lastScan ? ` · last scan ${relativeTime(lastScan)}` : '')}
          </span>
        </div>
        <div className="row">
          <span className="subtle">{user.username}</span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setImporting(true)}
          >
            Import project
          </button>
          <button
            type="button"
            className="btn-quiet"
            onClick={() => signOut.mutate()}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="page stack">
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
                scanDisabled={triggerScan.isPending}
              />
            ))}
          </div>
        )}
      </main>

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </>
  );
}
