// The scan worker: polls the jobs table and runs scans sequentially,
// concurrency 1 (docs/CONCEPT.md 0.1/0.2, section 5).
//
// Kept separate from the entrypoint in worker.ts so the combined single-
// process mode (main.ts, docs/CONCEPT.md 0.2) can start the same loop
// without spawning a second process.

import { config } from './config.js';
import { runMigrations } from './db/client.js';
import {
  claimNextJob,
  completeJob,
  failJob,
  isCancelRequested,
  markJobCancelled,
  recoverOrphanedJobs,
  type Job,
} from './queue/jobs.js';
import { recoverOrphanedScans } from './scan/recovery.js';
import { runScan } from './scan/run-scan.js';
import { enqueueDueScheduledScans } from './scan/schedule.js';
import { checkScannerChecksums } from './scanner/checksum.js';
import { cleanupOrphanedScanDirs } from './scanner/clone.js';
import { execute } from './scanner/exec.js';
import { SCANNER_VERSIONS } from './scanner/versions.js';

const POLL_INTERVAL_MS = 1000;
// The schedule check runs on its own cadence inside the same poll loop
// rather than a second timer — cheap enough not to need one, and this keeps
// concurrency at 1 (docs/CONCEPT.md 0.1): a scheduled scan is just another
// row in the same jobs table, claimed like any other.
const SCHEDULE_CHECK_INTERVAL_MS = 60_000;
const workerId = `worker-${process.pid}`;

let shuttingDown = false;

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${workerId}: ${message}`);
}

/**
 * Warns at startup about a scanner that cannot be executed. Without this the
 * first symptom is a scan that reports a failure for reasons nobody sees
 * until they open the scan record — and in a fresh local checkout a missing
 * binary is the single most likely thing to be wrong.
 */
async function checkScannerBinaries(): Promise<void> {
  const binaries = [
    ['osv-scanner', config.OSV_SCANNER_PATH, 'OSV_SCANNER_PATH'],
    ['trufflehog', config.TRUFFLEHOG_PATH, 'TRUFFLEHOG_PATH'],
  ] as const;
  for (const [name, binaryPath, envVar] of binaries) {
    const result = await execute(binaryPath, ['--version'], { timeoutMs: 15_000 });
    if (result.spawnError) {
      log(
        `WARNING: ${name} cannot be executed at "${binaryPath}" (${result.spawnError}). ` +
          `Scans will record this scanner as failed — set ${envVar} to a working binary.`,
      );
    }
  }
}

/**
 * Checksum verification of the scanner binaries (docs/CONCEPT.md 2.2, 6.2).
 * A mismatch is a compromise indicator, not a normal operating state — the
 * worker refuses to start rather than run untrusted repo content through a
 * binary it can no longer vouch for (threat model 6.1). Unpinned is only a
 * warning: it must stay visible rather than look like a passed check.
 */
async function verifyScannerChecksums(): Promise<void> {
  const results = await checkScannerChecksums([
    { name: 'osv-scanner', binaryPath: config.OSV_SCANNER_PATH },
    { name: 'trufflehog', binaryPath: config.TRUFFLEHOG_PATH },
  ]);

  const mismatches = results.filter((r) => r.status === 'mismatch');
  for (const result of results) {
    if (result.status === 'unpinned') {
      log(
        `WARNING: no pinned checksum for ${result.name} ${SCANNER_VERSIONS[result.name]} — ` +
          `checksum verification is not active for this binary. See scanner/versions.ts.`,
      );
    } else if (result.status === 'mismatch') {
      log(
        `CRITICAL: ${result.name} binary checksum does not match the pinned value ` +
          `(expected ${result.expected}, got ${result.actual}). Refusing to start.`,
      );
    }
    // 'binary_not_found' is already reported by checkScannerBinaries above.
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Scanner checksum mismatch for: ${mismatches.map((r) => r.name).join(', ')}. ` +
        'This can mean the image was tampered with — refusing to start the worker.',
    );
  }
}

async function processJob(job: Job): Promise<void> {
  log(`processing job ${job.id} (${job.type}, attempt ${job.attempts}/${job.maxAttempts})`);

  // api and worker are separate processes sharing only the database
  // (docs/CONCEPT.md 0.1), so a cancel request arrives as a row, not a
  // signal — this poll is what turns it into the AbortSignal runScan
  // actually reacts to while a subprocess is in flight.
  const abortController = new AbortController();
  const cancelPoll = setInterval(() => {
    if (isCancelRequested(job.id)) abortController.abort();
  }, POLL_INTERVAL_MS);

  try {
    if (job.type !== 'scan') {
      throw new Error(`unknown job type: ${job.type}`);
    }
    const { scanId, status } = await runScan(job.payload, abortController.signal);
    // A scan that ran and recorded a failure is a processed job — the result
    // lives on the scan record. Only infrastructure errors (throws) retry.
    if (status === 'cancelled') {
      markJobCancelled(job.id);
    } else {
      completeJob(job.id);
    }
    log(`job ${job.id} done (scan ${scanId}: ${status})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failJob(job.id, message);
    log(`job ${job.id} attempt failed: ${message}`);
  } finally {
    clearInterval(cancelPoll);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs until stopWorker() is called. Startup recovery runs first: with a
 * single worker, anything still marked running belongs to a process that
 * died (docs/CONCEPT.md 0.1).
 */
export async function startWorker(): Promise<void> {
  shuttingDown = false;
  runMigrations();

  await checkScannerBinaries();
  await verifyScannerChecksums();

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
  let lastScheduleCheck = 0;
  while (!shuttingDown) {
    const job = claimNextJob(workerId);
    if (job) {
      await processJob(job);
    } else {
      if (Date.now() - lastScheduleCheck >= SCHEDULE_CHECK_INTERVAL_MS) {
        lastScheduleCheck = Date.now();
        const enqueued = enqueueDueScheduledScans();
        if (enqueued > 0) log(`enqueued ${enqueued} scheduled scan(s)`);
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }
  log('shut down');
}

/**
 * Asks the loop to stop after the job it is currently running. Closing the
 * database is left to the caller: in the combined mode the API process is
 * still using the same handle.
 */
export function stopWorker(): void {
  shuttingDown = true;
}
