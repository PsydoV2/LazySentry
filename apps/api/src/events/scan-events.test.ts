import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Point the database at a throwaway file before the client module is imported.
const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
// config.ts refuses to load without a master key (docs/CONCEPT.md 4.2).
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { jobs, projects, scans } = await import('../db/schema.js');
const { ScanEventStream, createScanEventPoller } = await import('./scan-events.js');
const { eq } = await import('drizzle-orm');

function createProject(name: string): number {
  return db
    .insert(projects)
    .values({
      name,
      fullName: `test/${name}`,
      cloneUrl: `https://example.test/${name}`,
      addedAt: new Date(),
    })
    .returning({ id: projects.id })
    .get().id;
}

function startScan(projectId: number): number {
  return db
    .insert(scans)
    .values({
      projectId,
      status: 'running',
      trigger: 'manual',
      startedAt: new Date(),
    })
    .returning({ id: scans.id })
    .get().id;
}

function finishScan(scanId: number, status: string): void {
  db.update(scans).set({ status }).where(eq(scans.id, scanId)).run();
}

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(jobs).run();
  db.delete(scans).run();
  db.delete(projects).run();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('scan event poller', () => {
  it('emits nothing for history that existed before it started', () => {
    const projectId = createProject('old');
    finishScan(startScan(projectId), 'completed');

    const poller = createScanEventPoller();
    expect(poller.poll()).toEqual([]);
  });

  it('reports a scan start and its completion exactly once', () => {
    const projectId = createProject('alpha');
    const poller = createScanEventPoller();

    const scanId = startScan(projectId);
    expect(poller.poll()).toEqual([
      { type: 'scan.started', projectId, scanId, status: 'running' },
    ]);

    // Still running — no repeated event on every tick.
    expect(poller.poll()).toEqual([]);

    finishScan(scanId, 'completed_with_warnings');
    expect(poller.poll()).toEqual([
      {
        type: 'scan.completed',
        projectId,
        scanId,
        status: 'completed_with_warnings',
      },
    ]);
    expect(poller.poll()).toEqual([]);
  });

  it('reports a failed scan as scan.failed', () => {
    const projectId = createProject('beta');
    const poller = createScanEventPoller();
    const scanId = startScan(projectId);
    poller.poll();

    finishScan(scanId, 'failed');
    expect(poller.poll()).toEqual([
      { type: 'scan.failed', projectId, scanId, status: 'failed' },
    ]);
  });

  it('does not swallow a scan that starts and finishes between two polls', () => {
    const projectId = createProject('gamma');
    const poller = createScanEventPoller();

    const scanId = startScan(projectId);
    finishScan(scanId, 'completed');

    expect(poller.poll().map((event) => event.type)).toEqual([
      'scan.started',
      'scan.completed',
    ]);
  });

  it('reports a scan cancelled while running as scan.cancelled', () => {
    const projectId = createProject('zeta');
    const poller = createScanEventPoller();
    const scanId = startScan(projectId);
    const job = db
      .insert(jobs)
      .values({
        type: 'scan',
        payload: { projectId, trigger: 'manual' },
        status: 'running',
        createdAt: new Date(),
      })
      .returning({ id: jobs.id })
      .get();
    poller.poll();

    finishScan(scanId, 'cancelled');
    db.update(jobs).set({ status: 'cancelled' }).where(eq(jobs.id, job.id)).run();
    // The scan row's own transition is the one event — the job side must not
    // duplicate it just because it also reached a terminal state this tick.
    expect(poller.poll()).toEqual([
      { type: 'scan.cancelled', projectId, scanId, status: 'cancelled' },
    ]);
  });

  it('reports a job cancelled while still pending, which never created a scan record', () => {
    const projectId = createProject('eta');
    const poller = createScanEventPoller();

    const job = db
      .insert(jobs)
      .values({
        type: 'scan',
        payload: { projectId, trigger: 'manual' },
        createdAt: new Date(),
      })
      .returning({ id: jobs.id })
      .get();
    expect(poller.poll()).toEqual([]);

    db.update(jobs).set({ status: 'cancelled' }).where(eq(jobs.id, job.id)).run();
    expect(poller.poll()).toEqual([
      { type: 'scan.cancelled', projectId, scanId: null, status: 'cancelled' },
    ]);
  });

  it('reports a job that failed before producing a scan record', () => {
    const projectId = createProject('delta');
    const poller = createScanEventPoller();

    const job = db
      .insert(jobs)
      .values({
        type: 'scan',
        payload: { projectId, trigger: 'manual' },
        createdAt: new Date(),
      })
      .returning({ id: jobs.id })
      .get();
    // Queued, then running: neither is an event of its own.
    expect(poller.poll()).toEqual([]);

    db.update(jobs).set({ status: 'failed' }).where(eq(jobs.id, job.id)).run();
    expect(poller.poll()).toEqual([
      { type: 'scan.failed', projectId, scanId: null, status: 'failed' },
    ]);
    expect(poller.poll()).toEqual([]);
  });

  it('stays silent for a job that finished normally', () => {
    const projectId = createProject('epsilon');
    const poller = createScanEventPoller();
    const job = db
      .insert(jobs)
      .values({
        type: 'scan',
        payload: { projectId, trigger: 'manual' },
        createdAt: new Date(),
      })
      .returning({ id: jobs.id })
      .get();
    poller.poll();

    // A scan that merely *recorded* a failure still completes its job — the
    // scan row carries that outcome, so the job must not emit a second event.
    db.update(jobs).set({ status: 'done' }).where(eq(jobs.id, job.id)).run();
    expect(poller.poll()).toEqual([]);
  });
});

describe('scan event stream', () => {
  it('fans events out to subscribers and stops on unsubscribe', () => {
    const queued = [
      [{ type: 'scan.started', projectId: 1, scanId: 1, status: 'running' }],
      [{ type: 'scan.completed', projectId: 1, scanId: 1, status: 'completed' }],
    ] as const;
    let tick = 0;
    const stream = new ScanEventStream({
      poller: { poll: () => [...(queued[tick++] ?? [])] },
      intervalMs: 1,
    });

    const received: unknown[] = [];
    const unsubscribe = stream.subscribe((event) => received.push(event));
    // @ts-expect-error — driving the private tick directly keeps the test
    // free of timers; the interval only calls this method.
    stream.tick();
    unsubscribe();
    // @ts-expect-error — see above.
    stream.tick();

    expect(received).toEqual([queued[0]![0]]);
  });

  it('keeps polling after a failed poll', () => {
    let calls = 0;
    const errors: unknown[] = [];
    const stream = new ScanEventStream({
      poller: {
        poll: () => {
          calls++;
          if (calls === 1) throw new Error('database is locked');
          return [
            {
              type: 'scan.completed',
              projectId: 2,
              scanId: 5,
              status: 'completed',
            },
          ];
        },
      },
      onError: (error) => errors.push(error),
    });

    const received: unknown[] = [];
    stream.subscribe((event) => received.push(event));
    // @ts-expect-error — see above.
    stream.tick();
    expect(received).toEqual([]);
    expect(errors).toHaveLength(1);

    // @ts-expect-error — see above.
    stream.tick();
    expect(received).toHaveLength(1);
  });
});
