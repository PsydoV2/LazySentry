// Per-card overflow menu: pin/unpin and move-to-section. Replaces the old
// "more" button, which used to just duplicate opening the project — same
// dropdown mechanics as UserMenu (outside click / Escape closes it).

import { useEffect, useRef, useState } from 'react';
import type { Project, ProjectSection } from '@lazysentry/shared';
import { IconFolder, IconMoreHorizontal, IconPin } from './icons';

export function ProjectOrganizeMenu({
  project,
  sections,
  onTogglePin,
  onMoveToSection,
}: {
  project: Project;
  sections: ProjectSection[];
  onTogglePin: () => void;
  onMoveToSection: (sectionId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="organize-menu" ref={rootRef}>
      <button
        type="button"
        className="card-icon-btn"
        title="Organize"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Organize ${project.name}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <IconMoreHorizontal />
      </button>

      {open && (
        <div
          className="user-menu-dropdown organize-menu-dropdown"
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="user-menu-item"
            onClick={() => {
              setOpen(false);
              onTogglePin();
            }}
          >
            <IconPin /> {project.pinned ? 'Unpin' : 'Pin to top'}
          </button>

          {sections.length > 0 && <hr className="divider" style={{ margin: '6px 0' }} />}
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              role="menuitem"
              className="user-menu-item"
              disabled={project.sectionId === section.id}
              onClick={() => {
                setOpen(false);
                onMoveToSection(section.id);
              }}
            >
              <IconFolder /> {section.name}
            </button>
          ))}

          {project.sectionId !== null && (
            <>
              <hr className="divider" style={{ margin: '6px 0' }} />
              <button
                type="button"
                role="menuitem"
                className="user-menu-item"
                onClick={() => {
                  setOpen(false);
                  onMoveToSection(null);
                }}
              >
                Remove from section
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
