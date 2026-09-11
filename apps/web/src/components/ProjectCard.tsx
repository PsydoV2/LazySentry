// Dashboard grid card (docs/CONCEPT.md 8.1). Color signals urgency, not
// severity — a verified secret is always red regardless of what else the
// project has going on.

import type { Project } from '@lazysentry/shared';
import { cardStateFor, urgencyRank, type CardState } from '../lib/card-state';
import { relativeTime } from '../lib/format';

const STATE_COLOR: Record<number, string> = {
  0: 'var(--signal-critical)',
  1: 'var(--signal-high)',
  2: 'var(--signal-info)',
  3: 'var(--signal-ok)',
  4: 'var(--signal-critical)',
  5: 'var(--border-strong)',
  6: 'var(--border-strong)',
};

function stateLabel(state: CardState, errorMessage: string | null): string {
  switch (state) {
    case 'never_scanned':
      return 'Never scanned';
    case 'queued':
      return 'Queued';
    case 'scanning':
      return 'Scanning…';
    case 'completed_with_warnings':
      return 'Completed with warnings';
    case 'failed':
      return errorMessage ? `Scan failed: ${errorMessage}` : 'Scan failed';
    case 'completed':
      return 'Completed';
  }
}

export function ProjectCard({
  project,
  onOpen,
  onScanNow,
  scanDisabled,
}: {
  project: Project;
  onOpen: () => void;
  onScanNow: () => void;
  scanDisabled: boolean;
}) {
  const state = cardStateFor(project);
  const rank = urgencyRank(project, state);
  const dotColor = STATE_COLOR[rank];
  const isBusy = state === 'queued' || state === 'scanning';

  return (
    <div
      className="project-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen();
      }}
    >
      <div className="project-card-header">
        <div className="project-card-title">
          {isBusy ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <span
              className="status-dot"
              style={{ background: dotColor }}
              aria-hidden="true"
            />
          )}
          <strong title={project.name}>{project.name}</strong>
        </div>
        <button
          type="button"
          className="icon-btn"
          title="Scan now"
          aria-label={`Scan ${project.name} now`}
          disabled={scanDisabled || project.scanState !== 'idle'}
          onClick={(event) => {
            event.stopPropagation();
            onScanNow();
          }}
        >
          ⋯
        </button>
      </div>

      <span className="subtle">{project.fullName}</span>

      <div className="project-card-findings">
        <FindingLines project={project} state={state} />
      </div>

      <span
        className="project-card-footer"
        title={
          state === 'failed'
            ? stateLabel(state, project.lastScanErrorMessage)
            : undefined
        }
      >
        {state === 'queued' || state === 'scanning'
          ? stateLabel(state, null)
          : state === 'never_scanned'
            ? 'Added ' + relativeTime(project.addedAt)
            : `Last scan ${relativeTime(project.lastScanAt)}`}
      </span>
    </div>
  );
}

function FindingLines({
  project,
  state,
}: {
  project: Project;
  state: CardState;
}) {
  if (state === 'never_scanned') {
    return <span className="muted">Not scanned yet</span>;
  }
  if (state === 'failed') {
    return (
      <span style={{ color: 'var(--signal-critical)' }}>
        {project.lastScanErrorMessage ?? 'Scan failed'}
      </span>
    );
  }

  const lines: { color: string; label: string }[] = [];
  if (project.countSecretsVerified > 0) {
    lines.push({
      color: 'var(--signal-critical)',
      label: `${project.countSecretsVerified} verified secret${
        project.countSecretsVerified === 1 ? '' : 's'
      }`,
    });
  }
  const vulns =
    project.countVulnCritical +
    project.countVulnHigh +
    project.countVulnMedium +
    project.countVulnLow;
  if (vulns > 0) {
    lines.push({
      color:
        project.countVulnCritical > 0
          ? 'var(--signal-high)'
          : 'var(--signal-info)',
      label: `${vulns} vulnerabilit${vulns === 1 ? 'y' : 'ies'}${
        project.countVulnCritical > 0
          ? ` (${project.countVulnCritical} critical)`
          : ''
      }`,
    });
  }
  const outdated =
    project.countOutdatedMajor +
    project.countOutdatedMinor +
    project.countOutdatedPatch;
  if (outdated > 0) {
    lines.push({
      color: 'var(--signal-info)',
      label: `${outdated} outdated${
        project.countOutdatedMajor > 0
          ? ` (${project.countOutdatedMajor} major)`
          : ''
      }`,
    });
  }
  if (project.countSecretsUnknown > 0) {
    lines.push({
      color: 'var(--signal-medium)',
      label: `${project.countSecretsUnknown} unverified secret${
        project.countSecretsUnknown === 1 ? '' : 's'
      }`,
    });
  }

  if (lines.length === 0) {
    return (
      <span style={{ color: 'var(--signal-ok)' }}>
        {state === 'completed_with_warnings'
          ? 'Nothing found — scan completed with warnings'
          : 'Nothing found'}
      </span>
    );
  }

  return (
    <>
      {lines.map((line) => (
        <span key={line.label} style={{ color: line.color }}>
          {line.label}
        </span>
      ))}
    </>
  );
}
