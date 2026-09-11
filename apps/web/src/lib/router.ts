// Three screens, no nesting — a router library would be more machinery than
// the app needs. `#/projects/:id` for the detail view, `#/settings` for the
// instance settings, empty hash for the dashboard; all three survive a
// reload and work with the browser's back button.

import { useEffect, useState } from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'project'; id: number }
  | { name: 'settings' };

function parseHash(hash: string): Route {
  const match = /^#\/projects\/(\d+)$/.exec(hash);
  if (match) return { name: 'project', id: Number(match[1]) };
  if (hash === '#/settings') return { name: 'settings' };
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
        ? `#/projects/${next.id}`
        : next.name === 'settings'
          ? '#/settings'
          : '#/';
  };

  return [route, navigate];
}
