// Determines which packages in osv-scanner's inventory are direct
// dependencies (docs/CONCEPT.md 4 `packages.is_direct`), by reading the
// manifest files themselves.
//
// osv-scanner's lockfile parsers (v2.5.1, checked against pnpm-lock.yaml and
// package-lock.json) don't report this — every package in `--all-packages`
// output comes back with no group/relationship info at all, direct or
// transitive alike. So this reads package.json / composer.json straight out
// of the clone instead of trusting the scanner for it. The clone has no
// node_modules/vendor (osv-scanner works off the lockfile, no install step
// ever runs), so a plain recursive walk is enough — no need to parse the
// lockfiles themselves to find workspace roots.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'vendor']);

/** ecosystem -> manifest filename -> manifest fields listing direct deps. */
const MANIFESTS: { ecosystem: string; filename: string; fields: string[] }[] = [
  { ecosystem: 'npm', filename: 'package.json', fields: ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] },
  { ecosystem: 'Packagist', filename: 'composer.json', fields: ['require', 'require-dev'] },
];

async function findFiles(rootDir: string, filename: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // e.g. a symlink race with the temp-dir cleanup — skip it
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name));
      } else if (entry.isFile() && entry.name === filename) {
        found.push(path.join(dir, entry.name));
      }
    }
  }
  await walk(rootDir);
  return found;
}

/**
 * ecosystem -> set of package names declared directly by some manifest in
 * the clone. An ecosystem missing from the map means no manifest of that
 * kind was found — callers must treat that as "unknown", not "transitive"
 * (docs/CONCEPT.md rule 2: don't turn "couldn't determine" into a guess).
 */
export async function collectDirectDependencyNames(
  scanDir: string,
): Promise<Map<string, Set<string>>> {
  const direct = new Map<string, Set<string>>();

  for (const { ecosystem, filename, fields } of MANIFESTS) {
    const names = new Set<string>();
    for (const file of await findFiles(scanDir, filename)) {
      try {
        const manifest = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
        for (const field of fields) {
          const deps = manifest[field];
          if (deps && typeof deps === 'object') {
            for (const name of Object.keys(deps)) names.add(name);
          }
        }
      } catch {
        // Malformed or unreadable manifest — direct/transitive is a display
        // nicety, not worth failing the scan over.
      }
    }
    if (names.size > 0) direct.set(ecosystem, names);
  }

  return direct;
}
