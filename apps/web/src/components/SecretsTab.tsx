// Secrets tab (docs/CONCEPT.md 8.2). File paths, commit messages and author
// names below come straight from scanned repository content and are never
// trustworthy — this renders them as plain text only, never
// dangerouslySetInnerHTML (docs/CONCEPT.md rule 7 / 6.2).

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Project, type Secret } from '../lib/api';
import { formatDateTime, shortSha } from '../lib/format';

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

  const verifiedOpenCount = (secrets.data ?? []).filter(
    (s) => s.status === 'open' && s.isVerified,
  ).length;

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

      <label className="row" style={{ gap: 6 }}>
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(event) => setShowResolved(event.target.checked)}
        />
        Show resolved findings
      </label>

      {rows.length === 0 && <p className="muted">Nothing to show.</p>}

      {rows.length > 0 && (
        <div className="list">
          {rows.map((secret) => (
            <div key={secret.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <span
                className={`pill ${
                  secret.status === 'resolved'
                    ? 'pill-neutral'
                    : secret.isVerified
                      ? 'pill-critical'
                      : 'pill-medium'
                }`}
              >
                {secret.status === 'resolved'
                  ? 'resolved'
                  : secret.isVerified
                    ? 'verified'
                    : 'unverified'}
              </span>

              <div className="stack" style={{ flex: 1, gap: 2 }}>
                <span>
                  <strong>{secret.detectorType}</strong>
                  <span className="subtle"> · {secret.filePath}
                    {secret.line !== null ? `:${secret.line}` : ''}
                  </span>
                </span>
                <span className="subtle">
                  {shortSha(secret.commitSha)}
                  {secret.commitAuthor ? ` · ${secret.commitAuthor}` : ''}
                  {secret.commitDate ? ` · ${formatDateTime(secret.commitDate)}` : ''}
                </span>
              </div>

              <span className="mono subtle">{secret.redacted}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
