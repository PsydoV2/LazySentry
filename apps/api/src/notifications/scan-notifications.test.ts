import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
// config.ts refuses to load without a master key (docs/CONCEPT.md 4.2).
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { notificationChannels, projects, vulnerabilities } = await import('../db/schema.js');
const { createNotificationChannel } = await import('./channels.js');
const { notifyScanResult } = await import('./scan-notifications.js');

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(vulnerabilities).run();
  db.delete(projects).run();
  db.delete(notificationChannels).run();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

function createProject(): number {
  return db
    .insert(projects)
    .values({
      name: 'demo',
      fullName: 'octocat/demo',
      cloneUrl: 'https://github.com/octocat/demo.git',
      addedAt: new Date(),
    })
    .returning({ id: projects.id })
    .get().id;
}

describe('notifyScanResult', () => {
  it('does nothing when no channel is configured', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const projectId = createProject();

    await notifyScanResult({ id: projectId, fullName: 'octocat/demo' }, 1, 'failed');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('broadcasts a scan failure to every configured channel', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const projectId = createProject();
    createNotificationChannel({
      platform: 'discord',
      label: null,
      url: 'https://discord.com/api/webhooks/1/x',
    });
    createNotificationChannel({
      platform: 'slack',
      label: null,
      url: 'https://hooks.slack.com/services/1/2/3',
    });

    await notifyScanResult({ id: projectId, fullName: 'octocat/demo' }, 1, 'failed');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const urls = fetchSpy.mock.calls.map(([url]) => url);
    expect(urls).toContain('https://discord.com/api/webhooks/1/x');
    expect(urls).toContain('https://hooks.slack.com/services/1/2/3');
  });

  it('never notifies about a cancelled scan', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const projectId = createProject();
    createNotificationChannel({ platform: 'webhook', label: null, url: 'https://example.test/hook' });

    await notifyScanResult({ id: projectId, fullName: 'octocat/demo' }, 1, 'cancelled');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports newly discovered open findings but not pre-existing ones', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const projectId = createProject();
    createNotificationChannel({ platform: 'webhook', label: null, url: 'https://example.test/hook' });

    db.insert(vulnerabilities)
      .values({
        projectId,
        osvId: 'GHSA-old',
        severity: 'critical',
        fingerprint: 'old',
        status: 'open',
        firstSeenScanId: 1, // seen in an earlier scan, not this one
        lastSeenScanId: 2,
      })
      .run();
    db.insert(vulnerabilities)
      .values({
        projectId,
        osvId: 'GHSA-new',
        severity: 'critical',
        fingerprint: 'new',
        status: 'open',
        firstSeenScanId: 2,
        lastSeenScanId: 2,
      })
      .run();

    await notifyScanResult({ id: projectId, fullName: 'octocat/demo' }, 2, 'completed');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(init!.body as string);
    expect(body.text).toContain('1 critical vulnerability');
  });

  it('sends nothing when a re-scan finds no new open findings', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const projectId = createProject();
    createNotificationChannel({ platform: 'webhook', label: null, url: 'https://example.test/hook' });

    await notifyScanResult({ id: projectId, fullName: 'octocat/demo' }, 2, 'completed');

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
