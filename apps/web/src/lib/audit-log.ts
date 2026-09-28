// Display-only mapping from AuditLogAction to a human label and a one-line
// description of what happened (docs/CONCEPT.md 2.2, 6.2) — kept out of the
// component so the settings view stays focused on layout, not vocabulary.

import type { AuditLogAction, AuditLogEntry } from '@lazysentry/shared';

const ACTION_LABEL: Record<AuditLogAction, string> = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.logout': 'Signed out',
  'user.create': 'Created user',
  'user.role_change': 'Changed user role',
  'user.delete': 'Deleted user',
  'git_account.connect': 'Connected git account',
  'git_account.reconnect': 'Reconnected git account',
  'git_account.delete': 'Removed git account',
  'project.import': 'Imported project',
  'project.delete': 'Deleted project',
  'scan.trigger': 'Triggered scan',
  'scan.cancel': 'Cancelled scan',
  'settings.update': 'Changed settings',
  'notification_channel.create': 'Added notification channel',
  'notification_channel.delete': 'Removed notification channel',
};

export function auditLogActionLabel(action: AuditLogAction): string {
  return ACTION_LABEL[action] ?? action;
}

/** Groups actions for the sidebar nav — the part of the action before its
 * first '.', which already matches how AUDIT_LOG_ACTIONS is namespaced. */
export type AuditLogCategory =
  | 'auth'
  | 'user'
  | 'git_account'
  | 'project'
  | 'scan'
  | 'settings'
  | 'notification_channel';

export function auditLogCategory(action: AuditLogAction): AuditLogCategory {
  return action.split('.')[0] as AuditLogCategory;
}

export const AUDIT_LOG_CATEGORY_LABEL: Record<AuditLogCategory, string> = {
  auth: 'Sign-ins',
  user: 'User management',
  git_account: 'Git accounts',
  project: 'Projects',
  scan: 'Scans',
  settings: 'Settings',
  notification_channel: 'Notifications',
};

/** "Today" / "Yesterday" / weekday / short date — buckets entries recent
 * enough to matter into names instead of raw dates, same idea as
 * relativeTime() for a single timestamp. */
export function auditLogDayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/** Short "what happened" line built from an entry's meta, where it adds
 * information the action label alone doesn't already carry. */
export function auditLogDetail(entry: AuditLogEntry): string | null {
  const meta = entry.meta;
  if (!meta) return null;
  switch (entry.action) {
    case 'user.create':
      return typeof meta.username === 'string'
        ? `${meta.username}${meta.role ? ` (${meta.role})` : ''}`
        : null;
    case 'user.role_change':
      return typeof meta.username === 'string'
        ? `${meta.username}: ${meta.from} → ${meta.to}`
        : null;
    case 'user.delete':
      return typeof meta.username === 'string' ? meta.username : null;
    case 'git_account.connect':
    case 'git_account.reconnect':
    case 'git_account.delete':
      return typeof meta.username === 'string'
        ? `${meta.username}${meta.provider ? ` (${meta.provider})` : ''}`
        : null;
    case 'project.import':
    case 'project.delete':
      return typeof meta.fullName === 'string' ? meta.fullName : null;
    case 'scan.trigger':
      return typeof meta.fullName === 'string'
        ? `${meta.fullName}${meta.full ? ' (full rescan)' : ''}`
        : null;
    case 'scan.cancel':
      return typeof meta.fullName === 'string' ? meta.fullName : null;
    case 'notification_channel.create':
    case 'notification_channel.delete':
      return typeof meta.platform === 'string'
        ? String(meta.label ?? meta.platform)
        : null;
    default:
      return null;
  }
}
