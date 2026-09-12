// Dashboard grid card (docs/CONCEPT.md 8.1). Color signals urgency, not
// severity — a verified secret is always red regardless of what else the
// project has going on. Portrait 9:16 tile: a status glyph carries the
// at-a-glance read, pills carry the breakdown, icons stand in for labels
// wherever a glance should be enough.

import type { ComponentType, MouseEvent } from 'react';
import type { Project } from '@lazysentry/shared';
import { cardStateFor, urgencyRank, type CardState } from '../lib/card-state';
import { relativeTime } from '../lib/format';
import {
  IconAlertTriangle,
  IconBug,
  IconClock,
  IconFolder,
  IconGithub,
  IconKey,
  IconLock,
  IconMoreHorizontal,
  IconPackage,
  IconPlay,
  IconSettings,
  IconShieldAlert,
  IconShieldCheck,
  IconStop,
} from './icons';

const STATE_COLOR: Record<number, string> = {
  0: 'var(--signal-critical)',
  1: 'var(--signal-high)',
  2: 'var(--signal-info)',
  3: 'var(--signal-ok)',
  4: 'var(--signal-critical)',
  5: 'var(--border-strong)',
  6: 'var(--border-strong)',
};

/** Everything before the first "/" of "owner/repo" — the caption under the name. */
function ownerOf(fullName: string): string {
  const slash = fullName.indexOf('/');
  return slash === -1 ? fullName : fullName.slice(0, slash);
}

