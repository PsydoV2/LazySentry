// Repository picker (docs/CONCEPT.md 8.1): paginated, searchable, multi
// select, already-imported repositories greyed out rather than hidden.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type RepositoryPage } from '../lib/api';

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const repositories = useQuery({
    queryKey: ['repositories', page, search],
    queryFn: () =>
      api.get<RepositoryPage>(
        `/api/git-accounts/github/repositories?page=${page}` +
          (search ? `&search=${encodeURIComponent(search)}` : ''),
      ),
  });

  const importRepositories = useMutation({
    mutationFn: () =>
      api.post<{ imported: unknown[]; skipped: string[] }>(
        '/api/projects/import',
        { repositoryIds: [...selected] },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Import projects">
        <div className="dialog-header stack">
          <h2>Import repositories</h2>
          <input
            type="search"
            value={search}
            placeholder="Filter by name…"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="dialog-body">
          {repositories.isLoading && <p className="muted">Loading…</p>}

          {repositories.isError && (
            <p className="notice notice-error">
              {repositories.error instanceof ApiError
                ? repositories.error.message
                : 'Could not load repositories'}
            </p>
          )}

          {repositories.data && repositories.data.repositories.length === 0 && (
            <p className="muted">No repositories match this filter.</p>
          )}

          {repositories.data && repositories.data.repositories.length > 0 && (
            <div className="list">
              {repositories.data.repositories.map((repo) => (
                <label
                  key={repo.providerRepoId}
                  className={`list-row ${repo.imported ? 'is-disabled' : ''}`}
                >
                  <input
                    type="checkbox"
                    disabled={repo.imported}
                    checked={selected.has(repo.providerRepoId)}
                    onChange={() => toggle(repo.providerRepoId)}
                  />
                  <span className="spread" style={{ flex: 1 }}>
                    <span>
                      {repo.fullName}
                      {repo.isPrivate && (
                        <span className="subtle"> · private</span>
                      )}
                      {repo.language && (
                        <span className="subtle"> · {repo.language}</span>
                      )}
                    </span>
                    {repo.imported && <span className="subtle">imported</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <span className="subtle" style={{ marginRight: 'auto' }}>
            {selected.size > 0 ? `${selected.size} selected` : ''}
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!repositories.data?.hasMore}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={selected.size === 0 || importRepositories.isPending}
            onClick={() => importRepositories.mutate()}
          >
            {importRepositories.isPending
              ? 'Importing…'
              : `Import${selected.size > 0 ? ` ${selected.size}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
