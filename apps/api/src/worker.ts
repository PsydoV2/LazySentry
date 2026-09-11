// Entrypoint for the worker process: polls the jobs table and runs scans
// sequentially, concurrency 1 (docs/CONCEPT.md 0.1/0.2, section 5).

import { closeDb, runMigrations } from './db/client.js';
import {
  claimNextJob,
  completeJob,
  failJob,
  recoverOrphanedJobs,
  type Job,
} from './queue/jobs.js';
import { recoverOrphanedScans } from './scan/recovery.js';
import { runScan } from './scan/run-scan.js';
import { cleanupOrphanedScanDirs } from './scanner/clone.js';

const POLL_INTERVAL_MS = 1000;
const workerId = `worker-${process.pid}`;

let shuttingDown = false;

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${workerId}: ${message}`);
}

async function processJob(job: Job): Promise<void> {
  log(`processing job ${job.id} (${job.type}, attempt ${job.attempts}/${job.maxAttempts})`);
  try {
    if (job.type !== 'scan') {
      throw new Error(`unknown job type: ${job.type}`);
    }
    const { scanId, status } = await runScan(job.payload);
    // A scan that ran and recorded a failure is a processed job — the result
    // lives on the scan record. Only infrastructure errors (throws) retry.
    completeJob(job.id);
    log(`job ${job.id} done (scan ${scanId}: ${status})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failJob(job.id, message);
    log(`job ${job.id} attempt failed: ${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  runMigrations();

  const orphanDirs = await cleanupOrphanedScanDirs();
  if (orphanDirs.length > 0) {
    log(`removed ${orphanDirs.length} orphaned scan director${orphanDirs.length === 1 ? 'y' : 'ies'}`);
  }
  const recoveredScans = recoverOrphanedScans();
  if (recoveredScans > 0) {
    log(`marked ${recoveredScans} interrupted scan(s) as failed`);
  }
  const recovered = recoverOrphanedJobs();
  if (recovered > 0) {
    log(`recovered ${recovered} orphaned running job(s)`);
  }

  log('polling for jobs');
  while (!shuttingDown) {
    const job = claimNextJob(workerId);
    if (job) {
      await processJob(job);
    } else {
      await sleep(POLL_INTERVAL_MS);
    }
  }
  closeDb();
  log('shut down');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log(`received ${signal}, finishing current job`);
    shuttingDown = true;
  });
}

await main();
