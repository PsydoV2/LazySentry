// Upgrade safety (docs/CONCEPT.md 3.3, 11): a self-hosted user updates the
// container with an existing database. Migrating an older database must not
// lose data — a regression here silently destroys every scan result a user
// has, which is exactly what happened before foreign keys were disabled
// around the migration run.

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

const packageRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const realMigrations = path.join(packageRoot, 'drizzle');

interface Journal {
  entries: { idx: number; tag: string }[];
}

const journal: Journal = JSON.parse(
  readFileSync(path.join(realMigrations, 'meta', '_journal.json'), 'utf8'),
);

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'lazysentry-migrate-'));
  tempDirs.push(dir);
  return dir;
}

/** A migrations folder containing only the first `count` migrations. */
function migrationsUpTo(count: number): string {
  const dir = path.join(makeTempDir(), 'drizzle');
  mkdirSync(path.join(dir, 'meta'), { recursive: true });
  const entries = journal.entries.slice(0, count);
  for (const entry of entries) {
    copyFileSync(
      path.join(realMigrations, `${entry.tag}.sql`),
      path.join(dir, `${entry.tag}.sql`),
    );
  }
  const partial = JSON.parse(
    readFileSync(path.join(realMigrations, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;
  partial.entries = entries;
  writeFileSync(
    path.join(dir, 'meta', '_journal.json'),
    JSON.stringify(partial),
  );
  return dir;
}

function runMigrationsOn(dbPath: string, migrationsFolder: string): void {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  try {
    // Mirrors runMigrations() in db/client.ts.
    sqlite.pragma('foreign_keys = OFF');
    try {
      migrate(drizzle(sqlite), { migrationsFolder });
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      sqlite.pragma('foreign_keys = ON');
    }
  } finally {
    sqlite.close();
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('database migrations', () => {
  it('keeps existing scan data when upgrading from an older schema', () => {
    expect(journal.entries.length).toBeGreaterThan(1);

    const dbPath = path.join(makeTempDir(), 'upgrade.db');

    // An older release: every migration except the most recent one.
    runMigrationsOn(dbPath, migrationsUpTo(journal.entries.length - 1));

    // Data a real user would have accumulated before updating.
    const seed = new Database(dbPath);
    seed.pragma('foreign_keys = ON');
    seed
      .prepare(
        `insert into projects (id, name, full_name, clone_url, added_at)
         values (1, 'demo', 'acme/demo', 'https://example.test/acme/demo', 1)`,
      )
      .run();
    seed
      .prepare(
        `insert into scans (id, project_id, status, trigger)
         values (1, 1, 'completed', 'manual')`,
      )
      .run();
    seed
      .prepare(
        `insert into packages (id, scan_id, ecosystem, name, version_installed)
         values (1, 1, 'npm', 'lodash', '4.17.11')`,
      )
      .run();
    seed
      .prepare(
        `insert into vulnerabilities
           (id, project_id, package_id, osv_id, fingerprint,
            first_seen_scan_id, last_seen_scan_id)
         values (1, 1, 1, 'GHSA-test', 'fp-1', 1, 1)`,
      )
      .run();
    seed.close();

    // The container update.
    runMigrationsOn(dbPath, realMigrations);

    const after = new Database(dbPath, { readonly: true });
    const count = (table: string) =>
      (after.prepare(`select count(*) c from ${table}`).get() as { c: number }).c;

    expect(count('projects')).toBe(1);
    expect(count('scans')).toBe(1);
    expect(count('packages')).toBe(1);
    expect(count('vulnerabilities')).toBe(1);
    expect(
      after.prepare('select full_name from projects where id = 1').get(),
    ).toEqual({ full_name: 'acme/demo' });
    after.close();
  });

  it('runs cleanly on an empty database and is idempotent', () => {
    const dbPath = path.join(makeTempDir(), 'fresh.db');
    runMigrationsOn(dbPath, realMigrations);
    runMigrationsOn(dbPath, realMigrations);

    const db = new Database(dbPath, { readonly: true });
    const tables = db
      .prepare("select name from sqlite_master where type='table'")
      .all()
      .map((row) => (row as { name: string }).name);
    for (const table of [
      'projects',
      'scans',
      'packages',
      'vulnerabilities',
      'jobs',
      'users',
      'git_accounts',
      'settings',
    ]) {
      expect(tables).toContain(table);
    }
    db.close();
  });
});
