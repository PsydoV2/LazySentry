// Clones a repository into a temporary scan directory with full history
// (TruffleHog needs it — no --depth 1).

import { randomUUID } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execute } from './exec.js';

const CLONE_TIMEOUT_MS = 10 * 60 * 1000;

export const SCAN_DIR_PREFIX = 'scan-';

export class CloneError extends Error {
  constructor(
    message: string,
    /** True when the remote rejected our credentials (401/403). */
    readonly isAuthFailure = false,
  ) {
    super(message);
  }
}

export function newScanDir(): string {
  return path.join(tmpdir(), `${SCAN_DIR_PREFIX}${randomUUID()}`);
}

/**
 * Builds the environment for an authenticated clone.
 *
 * The token goes into git's config via GIT_CONFIG_* environment variables
 * rather than the clone URL or a command-line argument: process arguments are
 * readable by anyone who can run `ps` on the host, environment variables are
 * not (docs/CONCEPT.md 0.3, 6.2).
 */
function cloneEnv(token: string | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Never let git block on an interactive credential prompt inside a
    // headless worker — fail fast instead.
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
  };
  if (token === undefined) return env;

  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
  env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${basic}`;
  return env;
}

/** Detects an authentication failure in git's (token-free) stderr output. */
function isAuthFailure(stderr: string): boolean {
  return /Authentication failed|could not read Username|invalid username or password|403 Forbidden|401 Unauthorized|Repository not found/i.test(
    stderr,
  );
}

export async function cloneRepository(
  cloneUrl: string,
  targetDir: string,
  token?: string,
): Promise<{ commitSha: string }> {
  const clone = await execute(
    'git',
    ['clone', '--quiet', '--', cloneUrl, targetDir],
    { timeoutMs: CLONE_TIMEOUT_MS, env: cloneEnv(token) },
  );
  if (clone.spawnError) {
    throw new CloneError(`could not start git (${clone.spawnError})`);
  }
  if (clone.timedOut) {
    throw new CloneError('git clone timed out');
  }
  if (clone.exitCode !== 0) {
    const stderr = clone.stderr.trim();
    throw new CloneError(
      `git clone failed (exit ${clone.exitCode}): ${stderr}`,
      isAuthFailure(stderr),
    );
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

/**
 * Removes scan directories left behind by a crashed worker. Called at worker
 * startup (docs/CONCEPT.md 0.3): with a single worker and concurrency 1, any
 * existing scan-* directory is an orphan at that point.
 */
export async function cleanupOrphanedScanDirs(): Promise<string[]> {
  const base = tmpdir();
  let entries: string[];
  try {
    entries = await readdir(base);
  } catch {
    return [];
  }
  const orphans = entries.filter((name) => name.startsWith(SCAN_DIR_PREFIX));
  for (const name of orphans) {
    await removeScanDir(path.join(base, name));
  }
  return orphans;
}
