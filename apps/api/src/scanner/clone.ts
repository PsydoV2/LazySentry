// Clones a repository into a temporary scan directory with full history
// (TruffleHog needs it — no --depth 1). Token-based auth for private repos
// arrives with step 3 and will use GIT_ASKPASS, never the URL or argv.

import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execute } from './exec.js';

const CLONE_TIMEOUT_MS = 10 * 60 * 1000;

export const SCAN_DIR_PREFIX = 'scan-';

export class CloneError extends Error {}

export function newScanDir(): string {
  return path.join(tmpdir(), `${SCAN_DIR_PREFIX}${randomUUID()}`);
}

export async function cloneRepository(
  cloneUrl: string,
  targetDir: string,
): Promise<{ commitSha: string }> {
  const clone = await execute(
    'git',
    ['clone', '--quiet', '--', cloneUrl, targetDir],
    { timeoutMs: CLONE_TIMEOUT_MS },
  );
  if (clone.timedOut) {
    throw new CloneError('git clone timed out');
  }
  if (clone.exitCode !== 0) {
    // stderr may contain the clone URL; it must never contain a token
    // because tokens are passed out-of-band (GIT_ASKPASS, step 3).
    throw new CloneError(`git clone failed (exit ${clone.exitCode}): ${clone.stderr.trim()}`);
  }

  const revParse = await execute('git', ['-C', targetDir, 'rev-parse', 'HEAD'], {
    timeoutMs: 30_000,
  });
  if (revParse.exitCode !== 0) {
    throw new CloneError('could not determine HEAD commit of cloned repository');
  }

  return { commitSha: revParse.stdout.trim() };
}

export async function removeScanDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
}
