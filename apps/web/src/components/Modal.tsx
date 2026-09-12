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
  tabs,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  tabs?: ReactNode;
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
        className="dialog dialog-fixed"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <h2>{title}</h2>
            {subtitle && <span className="subtle">{subtitle}</span>}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <IconX />
          </button>
        </div>

        {tabs && <div className="modal-tabs">{tabs}</div>}

        <div className="dialog-body">{children}</div>

        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
