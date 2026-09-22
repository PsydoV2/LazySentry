import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CommandPalette } from './components/CommandPalette';
import { Sidebar } from './components/Sidebar';
import { api, ApiError, type CurrentUser, type SetupStatus } from './lib/api';
import { useRoute } from './lib/router';
import { AuditLog } from './views/AuditLog';
import { Dashboard } from './views/Dashboard';
import { FleetTrends } from './views/FleetTrends';
import { Login } from './views/Login';
import { ProjectDetail } from './views/ProjectDetail';
import { Settings } from './views/Settings';
import { SetupWizard } from './views/SetupWizard';

export function App() {
  const queryClient = useQueryClient();
  const [route, navigate] = useRoute();
  const [searchOpen, setSearchOpen] = useState(false);

  // Fleet search has no permanent nav item (docs/CONCEPT.md 2.2) — ⌘K/Ctrl+K
  // opens it from anywhere, same as a command palette in any other tool.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  // Sidebar is the app's one piece of permanent navigation chrome
  // (docs/CONCEPT.md 8.0). Project detail, settings, the audit log and
  // trends open as a centered modal over the dashboard rather than
  // replacing it — the dashboard (and its SSE-driven state) stays mounted
  // underneath, and closing the modal is instant instead of a refetch. The
  // route still changes underneath the modal, so deep links, reload and the
  // browser back button keep working.
  return (
    <div className="app-shell">
      <Sidebar
        user={session.data}
        route={route}
        navigate={navigate}
        onSignedOut={invalidateAll}
      />
      <div className="app-main">
        <Dashboard navigate={navigate} onOpenSearch={() => setSearchOpen(true)} />
        {route.name === 'project' && (
          // Keyed on the id so navigating from one project straight to
          // another remounts the view — otherwise the active tab (and each
          // tab's own filter state) would carry over from the previous
          // project.
          <ProjectDetail
            key={route.id}
            projectId={route.id}
            initialTab={route.tab}
            onClose={() => navigate({ name: 'dashboard' })}
          />
        )}
        {route.name === 'settings' && (
          <Settings
            currentUser={session.data}
            onClose={() => navigate({ name: 'dashboard' })}
          />
        )}
        {route.name === 'audit-log' && session.data.role === 'admin' && (
          <AuditLog onClose={() => navigate({ name: 'dashboard' })} />
        )}
        {route.name === 'trends' && (
          <FleetTrends onClose={() => navigate({ name: 'dashboard' })} />
        )}
        {searchOpen && (
          <CommandPalette onClose={() => setSearchOpen(false)} navigate={navigate} />
        )}
      </div>
    </div>
  );
}
