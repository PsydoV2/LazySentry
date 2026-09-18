// Repository picker (docs/CONCEPT.md 8.1): paginated, searchable, multi
// select, already-imported repositories excluded entirely rather than shown.
// Repositories come from one connected account at a time — a selector
// appears once more than one account is connected.

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import {
  IconChevronLeft,
  IconChevronRight,
  IconGithub,
  IconGitlab,
  IconLock,
  IconPlus,
  IconX,
} from './icons';
import { api, ApiError, type GitAccountsList, type RepositoryPage } from '../lib/api';
import type { Route } from '../lib/router';

// GitHub's usual per-language marker colors — decorative only, matches the
// convention repo lists elsewhere use so a language is recognizable at a
// glance instead of just named.
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Go: '#00add8',
  Rust: '#dea584',
  Java: '#b07219',
  Ruby: '#701516',
  'C#': '#178600',
  PHP: '#4f5d95',
  Swift: '#f05138',
};

export function ImportDialog({
  onClose,
  navigate,
}: {
  onClose: () => void;
  navigate: (route: Route) => void;
}) {
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

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-label="Import projects">
        <div className="dialog-header">
          <h2>Import repositories</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <IconX />
          </button>
        </div>

        <div className="dialog-split">
          {accounts.data && (
            <div className="account-sidebar">
              {accounts.data.accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className={`account-sidebar-item ${account.id === accountId ? 'is-active' : ''}`}
                  onClick={() => switchAccount(account.id)}
                >
                  <span className="account-avatar" aria-hidden="true">
                    {account.provider === 'gitlab' ? <IconGitlab /> : <IconGithub />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <div className="account-name">{account.username}</div>
                    <div className="account-provider">
                      {account.provider === 'gitlab' ? 'GitLab' : 'GitHub'}
                    </div>
                  </span>
                </button>
              ))}

              <button
                type="button"
                className="account-sidebar-item account-sidebar-add"
                onClick={() => {
                  onClose();
                  navigate({ name: 'settings' });
                }}
              >
                <span className="account-avatar" aria-hidden="true">
                  <IconPlus />
                </span>
                Add account
              </button>
            </div>
          )}

          <div className="dialog-main">
            <div className="dialog-search">
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
                <div className="repo-list">
                  {repositories.data.repositories.map((repo) => {
                    const [owner, ...rest] = repo.fullName.split('/');
                    const name = rest.join('/');
                    const isSelected = selected.has(repo.providerRepoId);
                    return (
                      <label
                        key={repo.providerRepoId}
                        className={`repo-row ${isSelected ? 'is-selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(repo.providerRepoId)}
                        />
                        <span className="repo-row-name">
                          <span className="repo-row-owner">{owner}/</span>
                          {name}
                          {repo.isPrivate && (
                            <IconLock className="repo-row-lock" width={12} height={12} />
                          )}
                        </span>
                        <span style={{ flex: 1 }} />
                        {repo.language && (
                          <>
                            <span
                              className="lang-dot"
                              style={{ background: LANGUAGE_COLORS[repo.language] ?? 'var(--text-subtle)' }}
                            />
                            <span className="repo-row-lang">{repo.language}</span>
                          </>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="dialog-footer dialog-footer-paginated">
              <div className="pager-text">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Previous page"
                  disabled={page === 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  <IconChevronLeft />
                </button>
                <span>
                  Page {page}
                  {repositories.data?.totalPages ? ` of ${repositories.data.totalPages}` : ''}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Next page"
                  disabled={!repositories.data?.hasMore}
                  onClick={() => setPage((current) => current + 1)}
                >
                  <IconChevronRight />
                </button>
              </div>

              <button
                type="button"
                className="btn-primary"
                disabled={selected.size === 0 || importRepositories.isPending}
                onClick={() => importRepositories.mutate()}
              >
                {importRepositories.isPending
                  ? 'Importing…'
                  : selected.size > 0
                    ? `Import ${selected.size} repositor${selected.size === 1 ? 'y' : 'ies'}`
                    : 'Import'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
