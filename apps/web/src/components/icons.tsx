// Small hand-rolled icon set — stroke-based, 20px viewbox, currentColor.
// No icon package: this app has no other UI dependency beyond React and
// TanStack Query, and a dozen glyphs don't justify one.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };
}

export function IconGithub(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={0} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.5 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.21-3.37-1.21-.46-1.2-1.11-1.52-1.11-1.52-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.72 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.95.68 1.92 0 1.39-.01 2.51-.01 2.85 0 .28.18.61.69.5A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export function IconGitlab(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={0} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.42 15.9 9.6H8.1L12 21.42Z" />
      <path d="M12 21.42 8.1 9.6H2.66L12 21.42Z" opacity={0.7} />
      <path d="M2.66 9.6 1.3 13.8a.9.9 0 0 0 .33 1.01L12 21.42 2.66 9.6Z" opacity={0.45} />
      <path d="M2.66 9.6H8.1L5.82 2.68a.42.42 0 0 0-.8 0L2.66 9.6Z" />
      <path d="M12 21.42 15.9 9.6h5.44Z" opacity={0.7} />
      <path
        d="M21.34 9.6 22.7 13.8a.9.9 0 0 1-.33 1.01L12 21.42 21.34 9.6Z"
        opacity={0.45}
      />
      <path d="M21.34 9.6H15.9l2.28-6.92a.42.42 0 0 1 .8 0l2.36 6.92Z" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="10.5" width="16" height="10" rx="2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </svg>
  );
}

export function IconShieldAlert(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2.5 4.5 5.5v6c0 5 3.2 8.4 7.5 10 4.3-1.6 7.5-5 7.5-10v-6L12 2.5Z" />
      <path d="M12 8v4.5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2.5 4.5 5.5v6c0 5 3.2 8.4 7.5 10 4.3-1.6 7.5-5 7.5-10v-6L12 2.5Z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  );
}

export function IconBug(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 5.5V4a3 3 0 0 1 6 0v1.5" />
      <rect x="6" y="8" width="12" height="11" rx="5" />
      <path d="M6 12H3M21 12h-3M6 16.5 3.5 18M18 16.5l2.5 1.5M6 8.5 3.8 6.7M18 8.5l2.2-1.8" />
      <path d="M9.5 12v4M14.5 12v4" />
    </svg>
  );
}

export function IconPackage(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m3.5 7.5 8.5-4.5 8.5 4.5-8.5 4.5-8.5-4.5Z" />
      <path d="M3.5 7.5v9l8.5 4.5 8.5-4.5v-9" />
      <path d="M12 12v9" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={0} fill="currentColor" viewBox="0 0 24 24">
      <path d="M7 5.5c0-.9 1-1.5 1.8-1l10.5 6.5c.8.5.8 1.6 0 2.1L8.8 19.6c-.8.5-1.8-.1-1.8-1V5.5Z" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconStop(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={0} fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17.5h.01" />
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={0} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5a8 8 0 0 1 16 0Z" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2.06 2.06 0 1 1-2.92 2.92l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V20a2.06 2.06 0 1 1-4.12 0v-.09A1.7 1.7 0 0 0 8.77 18.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2.06 2.06 0 1 1-2.92-2.92l.06-.06a1.7 1.7 0 0 0 .34-1.87A1.7 1.7 0 0 0 2.76 12.86H2.67a2.06 2.06 0 1 1 0-4.12h.09A1.7 1.7 0 0 0 4.32 7.71a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2.06 2.06 0 1 1 6.84 2.86l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 9.88 1.7V1.6a2.06 2.06 0 1 1 4.12 0v.09a1.7 1.7 0 0 0 1.03 1.55h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2.06 2.06 0 1 1 2.92 2.92l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.55 1.03h.1a2.06 2.06 0 1 1 0 4.12h-.09a1.7 1.7 0 0 0-1.56 1.03Z" />
    </svg>
  );
}

export function IconLogOut(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="15" r="4.5" />
      <path d="M11.5 11.5 20 3M16.5 6l3 3M14 8.5l2.5 2.5" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconMoreHorizontal(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={0} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

export function IconMonitor(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11Z" />
    </svg>
  );
}

export function IconPin(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 4.5h6" />
      <path d="M10 4.5v4.2c0 .8-.3 1.5-.9 2.1l-1.6 1.7c-.4.4-.6.9-.6 1.5v1h10v-1c0-.6-.2-1.1-.6-1.5l-1.6-1.7a3 3 0 0 1-.9-2.1V4.5" />
      <path d="M12 15v6" />
    </svg>
  );
}

/** Solid variant of {@link IconPin} for the pinned state — same silhouette, filled. */
export function IconPinFilled(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={0} fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 4.5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2v3.2c0 .53.2 1.04.57 1.42l1.6 1.7c.53.56.83 1.3.83 2.08V13a1 1 0 0 1-1 1h-3v6a1 1 0 1 1-2 0v-6H8a1 1 0 0 1-1-1v-.1c0-.78.3-1.52.83-2.08l1.6-1.7c.37-.38.57-.89.57-1.42V5.5a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

export function IconGripVertical(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={0} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
