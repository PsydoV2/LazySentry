// Fleet-wide trend snapshots (docs/CONCEPT.md 2.2): one row per calendar day
// capturing the fleet's aggregate severity and sustainability counts,
// sampled from the same denormalized counters the dashboard cards already
// show. Deliberately a daily point-in-time sample rather than a full
// historical reconstruction — captured once a day starting from whenever
// this shipped, never backfilled (11. "kein falsches Grün": a chart with
// three real days of history looks like three days, not more).
//
// Called periodically from the worker's poll loop (worker-loop.ts), same
// "cheap enough not to need its own timer" pattern as scan/schedule.ts.

import { sustainabilityStatusFor } from '@lazysentry/shared';
import { eq, gte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { fleetSnapshots, projects } from '../db/schema.js';

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Captures today's fleet snapshot if one doesn't exist yet. Returns whether
 * it captured one, so the caller can log it — mirrors
 * enqueueDueScheduledScans's "no-op most ticks" shape.
 */
export function captureDueFleetSnapshot(now: Date = new Date()): boolean {
  const today = dateKey(now);
  const existing = db
    .select({ id: fleetSnapshots.id })
    .from(fleetSnapshots)
    .where(eq(fleetSnapshots.date, today))
    .get();
  if (existing) return false;

  const counts = {
    countVulnCritical: 0,
    countVulnHigh: 0,
    countVulnMedium: 0,
    countVulnLow: 0,
    countSustainActive: 0,
    countSustainAging: 0,
    countSustainStale: 0,
    countSustainDead: 0,
    countSustainUnknown: 0,
  };

  const nowMs = now.getTime();
  for (const project of db.select().from(projects).all()) {
    counts.countVulnCritical += project.countVulnCritical;
    counts.countVulnHigh += project.countVulnHigh;
    counts.countVulnMedium += project.countVulnMedium;
    counts.countVulnLow += project.countVulnLow;

    const status = sustainabilityStatusFor(
      project.lastCommitAt ? project.lastCommitAt.getTime() : null,
      nowMs,
    );
    if (status === 'active') counts.countSustainActive++;
    else if (status === 'aging') counts.countSustainAging++;
    else if (status === 'stale') counts.countSustainStale++;
    else if (status === 'dead') counts.countSustainDead++;
    else counts.countSustainUnknown++;
  }

  db.insert(fleetSnapshots)
    .values({ date: today, createdAt: now, ...counts })
    .run();
  return true;
}

export interface FleetTrendsQuery {
  days: number;
}

/** Snapshots on or after `now - days`, oldest first — however few actually exist. */
export function queryFleetTrends({ days }: FleetTrendsQuery, now: Date = new Date()) {
  const since = dateKey(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
  return db
    .select()
    .from(fleetSnapshots)
    .where(gte(fleetSnapshots.date, since))
    .orderBy(fleetSnapshots.date)
    .all();
}
