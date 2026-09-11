// Floating account control (replaces the old top bar): a round avatar
// placeholder fixed to the top-right corner of every screen, opening onto
// Settings and sign-out — the only two things that used to live in the bar.

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, type CurrentUser } from '../lib/api';
import type { Route } from '../lib/router';
import { IconLogOut, IconSettings, IconUser } from './icons';

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
          <div className="user-menu-name">{user.username}</div>
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
