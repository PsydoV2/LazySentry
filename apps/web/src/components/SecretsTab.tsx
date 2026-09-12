// Secrets tab (docs/CONCEPT.md 8.2). File paths, commit messages and author
// names below come straight from scanned repository content and are never
// trustworthy — this renders them as plain text only, never
// dangerouslySetInnerHTML (docs/CONCEPT.md rule 7 / 6.2).

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Project, type Secret } from '../lib/api';
import { formatDateTime, shortSha } from '../lib/format';
import { IconCheck, IconKey, IconShieldAlert } from './icons';

export function SecretsTab({ project }: { project: Project }) {
  const projectId = project.id;
  const [showResolved, setShowResolved] = useState(false);

  const secrets = useQuery({
    queryKey: ['project', projectId, 'secrets'],
    queryFn: () => api.get<Secret[]>(`/api/projects/${projectId}/secrets`),
  });

  const rows = useMemo(
    () => (secrets.data ?? []).filter((s) => showResolved || s.status === 'open'),
    [secrets.data, showResolved],
  );

  const openCount = (secrets.data ?? []).filter((s) => s.status === 'open').length;
  const verifiedOpenCount = (secrets.data ?? []).filter(
    (s) => s.status === 'open' && s.isVerified,
  ).length;
  const resolvedCount = (secrets.data ?? []).filter((s) => s.status === 'resolved').length;

  if (secrets.isLoading) return <p className="muted">Loading…</p>;

  if ((secrets.data ?? []).length === 0) {
    const message =
      project.lastScanId === null
        ? 'This project has not been scanned yet.'
        : !project.scanSecretsEnabled
          ? 'Secret scanning is turned off for this project (see Settings).'
          : 'No secrets found.';
    return <p className="muted">{message}</p>;
  }

  return (
    <div className="stack">
      {verifiedOpenCount > 0 && (
        <p className="notice notice-error">
          {verifiedOpenCount} credential{verifiedOpenCount === 1 ? ' is' : 's are'}{' '}
          currently active. Rotate {verifiedOpenCount === 1 ? 'it' : 'them'}{' '}
          immediately — removing {verifiedOpenCount === 1 ? 'it' : 'them'} from the
          code is not enough.
        </p>
      )}

      <div className="filter-bar">
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          Show resolved findings
        </label>
        <span className="table-summary subtle">
          {openCount} open{verifiedOpenCount > 0 ? ` (${verifiedOpenCount} verified)` : ''}
          {resolvedCount > 0 ? ` · ${resolvedCount} resolved` : ''}
        </span>
      </div>

      {rows.length === 0 && (
        <p className="muted">
          {showResolved || resolvedCount === 0
            ? 'Nothing to show.'
            : `No open secrets. ${resolvedCount} resolved finding${resolvedCount === 1 ? '' : 's'} hidden — check "Show resolved findings".`}
        </p>
      )}

      {rows.length > 0 && (
        <div className="list">
          {rows.map((secret) => {
            const status =
              secret.status === 'resolved'
                ? {
                    tone: 'neutral',
                    icon: IconCheck,
                    label: 'resolved',
                    hint: 'No longer detected in the latest scan.',
                  }
                : secret.isVerified
                  ? {
                      tone: 'critical',
                      icon: IconShieldAlert,
                      label: 'verified',
                      hint: 'This credential is currently active. Rotate it immediately — removing it from the code is not enough.',
                    }
                  : {
                      tone: 'medium',
                      icon: IconKey,
                      label: 'unverified',
                      hint: 'No verifier available, or verification failed — review this one manually.',
                    };
            const StatusIcon = status.icon;
            return (
              <div key={secret.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                <span className={`pill pill-${status.tone}`} title={status.hint}>
                  <StatusIcon className="pill-icon" />
                  {status.label}
                </span>

                <div className="stack" style={{ flex: 1, gap: 2 }}>
                  <span>
                    <strong>{secret.detectorType}</strong>
                    <span className="subtle">
                      {' '}
                      · {secret.filePath}
                      {secret.line !== null ? `:${secret.line}` : ''}
                    </span>
                  </span>
                  <span className="subtle">
                    {shortSha(secret.commitSha)}
                    {secret.commitAuthor ? ` · ${secret.commitAuthor}` : ''}
                    {secret.commitDate ? ` · ${formatDateTime(secret.commitDate)}` : ''}
                    {secret.status === 'resolved' && secret.resolvedAt
                      ? ` · resolved ${formatDateTime(secret.resolvedAt)}`
                      : ''}
                  </span>
                </div>

                <span className="mono subtle">{secret.redacted}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
