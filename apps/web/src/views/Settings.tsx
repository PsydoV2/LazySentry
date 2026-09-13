// Instance settings (docs/CONCEPT.md 6.2 reconnect flow): connected git
// accounts — several at once, across GitHub and GitLab.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ConnectGitAccount,
  ReconnectAccount,
  TokenScopeWarning,
} from '../components/ConnectGitAccount';
import { IconGithub, IconGitlab, IconKey, IconPlus } from '../components/icons';
import { Modal } from '../components/Modal';
import {
  api,
  ApiError,
  type ConnectResult,
  type GitAccount,
  type GitAccountsList,
} from '../lib/api';
import { relativeTime } from '../lib/format';

function ProviderIcon({ provider }: { provider: string }) {
  return provider === 'gitlab' ? <IconGitlab /> : <IconGithub />;
}

export function Settings({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [justConnected, setJustConnected] = useState<ConnectResult | null>(null);

  const accounts = useQuery({
    queryKey: ['git-accounts'],
    queryFn: () => api.get<GitAccountsList>('/api/git-accounts'),
  });

  function invalidateAccounts(): void {
    queryClient.invalidateQueries({ queryKey: ['git-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['setup-status'] });
  }

  function closeAddForm(): void {
    setAdding(false);
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
          <div className="row spread">
            <div className="row">
              <IconGithub />
              <h2>Git accounts</h2>
            </div>
            {!adding && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setAdding(true)}
              >
                <IconPlus /> Add account
              </button>
            )}
          </div>

          {accounts.isLoading && <p className="muted">Loading…</p>}
          {accounts.isError && (
            <p className="notice notice-error">
              {accounts.error instanceof ApiError
                ? accounts.error.message
                : 'Could not load connected accounts.'}
            </p>
          )}

          {accounts.data && accounts.data.accounts.length === 0 && !adding && (
            <>
              <p className="subtle">No git account connected yet.</p>
              <div>
                <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
                  Connect an account
                </button>
              </div>
            </>
          )}

          {accounts.data?.accounts.map((account) => (
            <AccountRow key={account.id} account={account} onChanged={invalidateAccounts} />
          ))}

          {adding && (
            <div className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
              {justConnected ? (
                <>
                  <p className="notice notice-info">
                    Connected as {justConnected.account.username}.
                  </p>
                  <TokenScopeWarning result={justConnected} />
                </>
              ) : (
                <ConnectGitAccount
                  onConnected={(result) => {
                    setJustConnected(result);
                    invalidateAccounts();
                  }}
                />
              )}
              <div>
                <button type="button" className="btn-quiet" onClick={closeAddForm}>
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
            yet.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function AccountRow({
  account,
  onChanged,
}: {
  account: GitAccount;
  onChanged: () => void;
}) {
  const [reconnecting, setReconnecting] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [justReconnected, setJustReconnected] = useState<ConnectResult | null>(null);

  const remove = useMutation({
    mutationFn: () => api.delete<void>(`/api/git-accounts/${account.id}`),
    onSuccess: () => {
      setConfirmingRemove(false);
      onChanged();
    },
  });

  return (
    <div className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
      <div className="settings-row">
        <span className="row">
          <ProviderIcon provider={account.provider} />
          <span className="stack" style={{ gap: 2 }}>
            <strong>{account.username}</strong>
            <span className="subtle">
              {account.baseUrl ? `${account.baseUrl} · ` : ''}
              {account.scopes.length > 0 ? account.scopes.join(', ') : 'scopes unknown'} ·
              connected {relativeTime(account.connectedAt)}
            </span>
          </span>
        </span>
        <span className="row">
          <span className={`pill ${account.status === 'valid' ? 'pill-ok' : 'pill-critical'}`}>
            {account.status === 'valid' ? 'Connected' : 'Reconnect needed'}
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setReconnecting((current) => !current);
              setJustReconnected(null);
            }}
          >
            {account.status === 'valid' ? 'Replace token' : 'Reconnect'}
          </button>
          {!confirmingRemove ? (
            <button type="button" className="btn-danger" onClick={() => setConfirmingRemove(true)}>
              Remove
            </button>
          ) : (
            <>
              <span className="muted">Remove?</span>
              <button
                type="button"
                className="btn-danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? 'Removing…' : 'Confirm'}
              </button>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => setConfirmingRemove(false)}
              >
                Cancel
              </button>
            </>
          )}
        </span>
      </div>

      {remove.isError && (
        <p className="notice notice-error">
          {remove.error instanceof ApiError
            ? remove.error.message
            : 'Could not remove this account.'}
        </p>
      )}

      {reconnecting && (
        <div className="stack">
          {justReconnected ? (
            <>
              <p className="notice notice-info">
                Connected as {justReconnected.account.username}.
              </p>
              <TokenScopeWarning result={justReconnected} />
            </>
          ) : (
            <ReconnectAccount
              accountId={account.id}
              onConnected={(result) => {
                setJustReconnected(result);
                onChanged();
              }}
            />
          )}
          <div>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                setReconnecting(false);
                setJustReconnected(null);
              }}
            >
              {justReconnected ? 'Done' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
