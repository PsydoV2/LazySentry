// Left sidebar (docs/CONCEPT.md 8.0/UI mockup "Variant D"): the app's one
// piece of permanent navigation chrome — Dashboard, Settings, and (for an
// admin) the audit log. Deliberately does NOT carry a "Fleet"/"Trends" item:
// fleet search opens via the header search trigger or ⌘K, and trends open
// only from the dashboard's pulse strip — see FleetPulseStrip/CommandPalette.

import { useEffect, useState } from 'react';
import type { CurrentUser } from '../lib/api';
import type { Route } from '../lib/router';
import { UserMenu } from './UserMenu';
import { IconChevronLeft, IconChevronRight, IconGrid, IconHistory, IconSettings } from './icons';

const COLLAPSED_STORAGE_KEY = 'lazysentry-sidebar-collapsed';

function getStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    // Storage can throw in a locked-down environment — default to expanded.
    return false;
  }
}

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
  const [collapsed, setCollapsed] = useState(getStoredCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // Ignore — the in-memory state still drives this session correctly,
      // it just won't be remembered next time.
    }
  }, [collapsed]);

  // The project/trends modals open over the dashboard rather than replacing
  // it (App.tsx), so "Dashboard" still reads as active underneath either.
  const isDashboardActive = route.name === 'dashboard' || route.name === 'project' || route.name === 'trends';

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar-logo-row">
        {!collapsed && (
          <div className="sidebar-logo">
            <img src="/favicon.svg" alt="" className="sidebar-logo-mark" />
            <span>LazySentry</span>
          </div>
        )}
        <button
          type="button"
          className="sidebar-collapse-toggle"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      <nav className="sidebar-nav">
        <button
          type="button"
          className={`sidebar-nav-item ${isDashboardActive ? 'is-active' : ''}`}
          title="Dashboard"
          onClick={() => navigate({ name: 'dashboard' })}
        >
          <IconGrid />
          {!collapsed && <span>Dashboard</span>}
        </button>
        <button
          type="button"
          className={`sidebar-nav-item ${route.name === 'settings' ? 'is-active' : ''}`}
          title="Settings"
          onClick={() => navigate({ name: 'settings' })}
        >
          <IconSettings />
          {!collapsed && <span>Settings</span>}
        </button>
        {user.role === 'admin' && (
          <button
            type="button"
            className={`sidebar-nav-item ${route.name === 'audit-log' ? 'is-active' : ''}`}
            title="Audit log"
            onClick={() => navigate({ name: 'audit-log' })}
          >
            <IconHistory />
            {!collapsed && <span>Audit log</span>}
          </button>
        )}
      </nav>

      <div className="sidebar-spacer" />

      <UserMenu user={user} onSignedOut={onSignedOut} collapsed={collapsed} />
    </aside>
  );
}
