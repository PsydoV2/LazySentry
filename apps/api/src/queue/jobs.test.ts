import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Point the database at a throwaway file before the client module is imported.
// process.loadEnvFile() in config.ts does not override existing variables.
const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { jobs } = await import('../db/schema.js');
const {
  claimNextJob,
  completeJob,
  enqueueScanJob,
  failJob,
  hasActiveScanJob,
  recoverOrphanedJobs,
} = await import('./jobs.js');
const { eq } = await import('drizzle-orm');

function getJob(id: number) {
  return db.select().from(jobs).where(eq(jobs.id, id)).get()!;
}

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  // Each test starts from an empty queue; a job left pending by one test
  // would otherwise be claimed by the next.
  db.delete(jobs).run();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('job queue', () => {
  it('claims pending jobs oldest first and only once', () => {
    const first = enqueueScanJob({ projectId: 1, trigger: 'manual' });
    const second = enqueueScanJob({ projectId: 2, trigger: 'manual' });

    const claimed = claimNextJob('worker-a');
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.status).toBe('running');
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.lockedBy).toBe('worker-a');

    // The running job is not handed out again.
    expect(claimNextJob('worker-b')?.id).toBe(second.id);
    expect(claimNextJob('worker-c')).toBeNull();

    completeJob(first.id);
    completeJob(second.id);
    expect(getJob(first.id).status).toBe('done');
    expect(getJob(first.id).lockedBy).toBeNull();
  });

  it('reports a queued or running scan for a project, but not a finished one', () => {
    const job = enqueueScanJob({ projectId: 42, trigger: 'manual' });
    expect(hasActiveScanJob(42)).toBe(true);
    expect(hasActiveScanJob(43)).toBe(false);

    claimNextJob('worker-a');
    expect(hasActiveScanJob(42)).toBe(true);

    completeJob(job.id);
    expect(hasActiveScanJob(42)).toBe(false);
  });

  it('retries a failed job until max_attempts is exhausted', () => {
    const job = enqueueScanJob({ projectId: 7, trigger: 'manual' });

    for (let attempt = 1; attempt < 3; attempt++) {
      claimNextJob('worker-a');
      failJob(job.id, `boom ${attempt}`);
      const row = getJob(job.id);
      expect(row.status).toBe('pending');
      expect(row.attempts).toBe(attempt);
      expect(row.finishedAt).toBeNull();
    }

    claimNextJob('worker-a');
    failJob(job.id, 'boom 3');
    const row = getJob(job.id);
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(3);
    expect(row.errorMessage).toBe('boom 3');
    expect(row.finishedAt).not.toBeNull();
  });

  it('returns a crashed worker’s running job to the queue', () => {
    const job = enqueueScanJob({ projectId: 8, trigger: 'manual' });
    claimNextJob('worker-crashed');

    expect(recoverOrphanedJobs()).toBe(1);
    const row = getJob(job.id);
    expect(row.status).toBe('pending');
    expect(row.lockedBy).toBeNull();
    expect(row.lockedAt).toBeNull();
    // The attempt is kept, so a job that keeps crashing eventually fails.
    expect(row.attempts).toBe(1);
  });

  it('fails a recovered job that has no attempts left instead of looping forever', () => {
    const job = enqueueScanJob({ projectId: 9, trigger: 'manual' });
    for (let i = 0; i < 3; i++) {
      claimNextJob('worker-crashed');
      if (i < 2) failJob(job.id, 'crash');
    }
    // Third attempt is running when the worker dies.
    expect(recoverOrphanedJobs()).toBe(1);
    const row = getJob(job.id);
    expect(row.status).toBe('failed');
    expect(row.errorMessage).toBe('worker crashed during execution');
  });
});
