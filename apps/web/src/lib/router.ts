// Four screens, no nesting — a router library would be more machinery than
// the app needs. `#/projects/:id` for the detail view, `#/settings` for the
// instance settings, `#/audit-log` for the audit log, empty hash for the
// dashboard; all four survive a reload and work with the browser's back
// button. Project detail, settings and the audit log render as a modal over
// the dashboard rather than a full page (see App.tsx), but the route —
// including an optional tab, e.g. `#/projects/3/settings` — still drives
// which modal is open and which tab it opens on, so a card's settings/menu
// button can jump straight there.

import { useEffect, useState } from 'react';

export const PROJECT_TABS = ['overview', 'dependencies', 'secrets', 'settings'] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

export type Route =
  | { name: 'dashboard' }
  | { name: 'project'; id: number; tab?: ProjectTab }
  | { name: 'settings' }
  | { name: 'audit-log' };

function parseHash(hash: string): Route {
  const match = /^#\/projects\/(\d+)(?:\/(\w+))?$/.exec(hash);
  if (match) {
    const tab = match[2];
    return {
      name: 'project',
      id: Number(match[1]),
      tab: (PROJECT_TABS as readonly string[]).includes(tab ?? '')
        ? (tab as ProjectTab)
        : undefined,
    };
  }
  if (hash === '#/settings') return { name: 'settings' };
  if (hash === '#/audit-log') return { name: 'audit-log' };
  return { name: 'dashboard' };
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(window.location.hash),
  );

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (next: Route) => {
    window.location.hash =
      next.name === 'project'
        ? `#/projects/${next.id}${next.tab ? `/${next.tab}` : ''}`
        : next.name === 'settings'
          ? '#/settings'
          : next.name === 'audit-log'
            ? '#/audit-log'
            : '#/';
  };

  return [route, navigate];
}
