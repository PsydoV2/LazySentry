// Subprocess helper for scanner binaries and git. Always spawn with an
// argument array (never shell: true) and always enforce a hard timeout so a
// hanging process cannot block the queue — see docs/CONCEPT.md 0.3.

import { spawn } from 'node:child_process';

export interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** True when `options.signal` fired before the process exited on its own. */
  cancelled: boolean;
  /**
   * Set when the process could not be started at all — a missing binary, a
   * wrong path in the configuration, a missing execute bit. Reported instead
   * of thrown so a caller can treat it as *that scanner* failing rather than
   * as the whole scan blowing up (docs/CONCEPT.md 5.7).
   */
  spawnError?: string;
}

export interface ExecOptions {
  timeoutMs: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Cap on captured stderr, to keep a noisy process out of the heap. */
  maxStderrBytes?: number;
  /** Kills the child immediately when this fires (a user-requested cancel). */
  signal?: AbortSignal;
}

export function execute(
  command: string,
  args: string[],
  options: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    // Already cancelled before we ever spawned anything — nothing to kill.
    if (options.signal?.aborted) {
      resolve({ exitCode: null, stdout: '', stderr: '', timedOut: false, cancelled: true });
      return;
    }

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);

    const onAbort = () => {
      cancelled = true;
      child.kill('SIGKILL');
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const maxStderr = options.maxStderrBytes ?? 64 * 1024;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < maxStderr) stderr += chunk;
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        cancelled,
        spawnError: error.message,
      });
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve({ exitCode, stdout, stderr, timedOut, cancelled });
    });
  });
}
