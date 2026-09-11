// Implementation step 1 (docs/CONCEPT.md section 10): scan one hardcoded
// public repository end-to-end. Superseded by the worker poll loop in step 2.

import { eq } from 'drizzle-orm';
import { db, runMigrations } from '../db/client.js';
import { projects } from '../db/schema.js';
import { runScan } from '../scan/run-scan.js';

// nodejs-goof is a deliberately vulnerable demo application — a public repo
// that reliably produces real CVEs from its committed package-lock.json.
const HARDCODED_REPO = {
  name: 'nodejs-goof',
  fullName: 'snyk-labs/nodejs-goof',
  cloneUrl: 'https://github.com/snyk-labs/nodejs-goof',
};

runMigrations();

let project = db
  .select()
  .from(projects)
  .where(eq(projects.fullName, HARDCODED_REPO.fullName))
  .get();
if (!project) {
  project = db
    .insert(projects)
    .values({ ...HARDCODED_REPO, addedAt: new Date() })
    .returning()
    .get();
}

console.log(`Scanning ${project.fullName} (project ${project.id}) ...`);
const { scanId, status } = await runScan({
  projectId: project.id,
  trigger: 'manual',
});
console.log(`Scan ${scanId} finished with status: ${status}`);
