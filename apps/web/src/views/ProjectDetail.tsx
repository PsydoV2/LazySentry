// Project detail view (docs/CONCEPT.md 8.2): Overview · Dependencies ·
// Secrets · Settings. Opens as a centered modal over the dashboard rather
// than navigating to a new page (the route still changes underneath, so
// deep links and the back button keep working — see App.tsx).

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DependenciesTab } from '../components/DependenciesTab';
import { Modal } from '../components/Modal';
import { OverviewTab } from '../components/OverviewTab';
import { SecretsTab } from '../components/SecretsTab';
import { SettingsTab } from '../components/SettingsTab';
import { api, ApiError, type Project } from '../lib/api';
import { useScanEvents } from '../lib/events';
import { PROJECT_TABS, type ProjectTab } from '../lib/router';

const TAB_LABEL: Record<ProjectTab, string> = {
  overview: 'Overview',
  dependencies: 'Dependencies',
  secrets: 'Secrets',
  settings: 'Settings',
};

export function ProjectDetail({
  projectId,
  initialTab,
  onClose,
}: {
  projectId: number;
  initialTab?: ProjectTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ProjectTab>(initialTab ?? 'overview');

  // Scan progress arrives over SSE here too — an open detail modal must
  // reflect a running scan without a manual refresh (3.5).
  useScanEvents();

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get<Project>(`/api/projects/${projectId}`),
  });

  if (project.isLoading) {
    return (
      <Modal title="Loading…" onClose={onClose}>
        <p className="muted">Loading…</p>
      </Modal>
    );
  }

  if (project.isError || !project.data) {
    return (
      <Modal title="Project" onClose={onClose}>
        <p className="notice notice-error">
          {project.error instanceof ApiError
            ? project.error.message
            : 'Could not load this project.'}
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title={project.data.name}
      subtitle={project.data.fullName}
      onClose={onClose}
      tabs={
        <div className="tabs">
          {PROJECT_TABS.map((value) => (
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
      }
    >
      {tab === 'overview' && <OverviewTab project={project.data} />}
      {tab === 'dependencies' && <DependenciesTab project={project.data} />}
      {tab === 'secrets' && <SecretsTab project={project.data} />}
      {tab === 'settings' && (
        <SettingsTab project={project.data} onRemoved={onClose} />
      )}
    </Modal>
  );
}
