// Project detail view (docs/CONCEPT.md 8.2): Overview · Dependencies ·
// Secrets · Settings.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DependenciesTab } from '../components/DependenciesTab';
import { OverviewTab } from '../components/OverviewTab';
import { SecretsTab } from '../components/SecretsTab';
import { SettingsTab } from '../components/SettingsTab';
import { api, ApiError, type Project } from '../lib/api';
import { useScanEvents } from '../lib/events';

const TABS = ['overview', 'dependencies', 'secrets', 'settings'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  dependencies: 'Dependencies',
  secrets: 'Secrets',
  settings: 'Settings',
};

export function ProjectDetail({
  projectId,
  onBack,
}: {
  projectId: number;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');

  // Scan progress arrives over SSE here too — an open detail page must
  // reflect a running scan without a manual refresh (3.5).
  useScanEvents();

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get<Project>(`/api/projects/${projectId}`),
  });

  return (
    <main className="page stack">
      <div>
        <button type="button" className="btn-quiet" onClick={onBack}>
          ← All projects
        </button>
      </div>

      {project.isLoading && <p className="muted">Loading…</p>}

      {project.isError && (
        <p className="notice notice-error">
          {project.error instanceof ApiError
            ? project.error.message
            : 'Could not load this project.'}
        </p>
      )}

      {project.data && (
        <>
          <div className="detail-header">
            <h1>{project.data.name}</h1>
            <span className="subtle">{project.data.fullName}</span>
          </div>

          <div className="tabs">
            {TABS.map((value) => (
              <button
                key={value}
                type="button"
                className={`tab ${tab === value ? 'is-active' : ''}`}
                onClick={() => setTab(value)}
              >
                {TAB_LABEL[value]}
              </button>
            ))}
          </div>

          {tab === 'overview' && <OverviewTab project={project.data} />}
          {tab === 'dependencies' && <DependenciesTab project={project.data} />}
          {tab === 'secrets' && <SecretsTab project={project.data} />}
          {tab === 'settings' && (
            <SettingsTab project={project.data} onRemoved={onBack} />
          )}
        </>
      )}
    </main>
  );
}
