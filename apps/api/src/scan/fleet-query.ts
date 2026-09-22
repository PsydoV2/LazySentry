// Fleet-wide package/version query (docs/CONCEPT.md 2.2, incident-response
// search): "which of my projects have lodash < 4.17.21 installed", answered
// straight from each project's latest scan snapshot — no new scan run, no
// new dependency. Reuses the same version-range matching the version-audit
// path already ships (lib/semver.ts).

import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { packages, projects, scans } from '../db/schema.js';
import { matchesVersionRange } from '../lib/semver.js';

export interface FleetPackageQueryInput {
  name: string;
  /** npm-style range/comparator, e.g. "< 4.17.21" or "^2.0.0". */
  range?: string;
}

export interface FleetPackageMatchRow {
  projectId: number;
  projectName: string;
  projectFullName: string;
  lastScanAt: Date | null;
  ecosystem: string;
  packageName: string;
  versionInstalled: string;
  isDirect: boolean | null;
}

/**
 * One row per project whose *current* package inventory (its newest scan
 * that actually produced one — same rule as GET /api/projects/:id/packages)
 * contains a package matching `name`, optionally narrowed to a version
 * range. A project whose latest scan no longer has the package (removed
 * since an older scan) contributes nothing — this is a live "what's
 * installed now" answer, not a historical search.
 */
export function queryFleetPackages(input: FleetPackageQueryInput): FleetPackageMatchRow[] {
  const nameLower = input.name.trim().toLowerCase();
  if (!nameLower) return [];

  // Every project's true "current" scan — the newest one with a package
  // inventory at all, regardless of whether it happens to include this
  // package — so a project that dropped the dependency since an older scan
  // is correctly excluded rather than reported with stale data.
  const latestScanIdByProject = new Map<number, number>();
  for (const row of db
    .select({ projectId: scans.projectId, scanId: packages.scanId })
    .from(packages)
    .innerJoin(scans, eq(packages.scanId, scans.id))
    .all()) {
    const current = latestScanIdByProject.get(row.projectId);
    if (current === undefined || row.scanId > current) {
      latestScanIdByProject.set(row.projectId, row.scanId);
    }
  }

  const nameMatches = db
    .select({
      projectId: scans.projectId,
      scanId: packages.scanId,
      ecosystem: packages.ecosystem,
      packageName: packages.name,
      versionInstalled: packages.versionInstalled,
      isDirect: packages.isDirect,
    })
    .from(packages)
    .innerJoin(scans, eq(packages.scanId, scans.id))
    .all()
    .filter((row) => row.packageName.toLowerCase() === nameLower);

  const current = nameMatches.filter(
    (row) => latestScanIdByProject.get(row.projectId) === row.scanId,
  );

  const matched = input.range
    ? current.filter((row) => matchesVersionRange(row.versionInstalled, input.range!) === true)
    : current;
  if (matched.length === 0) return [];

  const projectById = new Map(db.select().from(projects).all().map((project) => [project.id, project]));

  const result: FleetPackageMatchRow[] = [];
  for (const row of matched) {
    const project = projectById.get(row.projectId);
    if (!project) continue; // deleted between the two reads above — skip rather than throw
    result.push({
      projectId: project.id,
      projectName: project.name,
      projectFullName: project.fullName,
      lastScanAt: project.lastScanAt,
      ecosystem: row.ecosystem,
      packageName: row.packageName,
      versionInstalled: row.versionInstalled,
      isDirect: row.isDirect,
    });
  }
  // Direct dependencies first (the more actionable match), then by project name.
  result.sort((a, b) => {
    if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1;
    return a.projectName.localeCompare(b.projectName);
  });
  return result;
}
