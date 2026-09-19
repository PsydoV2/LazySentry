// Instance settings (docs/CONCEPT.md 6.2 reconnect flow): connected
// accounts — several at once, across GitHub and GitLab.

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scanScheduleHoursOfDay } from '@lazysentry/shared';
import {
  ConnectGitAccount,
  ReconnectAccount,
  TokenScopeWarning,
} from '../components/ConnectGitAccount';
import {
  IconBell,
  IconClock,
  IconDiscord,
  IconGithub,
  IconGitlab,
  IconHistory,
  IconKey,
  IconPlus,
  IconSlack,
  IconTrash,
  IconUser,
  IconUsers,
  IconWebhook,
} from '../components/icons';
import { Modal } from '../components/Modal';
import { Popup } from '../components/Popup';
import { Select, type SelectOption } from '../components/Select';
import {
  api,
  ApiError,
  type AppSettings,
  type AppSettingsUpdate,
  type AppUser,
  type AuditLogList,
  type ConnectResult,
  type CurrentUser,
  type GitAccount,
  type GitAccountsList,
  type GitProviderId,
  type NotificationChannel,
  type NotificationChannelsList,
  type NotificationPlatformId,
  type NotificationPlatformsList,
  type ProvidersList,
  type UserRole,
  type UsersList,
} from '../lib/api';
import { auditLogActionLabel, auditLogDetail } from '../lib/audit-log';
import { relativeTime } from '../lib/format';

const SCHEDULE_PRESETS: { hours: number; label: string }[] = [
  { hours: 0, label: 'Off' },
  { hours: 6, label: 'Every 6 hours' },
  { hours: 12, label: 'Every 12 hours' },
  { hours: 24, label: 'Daily' },
  { hours: 24 * 7, label: 'Weekly' },
];

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

const HOUR_OPTIONS: SelectOption<number>[] = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: formatHour(hour),
}));

// Value is JS Date#getDay() (0=Sunday..6=Saturday); listed Monday-first to
// match how a week reads, not how getDay() numbers it.
const WEEKDAY_OPTIONS: SelectOption<number>[] = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

const ROLE_OPTIONS: SelectOption<UserRole>[] = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
];

function ProviderIcon({ provider }: { provider: string }) {
  return provider === 'gitlab' ? <IconGitlab /> : <IconGithub />;
}

function NotificationPlatformIcon({ platform }: { platform: string }) {
  if (platform === 'discord') return <IconDiscord />;
  if (platform === 'slack') return <IconSlack />;
  return <IconWebhook />;
}

const CHANNEL_URL_PLACEHOLDER: Record<NotificationPlatformId, string> = {
  discord: 'https://discord.com/api/webhooks/…',
  slack: 'https://hooks.slack.com/services/…',
  webhook: 'https://example.com/webhook',
};

export function Settings({
  onClose,
  currentUser,
}: {
  onClose: () => void;
  currentUser: CurrentUser;
}) {
  const isAdmin = currentUser.role === 'admin';
  const queryClient = useQueryClient();
  const [addingProvider, setAddingProvider] = useState<GitProviderId | null>(null);

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

          {!isAdmin && (
            <p className="subtle">Only admins can connect, reconnect or remove accounts.</p>
          )}

          {isAdmin && (
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
          )}

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
            <AccountRow
              key={account.id}
              account={account}
              canManage={isAdmin}
              onChanged={invalidateAccounts}
            />
          ))}
        </div>

        {isAdmin && addingProvider && (
          <AddAccountPopup
            provider={addingProvider}
            label={
              providers.data?.providers.find((p) => p.id === addingProvider)?.label ??
              addingProvider
            }
            onClose={() => setAddingProvider(null)}
            onConnected={invalidateAccounts}
          />
        )}

        <NotificationsCard />
        <ScanScheduleCard />
        {isAdmin && <UsersCard currentUserId={currentUser.id} />}
        {isAdmin && <AuditLogCard />}

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

