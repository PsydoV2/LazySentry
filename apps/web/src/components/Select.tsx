// Custom dropdown replacing the native <select>: the closed control can be
// restyled with CSS, but the open option list cannot — it always renders in
// the OS/browser's own theme, which is the one place this app would
// suddenly stop looking like itself. Same floating-panel language as
// UserMenu's dropdown (surface background, border, shadow-float).

import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from './icons';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  disabled,
  id,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const selectedIndex = options.findIndex((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    // Capture phase + stopPropagation, so this fires (and stops) before any
    // enclosing modal/popup's own Escape handler, which would otherwise
    // close both the dropdown and whatever it's sitting inside of at once.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const target = options[selectedIndex] ?? options[0];
    if (target) optionRefs.current.get(target.value)?.focus();
    // Only runs when the dropdown opens — `options`/`selectedIndex` are read
    // fresh from the closure, not tracked as reactive deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Moves focus relative to whichever option currently has it, not the
   *  selected value — arrowing past an unselected option must keep moving
   *  from there, not snap back to the selection each time. */
  function focusByOffset(offset: number): void {
    if (options.length === 0) return;
    const focused = document.activeElement;
    const current = options.findIndex((option) => optionRefs.current.get(option.value) === focused);
    const from = current === -1 ? selectedIndex : current;
    const next = options[(from + offset + options.length) % options.length];
    if (next) optionRefs.current.get(next.value)?.focus();
  }

  function select(next: T): void {
    onChange(next);
    setOpen(false);
    rootRef.current?.querySelector('button')?.focus();
  }

  return (
    <div className="select" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{options[selectedIndex]?.label ?? ''}</span>
        <IconChevronDown className="select-chevron" />
      </button>

      {open && (
        <div className="select-dropdown" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              ref={(el) => {
                if (el) optionRefs.current.set(option.value, el);
                else optionRefs.current.delete(option.value);
              }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`select-option ${option.value === value ? 'is-selected' : ''}`}
              onClick={() => select(option.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  focusByOffset(1);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  focusByOffset(-1);
                } else if (event.key === 'Tab') {
                  setOpen(false);
                }
              }}
            >
              {option.label}
              {option.value === value && <IconCheck className="select-option-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
