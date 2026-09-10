// Dashboard shell. The card grid, per-project detail view and empty states
// are built out in implementation step 6 (docs/CONCEPT.md 8.1); this is the
// working list that makes step 3 usable end to end.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImportDialog } from '../components/ImportDialog';
import { api, type CurrentUser, type Project } from '../lib/api';

function relativeTime(timestamp: number | null): string {
  if (timestamp === null) return 'never scanned';
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function Dashboard({
  user,
  onSignedOut,
}: {
  user: CurrentUser;
  onSignedOut: () => void;
}) {
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);

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

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <h1>LazySentry</h1>
          <span className="subtle">
            {projects.data
              ? `${projects.data.length} project${projects.data.length === 1 ? '' : 's'}`
              : ''}
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

        {projects.data?.length === 0 && (
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

        {projects.data && projects.data.length > 0 && (
          <div className="list">
            {projects.data.map((project) => (
              <div key={project.id} className="list-row">
                <div className="stack" style={{ flex: 1, gap: 0 }}>
                  <strong>{project.name}</strong>
                  <span className="subtle">{project.fullName}</span>
                </div>
                <ProjectCounts project={project} />
                <span className="subtle">
                  {relativeTime(project.lastScanAt)}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={triggerScan.isPending}
                  onClick={() => triggerScan.mutate(project.id)}
                >
                  Scan now
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </>
  );
}

function ProjectCounts({ project }: { project: Project }) {
  // Color is urgency, not severity (docs/CONCEPT.md 8.1): an active
  // credential outranks everything else.
  if (project.lastScanStatus === null) {
    return <span className="subtle">not scanned yet</span>;
  }
  const parts: { color: string; label: string }[] = [];
  if (project.countSecretsVerified > 0) {
    parts.push({
      color: 'var(--signal-critical)',
      label: `${project.countSecretsVerified} verified secrets`,
    });
  }
  const vulns =
    project.countVulnCritical +
    project.countVulnHigh +
    project.countVulnMedium +
    project.countVulnLow;
  if (vulns > 0) {
    parts.push({
      color:
        project.countVulnCritical > 0
          ? 'var(--signal-high)'
          : 'var(--signal-info)',
      label: `${vulns} vulnerabilities${
        project.countVulnCritical > 0
          ? ` (${project.countVulnCritical} critical)`
          : ''
      }`,
    });
  }
  if (parts.length === 0) {
    return <span style={{ color: 'var(--signal-ok)' }}>nothing found</span>;
  }
  return (
    <span className="row">
      {parts.map((part) => (
        <span key={part.label} style={{ color: part.color }}>
          {part.label}
        </span>
      ))}
    </span>
  );
}
