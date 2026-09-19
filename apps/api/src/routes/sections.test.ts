import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Regression test for a real bug: deleting a section with members failed
// with "FOREIGN KEY constraint failed". schema.ts declares
// `sectionId: ... .references(() => projectSections.id, { onDelete: 'set
// null' })`, but the migration that actually added the column (0007) is a
// bare `ALTER TABLE projects ADD section_id integer REFERENCES
// project_sections(id)` with no ON DELETE clause — SQLite has no ALTER TABLE
// that can attach one after the fact, so every real install's live schema
// defaults to NO ACTION here regardless of what schema.ts says. This test
// runs against that same real migrated schema, not a mock, so it actually
// exercises the constraint.
const testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-test-'));
process.env.DATABASE_PATH = path.join(testDir, 'test.db');
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { closeDb, db, runMigrations } = await import('../db/client.js');
const { projects, projectSections } = await import('../db/schema.js');
const { eq } = await import('drizzle-orm');

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.delete(projects).run();
  db.delete(projectSections).run();
});

afterAll(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

/** The exact statement pair the DELETE /api/sections/:id route runs. */
function deleteSectionDetachingMembers(sectionId: number): void {
  db.update(projects).set({ sectionId: null }).where(eq(projects.sectionId, sectionId)).run();
  db.delete(projectSections).where(eq(projectSections.id, sectionId)).run();
}

describe('deleting a section with members', () => {
  it('detaches its projects instead of failing the foreign key constraint', () => {
    const section = db
      .insert(projectSections)
      .values({ name: 'Test', createdAt: new Date() })
      .returning()
      .get();
    const project = db
      .insert(projects)
      .values({
        name: 'demo',
        fullName: 'octocat/demo',
        cloneUrl: 'https://github.com/octocat/demo.git',
        addedAt: new Date(),
        sectionId: section.id,
      })
      .returning()
      .get();

    expect(() => deleteSectionDetachingMembers(section.id)).not.toThrow();

    expect(db.select().from(projectSections).all()).toHaveLength(0);
    const reloaded = db.select().from(projects).where(eq(projects.id, project.id)).get();
    expect(reloaded?.sectionId).toBeNull();
  });

  it('still deletes a section with no members', () => {
    const section = db
      .insert(projectSections)
      .values({ name: 'Empty', createdAt: new Date() })
      .returning()
      .get();

    expect(() => deleteSectionDetachingMembers(section.id)).not.toThrow();
    expect(db.select().from(projectSections).all()).toHaveLength(0);
  });
});
