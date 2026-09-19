// Audit log (docs/CONCEPT.md 2.2, 4, 6.2): security-relevant, state-changing
// actions only — not every GET request and not routine finding suppression.
// Writing an entry never fails the request it accompanies, same posture as
// notifyScanResult in scan/run-scan.ts: a broken audit write must not break
// the action being audited.

import { desc, lt } from 'drizzle-orm';
import type { AuditLogAction, AuditLogEntry } from '@lazysentry/shared';
import type { FastifyRequest } from 'fastify';
import { db } from '../db/client.js';
import { auditLog } from '../db/schema.js';

export interface RecordAuditLogInput {
  action: AuditLogAction;
  resourceType?: string;
  resourceId?: string | number;
  /** Small, non-secret context (e.g. { fullName } or { from, to }) — never a
   * token, password or raw secret (docs/CONCEPT.md 4.3's rule applies here
   * too). */
  meta?: Record<string, unknown>;
  /** Overrides the actor derived from the session — needed for a failed
   * login (no session yet) and for the setup wizard's first admin. */
  actor?: { userId: number | null; username: string | null };
}

type AuditLogRow = typeof auditLog.$inferSelect;

function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    userId: row.userId,
    username: row.username,
    ip: row.ip,
    action: row.action as AuditLogAction,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    meta: row.meta ?? null,
    createdAt: row.createdAt.getTime(),
  };
}

/**
 * Records one audit log entry. The actor and IP come from the session/request
 * unless `actor` overrides them (login attempts, which happen before a
 * session exists). Never throws — a logging failure must not take down the
 * request it is auditing.
 */
export function recordAuditLog(request: FastifyRequest, input: RecordAuditLogInput): void {
  try {
    const userId = input.actor ? input.actor.userId : (request.session.userId ?? null);
    const username = input.actor ? input.actor.username : (request.session.username ?? null);
    db.insert(auditLog)
      .values({
        userId,
        username,
        ip: request.ip,
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId === undefined ? null : String(input.resourceId),
        meta: input.meta ?? null,
        createdAt: new Date(),
      })
      .run();
  } catch (error) {
    request.log.error(error, 'failed to write audit log entry');
  }
}

const DEFAULT_PAGE_SIZE = 50;

/** Newest-first, cursor-paginated by id (GET /api/audit-log, admin only). */
export function listAuditLog(options: {
  limit?: number;
  beforeId?: number;
}): { entries: AuditLogEntry[]; hasMore: boolean } {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), 200);
  const rows = db
    .select()
    .from(auditLog)
    .where(options.beforeId !== undefined ? lt(auditLog.id, options.beforeId) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  return {
    entries: rows.slice(0, limit).map(toAuditLogEntry),
    hasMore,
  };
}
