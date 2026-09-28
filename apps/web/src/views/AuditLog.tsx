// Standalone audit log modal (docs/CONCEPT.md 2.2, 6.2): security-relevant,
// state-changing actions only — not a general activity feed. Sidebar groups
// entries by category (same modal-sidebar/modal-nav language as
// ProjectDetail's tabs), main pane is a date-grouped timeline. Newest first,
// loaded a page at a time by growing the requested limit rather than
// tracking a cursor, which keeps this simple and avoids any StrictMode
// double-fetch bookkeeping for a view an admin opens only occasionally.
//
// Category and search filtering happen client-side over whatever page is
// currently loaded — there is no server-side filter endpoint, so sidebar
// badge counts reflect the loaded page, not the full history; "Load older"
// grows both.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../components/Modal';
import { api, ApiError, type AuditLogEntry, type AuditLogList } from '../lib/api';
import {
  auditLogActionLabel,
  auditLogCategory,
  auditLogDayLabel,
  auditLogDetail,
  AUDIT_LOG_CATEGORY_LABEL,
  type AuditLogCategory,
} from '../lib/audit-log';
import { formatDateTime, relativeTime } from '../lib/format';
import {
  IconBell,
  IconFolder,
  IconHistory,
  IconKey,
  IconLock,
  IconPlay,
  IconSettings,
  IconShieldAlert,
  IconUser,
} from '../components/icons';

type CategoryFilter = AuditLogCategory | 'all';

const CATEGORY_ICON: Record<AuditLogCategory, typeof IconLock> = {
  auth: IconLock,
  user: IconUser,
  git_account: IconKey,
  project: IconFolder,
  scan: IconPlay,
  settings: IconSettings,
  notification_channel: IconBell,
};

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All activity' },
  ...(Object.keys(AUDIT_LOG_CATEGORY_LABEL) as AuditLogCategory[]).map((key) => ({
    key,
    label: AUDIT_LOG_CATEGORY_LABEL[key],
  })),
];

export function AuditLog({ onClose }: { onClose: () => void }) {
  const [limit, setLimit] = useState(50);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');

  const auditLog = useQuery({
    queryKey: ['audit-log', limit],
    queryFn: () => api.get<AuditLogList>(`/api/audit-log?limit=${limit}`),
  });

  const entries = auditLog.data?.entries ?? [];

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<AuditLogCategory, number>> = {};
    for (const entry of entries) {
      const key = auditLogCategory(entry.action);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (category !== 'all' && auditLogCategory(entry.action) !== category) return false;
      if (!query) return true;
      const haystack = [
        auditLogActionLabel(entry.action),
        entry.username ?? '',
        entry.ip ?? '',
        auditLogDetail(entry) ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [entries, category, search]);

  const groups = useMemo(() => {
    const result: { label: string; entries: AuditLogEntry[] }[] = [];
    for (const entry of filtered) {
      const label = auditLogDayLabel(entry.createdAt);
      const last = result[result.length - 1];
      if (last && last.label === label) {
        last.entries.push(entry);
      } else {
        result.push({ label, entries: [entry] });
      }
    }
    return result;
  }, [filtered]);

  return (
    <Modal
      title="Audit log"
      onClose={onClose}
      wide
      sidebar={
        <>
          <div className="stack" style={{ gap: 2 }}>
            <h2>Audit log</h2>
            <span className="subtle">Security-relevant actions on this instance</span>
          </div>

          <input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <nav className="modal-nav">
            {CATEGORIES.map(({ key, label }) => {
              const Icon = key === 'all' ? IconHistory : CATEGORY_ICON[key];
              const count = key === 'all' ? entries.length : categoryCounts[key] ?? 0;
              return (
                <button
                  key={key}
                  type="button"
                  className={`modal-nav-item ${category === key ? 'is-active' : ''}`}
                  onClick={() => setCategory(key)}
                >
                  <Icon className="modal-nav-icon" />
                  {label}
                  {count > 0 && <span className="modal-nav-badge">{count}</span>}
                </button>
              );
            })}
          </nav>
        </>
      }
      footer={
        <div className="spread" style={{ width: '100%' }}>
          <span className="subtle">
            {filtered.length} of {entries.length} loaded
          </span>
          {auditLog.data?.hasMore && (
            <button
              type="button"
              className="btn-secondary"
              disabled={auditLog.isFetching}
              onClick={() => setLimit((current) => current + 50)}
            >
              {auditLog.isFetching ? 'Loading…' : 'Load older'}
            </button>
          )}
        </div>
      }
    >
      {auditLog.isLoading && <p className="muted">Loading…</p>}
      {auditLog.isError && (
        <p className="notice notice-error">
          {auditLog.error instanceof ApiError
            ? auditLog.error.message
            : 'Could not load the audit log.'}
        </p>
      )}
      {auditLog.data && entries.length === 0 && <p className="subtle">Nothing logged yet.</p>}
      {auditLog.data && entries.length > 0 && filtered.length === 0 && (
        <p className="subtle">No events match this filter.</p>
      )}

      {groups.length > 0 && (
        <div className="timeline">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="date-heading">{group.label}</div>
              {group.entries.map((entry) => {
                const isFailedLogin = entry.action === 'auth.login_failed';
                const Icon = isFailedLogin ? IconShieldAlert : CATEGORY_ICON[auditLogCategory(entry.action)];
                const detail = auditLogDetail(entry);
                return (
                  <div key={entry.id} className="timeline-entry">
                    <span className={`timeline-dot ${isFailedLogin ? 'is-warning' : ''}`}>
                      <Icon />
                    </span>
                    <div className="spread">
                      <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                        <span>
                          <strong>{auditLogActionLabel(entry.action)}</strong>
                          {entry.username && <span className="subtle"> by {entry.username}</span>}
                          {isFailedLogin && <span className="pill pill-high"> failed</span>}
                        </span>
                        {detail && <span className="subtle">{detail}</span>}
                      </div>
                      <div className="row" style={{ gap: 8, flexShrink: 0 }}>
                        {entry.ip && <span className="ip-chip">{entry.ip}</span>}
                        <span className="subtle" title={formatDateTime(entry.createdAt)}>
                          {relativeTime(entry.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
