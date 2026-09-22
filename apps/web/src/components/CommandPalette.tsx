// Fleet-wide package/version search (docs/CONCEPT.md 2.2, incident-response
// search) as a ⌘K command palette — no permanent nav item, opened from
// UserMenu or the global keyboard shortcut (App.tsx) and closed on Escape or
// a backdrop click, same as every other dialog in this app. Answers come
// straight from each project's last scan snapshot; nothing here triggers a
// new scan except the explicit "Rescan now" on a single matched row.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FleetPackageMatches } from '@lazysentry/shared';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/format';
import type { Route } from '../lib/router';
import { IconPackage, IconSearch, IconX } from './icons';

/** "lodash < 4.17.21" → { name: "lodash", range: "< 4.17.21" } — one field
 * instead of separate inputs, so a range copied straight from an advisory
 * can be pasted in whole. */
function parseQuery(raw: string): { name: string; range?: string } {
  const trimmed = raw.trim();
  const spaceIndex = trimmed.search(/\s/);
  if (spaceIndex === -1) return { name: trimmed };
  return { name: trimmed.slice(0, spaceIndex), range: trimmed.slice(spaceIndex + 1).trim() };
}

export function CommandPalette({
  onClose,
  navigate,
}: {
  onClose: () => void;
  navigate: (route: Route) => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const { name, range } = parseQuery(debounced);

  const results = useQuery({
    queryKey: ['fleet-packages', name, range],
    queryFn: () =>
      api.get<FleetPackageMatches>(
        `/api/fleet/packages?name=${encodeURIComponent(name)}` +
          (range ? `&range=${encodeURIComponent(range)}` : ''),
      ),
    enabled: name.length >= 2,
  });

  const rescan = useMutation({
    mutationFn: (projectId: number) => api.post(`/api/projects/${projectId}/scans`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const matches = results.data?.matches ?? [];
  const projectCount = new Set(matches.map((m) => m.projectId)).size;

  return (
    <div
      className="command-palette-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Search fleet">
        <div className="command-palette-input-row">
          <IconSearch className="command-palette-input-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Search fleet: package name, e.g. lodash < 4.17.21"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <IconX />
          </button>
        </div>

        {name.length > 0 && name.length < 2 && (
          <p className="command-palette-hint subtle">Keep typing…</p>
        )}

        {results.isError && (
          <p className="notice notice-error" style={{ margin: 'var(--space-3) var(--space-4)' }}>
            {results.error instanceof ApiError ? results.error.message : 'Search failed.'}
          </p>
        )}

        {name.length >= 2 && results.data && matches.length === 0 && (
          <p className="command-palette-hint subtle">
            No project currently has "{name}"{range ? ` matching ${range}` : ''} installed.
          </p>
        )}

        {matches.length > 0 && (
          <div className="command-palette-list">
            {matches.map((match) => (
              <div key={`${match.projectId}-${match.packageName}`} className="command-palette-row">
                <span
                  className={`pill ${match.isDirect ? 'pill-info' : 'pill-neutral'}`}
                  title={match.isDirect ? 'Direct dependency' : 'Transitive dependency'}
                >
                  <IconPackage className="pill-icon" />
                  {match.isDirect ? 'direct' : 'transitive'}
                </span>
                <button
                  type="button"
                  className="command-palette-row-main"
                  onClick={() => {
                    onClose();
                    navigate({ name: 'project', id: match.projectId, tab: 'dependencies' });
                  }}
                >
                  <span className="command-palette-row-name">{match.projectName}</span>
                  <span className="subtle">
                    {match.versionInstalled} · {match.ecosystem} · last scan{' '}
                    {relativeTime(match.lastScanAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-quiet"
                  disabled={rescan.isPending}
                  onClick={() => rescan.mutate(match.projectId)}
                >
                  Rescan now
                </button>
              </div>
            ))}
          </div>
        )}

        {matches.length > 0 && (
          <div className="command-palette-footer subtle">
            {matches.length} match{matches.length === 1 ? '' : 'es'} in {projectCount} project
            {projectCount === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}
