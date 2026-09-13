// Repository picker (docs/CONCEPT.md 8.1): paginated, searchable, multi
// select, already-imported repositories greyed out rather than hidden.
// Repositories come from one connected account at a time — a selector
// appears once more than one account is connected.

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import { IconChevronLeft, IconChevronRight, IconGithub } from './icons';
import { api, ApiError, type GitAccountsList, type RepositoryPage } from '../lib/api';

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const accounts = useQuery({
    queryKey: ['git-accounts'],
    queryFn: () => api.get<GitAccountsList>('/api/git-accounts'),
  });

  // Default to the (first) connected account once the list arrives.
  useEffect(() => {
    if (accountId === null && accounts.data && accounts.data.accounts.length > 0) {
      setAccountId(accounts.data.accounts[0]!.id);
    }
  }, [accountId, accounts.data]);

  const repositories = useQuery({
    queryKey: ['repositories', accountId, page, search],
    enabled: accountId !== null,
    queryFn: () =>
      api.get<RepositoryPage>(
        `/api/git-accounts/${accountId}/repositories?page=${page}` +
          (search ? `&search=${encodeURIComponent(search)}` : ''),
      ),
  });

  const importRepositories = useMutation({
    mutationFn: () =>
      api.post<{ imported: unknown[]; skipped: string[] }>(
        '/api/projects/import',
        { gitAccountId: accountId, repositoryIds: [...selected] },
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

  function switchAccount(id: number) {
    setAccountId(id);
    setPage(1);
    setSelected(new Set());
  }

  const hasMultipleAccounts = (accounts.data?.accounts.length ?? 0) > 1;

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

          {hasMultipleAccounts && (
            <select
              value={accountId ?? ''}
              onChange={(event) => switchAccount(Number(event.target.value))}
            >
              {accounts.data!.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.provider === 'gitlab' ? 'GitLab' : 'GitHub'} · {account.username}
                </option>
              ))}
            </select>
          )}

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
          {(accounts.isLoading || repositories.isLoading) && <LoadingState />}

          {accounts.data && accounts.data.accounts.length === 0 && (
            <EmptyState icon={IconGithub} message="No git account connected yet." />
          )}

          {repositories.isError && (
            <p className="notice notice-error">
              {repositories.error instanceof ApiError
                ? repositories.error.message
                : 'Could not load repositories'}
            </p>
          )}

          {repositories.data && repositories.data.repositories.length === 0 && (
            <EmptyState icon={IconGithub} message="No repositories match this filter." />
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

        <div className="dialog-footer dialog-footer-paginated">
          <button
            type="button"
            className="btn-secondary btn-icon-only"
            title="Previous page"
            aria-label="Previous page"
            disabled={page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            <IconChevronLeft />
          </button>

          <div className="row" style={{ gap: 8 }}>
            <span className="subtle">
              {selected.size > 0 ? `${selected.size} selected` : ''}
            </span>
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

          <button
            type="button"
            className="btn-secondary btn-icon-only"
            title="Next page"
            aria-label="Next page"
            disabled={!repositories.data?.hasMore}
            onClick={() => setPage((current) => current + 1)}
          >
            <IconChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
}
