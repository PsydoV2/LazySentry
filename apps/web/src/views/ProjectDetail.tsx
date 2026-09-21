// Project detail view (docs/CONCEPT.md 8.2): Overview · Dependencies ·
// Secrets · Settings. Opens as a centered modal over the dashboard rather
// than navigating to a new page (the route still changes underneath, so
// deep links and the back button keep working — see App.tsx).

import { useState, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DependenciesTab } from '../components/DependenciesTab';
import {
  IconGithub,
  IconHistory,
  IconKey,
  IconLock,
  IconPackage,
  IconSettings,
} from '../components/icons';
import { Modal } from '../components/Modal';
import { OverviewTab } from '../components/OverviewTab';
import { SecretsTab } from '../components/SecretsTab';
import { SettingsTab } from '../components/SettingsTab';
import { SustainabilityBadge } from '../components/SustainabilityBadge';
import { api, ApiError, type Project } from '../lib/api';
import { cardStateFor, urgencyRank } from '../lib/card-state';
import { useScanEvents } from '../lib/events';
import { relativeTime } from '../lib/format';
import { PROJECT_TABS, type ProjectTab } from '../lib/router';

const TAB_LABEL: Record<ProjectTab, string> = {
  overview: 'Overview',
  dependencies: 'Dependencies',
  secrets: 'Secrets',
  settings: 'Settings',
};

const TAB_ICON: Record<ProjectTab, ComponentType<{ className?: string }>> = {
  overview: IconHistory,
  dependencies: IconPackage,
  secrets: IconKey,
  settings: IconSettings,
};

/** Count badge next to a nav item — how many things in that tab might need
 * a look, not a total inventory (e.g. up-to-date packages don't count). */
function tabBadge(project: Project, tab: ProjectTab): number {
  if (tab === 'dependencies') {
    return (
      project.countVulnCritical +
      project.countVulnHigh +
      project.countVulnMedium +
      project.countVulnLow
    );
  }
  if (tab === 'secrets') {
    return project.countSecretsVerified + project.countSecretsUnknown;
  }
  return 0;
}

// Same urgency ranking the dashboard card colors by (lib/card-state) and the
// same wording its status glyph uses — the sidebar pill is a compact version
// of that same at-a-glance read, not a separate judgment.
const URGENCY_PILL_CLASS: Record<number, string> = {
  0: 'pill-critical',
  1: 'pill-critical',
  2: 'pill-info',
  3: 'pill-ok',
  4: 'pill-critical',
  5: 'pill-neutral',
  6: 'pill-neutral',
};

function statusPillLabel(project: Project): string {
  const state = cardStateFor(project);
  if (state === 'scanning') return 'Scanning…';
  if (state === 'queued') return 'Queued';
  if (state === 'never_scanned') return 'Not scanned yet';
  if (state === 'failed') return 'Scan failed';
  if (state === 'cancelled') return 'Scan cancelled';
  if (project.countSecretsVerified > 0) {
    return `${project.countSecretsVerified} verified secret${project.countSecretsVerified === 1 ? '' : 's'}`;
  }
  if (project.countVulnCritical > 0) {
    return `${project.countVulnCritical} critical vulnerabilit${project.countVulnCritical === 1 ? 'y' : 'ies'}`;
  }
  const otherFindings =
    project.countVulnHigh +
    project.countVulnMedium +
    project.countVulnLow +
    project.countOutdatedMajor +
    project.countOutdatedMinor +
    project.countOutdatedPatch +
    project.countSecretsUnknown;
  if (otherFindings > 0) return 'Needs attention';
  return state === 'completed_with_warnings' ? 'Completed with warnings' : 'All clear';
}

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

  const state = cardStateFor(project.data);
  const rank = urgencyRank(project.data, state);

  return (
    <Modal
      title={project.data.name}
      onClose={onClose}
      wide
      sidebar={
        <>
          <div className="modal-sidebar-head">
            <div className="modal-sidebar-avatar" aria-hidden="true">
              {project.data.isPrivate ? <IconLock /> : <IconGithub />}
            </div>
            <div className="stack" style={{ gap: 2 }}>
              <h2 title={project.data.name}>{project.data.name}</h2>
              <span className="subtle" title={project.data.fullName}>
                {project.data.fullName}
              </span>
            </div>
            <span className={`pill ${URGENCY_PILL_CLASS[rank]}`}>
              {statusPillLabel(project.data)}
            </span>
          </div>
          <nav className="modal-nav">
            {PROJECT_TABS.map((value) => {
              const Icon = TAB_ICON[value];
              const badge = tabBadge(project.data, value);
              return (
                <button
                  key={value}
                  type="button"
                  className={`modal-nav-item ${tab === value ? 'is-active' : ''}`}
                  onClick={() => setTab(value)}
                >
                  <Icon className="modal-nav-icon" />
                  {TAB_LABEL[value]}
                  {badge > 0 && <span className="modal-nav-badge">{badge}</span>}
                </button>
              );
            })}
          </nav>
          <div className="modal-sidebar-meta">
            <span className="row" style={{ gap: 6 }}>
              {project.data.lastScanAt
                ? `Last scan ${relativeTime(project.data.lastScanAt)}`
                : 'Not scanned yet'}
            </span>
            <SustainabilityBadge status={project.data.sustainabilityStatus} />
            {project.data.repoUrl && (
              // Generic repo glyph, not a GitHub-specific claim — a Project
              // carries no provider field (ProjectCard makes the same call
              // for its own icon), so this reads right for any host.
              <a
                href={project.data.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="modal-repo-link"
              >
                <IconGithub />
                View repository
              </a>
            )}
          </div>
        </>
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
