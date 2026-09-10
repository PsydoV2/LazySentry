import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../config.js';
import * as schema from './schema.js';

// Works from both src/ (tsx) and dist/ (build): each is one level below the
// package root, where the drizzle/ migrations folder lives.
const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'drizzle',
);

mkdirSync(path.dirname(path.resolve(config.DATABASE_PATH)), {
  recursive: true,
});

const sqlite = new Database(config.DATABASE_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export function runMigrations(): void {
  // SQLite cannot change the foreign_keys pragma inside a transaction, and
  // the migrator wraps every migration in one. Since a column change makes
  // Drizzle rebuild the table (create new → copy → DROP old → rename), an
  // enabled foreign_keys pragma turns that DROP into a cascading delete of
  // every child row. Disabling it here — outside the transaction — is what
  // keeps an upgrade from wiping scans and findings (docs/CONCEPT.md 3.3).
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder });

    const violations = sqlite.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new Error(
        `Migration left ${violations.length} foreign key violation(s); database not modified further`,
      );
    }
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
}

/** Closes the database handle — for graceful shutdown and tests. */
export function closeDb(): void {
  sqlite.close();
}
