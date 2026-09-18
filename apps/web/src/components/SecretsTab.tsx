// Secrets tab (docs/CONCEPT.md 8.2). File paths, commit messages and author
// names below come straight from scanned repository content and are never
// trustworthy — this renders them as plain text only, never
// dangerouslySetInnerHTML (docs/CONCEPT.md rule 7 / 6.2).

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from './EmptyState';
import { api, type Project, type Secret } from '../lib/api';
import { formatDateTime, shortSha } from '../lib/format';
import { IconCheck, IconFolder, IconKey, IconShieldAlert, IconShieldCheck } from './icons';

export function SecretsTab({ project }: { project: Project }) {
  const projectId = project.id;
  const queryClient = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const [showSuppressed, setShowSuppressed] = useState(false);

  const secrets = useQuery({
    queryKey: ['project', projectId, 'secrets'],
    queryFn: () => api.get<Secret[]>(`/api/projects/${projectId}/secrets`),
  });

  const suppress = useMutation({
    mutationFn: ({ secretId, suppressed }: { secretId: number; suppressed: boolean }) =>
      api.patch(`/api/projects/${projectId}/secrets/${secretId}`, { suppressed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId, 'secrets'] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const rows = useMemo(
    () =>
      (secrets.data ?? []).filter(
        (s) =>
          (showResolved || s.status === 'open') &&
          (showSuppressed || s.suppressedAt === null),
      ),
    [secrets.data, showResolved, showSuppressed],
  );

  const openCount = (secrets.data ?? []).filter((s) => s.status === 'open').length;
  // Suppressed secrets are excluded from the "rotate immediately" warning —
  // the user already acknowledged this one (Phase 3 suppression workflow).
  const verifiedOpenCount = (secrets.data ?? []).filter(
    (s) => s.status === 'open' && s.isVerified && s.suppressedAt === null,
  ).length;
  const resolvedCount = (secrets.data ?? []).filter((s) => s.status === 'resolved').length;

  if (secrets.isLoading) return <p className="muted">Loading…</p>;

  if ((secrets.data ?? []).length === 0) {
    if (project.lastScanId === null) {
      return (
        <EmptyState icon={IconFolder} message="This project has not been scanned yet." />
      );
    }
    if (!project.scanSecretsEnabled) {
      return (
        <EmptyState
          icon={IconKey}
          message="Secret scanning is turned off for this project (see Settings)."
        />
      );
    }
    return <EmptyState icon={IconShieldCheck} message="No secrets found." />;
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
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={showSuppressed}
            onChange={(event) => setShowSuppressed(event.target.checked)}
          />
          Show suppressed
        </label>
        <span className="table-summary subtle">
          {openCount} open{verifiedOpenCount > 0 ? ` (${verifiedOpenCount} verified)` : ''}
          {resolvedCount > 0 ? ` · ${resolvedCount} resolved` : ''}
        </span>
      </div>

      {rows.length === 0 && (
        <EmptyState
          icon={IconShieldCheck}
          message={
            showResolved || resolvedCount === 0
              ? 'Nothing to show.'
              : `No open secrets. ${resolvedCount} resolved finding${resolvedCount === 1 ? '' : 's'} hidden — check "Show resolved findings".`
          }
        />
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
                {secret.suppressedAt !== null && (
                  <span className="pill pill-neutral">suppressed</span>
                )}

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

                <button
                  type="button"
                  className="btn-quiet"
                  disabled={suppress.isPending}
                  onClick={() =>
                    suppress.mutate({
                      secretId: secret.id,
                      suppressed: secret.suppressedAt === null,
                    })
                  }
                >
                  {secret.suppressedAt !== null ? 'Unsuppress' : 'Suppress'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
