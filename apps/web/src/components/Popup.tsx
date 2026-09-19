// Small content-sized popup, layered over whatever is already open (e.g. the
// Settings modal) instead of an "add" form growing inline inside a card —
// inline forms used to appear below an arbitrary number of existing rows,
// easy to miss and disconnected from the button that opened them. Unlike
// Modal (which is always a large fixed-size dialog), this sizes itself to
// its content, so it works for a short form like "connect an account" or
// "add a user".

import { useEffect, type ReactNode } from 'react';
import { IconX } from './icons';

export function Popup({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    // Capture phase, so this fires (and stops) before another modal's own
    // Escape handler further down the tree, which would otherwise close
    // both at once.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <IconX />
          </button>
        </div>
        <div className="dialog-body stack">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
