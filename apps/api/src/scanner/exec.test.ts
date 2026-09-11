// Uses `node` itself as the subprocess under test — it's guaranteed present
// in this project's own runtime, unlike osv-scanner/trufflehog, so these
// tests don't depend on either scanner binary being installed.

import { describe, expect, it } from 'vitest';
import { execute } from './exec.js';

describe('execute', () => {
  it('runs a process to completion and captures its output', async () => {
    const result = await execute(process.execPath, ['-e', 'console.log("hi")'], {
      timeoutMs: 5000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hi');
    expect(result.timedOut).toBe(false);
    expect(result.cancelled).toBe(false);
  });

  it('kills the process and reports cancelled when the signal aborts mid-run', async () => {
    const controller = new AbortController();
    const promise = execute(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 30000)'],
      { timeoutMs: 10_000, signal: controller.signal },
    );
    controller.abort();
    const result = await promise;

    expect(result.cancelled).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  it('never spawns when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await execute(process.execPath, ['-e', 'process.exit(1)'], {
      timeoutMs: 5000,
      signal: controller.signal,
    });

    expect(result.cancelled).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.spawnError).toBeUndefined();
  });

  it('reports a genuine timeout distinctly from a cancellation', async () => {
    const result = await execute(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 30000)'],
      { timeoutMs: 100 },
    );
    expect(result.timedOut).toBe(true);
    expect(result.cancelled).toBe(false);
  });
});
