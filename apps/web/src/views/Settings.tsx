// Instance settings (docs/CONCEPT.md 6.2 reconnect flow): connected git
// accounts today, a placeholder for provider API keys later — this stays a
// placeholder on purpose, see the note on the card below (rule 5: no
// multi-provider/AI work starts here just because the UI has a spot for it).

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConnectGithub, TokenScopeWarning } from '../components/ConnectGithub';
import { IconGithub, IconKey } from '../components/icons';
import { Modal } from '../components/Modal';
import { api, ApiError, type ConnectResult, type GitAccountStatus } from '../lib/api';
import { relativeTime } from '../lib/format';

export function Settings({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reconnecting, setReconnecting] = useState(false);
  const [justConnected, setJustConnected] = useState<ConnectResult | null>(null);

  const account = useQuery({
    queryKey: ['git-account'],
    queryFn: () => api.get<GitAccountStatus>('/api/git-accounts'),
  });

  function closeReconnectForm(): void {
    setReconnecting(false);
    setJustConnected(null);
  }

  return (
    <Modal
      title="Settings"
      subtitle="Connected accounts and credentials for this instance."
      onClose={onClose}
    >
      <div className="stack">
        <div className="card stack">
          <div className="row">
            <IconGithub />
            <h2>Git accounts</h2>
          </div>

          {account.isLoading && <p className="muted">Loading…</p>}
          {account.isError && (
            <p className="notice notice-error">
              {account.error instanceof ApiError
                ? account.error.message
                : 'Could not load the connected account.'}
            </p>
          )}

          {account.data && !account.data.account && !reconnecting && (
            <>
              <p className="subtle">No GitHub account connected yet.</p>
              <div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setReconnecting(true)}
                >
                  Connect GitHub
                </button>
              </div>
            </>
          )}

          {account.data?.account && !reconnecting && (
            <div className="settings-row">
              <span className="stack" style={{ gap: 2 }}>
                <strong>{account.data.account.username}</strong>
                <span className="subtle">
                  {account.data.account.scopes.length > 0
                    ? account.data.account.scopes.join(', ')
                    : 'scopes unknown'}{' '}
                  · connected {relativeTime(account.data.account.connectedAt)}
                </span>
              </span>
              <span className="row">
                <span
                  className={`pill ${account.data.account.status === 'valid' ? 'pill-ok' : 'pill-critical'}`}
                >
                  {account.data.account.status === 'valid' ? 'Connected' : 'Reconnect needed'}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReconnecting(true)}
                >
                  {account.data.account.status === 'valid' ? 'Replace token' : 'Reconnect'}
                </button>
              </span>
            </div>
          )}

          {reconnecting && (
            <div className="stack">
              {justConnected ? (
                <>
                  <p className="notice notice-info">
                    Connected as {justConnected.account.username}.
                  </p>
                  <TokenScopeWarning result={justConnected} />
                </>
              ) : (
                <ConnectGithub
                  submitLabel={account.data?.account ? 'Reconnect' : 'Connect'}
                  onConnected={(result) => {
                    setJustConnected(result);
                    queryClient.invalidateQueries({ queryKey: ['git-account'] });
                    queryClient.invalidateQueries({ queryKey: ['setup-status'] });
                  }}
                />
              )}
              <div>
                <button type="button" className="btn-quiet" onClick={closeReconnectForm}>
                  {justConnected ? 'Done' : 'Cancel'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card stack">
          <div className="row">
            <IconKey />
            <h2>API keys</h2>
          </div>
          <p className="subtle">
            Support for additional provider API keys is planned but not available
            yet — LazySentry only talks to GitHub today.
          </p>
        </div>
      </div>
    </Modal>
  );
}
