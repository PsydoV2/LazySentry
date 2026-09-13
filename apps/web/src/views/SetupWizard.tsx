// Setup wizard (docs/CONCEPT.md 7): two steps, nothing optional. Everything
// else lives in settings — a seven-section wizard makes people delete the
// tool before they have seen it.

import { useState, type FormEvent } from 'react';
import {
  ConnectGitAccount,
  TokenScopeWarning,
} from '../components/ConnectGitAccount';
import { api, ApiError, type ConnectResult, type SetupStatus } from '../lib/api';

interface Props {
  status: SetupStatus;
  onComplete: () => void;
}

export function SetupWizard({ status, onComplete }: Props) {
  const [step, setStep] = useState<'admin' | 'github'>(
    status.adminAccountExists ? 'github' : 'admin',
  );
  const [connected, setConnected] = useState<ConnectResult | null>(null);

  return (
    <div className="centered-page">
      <div className="panel stack">
        <div className="stack" style={{ gap: 'var(--space-1)' }}>
          <h1>Welcome to LazySentry</h1>
          <p className="muted">
            Two steps and you are done. Everything else is optional and lives in
            settings.
          </p>
        </div>

        <div className="steps">
          <span className={`step-dot ${step === 'admin' ? 'is-active' : ''}`} />
          <span className={`step-dot ${step === 'github' ? 'is-active' : ''}`} />
          <span>Step {step === 'admin' ? '1' : '2'} of 2</span>
        </div>

        <div className="card">
          {step === 'admin' ? (
            <CreateAdminStep onCreated={() => setStep('github')} />
          ) : connected ? (
            <ConnectedStep result={connected} onDone={onComplete} />
          ) : (
            <div className="stack">
              <div>
                <h2>Connect GitHub</h2>
                <p className="muted">
                  LazySentry needs read access to list and clone the
                  repositories you want to watch.
                </p>
              </div>
              <ConnectGitAccount fixedProvider="github" onConnected={setConnected} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateAdminStep({ onCreated }: { onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/api/setup/admin', {
        username,
        password,
        passwordConfirmation,
      });
      onCreated();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not create the account',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <div>
        <h2>Create your admin account</h2>
        <p className="muted">
          This is the only account. There is no default password and no way to
          create a second one later.
        </p>
      </div>

      <div>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          autoComplete="username"
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="field-hint">At least 12 characters.</p>
      </div>

      <div>
        <label htmlFor="password-confirm">Confirm password</label>
        <input
          id="password-confirm"
          type="password"
          value={passwordConfirmation}
          autoComplete="new-password"
          onChange={(event) => setPasswordConfirmation(event.target.value)}
        />
      </div>

      {error && <p className="notice notice-error">{error}</p>}

      <div className="row">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </form>
  );
}

function ConnectedStep({
  result,
  onDone,
}: {
  result: ConnectResult;
  onDone: () => void;
}) {
  return (
    <div className="stack">
      <div>
        <h2>Connected as {result.account.username}</h2>
        <p className="muted">
          {result.account.scopes.length > 0
            ? `Scopes: ${result.account.scopes.join(', ')}`
            : 'Fine-grained token — permissions are managed in GitHub.'}
        </p>
      </div>

      <TokenScopeWarning result={result} />

      <div className="row">
        <button type="button" className="btn-primary" onClick={onDone}>
          Go to dashboard
        </button>
      </div>
    </div>
  );
}
