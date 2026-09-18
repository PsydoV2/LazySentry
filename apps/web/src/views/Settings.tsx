// Instance settings (docs/CONCEPT.md 6.2 reconnect flow): connected
// accounts — several at once, across GitHub and GitLab.

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ConnectGitAccount,
  ReconnectAccount,
  TokenScopeWarning,
} from '../components/ConnectGitAccount';
import {
  IconBell,
  IconClock,
  IconGithub,
  IconGitlab,
  IconKey,
  IconPlus,
  IconTrash,
  IconUser,
} from '../components/icons';
import { Modal } from '../components/Modal';
import {
  api,
  ApiError,
  type AppSettings,
  type ConnectResult,
  type GitAccount,
  type GitAccountsList,
  type GitProviderId,
  type ProvidersList,
} from '../lib/api';
import { relativeTime } from '../lib/format';

const SCHEDULE_PRESETS: { hours: number; label: string }[] = [
  { hours: 0, label: 'Off' },
  { hours: 6, label: 'Every 6 hours' },
  { hours: 12, label: 'Every 12 hours' },
  { hours: 24, label: 'Daily' },
  { hours: 24 * 7, label: 'Weekly' },
];

function ProviderIcon({ provider }: { provider: string }) {
  return provider === 'gitlab' ? <IconGitlab /> : <IconGithub />;
}

export function Settings({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [addingProvider, setAddingProvider] = useState<GitProviderId | null>(null);
  const [justConnected, setJustConnected] = useState<ConnectResult | null>(null);

  const accounts = useQuery({
    queryKey: ['git-accounts'],
    queryFn: () => api.get<GitAccountsList>('/api/git-accounts'),
  });

  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: () => api.get<ProvidersList>('/api/providers'),
  });

  function invalidateAccounts(): void {
    queryClient.invalidateQueries({ queryKey: ['git-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['setup-status'] });
  }

  function toggleAddProvider(id: GitProviderId): void {
    setAddingProvider((current) => (current === id ? null : id));
    setJustConnected(null);
  }

  function closeAddForm(): void {
    setAddingProvider(null);
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
            <IconUser />
            <h2>Accounts</h2>
          </div>

          <div className="row" style={{ gap: 8 }}>
            {providers.data?.providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={`provider-add-btn ${addingProvider === provider.id ? 'is-active' : ''}`}
                onClick={() => toggleAddProvider(provider.id)}
              >
                <ProviderIcon provider={provider.id} />
                {provider.label}
                <IconPlus />
              </button>
            ))}
          </div>

          {accounts.isLoading && <p className="muted">Loading…</p>}
          {accounts.isError && (
            <p className="notice notice-error">
              {accounts.error instanceof ApiError
                ? accounts.error.message
                : 'Could not load connected accounts.'}
            </p>
          )}

          {accounts.data && accounts.data.accounts.length === 0 && !addingProvider && (
            <p className="subtle">No accounts connected yet.</p>
          )}

          {accounts.data?.accounts.map((account) => (
            <AccountRow key={account.id} account={account} onChanged={invalidateAccounts} />
          ))}

          {addingProvider && (
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
                  key={addingProvider}
                  fixedProvider={addingProvider}
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

        <NotificationsCard />
        <ScanScheduleCard />

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

/** Discord webhook configuration (roadmap Phase 3, docs/CONCEPT.md 2.3). */
function NotificationsCard() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  const appSettings = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get<AppSettings>('/api/settings'),
  });

  const save = useMutation({
    mutationFn: (discordWebhookUrl: string | null) =>
      api.patch<AppSettings>('/api/settings', { discordWebhookUrl }),
    onSuccess: () => {
      setEditing(false);
      setWebhookUrl('');
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate(webhookUrl.trim());
  }

  return (
    <div className="card stack">
      <div className="row">
        <IconBell />
        <h2>Notifications</h2>
      </div>
      <p className="subtle">
        Get a Discord message when a scan finds new vulnerabilities or
        secrets, or fails outright.
      </p>

      {appSettings.isLoading && <p className="muted">Loading…</p>}

      {appSettings.data && !editing && (
        <div className="settings-row">
          <span className="row">
            <span
              className={`pill ${appSettings.data.discordWebhookConfigured ? 'pill-ok' : 'pill-neutral'}`}
            >
              {appSettings.data.discordWebhookConfigured ? 'Configured' : 'Not configured'}
            </span>
          </span>
          <span className="row">
            <button type="button" className="btn-quiet" onClick={() => setEditing(true)}>
              {appSettings.data.discordWebhookConfigured ? 'Replace' : 'Set up'}
            </button>
            {appSettings.data.discordWebhookConfigured && (
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                title="Remove webhook"
                aria-label="Remove webhook"
                disabled={save.isPending}
                onClick={() => save.mutate(null)}
              >
                <IconTrash />
              </button>
            )}
          </span>
        </div>
      )}

      {editing && (
        <form className="stack" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="discord-webhook">Discord webhook URL</label>
            <input
              id="discord-webhook"
              type="password"
              value={webhookUrl}
              autoComplete="off"
              placeholder="https://discord.com/api/webhooks/…"
              onChange={(event) => setWebhookUrl(event.target.value)}
            />
            <p className="field-hint">
              Create one in a Discord channel's Integrations settings. The
              URL is encrypted before it is stored and never shown again.
            </p>
          </div>
          {save.isError && (
            <p className="notice notice-error">
              {save.error instanceof ApiError ? save.error.message : 'Could not save.'}
            </p>
          )}
          <div className="row">
            <button
              type="submit"
              className="btn-primary"
              disabled={save.isPending || webhookUrl.trim() === ''}
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                setEditing(false);
                setWebhookUrl('');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Global scan-schedule interval (roadmap Phase 3, docs/CONCEPT.md 2.3) — one
 * interval for every project, matching the "five-minute setup" philosophy. */
function ScanScheduleCard() {
  const queryClient = useQueryClient();

  const appSettings = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get<AppSettings>('/api/settings'),
  });

  const save = useMutation({
    mutationFn: (scanScheduleIntervalHours: number) =>
      api.patch<AppSettings>('/api/settings', { scanScheduleIntervalHours }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-settings'] }),
  });

  return (
    <div className="card stack">
      <div className="row">
        <IconClock />
        <h2>Scan schedule</h2>
      </div>
      <p className="subtle">
        Automatically re-scan every project on this interval, in addition to
        manually triggered scans.
      </p>

      {appSettings.isLoading && <p className="muted">Loading…</p>}

      {appSettings.data && (
        <div>
          <select
            value={appSettings.data.scanScheduleIntervalHours}
            disabled={save.isPending}
            onChange={(event) => save.mutate(Number(event.target.value))}
          >
            {SCHEDULE_PRESETS.map((preset) => (
              <option key={preset.hours} value={preset.hours}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {save.isError && (
        <p className="notice notice-error">
          {save.error instanceof ApiError ? save.error.message : 'Could not save.'}
        </p>
      )}
    </div>
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
            className="icon-btn"
            title={account.status === 'valid' ? 'Replace token' : 'Reconnect'}
            aria-label={account.status === 'valid' ? 'Replace token' : 'Reconnect'}
            onClick={() => {
              setReconnecting((current) => !current);
              setJustReconnected(null);
            }}
          >
            <IconKey />
          </button>
          {!confirmingRemove ? (
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              title="Remove account"
              aria-label="Remove account"
              onClick={() => setConfirmingRemove(true)}
            >
              <IconTrash />
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
