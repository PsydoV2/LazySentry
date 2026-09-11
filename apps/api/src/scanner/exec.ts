// Subprocess helper for scanner binaries and git. Always spawn with an
// argument array (never shell: true) and always enforce a hard timeout so a
// hanging process cannot block the queue — see docs/CONCEPT.md 0.3.

import { spawn } from 'node:child_process';

export interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
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
}

export function execute(
  command: string,
  args: string[],
  options: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve) => {
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

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);

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
      resolve({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        spawnError: error.message,
      });
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}
