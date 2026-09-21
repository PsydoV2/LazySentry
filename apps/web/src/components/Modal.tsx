// Fixed-size centered popup (docs/CONCEPT.md 8.0/8.2): project detail and
// settings open in this instead of navigating to a new page. Same dimmed
// backdrop as ImportDialog, but a constant width/height so switching tabs
// or content loading in doesn't resize the dialog around the user.

import { useEffect, type ReactNode } from 'react';
import { IconX } from './icons';

export function Modal({
  title,
  subtitle,
  onClose,
  sidebar,
  wide,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Vertical nav (+ its own identity block and meta), same dialog-split/
   * dialog-main language as ImportDialog's account switcher — the sidebar
   * carries identity instead of the header row, so there is no separate
   * `modal-header` when this is set; `title` still sets the dialog's
   * aria-label. */
  sidebar?: ReactNode;
  /** Extra width for a sidebar layout, which needs more room for the nav
   * column than a plain single-pane modal does. */
  wide?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    // Background scroll while a fixed-size modal is open just fights the
    // backdrop for the user's scroll wheel — lock it for the modal's life.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog dialog-fixed ${wide ? 'dialog-fixed-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {sidebar ? (
          <>
            <button
              type="button"
              className="icon-btn modal-close-float"
              aria-label="Close"
              onClick={onClose}
            >
              <IconX />
            </button>
            <div className="dialog-split">
              <div className="modal-sidebar">{sidebar}</div>
              <div className="dialog-main">
                <div className="dialog-body">{children}</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="modal-header">
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <h2>{title}</h2>
                {subtitle && <span className="subtle">{subtitle}</span>}
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
                <IconX />
              </button>
            </div>
            <div className="dialog-body">{children}</div>
          </>
        )}

        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
