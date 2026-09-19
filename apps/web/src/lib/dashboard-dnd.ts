// Native HTML5 drag-and-drop for the dashboard: reordering project cards
// within and across the pinned/section/leftover groups, and reordering
// section headers themselves. No dnd library — this app has none beyond
// React and TanStack Query, and the interaction is simple enough (grab a
// card, drop it before another one or into empty space) not to need one.
//
// Two independent drag "modes" share one hook: dragging a project card only
// ever targets a project group (pinned / a section / leftover), dragging a
// section header only ever targets the section list. Each element only
// reacts to the mode it understands, so the two never interfere.

import { useEffect, useState, type DragEvent } from 'react';
import {
  groupKeysEqual,
  projectsForGroup,
  type DashboardGroupKey,
  type DashboardGroups,
} from './dashboard-groups';

type Dragging = { type: 'project'; id: number } | { type: 'section'; id: number };

interface ProjectDropTarget {
  group: DashboardGroupKey;
  /** null = append to the end of the group. */
  beforeId: number | null;
}

export function useDashboardDnd(
  groups: DashboardGroups,
  onReorderProjects: (ids: number[], pinned: boolean, sectionId: number | null) => void,
  onReorderSections: (ids: number[]) => void,
) {
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [projectTarget, setProjectTarget] = useState<ProjectDropTarget | null>(null);
  const [sectionTarget, setSectionTarget] = useState<number | null>(null);
  const [sectionTargetActive, setSectionTargetActive] = useState(false);

  function reset() {
    setDragging(null);
    setProjectTarget(null);
    setSectionTarget(null);
    setSectionTargetActive(false);
  }

  // Native HTML5 drag-and-drop doesn't auto-scroll the page, so reordering
  // a card far from its target (e.g. bottom of a long grid to the top)
  // otherwise means nudging it one drop at a time. While a drag is active,
  // hovering near the top/bottom edge of the viewport scrolls the page —
  // driven straight off the browser's own recurring `dragover` dispatch
  // rather than a separate rAF loop, since that's what keeps firing during
  // a native drag.
  useEffect(() => {
    if (!dragging) return;
    const EDGE = 80; // px from the viewport edge that starts scrolling
    const MAX_SPEED = 22; // px per dragover tick right at the edge

    function onDragOver(event: globalThis.DragEvent) {
      const y = event.clientY;
      const { innerHeight } = window;
      let delta = 0;
      if (y < EDGE) {
        delta = -MAX_SPEED * (1 - Math.max(y, 0) / EDGE);
      } else if (y > innerHeight - EDGE) {
        delta = MAX_SPEED * (1 - Math.max(innerHeight - y, 0) / EDGE);
      }
      if (delta !== 0) window.scrollBy(0, delta);
    }

    window.addEventListener('dragover', onDragOver);
    return () => window.removeEventListener('dragover', onDragOver);
  }, [dragging]);

  // ---- dragging a project card ----

  function beginProjectDrag(id: number) {
    return (event: DragEvent) => {
      setDragging({ type: 'project', id });
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(id));
    };
  }

  /** Hovering a specific card: insert the dragged card before this one. */
  function overProjectCard(group: DashboardGroupKey, projectId: number) {
    return (event: DragEvent) => {
      if (!dragging || dragging.type !== 'project') return;
      event.preventDefault();
      event.stopPropagation();
      setProjectTarget({ group, beforeId: projectId });
    };
  }

  /** Hovering the group's empty space (not a card): append to the end. */
  function overProjectGroup(group: DashboardGroupKey) {
    return (event: DragEvent) => {
      if (!dragging || dragging.type !== 'project') return;
      event.preventDefault();
      if (event.target !== event.currentTarget) return; // a card already claimed it
      setProjectTarget({ group, beforeId: null });
    };
  }

  function dropOnProjectGroup(group: DashboardGroupKey) {
    return (event: DragEvent) => {
      if (!dragging || dragging.type !== 'project') return;
      event.preventDefault();
      const target =
        projectTarget && groupKeysEqual(projectTarget.group, group)
          ? projectTarget
          : { group, beforeId: null as number | null };

      const ids = projectsForGroup(groups, group)
        .map((p) => p.id)
        .filter((id) => id !== dragging.id);
      if (target.beforeId === null) {
        ids.push(dragging.id);
      } else {
        const index = ids.indexOf(target.beforeId);
        ids.splice(index === -1 ? ids.length : index, 0, dragging.id);
      }
      onReorderProjects(ids, group.kind === 'pinned', group.kind === 'section' ? group.sectionId : null);
      reset();
    };
  }

  // ---- dragging a section header ----

  function beginSectionDrag(id: number) {
    return (event: DragEvent) => {
      setDragging({ type: 'section', id });
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(id));
    };
  }

  function overSectionHeader(sectionId: number) {
    return (event: DragEvent) => {
      if (!dragging || dragging.type !== 'section') return;
      event.preventDefault();
      event.stopPropagation();
      setSectionTarget(sectionId);
      setSectionTargetActive(true);
    };
  }

  function overSectionsList() {
    return (event: DragEvent) => {
      if (!dragging || dragging.type !== 'section') return;
      event.preventDefault();
      if (event.target !== event.currentTarget) return;
      setSectionTarget(null);
      setSectionTargetActive(true);
    };
  }

  function dropOnSectionsList() {
    return (event: DragEvent) => {
      if (!dragging || dragging.type !== 'section') return;
      event.preventDefault();
      const ids = groups.sections.map((g) => g.section.id).filter((id) => id !== dragging.id);
      if (sectionTarget === null) {
        ids.push(dragging.id);
      } else {
        const index = ids.indexOf(sectionTarget);
        ids.splice(index === -1 ? ids.length : index, 0, dragging.id);
      }
      onReorderSections(ids);
      reset();
    };
  }

  return {
    isDraggingProject: (id: number) => dragging?.type === 'project' && dragging.id === id,
    isDraggingSection: (id: number) => dragging?.type === 'section' && dragging.id === id,
    isProjectDragActive: dragging?.type === 'project',
    isSectionDragActive: dragging?.type === 'section',
    isProjectDropBefore: (group: DashboardGroupKey, projectId: number) =>
      dragging?.type === 'project' &&
      projectTarget !== null &&
      groupKeysEqual(projectTarget.group, group) &&
      projectTarget.beforeId === projectId,
    isProjectAppendTarget: (group: DashboardGroupKey) =>
      dragging?.type === 'project' &&
      projectTarget !== null &&
      groupKeysEqual(projectTarget.group, group) &&
      projectTarget.beforeId === null,
    isSectionDropBefore: (sectionId: number) =>
      sectionTargetActive && sectionTarget === sectionId,
    isSectionAppendTarget: () => sectionTargetActive && sectionTarget === null,
    beginProjectDrag,
    overProjectCard,
    overProjectGroup,
    dropOnProjectGroup,
    beginSectionDrag,
    overSectionHeader,
    overSectionsList,
    dropOnSectionsList,
    endDrag: reset,
  };
}

export type DashboardDnd = ReturnType<typeof useDashboardDnd>;