/** Popup for connecting a new account (docs/CONCEPT.md 6.2). */
function AddAccountPopup({
  provider,
  label,
  onClose,
  onConnected,
}: {
  provider: GitProviderId;
  label: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [justConnected, setJustConnected] = useState<ConnectResult | null>(null);

  return (
    <Popup
      title={`Connect ${label}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn-quiet" onClick={onClose}>
          {justConnected ? 'Done' : 'Cancel'}
        </button>
      }
    >
      {justConnected ? (
        <>
          <p className="notice notice-info">Connected as {justConnected.account.username}.</p>
          <TokenScopeWarning result={justConnected} />
        </>
      ) : (
        <ConnectGitAccount
          fixedProvider={provider}
          onConnected={(result) => {
            setJustConnected(result);
            onConnected();
          }}
        />
      )}
    </Popup>
  );
}

/**
 * Notification channels (roadmap Phase 3, docs/CONCEPT.md 2.3) — several at
 * once, including several of the same platform (e.g. two Slack channels);
 * every one receives every scan notification. Managing these is a
 * member-level action, not admin-only (docs/CONCEPT.md 2.6), unlike git
 * accounts and users below.
 */
function NotificationsCard() {
  const queryClient = useQueryClient();
  const [addingPlatform, setAddingPlatform] = useState<NotificationPlatformId | null>(null);

  const channels = useQuery({
    queryKey: ['notification-channels'],
    queryFn: () => api.get<NotificationChannelsList>('/api/notification-channels'),
  });

  const platforms = useQuery({
    queryKey: ['notification-platforms'],
    queryFn: () => api.get<NotificationPlatformsList>('/api/notification-platforms'),
  });

  function invalidateChannels(): void {
    queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
  }

  function toggleAddPlatform(id: NotificationPlatformId): void {
    setAddingPlatform((current) => (current === id ? null : id));
  }

  const remove = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/notification-channels/${id}`),
    onSuccess: invalidateChannels,
  });

  const platformLabel = (id: string) =>
    platforms.data?.platforms.find((p) => p.id === id)?.label ?? id;

  return (
    <div className="card stack">
      <div className="row">
        <IconBell />
        <h2>Notifications</h2>
      </div>
      <p className="subtle">
        Get a message when a scan finds new vulnerabilities or secrets, or
        fails outright.
      </p>

      <div className="row" style={{ gap: 8 }}>
        {platforms.data?.platforms.map((platform) => (
          <button
            key={platform.id}
            type="button"
            className={`provider-add-btn ${addingPlatform === platform.id ? 'is-active' : ''}`}
            onClick={() => toggleAddPlatform(platform.id)}
          >
            <NotificationPlatformIcon platform={platform.id} />
            {platform.label}
            <IconPlus />
          </button>
        ))}
      </div>

      {channels.isLoading && <p className="muted">Loading…</p>}
      {channels.isError && (
        <p className="notice notice-error">
          {channels.error instanceof ApiError
            ? channels.error.message
            : 'Could not load notification channels.'}
        </p>
      )}
      {channels.data && channels.data.channels.length === 0 && !addingPlatform && (
        <p className="subtle">No channels configured yet.</p>
      )}

      {channels.data?.channels.map((channel) => (
        <div
          key={channel.id}
          className="settings-row"
          style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}
        >
          <span className="row">
            <NotificationPlatformIcon platform={channel.platform} />
            <span className="stack" style={{ gap: 2 }}>
              <strong>{channel.label ?? platformLabel(channel.platform)}</strong>
              <span className="subtle">added {relativeTime(channel.createdAt)}</span>
            </span>
          </span>
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            title="Remove channel"
            aria-label={`Remove ${channel.label ?? platformLabel(channel.platform)}`}
            disabled={remove.isPending}
            onClick={() => remove.mutate(channel.id)}
          >
            <IconTrash />
          </button>
        </div>
      ))}

      {addingPlatform && (
        <AddChannelPopup
          platform={addingPlatform}
          label={platformLabel(addingPlatform)}
          onClose={() => setAddingPlatform(null)}
          onCreated={invalidateChannels}
        />
      )}
    </div>
  );
}

