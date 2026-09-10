// Startup recovery for scan records. A crashed worker leaves its scan row in
// 'running' forever, which the dashboard would render as a perpetual
// "scanning" state — exactly the false status the quality criteria in
// docs/CONCEPT.md 11 rule out.

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { scans } from '../db/schema.js';

/**
 * Marks scans still 'running' as failed. With concurrency 1 and a single
 * worker, any such row at worker startup belongs to a crashed process.
 */
export function recoverOrphanedScans(): number {
  const now = new Date();
  const result = db
    .update(scans)
    .set({
      status: 'failed',
      depsStatus: sql`case when ${scans.depsStatus} = 'pending' then 'failed' else ${scans.depsStatus} end`,
      secretsStatus: sql`case when ${scans.secretsStatus} = 'pending' then 'failed' else ${scans.secretsStatus} end`,
      finishedAt: now,
      durationMs: sql`${now.getTime()} - ${scans.startedAt}`,
      errorCode: 'WORKER_CRASHED',
      errorMessage: 'Worker process terminated before the scan finished',
    })
    .where(eq(scans.status, 'running'))
    .run();
  return result.changes;
}
