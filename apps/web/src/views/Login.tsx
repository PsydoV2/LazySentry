import { useState, type FormEvent } from 'react';
import { api, ApiError, type CurrentUser } from '../lib/api';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post<CurrentUser>('/api/auth/login', { username, password });
      onSignedIn();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered-page">
      <form className="panel card stack" onSubmit={handleSubmit}>
        <h1>Sign in</h1>

        <div>
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            type="text"
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error && <p className="notice notice-error">{error}</p>}

        <div className="row">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
