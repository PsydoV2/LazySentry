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
