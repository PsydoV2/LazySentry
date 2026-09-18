// One dashboard tier (pinned / a section / the leftover group): an optional
// header, a project grid that is itself a drop zone, and — while dragging a
// project — an insertion indicator on whichever card or empty space is
// currently hovered.

import type { ReactNode } from 'react';
import type { Project } from '@lazysentry/shared';
import type { DashboardGroupKey } from '../lib/dashboard-groups';
import type { DashboardDnd } from '../lib/dashboard-dnd';

export function DashboardGroup({
  groupKey,
  projects,
  dnd,
  renderCard,
  header,
  emptyPlaceholder,
}: {
  groupKey: DashboardGroupKey;
  projects: Project[];
  dnd: DashboardDnd;
  renderCard: (project: Project) => ReactNode;
  header?: ReactNode;
  /** Shown instead of the grid when the group has no members — lets an
   * empty section still act as a drop target. */
  emptyPlaceholder?: ReactNode;
}) {
  const appendTarget = dnd.isProjectAppendTarget(groupKey);

  return (
    <div className="dashboard-group">
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
