// Global scan-schedule check (roadmap Phase 3, docs/CONCEPT.md 2.3). One
// interval for every project rather than a per-project schedule — matches
// the "one container, five-minute setup" philosophy (docs/CONCEPT.md 0.1,
// 1). Called periodically from the worker's poll loop, not on its own timer.

import { isNull, lte, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { projects } from '../db/schema.js';
import { enqueueScanJob, hasActiveScanJob } from '../queue/jobs.js';
import { getScanScheduleIntervalHours } from '../settings/app-settings.js';

/** Enqueues a 'scheduled' scan job for every project due for a rescan. Returns how many were enqueued. */
export function enqueueDueScheduledScans(): number {
  const intervalHours = getScanScheduleIntervalHours();
  if (intervalHours <= 0) return 0;

  const cutoff = new Date(Date.now() - intervalHours * 60 * 60 * 1000);
  const due = db
    .select()
    .from(projects)
    .where(or(isNull(projects.lastScanAt), lte(projects.lastScanAt, cutoff)))
    .all();

  let enqueued = 0;
  for (const project of due) {
    if (hasActiveScanJob(project.id)) continue;
    enqueueScanJob({ projectId: project.id, trigger: 'scheduled' });
    enqueued++;
  }
  return enqueued;
}
