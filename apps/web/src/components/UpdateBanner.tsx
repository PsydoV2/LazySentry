// Update notice (docs/CONCEPT.md 6.1 threat model — self-hosted, no
// auto-update): shown once the backend's cached GitHub tag check finds a
// newer release than the version baked into this image. Dismissing it is
// session-only (component state, not persisted) — it comes back on the next
// reload, same as any other transient notice in this app.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type VersionInfo } from '../lib/api';
import { IconX } from './icons';
import { Modal } from './Modal';

export function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const version = useQuery({
    queryKey: ['version'],
    queryFn: () => api.get<VersionInfo>('/api/version'),
    // The server itself only refreshes this once an hour — matching that
    // here just avoids a redundant request on every mount.
    staleTime: 60 * 60 * 1000,
  });

  if (dismissed || !version.data?.updateAvailable) return null;

  return (
    <>
      <div className="notice notice-info update-banner">
        <span>
          Update available: <strong>{version.data.latest}</strong> (this
          instance is on {version.data.current})
        </span>
        <span className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn-quiet"
            onClick={() => setShowTutorial(true)}
          >
            How to update
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
          >
            <IconX />
          </button>
        </span>
      </div>

      {showTutorial && (
        <Modal
          title="Update LazySentry"
          subtitle={`${version.data.current} → ${version.data.latest}`}
          onClose={() => setShowTutorial(false)}
        >
          <div className="stack">
            <p>
              Run these from the directory with your{' '}
              <code className="mono">docker-compose.yml</code>:
            </p>
            <ol className="update-steps">
              <li>
                Pull the new image
                <pre className="code-block">docker compose pull</pre>
              </li>
              <li>
                Recreate the containers with it
                <pre className="code-block">docker compose up -d</pre>
              </li>
              <li>
                Remove the now-unused old image
                <pre className="code-block">docker image prune -f</pre>
              </li>
            </ol>
            <p className="subtle">
              Your data lives in the <code className="mono">lazysentry-data</code>{' '}
              volume and is untouched by any of this.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