/** Popup for adding a notification channel. */
function AddChannelPopup({
  platform,
  label,
  onClose,
  onCreated,
}: {
  platform: NotificationPlatformId;
  label: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [url, setUrl] = useState('');
  const [channelLabel, setChannelLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post<{ channel: NotificationChannel }>('/api/notification-channels', {
        platform,
        url: url.trim(),
        ...(channelLabel.trim() ? { label: channelLabel.trim() } : {}),
      });
      onCreated();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not add channel');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popup title={`Add ${label} channel`} onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="channel-url">Webhook URL</label>
          <input
            id="channel-url"
            type="password"
            value={url}
            autoComplete="off"
            placeholder={CHANNEL_URL_PLACEHOLDER[platform]}
            onChange={(event) => setUrl(event.target.value)}
          />
          <p className="field-hint">
            The URL is encrypted before it is stored and never shown again.
          </p>
        </div>
        <div>
          <label htmlFor="channel-label">Name (optional)</label>
          <input
            id="channel-label"
            type="text"
            value={channelLabel}
            autoComplete="off"
            placeholder={label}
            onChange={(event) => setChannelLabel(event.target.value)}
          />
          <p className="field-hint">Helps tell two {label} channels apart.</p>
        </div>
        {error && <p className="notice notice-error">{error}</p>}
        <div className="row">
          <button type="submit" className="btn-primary" disabled={busy || url.trim() === ''}>
            {busy ? 'Adding…' : 'Add channel'}
          </button>
          <button type="button" className="btn-quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Popup>
  );
}

/** Describes when a schedule actually fires, in the same terms the user
 * picked it in — reads the fire hours from the same helper the backend
 * scheduler uses, so this text can never drift from what actually runs. */
function describeSchedule(intervalHours: number, anchorHour: number, weekday: number): string {
  if (intervalHours >= 24 * 7) {
    const day = WEEKDAY_OPTIONS.find((option) => option.value === weekday)?.label ?? '';
    return `Runs every ${day} at ${formatHour(anchorHour)}.`;
  }
  if (intervalHours >= 24) {
    return `Runs daily at ${formatHour(anchorHour)}.`;
  }
  const hours = scanScheduleHoursOfDay(intervalHours, anchorHour).map(formatHour).join(', ');
  return `Runs at ${hours}.`;
}

/** Global scan-schedule (roadmap Phase 3, docs/CONCEPT.md 2.3) — one
 * schedule for every project, matching the "five-minute setup" philosophy.
 * Anchored to a fixed server-local hour (and weekday, for the weekly
 * preset) rather than "N hours since each project's last scan", so "daily"
 * or "every 6 hours" has a concrete, admin-chosen answer to "starting when". */
function ScanScheduleCard() {
  const queryClient = useQueryClient();

  const appSettings = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get<AppSettings>('/api/settings'),
  });

  const save = useMutation({
    mutationFn: (patch: AppSettingsUpdate) => api.patch<AppSettings>('/api/settings', patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-settings'] }),
  });

  const data = appSettings.data;

  return (
    <div className="card stack">
      <div className="row">
        <IconClock />
        <h2>Scan schedule</h2>
      </div>
      <p className="subtle">
        Automatically re-scan every project on this schedule, in addition to
        manually triggered scans.
      </p>

      {appSettings.isLoading && <p className="muted">Loading…</p>}

      {data && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <div className="row" style={{ gap: 8 }}>
            <Select
              value={data.scanScheduleIntervalHours}
              disabled={save.isPending}
              ariaLabel="Scan schedule"
              options={SCHEDULE_PRESETS.map((preset) => ({ value: preset.hours, label: preset.label }))}
              onChange={(scanScheduleIntervalHours) => save.mutate({ scanScheduleIntervalHours })}
            />
            {data.scanScheduleIntervalHours > 0 && (
              <Select
                value={data.scanScheduleAnchorHour}
                disabled={save.isPending}
                ariaLabel="Anchor hour"
                options={HOUR_OPTIONS}
                onChange={(scanScheduleAnchorHour) => save.mutate({ scanScheduleAnchorHour })}
              />
            )}
            {data.scanScheduleIntervalHours >= 24 * 7 && (
              <Select
                value={data.scanScheduleWeekday}
                disabled={save.isPending}
                ariaLabel="Weekday"
                options={WEEKDAY_OPTIONS}
                onChange={(scanScheduleWeekday) => save.mutate({ scanScheduleWeekday })}
              />
            )}
          </div>
          {data.scanScheduleIntervalHours > 0 && (
            <p className="field-hint">
              {describeSchedule(
                data.scanScheduleIntervalHours,
                data.scanScheduleAnchorHour,
                data.scanScheduleWeekday,
              )}
            </p>
          )}
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
  canManage,
  onChanged,
}: {
  account: GitAccount;
  canManage: boolean;
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
          {canManage && (
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
          )}
          {canManage && !confirmingRemove && (
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              title="Remove account"
              aria-label="Remove account"
              onClick={() => setConfirmingRemove(true)}
            >
              <IconTrash />
            </button>
          )}
          {canManage && confirmingRemove && (
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

/**
 * Admin-only user management (docs/CONCEPT.md 2.6). New accounts are created
 * here directly — no invite email, no self-signup.
 */
function UsersCard({ currentUserId }: { currentUserId: number }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UsersList>('/api/users'),
  });

  function invalidateUsers(): void {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  return (
    <div className="card stack">
      <div className="row">
        <IconUsers />
        <h2>Users</h2>
      </div>
      <p className="subtle">
        Everyone on this instance shares the same projects and git accounts.
        Admins additionally manage connected accounts and other users.
      </p>

      {users.isLoading && <p className="muted">Loading…</p>}
      {users.isError && (
        <p className="notice notice-error">
          {users.error instanceof ApiError ? users.error.message : 'Could not load users.'}
        </p>
      )}

      {users.data?.users.map((user) => (
        <UserRow
          key={user.id}
          user={user}
          isSelf={user.id === currentUserId}
          onChanged={invalidateUsers}
        />
      ))}

      <div>
        <button type="button" className="btn-quiet" onClick={() => setAdding(true)}>
          <IconPlus /> Add user
        </button>
      </div>

      {adding && (
        <AddUserPopup onClose={() => setAdding(false)} onCreated={invalidateUsers} />
      )}
    </div>
  );
}

/** Popup for creating a new user (docs/CONCEPT.md 2.6). */
function AddUserPopup({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('member');

  const create = useMutation({
    mutationFn: () => api.post<AppUser>('/api/users', { username, password, role }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Popup title="Add user" onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="new-user-username">Username</label>
          <input
            id="new-user-username"
            type="text"
            value={username}
            autoComplete="off"
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="new-user-password">Initial password</label>
          <input
            id="new-user-password"
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="field-hint">At least 12 characters. The user can change it later.</p>
        </div>
        <div>
          <label htmlFor="new-user-role">Role</label>
          <Select id="new-user-role" value={role} options={ROLE_OPTIONS} onChange={setRole} />
        </div>
        {create.isError && (
          <p className="notice notice-error">
            {create.error instanceof ApiError ? create.error.message : 'Could not create user.'}
          </p>
        )}
        <div className="row">
          <button
            type="submit"
            className="btn-primary"
            disabled={create.isPending || username.trim() === '' || password.trim() === ''}
          >
            {create.isPending ? 'Creating…' : 'Create user'}
          </button>
          <button type="button" className="btn-quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Popup>
  );
}

function UserRow({
  user,
  isSelf,
  onChanged,
}: {
  user: AppUser;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const changeRole = useMutation({
    mutationFn: (role: UserRole) =>
      api.patch<AppUser>(`/api/users/${user.id}`, { role }),
    onSuccess: onChanged,
  });

  const remove = useMutation({
    mutationFn: () => api.delete<void>(`/api/users/${user.id}`),
    onSuccess: () => {
      setConfirmingRemove(false);
      onChanged();
    },
  });

  return (
    <div className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
      <div className="settings-row">
        <span className="row">
          <IconUser />
          <span className="stack" style={{ gap: 2 }}>
            <strong>
              {user.username}
              {isSelf && <span className="subtle"> (you)</span>}
            </strong>
            <span className="subtle">
              {user.lastLoginAt
                ? `last signed in ${relativeTime(user.lastLoginAt)}`
                : 'never signed in'}
            </span>
          </span>
        </span>
        <span className="row">
          <Select
            value={user.role}
            disabled={isSelf || changeRole.isPending}
            ariaLabel={`Role for ${user.username}`}
            options={ROLE_OPTIONS}
            onChange={(role) => changeRole.mutate(role)}
          />
          {!isSelf && !confirmingRemove && (
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              title="Remove user"
              aria-label="Remove user"
              onClick={() => setConfirmingRemove(true)}
            >
              <IconTrash />
            </button>
          )}
          {!isSelf && confirmingRemove && (
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

      {changeRole.isError && (
        <p className="notice notice-error">
          {changeRole.error instanceof ApiError
            ? changeRole.error.message
            : 'Could not change role.'}
        </p>
      )}
      {remove.isError && (
        <p className="notice notice-error">
          {remove.error instanceof ApiError ? remove.error.message : 'Could not remove this user.'}
        </p>
      )}
    </div>
  );
}

/**
 * Admin-only audit log (docs/CONCEPT.md 2.2, 6.2): security-relevant,
 * state-changing actions only — not a general activity feed. Newest first,
 * loaded a page at a time by growing the requested limit rather than tracking
 * a cursor, which keeps this simple and avoids any StrictMode double-fetch
 * bookkeeping for a view an admin opens only occasionally.
 */
function AuditLogCard() {
  const [limit, setLimit] = useState(50);

  const auditLog = useQuery({
    queryKey: ['audit-log', limit],
    queryFn: () => api.get<AuditLogList>(`/api/audit-log?limit=${limit}`),
  });

  return (
    <div className="card stack">
      <div className="row">
        <IconHistory />
        <h2>Audit log</h2>
      </div>
      <p className="subtle">
        Security-relevant actions on this instance: sign-ins, user and account
        management, imports/deletions, scan triggers, and settings changes.
      </p>

      {auditLog.isLoading && <p className="muted">Loading…</p>}
      {auditLog.isError && (
        <p className="notice notice-error">
          {auditLog.error instanceof ApiError
            ? auditLog.error.message
            : 'Could not load the audit log.'}
        </p>
      )}
      {auditLog.data && auditLog.data.entries.length === 0 && (
        <p className="subtle">Nothing logged yet.</p>
      )}

      {auditLog.data && auditLog.data.entries.length > 0 && (
        <div className="list">
          {auditLog.data.entries.map((entry) => (
            <div
              key={entry.id}
              className="list-row"
              style={{ alignItems: 'flex-start' }}
            >
              <div className="stack" style={{ flex: 1, gap: 2 }}>
                <span>
                  <strong>{auditLogActionLabel(entry.action)}</strong>
                  {entry.username && <span className="subtle"> by {entry.username}</span>}
                </span>
                {auditLogDetail(entry) && (
                  <span className="subtle">{auditLogDetail(entry)}</span>
                )}
              </div>
              <span className="subtle">{entry.ip ?? ''}</span>
              <span className="subtle">{relativeTime(entry.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      {auditLog.data?.hasMore && (
        <div>
          <button
            type="button"
            className="btn-quiet"
            disabled={auditLog.isFetching}
            onClick={() => setLimit((current) => current + 50)}
          >
            {auditLog.isFetching ? 'Loading…' : 'Load older'}
          </button>
        </div>
      )}
    </div>
  );
}
