// Live scan updates (docs/CONCEPT.md 3.5). The worker runs in its own
// process and cannot push into the API's open HTTP connections, so the API
// polls its own embedded database once per second and fans the detected
// changes out to every connected SSE client. All polling lives here, in one
// place, instead of in every browser tab.

import { and, asc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import type { ScanEvent, ScanStatus } from '@lazysentry/shared';
import { db } from '../db/client.js';
import { jobs, scans } from '../db/schema.js';

const TERMINAL_SCAN_STATUSES = new Set([
  'completed',
  'completed_with_warnings',
  'failed',
]);

export interface ScanEventPoller {
  /** Events that happened since the previous call. */
  poll(): ScanEvent[];
}

function maxId(table: typeof scans | typeof jobs): number {
  const row = db
    .select({ value: sql<number | null>`max(id)` })
    .from(table)
    .get();
  return row?.value ?? 0;
}

/**
 * Diffs the scan and job tables against what the previous call saw.
 *
 * Seeded with the current maximum ids, so a restarted API process does not
 * replay the whole scan history to the first client that connects. Scans
 * that are still running are tracked individually until they reach a
 * terminal status; a scan that starts *and* finishes between two polls is
 * reported as both `scan.started` and its terminal event, so no state
 * transition is silently swallowed.
 */
export function createScanEventPoller(): ScanEventPoller {
  let lastScanId = maxId(scans);
  let lastJobId = maxId(jobs);
  const watchedScans = new Map<number, string>();
  const watchedJobs = new Map<number, string>();

  function pollScans(): ScanEvent[] {
    const events: ScanEvent[] = [];
    const watchedIds = [...watchedScans.keys()];
    const isNew = gt(scans.id, lastScanId);
    const rows = db
      .select({
        id: scans.id,
        projectId: scans.projectId,
        status: scans.status,
      })
      .from(scans)
      .where(
        watchedIds.length > 0 ? or(isNew, inArray(scans.id, watchedIds)) : isNew,
      )
      .orderBy(asc(scans.id))
      .all();

    const previousMaxId = lastScanId;
    for (const row of rows) {
      const known = watchedScans.get(row.id);
      if (known === undefined && row.id > previousMaxId) {
        events.push({
          type: 'scan.started',
          projectId: row.projectId,
          scanId: row.id,
          status: 'running',
        });
      }

      if (TERMINAL_SCAN_STATUSES.has(row.status)) {
        if (known !== row.status) {
          events.push({
            type: row.status === 'failed' ? 'scan.failed' : 'scan.completed',
            projectId: row.projectId,
            scanId: row.id,
            status: row.status as ScanStatus,
          });
        }
        watchedScans.delete(row.id);
      } else {
        watchedScans.set(row.id, row.status);
      }
      lastScanId = Math.max(lastScanId, row.id);
    }
    return events;
  }

  /**
   * Jobs are polled for the one case the scans table cannot show: a job that
   * failed before (or without) creating a scan record — a crashed worker, or
   * one that ran out of attempts. Without this the card would sit at "queued"
   * forever. A scan that merely *recorded* a failure completes its job
   * normally, so this does not duplicate `scan.failed` from pollScans.
   */
  function pollJobs(): ScanEvent[] {
    const events: ScanEvent[] = [];
    const watchedIds = [...watchedJobs.keys()];
    const isNew = gt(jobs.id, lastJobId);
    const rows = db
      .select({ id: jobs.id, status: jobs.status, payload: jobs.payload })
      .from(jobs)
      .where(
        and(
          eq(jobs.type, 'scan'),
          watchedIds.length > 0 ? or(isNew, inArray(jobs.id, watchedIds)) : isNew,
        ),
      )
      .orderBy(asc(jobs.id))
      .all();

    for (const row of rows) {
      const projectId = row.payload?.projectId;
      if (row.status === 'pending' || row.status === 'running') {
        watchedJobs.set(row.id, row.status);
      } else {
        if (row.status === 'failed' && typeof projectId === 'number') {
          events.push({
            type: 'scan.failed',
            projectId,
            scanId: null,
            status: 'failed',
          });
        }
        watchedJobs.delete(row.id);
      }
      lastJobId = Math.max(lastJobId, row.id);
    }
    return events;
  }

  return {
    poll: () => [...pollScans(), ...pollJobs()],
  };
}

export type ScanEventListener = (event: ScanEvent) => void;

/**
 * Owns the poll interval and the set of connected clients. One instance per
 * API process; the interval keeps running regardless of how many clients are
 * attached, because a single indexed query per second against an embedded
 * database is cheaper than the bookkeeping to start and stop it.
 */
export interface ScanEventStreamOptions {
  poller?: ScanEventPoller;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}

export class ScanEventStream {
  private readonly listeners = new Set<ScanEventListener>();
  private readonly poller: ScanEventPoller;
  private readonly intervalMs: number;
  private readonly onError: (error: unknown) => void;
  private timer: NodeJS.Timeout | undefined;

  constructor(options: ScanEventStreamOptions = {}) {
    this.poller = options.poller ?? createScanEventPoller();
    this.intervalMs = options.intervalMs ?? 1000;
    this.onError = options.onError ?? (() => {});
  }

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    // Never hold the process open just to poll.
    this.timer.unref();
  }

  stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  subscribe(listener: ScanEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private tick(): void {
    let events: ScanEvent[];
    try {
      events = this.poller.poll();
    } catch (error) {
      // A failed poll must not kill the interval — the next tick retries.
      this.onError(error);
      return;
    }
    for (const event of events) {
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch (error) {
          this.onError(error);
        }
      }
    }
  }
}
