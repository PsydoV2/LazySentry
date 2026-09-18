// Collapsible, drag-reorderable, renameable section header for the
// dashboard. Delete uses the same inline "click again to confirm" pattern
// as removing a project (SettingsTab) instead of a native confirm() dialog.

import { useEffect, useState } from 'react';
import type { ProjectSection } from '@lazysentry/shared';
import type { DashboardDnd } from '../lib/dashboard-dnd';
import { IconChevronDown, IconGripVertical, IconTrash } from './icons';

export function SectionHeader({
  section,
  count,
  dnd,
  onToggleCollapse,
  onRename,
  onDelete,
}: {
  section: ProjectSection;
  count: number;
  dnd: DashboardDnd;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => setName(section.name), [section.name]);

  if (confirmingDelete) {
    return (
      <div className="section-header section-header-confirm">
        <span className="muted">
          Delete "{section.name}"? Its projects move to the list below.
        </span>
        <button type="button" className="btn-danger" onClick={onDelete}>
          Delete
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setConfirmingDelete(false)}
        >
          Cancel
        </button>
      </div>
    );
  }

  const commitRename = () => {
    const trimmed = name.trim();
    setEditing(false);
    if (trimmed && trimmed !== section.name) onRename(trimmed);
    else setName(section.name);
  };

  return (
    <div
      className={[
        'section-header',
        dnd.isDraggingSection(section.id) ? 'is-dragging' : '',
        dnd.isSectionDropBefore(section.id) ? 'drop-before' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={!editing}
      onDragStart={dnd.beginSectionDrag(section.id)}
      onDragEnd={dnd.endDrag}
      onDragOver={dnd.overSectionHeader(section.id)}
    >
      <span className="section-drag-handle" aria-hidden="true">
        <IconGripVertical />
      </span>

      <button
        type="button"
        className={`icon-btn section-collapse-btn${section.collapsed ? ' is-collapsed' : ''}`}
        title={section.collapsed ? 'Expand section' : 'Collapse section'}
        aria-label={section.collapsed ? `Expand ${section.name}` : `Collapse ${section.name}`}
        onClick={onToggleCollapse}
      >
        <IconChevronDown />
      </button>

      {editing ? (
        <input
          type="text"
          autoFocus
          className="section-name-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitRename();
            if (event.key === 'Escape') {
              setName(section.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="section-name-btn"
          title="Rename section"
          onClick={() => setEditing(true)}
        >
          {section.name}
        </button>
      )}

      <span className="section-count subtle">{count}</span>

      <button
        type="button"
        className="icon-btn icon-btn-danger section-delete-btn"
        title="Delete section"
        aria-label={`Delete ${section.name}`}
        onClick={() => setConfirmingDelete(true)}
      >
        <IconTrash />
      </button>
    </div>
  );
}
