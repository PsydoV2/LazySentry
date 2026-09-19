// Floating account control (replaces the old top bar): a round avatar
// placeholder fixed to the top-right corner of every screen, opening onto
// Settings and sign-out — the only two things that used to live in the bar.

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, type CurrentUser } from '../lib/api';
import type { Route } from '../lib/router';
import { type Theme, useTheme } from '../lib/theme';
import {
  IconHistory,
  IconLogOut,
  IconMonitor,
  IconMoon,
  IconSettings,
  IconSun,
  IconUser,
} from './icons';

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof IconSun }[] = [
  { value: 'system', label: 'Match system theme', icon: IconMonitor },
  { value: 'light', label: 'Light theme', icon: IconSun },
  { value: 'dark', label: 'Dark theme', icon: IconMoon },
];

export function UserMenu({
  user,
  navigate,
  onSignedOut,
}: {
  user: CurrentUser;
  navigate: (route: Route) => void;
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
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-menu-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.username}
        onClick={() => setOpen((value) => !value)}
      >
        <IconUser />
      </button>

      {open && (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-name">
            {user.username}
            <span className="subtle"> · {user.role}</span>
          </div>
          <hr className="divider" style={{ margin: '6px 0' }} />

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
            className="user-menu-item"
            onClick={() => {
              setOpen(false);
              navigate({ name: 'settings' });
            }}
          >
            <IconSettings /> Settings
          </button>
          {user.role === 'admin' && (
            <button
              type="button"
              role="menuitem"
              className="user-menu-item"
              onClick={() => {
                setOpen(false);
                navigate({ name: 'audit-log' });
              }}
            >
              <IconHistory /> Audit log
            </button>
          )}
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
    </div>
  );
}
