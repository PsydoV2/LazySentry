// The job queue is a SQLite table polled by the worker process — deliberately
// no Redis/BullMQ (docs/CONCEPT.md 0.1). Concurrency is 1: a single worker
// claims one job at a time.

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { jobs, type ScanJobPayload } from '../db/schema.js';

export type Job = typeof jobs.$inferSelect;

export function enqueueScanJob(payload: ScanJobPayload): Job {
  return db
    .insert(jobs)
    .values({ type: 'scan', payload, createdAt: new Date() })
    .returning()
    .get();
}

/** True if a scan job for this project is already waiting or running. */
export function hasActiveScanJob(projectId: number): boolean {
  return findActiveScanJob(projectId) !== null;
}

/** The waiting or running scan job for this project, if any. */
export function findActiveScanJob(projectId: number): Job | null {
  const active = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.type, 'scan'), inArray(jobs.status, ['pending', 'running'])))
    .all();
  return active.find((job) => job.payload.projectId === projectId) ?? null;
}

/** Atomically claims the oldest pending job, or returns null. */
export function claimNextJob(workerId: string): Job | null {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(jobs)
      .where(eq(jobs.status, 'pending'))
      .orderBy(asc(jobs.id))
      .limit(1)
      .get();
    if (!next) return null;
    return tx
      .update(jobs)
      .set({
        status: 'running',
        attempts: sql`${jobs.attempts} + 1`,
        lockedAt: new Date(),
        lockedBy: workerId,
      })
      .where(eq(jobs.id, next.id))
      .returning()
      .get();
  });
}

export function completeJob(jobId: number): void {
  db.update(jobs)
    .set({ status: 'done', finishedAt: new Date(), lockedAt: null, lockedBy: null })
    .where(eq(jobs.id, jobId))
    .run();
}

/**
 * Cancels an active scan job for a project (docs/CONCEPT.md 8.1 stop
 * action). A pending job is simply marked cancelled — it never started, so
 * there is no process to kill. A running one only gets its
 * `cancelRequested` flag set here: api and worker are separate processes
 * sharing this table, not memory, so the worker's own poll loop is what
 * actually notices the flag and aborts the in-flight scan.
 */
export function cancelScanJob(projectId: number): 'not_found' | 'cancelled' | 'cancelling' {
  const job = findActiveScanJob(projectId);
  if (!job) return 'not_found';
  if (job.status === 'pending') {
    markJobCancelled(job.id);
    return 'cancelled';
  }
  requestJobCancellation(job.id);
  return 'cancelling';
}

/** Sets the flag the worker's poll loop checks while running this job. */
export function requestJobCancellation(jobId: number): void {
  db.update(jobs).set({ cancelRequested: true }).where(eq(jobs.id, jobId)).run();
}

/** Read by the worker's own poll loop while it is running this job. */
export function isCancelRequested(jobId: number): boolean {
  const row = db
    .select({ cancelRequested: jobs.cancelRequested })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .get();
  return row?.cancelRequested ?? false;
}

export function markJobCancelled(jobId: number): void {
  db.update(jobs)
    .set({
      status: 'cancelled',
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      cancelRequested: false,
      errorMessage: 'Cancelled by user',
    })
    .where(eq(jobs.id, jobId))
    .run();
}

/** Marks a failed attempt: back to pending, or failed once attempts are exhausted. */
export function failJob(jobId: number, errorMessage: string): void {
  db.update(jobs)
    .set({
      status: sql`case when ${jobs.attempts} >= ${jobs.maxAttempts} then 'failed' else 'pending' end`,
      finishedAt: sql`case when ${jobs.attempts} >= ${jobs.maxAttempts} then ${Date.now()} else null end`,
      errorMessage,
      lockedAt: null,
      lockedBy: null,
    })
    .where(eq(jobs.id, jobId))
    .run();
}

/**
 * Startup recovery (docs/CONCEPT.md 0.1): with a single worker, any job still
 * 'running' at startup belongs to a crashed process. Reset it to 'pending',
 * or mark it 'failed' once max_attempts is exhausted.
 */
export function recoverOrphanedJobs(): number {
  // A job whose cancellation was requested right before the worker crashed
  // should end up cancelled, not silently retried or reported as a crash.
  const cancelled = db
    .update(jobs)
    .set({
      status: 'cancelled',
      errorMessage: 'Cancelled by user',
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      cancelRequested: false,
    })
    .where(and(eq(jobs.status, 'running'), eq(jobs.cancelRequested, true)))
    .run();

  const result = db
    .update(jobs)
    .set({
      status: sql`case when ${jobs.attempts} >= ${jobs.maxAttempts} then 'failed' else 'pending' end`,
      errorMessage: sql`case when ${jobs.attempts} >= ${jobs.maxAttempts} then 'worker crashed during execution' else ${jobs.errorMessage} end`,
      finishedAt: sql`case when ${jobs.attempts} >= ${jobs.maxAttempts} then ${Date.now()} else null end`,
      lockedAt: null,
      lockedBy: null,
    })
    .where(and(eq(jobs.status, 'running'), eq(jobs.cancelRequested, false)))
    .run();
  return result.changes + cancelled.changes;
}
