// What a project is doing right now (docs/CONCEPT.md 8.1: a freshly imported
// project must show up as `scanning` immediately, before any scan record
// exists). The denormalized counters on `projects` only describe the last
// *finished* scan, so the live state is derived from the job queue instead.

import { eq, inArray } from 'drizzle-orm';
import type { ScanState } from '@lazysentry/shared';
import { db } from '../db/client.js';
import { jobs, scans } from '../db/schema.js';

/** Live scan state per project id; projects without one are simply absent. */
export function scanStatesByProject(): Map<number, ScanState> {
  const states = new Map<number, ScanState>();

  const active = db
    .select({ status: jobs.status, payload: jobs.payload })
    .from(jobs)
    .where(inArray(jobs.status, ['pending', 'running']))
    .all();
  for (const job of active) {
    const projectId = job.payload?.projectId;
    if (typeof projectId !== 'number') continue;
    // A project can have a running job and a queued one behind it; running
    // is the more specific state and wins.
    if (states.get(projectId) === 'running') continue;
    states.set(projectId, job.status === 'running' ? 'running' : 'queued');
  }

  // Defensive: a scan row in 'running' without a running job means the
  // worker died mid-scan and has not restarted yet (its startup recovery
  // marks such rows failed). Showing "running" is still more honest than
  // showing the previous scan's result as if it were current.
  const running = db
    .select({ projectId: scans.projectId })
    .from(scans)
    .where(eq(scans.status, 'running'))
    .all();
  for (const scan of running) {
    states.set(scan.projectId, 'running');
  }

  return states;
}

export function scanStateFor(projectId: number): ScanState {
  return scanStatesByProject().get(projectId) ?? 'idle';
}
