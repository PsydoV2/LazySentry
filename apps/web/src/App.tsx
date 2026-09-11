import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type CurrentUser, type SetupStatus } from './lib/api';
import { useRoute } from './lib/router';
import { Dashboard } from './views/Dashboard';
import { Login } from './views/Login';
import { ProjectDetail } from './views/ProjectDetail';
import { SetupWizard } from './views/SetupWizard';

export function App() {
  const queryClient = useQueryClient();
  const [route, navigate] = useRoute();

  const setup = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api.get<SetupStatus>('/api/setup/status'),
  });

  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        return await api.get<CurrentUser>('/api/auth/me');
      } catch (error) {
        // Not signed in is a normal state, not a failure to retry.
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });

  if (setup.isLoading || session.isLoading) {
    return (
      <div className="centered-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (setup.isError || session.isError) {
    return (
      <div className="centered-page">
        <p className="notice notice-error">
          Cannot reach the LazySentry API. Is the server running?
        </p>
      </div>
    );
  }

  const invalidateAll = () => queryClient.invalidateQueries();

  // Without an admin account the instance is unclaimed, and the wizard is the
  // only way in (docs/CONCEPT.md 6.2).
  if (setup.data && !setup.data.adminAccountExists) {
    return <SetupWizard status={setup.data} onComplete={invalidateAll} />;
  }

  // Once that account exists, everything else is behind the login — including
  // the rest of the wizard, whose endpoints require a session.
  if (!session.data) {
    return <Login onSignedIn={invalidateAll} />;
  }

  if (setup.data && !setup.data.complete) {
    return <SetupWizard status={setup.data} onComplete={invalidateAll} />;
  }

  if (route.name === 'project') {
    return (
      // Keyed on the id so navigating from one project straight to another
      // remounts the view — otherwise the active tab (and each tab's own
      // filter state) would carry over from the previous project.
      <ProjectDetail
        key={route.id}
        projectId={route.id}
        onBack={() => navigate({ name: 'dashboard' })}
      />
    );
  }

  return (
    <Dashboard user={session.data} onSignedOut={invalidateAll} navigate={navigate} />
  );
}
