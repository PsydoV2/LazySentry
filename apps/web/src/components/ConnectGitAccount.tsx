import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select } from './Select';
import {
  api,
  ApiError,
  type ConnectResult,
  type GitProviderId,
  type ProvidersList,
} from '../lib/api';

interface Props {
  onConnected: (result: ConnectResult) => void;
  submitLabel?: string;
  /** Restrict to one provider and hide the selector (setup wizard, reconnect). */
  fixedProvider?: GitProviderId;
}

const SCOPE_HINTS: Record<GitProviderId, { url: string; label: string; scopes: string }> = {
  github: {
    url: 'https://github.com/settings/personal-access-tokens',
    label: 'fine-grained token',
    scopes: 'Contents: read and Metadata: read',
  },
  gitlab: {
    url: 'https://gitlab.com/-/user_settings/personal_access_tokens',
    label: 'personal access token',
    scopes: 'read_api and read_repository',
  },
  gitea: {
    url: '', // Self-hosted, no fixed URL — see the instance-URL hint instead.
    label: 'access token',
    scopes: 'read:repository',
  },
};

const TOKEN_PLACEHOLDER: Record<GitProviderId, string> = {
  github: 'github_pat_…',
  gitlab: 'glpat-…',
  gitea: '',
};

/**
 * Personal access token form for GitHub, GitLab or Gitea. Several accounts
 * can be connected side by side, including several for the same provider —
 * this form always creates a new connection rather than replacing one.
 */
export function ConnectGitAccount({ onConnected, submitLabel = 'Connect', fixedProvider }: Props) {
  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: () => api.get<ProvidersList>('/api/providers'),
  });

  const [provider, setProvider] = useState<GitProviderId>(fixedProvider ?? 'github');
  const [token, setToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const info = providers.data?.providers.find((p) => p.id === provider);

  // Reset the base-url field whenever the provider changes, so switching
  // from GitLab back to GitHub does not carry over a stray self-hosted URL.
  useEffect(() => {
    setBaseUrl('');
  }, [provider]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<ConnectResult>('/api/git-accounts', {
        provider,
        token,
        ...(info?.supportsCustomBaseUrl && baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setToken('');
      setLabel('');
      onConnected(result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not connect');
    } finally {
      setBusy(false);
    }
  }

  const hint = SCOPE_HINTS[provider];

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {!fixedProvider && (
        <div>
          <label htmlFor="provider">Provider</label>
          <Select
            id="provider"
            value={provider}
            options={(providers.data?.providers ?? []).map((p) => ({ value: p.id, label: p.label }))}
            onChange={setProvider}
          />
        </div>
      )}

      {info?.supportsCustomBaseUrl && (
        <div>
          <label htmlFor="base-url">Instance URL</label>
          <input
            id="base-url"
            type="text"
            value={baseUrl}
            placeholder={info.baseUrlRequired ? 'https://gitea.example.com' : info.defaultBaseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
          <p className="field-hint">
            {info.baseUrlRequired
              ? 'Required — the URL of your self-hosted instance.'
              : `Leave empty for ${info.defaultBaseUrl}.`}
          </p>
        </div>
      )}

      <div>
        <label htmlFor="token">Personal access token</label>
        <input
          id="token"
          type="password"
          value={token}
          autoComplete="off"
          placeholder={TOKEN_PLACEHOLDER[provider]}
          onChange={(event) => setToken(event.target.value)}
        />
        <p className="field-hint">
          Use a{' '}
          {hint.url ? (
            <a href={hint.url} target="_blank" rel="noreferrer noopener">
              {hint.label}
            </a>
          ) : (
            hint.label
          )}{' '}
          with only <strong>{hint.scopes}</strong>. The token is encrypted before
          it is stored and never leaves this server.
        </p>
      </div>

      <div>
        <label htmlFor="label">Label (optional)</label>
        <input
          id="label"
          type="text"
          value={label}
          placeholder="e.g. Org: Faltix IT UG"
          onChange={(event) => setLabel(event.target.value)}
        />
        <p className="field-hint">
          Only needed to tell two accounts apart when they report the same
          username — for example a GitHub personal token and a fine-grained
          token scoped to an organization as its resource owner. GitHub does
          not report which resource owner a token is scoped to, so without a
          label the second connection looks like a duplicate.
        </p>
      </div>

      {error && <p className="notice notice-error">{error}</p>}

      <div className="row">
        <button
          type="submit"
          className="btn-primary"
          disabled={
            busy || token.trim() === '' || (info?.baseUrlRequired && baseUrl.trim() === '')
          }
        >
          {busy ? 'Checking…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Replaces the token on an already-connected account (docs/CONCEPT.md 6.2). */
export function ReconnectAccount({
  accountId,
  onConnected,
}: {
  accountId: number;
  onConnected: (result: ConnectResult) => void;
}) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<ConnectResult>(
        `/api/git-accounts/${accountId}/reconnect`,
        { token },
      );
      setToken('');
      onConnected(result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reconnect');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <div>
        <label htmlFor={`reconnect-token-${accountId}`}>New personal access token</label>
        <input
          id={`reconnect-token-${accountId}`}
          type="password"
          value={token}
          autoComplete="off"
          onChange={(event) => setToken(event.target.value)}
        />
      </div>
      {error && <p className="notice notice-error">{error}</p>}
      <div className="row">
        <button type="submit" className="btn-primary" disabled={busy || token.trim() === ''}>
          {busy ? 'Checking…' : 'Reconnect'}
        </button>
      </div>
    </form>
  );
}

/** Warning shown when the connected token carries more rights than needed. */
export function TokenScopeWarning({ result }: { result: ConnectResult }) {
  if (result.writeScopes.length > 0) {
    return (
      <p className="notice notice-warning">
        This token has write access ({result.writeScopes.join(', ')}).
        LazySentry only ever reads. Consider replacing it with a read-only
        token.
      </p>
    );
  }
  if (result.scopesUnknown) {
    return (
      <p className="notice notice-info">
        The provider does not report this token's permissions, so they could
        not be verified here. Double-check that it grants read access only.
      </p>
    );
  }
  return null;
}
