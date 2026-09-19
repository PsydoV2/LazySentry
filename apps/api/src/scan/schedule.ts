// Global scan-schedule check (roadmap Phase 3, docs/CONCEPT.md 2.3). One
// schedule for every project rather than a per-project one — matches the
// "one container, five-minute setup" philosophy (docs/CONCEPT.md 0.1, 1).
// Called periodically from the worker's poll loop, not on its own timer.
//
// The schedule is anchored to a fixed server-local time, not "N hours since
// this project's last scan" — the admin picks e.g. "daily at 04:00" or
// "every 6 hours starting at 02:00", and every project shares that same
// wall-clock boundary. A project is due once its last scan predates the
// most recent such boundary. This means many projects can become due at
// once; that's fine — the queue already runs scans one at a time
// (docs/CONCEPT.md 0.1), so a burst just fills the queue instead of firing
// concurrently.

import { scanScheduleHoursOfDay } from '@lazysentry/shared';
import { isNull, lte, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { projects } from '../db/schema.js';
import { enqueueScanJob, hasActiveScanJob } from '../queue/jobs.js';
import {
  getScanScheduleAnchorHour,
  getScanScheduleIntervalHours,
  getScanScheduleWeekday,
} from '../settings/app-settings.js';

/**
 * The latest scheduled occurrence at or before `now`. Walks back hour by
 * hour rather than computing it in closed form — the schedule space is tiny
 * (at most 24 candidate hours, at most 7 weekdays) so a brute-force search
 * is both simpler and easier to verify than date arithmetic across month/DST
 * boundaries.
 */
export function mostRecentOccurrence(
  now: Date,
  intervalHours: number,
  anchorHour: number,
  weekday: number,
): Date {
  const hours = scanScheduleHoursOfDay(intervalHours, anchorHour);
  const weekly = intervalHours >= 168;
  const candidate = new Date(now);
  candidate.setMinutes(0, 0, 0);
  // A week (168h) is the longest possible gap between occurrences.
  for (let step = 0; step < 24 * 8; step++) {
    if (
      candidate.getTime() <= now.getTime() &&
      hours.includes(candidate.getHours()) &&
      (!weekly || candidate.getDay() === weekday)
    ) {
      return candidate;
    }
    candidate.setHours(candidate.getHours() - 1);
  }
  // Unreachable: every non-empty hour set, optionally paired with a
  // weekday, recurs within 8 days of any starting point.
  throw new Error('could not resolve a scheduled occurrence');
}

/** Enqueues a 'scheduled' scan job for every project due for a rescan. Returns how many were enqueued. */
export function enqueueDueScheduledScans(now = new Date()): number {
  const intervalHours = getScanScheduleIntervalHours();
  if (intervalHours <= 0) return 0;

  const anchorHour = getScanScheduleAnchorHour();
  const weekday = getScanScheduleWeekday();
  const dueAt = mostRecentOccurrence(now, intervalHours, anchorHour, weekday);

  const due = db
    .select()
    .from(projects)
    .where(or(isNull(projects.lastScanAt), lte(projects.lastScanAt, dueAt)))
    .all();

  let enqueued = 0;
  for (const project of due) {
    if (hasActiveScanJob(project.id)) continue;
    enqueueScanJob({ projectId: project.id, trigger: 'scheduled' });
    enqueued++;
  }
  return enqueued;
}
