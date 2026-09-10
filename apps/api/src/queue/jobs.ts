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
  const active = db
    .select({ id: jobs.id, payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.type, 'scan'), inArray(jobs.status, ['pending', 'running'])))
    .all();
  return active.some((job) => job.payload.projectId === projectId);
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
  const result = db
    .update(jobs)
    .set({
      status: sql`case when ${jobs.attempts} >= ${jobs.maxAttempts} then 'failed' else 'pending' end`,
      errorMessage: sql`case when ${jobs.attempts} >= ${jobs.maxAttempts} then 'worker crashed during execution' else ${jobs.errorMessage} end`,
      finishedAt: sql`case when ${jobs.attempts} >= ${jobs.maxAttempts} then ${Date.now()} else null end`,
      lockedAt: null,
      lockedBy: null,
    })
    .where(eq(jobs.status, 'running'))
    .run();
  return result.changes;
}
