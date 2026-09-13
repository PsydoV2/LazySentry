import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
// config.ts refuses to load without a master key (docs/CONCEPT.md 4.2).
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { jobs, projects, scans } = await import('../db/schema.js');
const { scanStateFor, scanStatesByProject } = await import('./scan-state.js');
const { claimNextJob, completeJob, enqueueScanJob } = await import(
  '../queue/jobs.js'
);

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

describe('project scan state', () => {
  it('is idle for a project with no queued work', () => {
    const projectId = createProject('quiet');
    expect(scanStateFor(projectId)).toBe('idle');
    expect(scanStatesByProject().has(projectId)).toBe(false);
  });

  it('follows the job from queued to running and back to idle', () => {
    const projectId = createProject('busy');
    const job = enqueueScanJob({ projectId, trigger: 'manual' });
    expect(scanStateFor(projectId)).toBe('queued');

    claimNextJob('worker-a');
    expect(scanStateFor(projectId)).toBe('running');

    completeJob(job.id);
    expect(scanStateFor(projectId)).toBe('idle');
  });

  it('prefers running over a second job queued behind it', () => {
    const projectId = createProject('double');
    enqueueScanJob({ projectId, trigger: 'manual' });
    enqueueScanJob({ projectId, trigger: 'scheduled' });
    claimNextJob('worker-a');

    expect(scanStateFor(projectId)).toBe('running');
  });

  it('reports a scan row left running by a crashed worker as running', () => {
    const projectId = createProject('crashed');
    db.insert(scans)
      .values({
        projectId,
        status: 'running',
        trigger: 'manual',
        startedAt: new Date(),
      })
      .run();

    expect(scanStateFor(projectId)).toBe('running');
  });
});
