// Left sidebar (docs/CONCEPT.md 8.0/UI mockup "Variant D"): the app's one
// piece of permanent navigation chrome — Dashboard, Settings, and (for an
// admin) the audit log. Deliberately does NOT carry a "Fleet"/"Trends" item:
// fleet search opens via the header search trigger or ⌘K, and trends open
// only from the dashboard's pulse strip — see FleetPulseStrip/CommandPalette.

import type { CurrentUser } from '../lib/api';
import type { Route } from '../lib/router';
import { UserMenu } from './UserMenu';
import { IconGrid, IconHistory, IconSettings } from './icons';

export function Sidebar({
  user,
  route,
  navigate,
  onSignedOut,
}: {
  user: CurrentUser;
  route: Route;
  navigate: (route: Route) => void;
  onSignedOut: () => void;
}) {
  // The project/trends modals open over the dashboard rather than replacing
  // it (App.tsx), so "Dashboard" still reads as active underneath either.
  const isDashboardActive = route.name === 'dashboard' || route.name === 'project' || route.name === 'trends';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">LazySentry</div>

      <nav className="sidebar-nav">
        <button
          type="button"
          className={`sidebar-nav-item ${isDashboardActive ? 'is-active' : ''}`}
          onClick={() => navigate({ name: 'dashboard' })}
        >
          <IconGrid />
          <span>Dashboard</span>
        </button>
        <button
          type="button"
          className={`sidebar-nav-item ${route.name === 'settings' ? 'is-active' : ''}`}
          onClick={() => navigate({ name: 'settings' })}
        >
          <IconSettings />
          <span>Settings</span>
        </button>
        {user.role === 'admin' && (
          <button
            type="button"
            className={`sidebar-nav-item ${route.name === 'audit-log' ? 'is-active' : ''}`}
            onClick={() => navigate({ name: 'audit-log' })}
          >
            <IconHistory />
            <span>Audit log</span>
          </button>
        )}
      </nav>

      <div className="sidebar-spacer" />

      <UserMenu user={user} onSignedOut={onSignedOut} />
    </aside>
  );
}
