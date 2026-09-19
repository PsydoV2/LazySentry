// Standalone audit log modal (docs/CONCEPT.md 2.2, 6.2): security-relevant,
// state-changing actions only — not a general activity feed. Newest first,
// loaded a page at a time by growing the requested limit rather than tracking
// a cursor, which keeps this simple and avoids any StrictMode double-fetch
// bookkeeping for a view an admin opens only occasionally.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../components/Modal';
import { api, ApiError, type AuditLogList } from '../lib/api';
import { auditLogActionLabel, auditLogDetail } from '../lib/audit-log';
import { relativeTime } from '../lib/format';

export function AuditLog({ onClose }: { onClose: () => void }) {
  const [limit, setLimit] = useState(50);

  const auditLog = useQuery({
    queryKey: ['audit-log', limit],
    queryFn: () => api.get<AuditLogList>(`/api/audit-log?limit=${limit}`),
  });

  return (
    <Modal
      title="Audit log"
      subtitle="Security-relevant actions on this instance: sign-ins, user and account management, imports/deletions, scan triggers, and settings changes."
      onClose={onClose}
    >
      <div className="stack">
        {auditLog.isLoading && <p className="muted">Loading…</p>}
        {auditLog.isError && (
          <p className="notice notice-error">
            {auditLog.error instanceof ApiError
              ? auditLog.error.message
              : 'Could not load the audit log.'}
          </p>
        )}
        {auditLog.data && auditLog.data.entries.length === 0 && (
          <p className="subtle">Nothing logged yet.</p>
        )}

        {auditLog.data && auditLog.data.entries.length > 0 && (
          <div className="list">
            {auditLog.data.entries.map((entry) => (
              <div key={entry.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                <div className="stack" style={{ flex: 1, gap: 2 }}>
                  <span>
                    <strong>{auditLogActionLabel(entry.action)}</strong>
                    {entry.username && <span className="subtle"> by {entry.username}</span>}
                  </span>
                  {auditLogDetail(entry) && (
                    <span className="subtle">{auditLogDetail(entry)}</span>
                  )}
                </div>
                <span className="subtle">{entry.ip ?? ''}</span>
                <span className="subtle">{relativeTime(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        )}

        {auditLog.data?.hasMore && (
          <div>
            <button
              type="button"
              className="btn-quiet"
              disabled={auditLog.isFetching}
              onClick={() => setLimit((current) => current + 50)}
            >
              {auditLog.isFetching ? 'Loading…' : 'Load older'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