export function ProjectCard({
  project,
  onOpen,
  onOpenSettings,
  onScanNow,
  onCancelScan,
  scanDisabled,
}: {
  project: Project;
  onOpen: () => void;
  onOpenSettings: () => void;
  onScanNow: () => void;
  onCancelScan: () => void;
  scanDisabled: boolean;
}) {
  const state = cardStateFor(project);
  const rank = urgencyRank(project, state);
  // rank is always one of the keys STATE_COLOR defines (0-6).
  const accentColor = STATE_COLOR[rank]!;
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
      <div className="project-card-top">
        <div className="project-card-repo">
          <span className="project-card-repo-icon" aria-hidden="true">
            {project.isPrivate ? <IconLock /> : <IconGithub />}
          </span>
          <span className="project-card-repo-text">
            <strong title={project.name}>{project.name}</strong>
            <span className="project-card-owner">{ownerOf(project.fullName)}</span>
          </span>
        </div>

        <div className="project-card-actions">
          <ScanControl
            projectName={project.name}
            isBusy={isBusy}
            disabled={scanDisabled}
            onScan={(event) => {
              event.stopPropagation();
              onScanNow();
            }}
            onCancel={(event) => {
              event.stopPropagation();
              onCancelScan();
            }}
          />
          <button
            type="button"
            className="card-icon-btn"
            title="Project settings"
            aria-label={`Open settings for ${project.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenSettings();
            }}
          >
            <IconSettings />
          </button>
          <button
            type="button"
            className="card-icon-btn"
            title="Open project"
            aria-label={`Open ${project.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          >
            <IconMoreHorizontal />
          </button>
        </div>
      </div>

      <div className="project-card-body">
        <StatusGlyph project={project} state={state} color={accentColor} />
        <div className="project-card-pills">
          <FindingPills project={project} state={state} />
        </div>
      </div>

      <div
        className="project-card-bottom"
        title={
          state === 'failed'
            ? (project.lastScanErrorMessage ?? undefined)
            : undefined
        }
      >
        <IconClock aria-hidden="true" />
        <span>
          {state === 'queued' || state === 'scanning'
            ? state === 'queued'
              ? 'Waiting in queue'
              : 'Scan in progress'
            : state === 'never_scanned'
              ? 'Added ' + relativeTime(project.addedAt)
              : `Last scan ${relativeTime(project.lastScanAt)}`}
        </span>
      </div>
    </div>
  );
}

function ScanControl({
  projectName,
  isBusy,
  disabled,
  onScan,
  onCancel,
}: {
  projectName: string;
  isBusy: boolean;
  disabled: boolean;
  onScan: (event: MouseEvent) => void;
  onCancel: (event: MouseEvent) => void;
}) {
  if (!isBusy) {
    return (
      <button
        type="button"
        className="scan-btn"
        title="Scan now"
        aria-label={`Scan ${projectName} now`}
        disabled={disabled}
        onClick={onScan}
      >
        <IconPlay />
      </button>
    );
  }

  // Hovering the spinner swaps it for a stop control, Jenkins-style — the
  // button itself never moves, only what's inside it.
  return (
    <button
      type="button"
      className="scan-btn scan-btn-busy"
      title="Stop scan"
      aria-label={`Stop scanning ${projectName}`}
      onClick={onCancel}
    >
      <span className="scan-spinner" aria-hidden="true" />
      <IconStop className="scan-stop-icon" />
    </button>
  );
}

const STATE_ICON: Partial<Record<CardState, ComponentType<{ className?: string }>>> = {
  never_scanned: IconFolder,
  failed: IconAlertTriangle,
  cancelled: IconStop,
};

/** Big centered glyph + one-line headline — the card's at-a-glance read. */
function StatusGlyph({
  project,
  state,
  color,
}: {
  project: Project;
  state: CardState;
  color: string;
}) {
  if (state === 'scanning' || state === 'queued') {
    return (
      <div className="project-card-glyph" style={{ color: 'var(--text-subtle)' }}>
        <span className="glyph-spinner" aria-hidden="true" />
        <span className="project-card-headline">
          {state === 'scanning' ? 'Scanning…' : 'Queued'}
        </span>
      </div>
    );
  }

  if (state === 'never_scanned' || state === 'failed' || state === 'cancelled') {
    const Icon = STATE_ICON[state]!;
    return (
      <div className="project-card-glyph" style={{ color }}>
        <Icon className="glyph-icon" />
        <span className="project-card-headline">
          {state === 'never_scanned'
            ? 'Not scanned yet'
            : state === 'failed'
              ? 'Scan failed'
              : 'Scan cancelled'}
        </span>
      </div>
    );
  }

  // completed / completed_with_warnings: lead with the single most urgent
  // signal, same priority order the pills below use in full.
  if (project.countSecretsVerified > 0) {
    return (
      <div className="project-card-glyph" style={{ color }}>
        <IconShieldAlert className="glyph-icon" />
        <span className="project-card-headline">
          {project.countSecretsVerified} verified secret
          {project.countSecretsVerified === 1 ? '' : 's'}
        </span>
      </div>
    );
  }
  if (project.countVulnCritical > 0) {
    return (
      <div className="project-card-glyph" style={{ color }}>
        <IconBug className="glyph-icon" />
        <span className="project-card-headline">
          {project.countVulnCritical} critical vulnerabilit
          {project.countVulnCritical === 1 ? 'y' : 'ies'}
        </span>
      </div>
    );
  }
  const otherFindings =
    project.countVulnHigh +
    project.countVulnMedium +
    project.countVulnLow +
    project.countOutdatedMajor +
    project.countOutdatedMinor +
    project.countOutdatedPatch +
    project.countSecretsUnknown;
  if (otherFindings > 0) {
    return (
      <div className="project-card-glyph" style={{ color }}>
        <IconBug className="glyph-icon" />
        <span className="project-card-headline">Needs attention</span>
      </div>
    );
  }

  return (
    <div className="project-card-glyph" style={{ color }}>
      <IconShieldCheck className="glyph-icon" />
      <span className="project-card-headline">
        {state === 'completed_with_warnings' ? 'Completed with warnings' : 'All clear'}
      </span>
    </div>
  );
}

function FindingPills({ project, state }: { project: Project; state: CardState }) {
  if (
    state === 'never_scanned' ||
    state === 'failed' ||
    state === 'cancelled' ||
    state === 'queued' ||
    state === 'scanning'
  ) {
    return null;
  }

  const pills: { key: string; tone: string; icon: ComponentType<{ className?: string }>; label: string }[] = [];

  if (project.countSecretsVerified > 0) {
    pills.push({
      key: 'secrets-verified',
      tone: 'critical',
      icon: IconShieldAlert,
      label: `${project.countSecretsVerified} secret${project.countSecretsVerified === 1 ? '' : 's'}`,
    });
  }
  const vulns =
    project.countVulnCritical +
    project.countVulnHigh +
    project.countVulnMedium +
    project.countVulnLow;
  if (vulns > 0) {
    pills.push({
      key: 'vulns',
      tone: project.countVulnCritical > 0 ? 'high' : 'info',
      icon: IconBug,
      label:
        project.countVulnCritical > 0
          ? `${vulns} vuln${vulns === 1 ? '' : 's'} · ${project.countVulnCritical} crit`
          : `${vulns} vuln${vulns === 1 ? '' : 's'}`,
    });
  }
  const outdated =
    project.countOutdatedMajor + project.countOutdatedMinor + project.countOutdatedPatch;
  if (outdated > 0) {
    pills.push({
      key: 'outdated',
      tone: 'info',
      icon: IconPackage,
      label: `${outdated} outdated${project.countOutdatedMajor > 0 ? ` · ${project.countOutdatedMajor} major` : ''}`,
    });
  }
  if (project.countSecretsUnknown > 0) {
    pills.push({
      key: 'secrets-unknown',
      tone: 'medium',
      icon: IconKey,
      label: `${project.countSecretsUnknown} unverified`,
    });
  }

  if (pills.length === 0) return null;

  return (
    <>
      {pills.map(({ key, tone, icon: Icon, label }) => (
        <span key={key} className={`pill pill-${tone}`}>
          <Icon className="pill-icon" />
          {label}
        </span>
      ))}
    </>
  );
}
