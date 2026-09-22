// Account control anchored to the bottom of the sidebar (docs/CONCEPT.md
// 8.0): identity, theme and sign-out — Settings and the audit log are their
// own sidebar nav items now, so they don't need a second home here.

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, type CurrentUser } from '../lib/api';
import { type Theme, useTheme } from '../lib/theme';
import { IconLogOut, IconMonitor, IconMoon, IconSun, IconUser } from './icons';

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof IconSun }[] = [
  { value: 'system', label: 'Match system theme', icon: IconMonitor },
  { value: 'light', label: 'Light theme', icon: IconSun },
  { value: 'dark', label: 'Dark theme', icon: IconMoon },
];

export function UserMenu({
  user,
  onSignedOut,
}: {
  user: CurrentUser;
  onSignedOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useTheme();

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

  const signOut = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: onSignedOut,
  });

  return (
    <div className="sidebar-user" ref={rootRef}>
      {open && (
        <div className="user-menu-dropdown user-menu-dropdown-up" role="menu">
          <div className="user-menu-theme">
            <span className="user-menu-theme-label">Theme</span>
            <div className="theme-toggle" role="group" aria-label="Theme">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={`theme-toggle-btn ${theme === value ? 'is-active' : ''}`}
                  title={label}
                  aria-label={label}
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                >
                  <Icon />
                </button>
              ))}
            </div>
          </div>
          <hr className="divider" style={{ margin: '6px 0' }} />

          <button
            type="button"
            role="menuitem"
            className="user-menu-item user-menu-item-danger"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            <IconLogOut /> {signOut.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}

      <button
        type="button"
        className="sidebar-user-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sidebar-user-avatar" aria-hidden="true">
          <IconUser />
        </span>
        <span className="sidebar-user-text">
          <span className="sidebar-user-name">{user.username}</span>
          <span className="sidebar-user-role">{user.role}</span>
        </span>
      </button>
    </div>
  );
}
