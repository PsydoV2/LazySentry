import { useState, type FormEvent } from 'react';
import { api, ApiError, type ConnectResult } from '../lib/api';

interface Props {
  onConnected: (result: ConnectResult) => void;
  submitLabel?: string;
}

/**
 * GitHub personal access token form. Used by the setup wizard and by
 * "reconnect" once a token has been revoked.
 */
export function ConnectGithub({ onConnected, submitLabel = 'Connect' }: Props) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<ConnectResult>('/api/git-accounts/github', {
        token,
      });
      setToken('');
      onConnected(result);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not connect',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="token">Personal access token</label>
        <input
          id="token"
          type="password"
          value={token}
          autoComplete="off"
          placeholder="github_pat_…"
          onChange={(event) => setToken(event.target.value)}
        />
        <p className="field-hint">
          Use a{' '}
          <a
            href="https://github.com/settings/personal-access-tokens"
            target="_blank"
            rel="noreferrer noopener"
          >
            fine-grained token
          </a>{' '}
          with only <strong>Contents: read</strong> and{' '}
          <strong>Metadata: read</strong>. The token is encrypted before it is
          stored and never leaves this server.
        </p>
      </div>

      {error && <p className="notice notice-error">{error}</p>}

      <div className="row">
        <button
          type="submit"
          className="btn-primary"
          disabled={busy || token.trim() === ''}
        >
          {busy ? 'Checking…' : submitLabel}
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
        GitHub does not report the permissions of fine-grained tokens, so they
        could not be verified here. Check in GitHub that this token grants read
        access only.
      </p>
    );
  }
  return null;
}
