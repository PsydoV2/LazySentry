// One dashboard tier (pinned / a section / the leftover group): an optional
// header, a project grid that is itself a drop zone, and — while dragging a
// project — an insertion indicator on whichever card or empty space is
// currently hovered.

import type { ReactNode } from 'react';
import type { Project } from '@lazysentry/shared';
import type { DashboardGroupKey } from '../lib/dashboard-groups';
import type { DashboardDnd } from '../lib/dashboard-dnd';

// Must match .project-grid's grid-template-columns (minmax(320px, 420px))
// and the gap variable (--space-4) in styles.css.
const CARD_MAX_WIDTH = 420;
const GRID_GAP = 16;

/**
 * The one section width every group shares, driven only by how many
 * fixed-420px cards fit side by side in the space actually available (docs:
 * see useElementWidth) — not by how many cards any particular section
 * holds. A section with fewer cards than that is still this width, with its
 * cards left-aligned inside it, so every section's left/right edge lines up
 * with every other. The width only ever steps up once there's room for one
 * more full column, and steps back down the same way, never in between.
 */
export function maxSectionWidth(availableWidth: number): number | undefined {
  if (availableWidth <= 0) return undefined;
  const columns = Math.max(
    1,
    Math.floor((availableWidth + GRID_GAP) / (CARD_MAX_WIDTH + GRID_GAP)),
  );
  return columns * CARD_MAX_WIDTH + (columns - 1) * GRID_GAP;
}

export function DashboardGroup({
  groupKey,
  projects,
  sectionWidth,
  dnd,
  renderCard,
  header,
  emptyPlaceholder,
}: {
  groupKey: DashboardGroupKey;
  projects: Project[];
  /** Shared width for every section on the dashboard — see maxSectionWidth. */
  sectionWidth: number | undefined;
  dnd: DashboardDnd;
  renderCard: (project: Project) => ReactNode;
  header?: ReactNode;
  /** Shown instead of the grid when the group has no members — lets an
   * empty section still act as a drop target. */
  emptyPlaceholder?: ReactNode;
}) {
  const appendTarget = dnd.isProjectAppendTarget(groupKey);

  return (
    <div className="dashboard-group" style={sectionWidth ? { width: sectionWidth } : undefined}>
      {header}

      {projects.length > 0 ? (
        <div
          className={`project-grid${appendTarget ? ' drop-append' : ''}`}
          onDragOver={dnd.overProjectGroup(groupKey)}
          onDrop={dnd.dropOnProjectGroup(groupKey)}
        >
          {projects.map((project) => (
            <div
              key={project.id}
              draggable
              className={[
                'project-drag-item',
                dnd.isDraggingProject(project.id) ? 'is-dragging' : '',
                dnd.isProjectDropBefore(groupKey, project.id) ? 'drop-before' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onDragStart={dnd.beginProjectDrag(project.id)}
              onDragEnd={dnd.endDrag}
              onDragOver={dnd.overProjectCard(groupKey, project.id)}
            >
              {renderCard(project)}
            </div>
          ))}
        </div>
      ) : emptyPlaceholder ? (
        <div
          className={`section-empty-drop${appendTarget ? ' drop-append' : ''}`}
          onDragOver={dnd.overProjectGroup(groupKey)}
          onDrop={dnd.dropOnProjectGroup(groupKey)}
        >
          {emptyPlaceholder}
        </div>
      ) : null}
    </div>
  );
}
