// Splits the flat project list into the dashboard's three tiers — pinned,
// user-defined sections, and everything else — each in its own manual
// order. Pinned always outranks a section placement (the API enforces the
// same exclusivity), so a project appears in exactly one of the three.

import type { Project, ProjectSection } from '@lazysentry/shared';

export interface SectionGroup {
  section: ProjectSection;
  projects: Project[];
}

export interface DashboardGroups {
  pinned: Project[];
  sections: SectionGroup[];
  rest: Project[];
}

/**
 * Orders two projects within the same dashboard group. `sortOrder` is only
 * ever set explicitly by a pin/section/drag action — an untouched group has
 * every member at sortOrder 0, so `tiebreak` (typically urgency, matching
 * the dashboard's pre-organization behavior) decides among those instead of
 * falling back to something arbitrary like insertion id.
 */
export type ProjectComparator = (a: Project, b: Project) => number;

export function groupProjects(
  projects: Project[],
  sections: ProjectSection[],
  compare: ProjectComparator,
): DashboardGroups {
  const pinned = projects.filter((p) => p.pinned).sort(compare);

  const orderedSections = [...sections].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  );
  const sectionGroups = orderedSections.map((section) => ({
    section,
    projects: projects.filter((p) => !p.pinned && p.sectionId === section.id).sort(compare),
  }));

  const rest = projects.filter((p) => !p.pinned && p.sectionId === null).sort(compare);

  return { pinned, sections: sectionGroups, rest };
}

/** Discriminates the three drop targets a project card can land in. */
export type DashboardGroupKey =
  | { kind: 'pinned' }
  | { kind: 'section'; sectionId: number }
  | { kind: 'rest' };

export function groupKeyId(key: DashboardGroupKey): string {
  return key.kind === 'section' ? `section:${key.sectionId}` : key.kind;
}

export function groupKeysEqual(a: DashboardGroupKey, b: DashboardGroupKey): boolean {
  return groupKeyId(a) === groupKeyId(b);
}

export function projectsForGroup(groups: DashboardGroups, key: DashboardGroupKey): Project[] {
  if (key.kind === 'pinned') return groups.pinned;
  if (key.kind === 'rest') return groups.rest;
  return groups.sections.find((g) => g.section.id === key.sectionId)?.projects ?? [];
}
