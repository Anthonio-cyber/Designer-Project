import type { SVGProps } from 'react';

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

type IconProps = SVGProps<SVGSVGElement>;

export const Icon = {
  home: (p: IconProps) => (
    <svg {...base} {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
  ),
  grid: (p: IconProps) => (
    <svg {...base} {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
  ),
  briefcase: (p: IconProps) => (
    <svg {...base} {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M3 12h18" /></svg>
  ),
  chat: (p: IconProps) => (
    <svg {...base} {...p}><path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8Z" /></svg>
  ),
  bell: (p: IconProps) => (
    <svg {...base} {...p}><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" /><path d="M10.5 20a1.8 1.8 0 0 0 3 0" /></svg>
  ),
  user: (p: IconProps) => (
    <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.7 7.7 0 0 1 15 0" /></svg>
  ),
  users: (p: IconProps) => (
    <svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.6 6.6 0 0 1 13 0" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6" /><path d="M18 14.4a6.6 6.6 0 0 1 3.5 5.6" /></svg>
  ),
  sparkles: (p: IconProps) => (
    <svg {...base} {...p}><path d="M12 3.5 13.6 8 18 9.5 13.6 11 12 15.5 10.4 11 6 9.5 10.4 8Z" /><path d="M18.5 15.5 19.3 18l2.2.8-2.2.7-.8 2.5-.8-2.5-2.2-.7 2.2-.8Z" /></svg>
  ),
  search: (p: IconProps) => (
    <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
  ),
  settings: (p: IconProps) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.3 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 2.6h.1A1.7 1.7 0 0 0 8.3 1V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 2.3" /></svg>
  ),
  chart: (p: IconProps) => (
    <svg {...base} {...p}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></svg>
  ),
  file: (p: IconProps) => (
    <svg {...base} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /></svg>
  ),
  image: (p: IconProps) => (
    <svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 17 5-5 4 4 2.5-2.5L20 17" /></svg>
  ),
  inbox: (p: IconProps) => (
    <svg {...base} {...p}><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="m4.5 5 -1.5 8v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5l-1.5-8a2 2 0 0 0-2-1.5H6.5a2 2 0 0 0-2 1.5Z" /></svg>
  ),
  layers: (p: IconProps) => (
    <svg {...base} {...p}><path d="m12 3 9 5-9 5-9-5Z" /><path d="m3 13 9 5 9-5" /></svg>
  ),
  tag: (p: IconProps) => (
    <svg {...base} {...p}><path d="M3 12V4h8l10 10-8 8Z" /><circle cx="7.5" cy="7.5" r="1.3" /></svg>
  ),
  toggle: (p: IconProps) => (
    <svg {...base} {...p}><rect x="2" y="7" width="20" height="10" rx="5" /><circle cx="16" cy="12" r="3" /></svg>
  ),
  plus: (p: IconProps) => (
    <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
  ),
  check: (p: IconProps) => (
    <svg {...base} {...p}><path d="m4 12.5 5 5L20 6.5" /></svg>
  ),
  x: (p: IconProps) => (
    <svg {...base} {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>
  ),
  arrowRight: (p: IconProps) => (
    <svg {...base} {...p}><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></svg>
  ),
  arrowLeft: (p: IconProps) => (
    <svg {...base} {...p}><path d="M20 12H4" /><path d="m10 6-6 6 6 6" /></svg>
  ),
  menu: (p: IconProps) => (
    <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
  ),
  sun: (p: IconProps) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  ),
  moon: (p: IconProps) => (
    <svg {...base} {...p}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></svg>
  ),
  monitor: (p: IconProps) => (
    <svg {...base} {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
  ),
  logout: (p: IconProps) => (
    <svg {...base} {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 8 6 12l4 4" /><path d="M6 12h11" /></svg>
  ),
  send: (p: IconProps) => (
    <svg {...base} {...p}><path d="m4 12 16-8-6 16-2.5-6.5Z" /><path d="M11.5 13.5 20 4" /></svg>
  ),
  paperclip: (p: IconProps) => (
    <svg {...base} {...p}><path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5" /></svg>
  ),
  trash: (p: IconProps) => (
    <svg {...base} {...p}><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" /></svg>
  ),
  edit: (p: IconProps) => (
    <svg {...base} {...p}><path d="M4 20h4l10-10-4-4L4 16Z" /><path d="m14 6 4 4" /></svg>
  ),
  eye: (p: IconProps) => (
    <svg {...base} {...p}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>
  ),
  flag: (p: IconProps) => (
    <svg {...base} {...p}><path d="M5 21V4" /><path d="M5 5h11l-1.5 3.5L16 12H5Z" /></svg>
  ),
  clock: (p: IconProps) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.5l3.5 2" /></svg>
  ),
  shield: (p: IconProps) => (
    <svg {...base} {...p}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z" /><path d="m9 12 2 2 4-4" /></svg>
  ),
  download: (p: IconProps) => (
    <svg {...base} {...p}><path d="M12 4v11" /><path d="m7.5 11 4.5 4.5L16.5 11" /><path d="M4 20h16" /></svg>
  ),
  undo: (p: IconProps) => (
    <svg {...base} {...p}><path d="M4 9h11a5 5 0 0 1 0 10H9" /><path d="m8 5-4 4 4 4" /></svg>
  ),
  card: (p: IconProps) => (
    <svg {...base} {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /><path d="M6 14.5h3" /></svg>
  ),
  plug: (p: IconProps) => (
    <svg {...base} {...p}><path d="M9 3v6M15 3v6" /><path d="M6 9h12v3a6 6 0 0 1-12 0Z" /><path d="M12 18v3" /></svg>
  ),
  mail: (p: IconProps) => (
    <svg {...base} {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
  ),
  external: (p: IconProps) => (
    <svg {...base} {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
  ),
  copy: (p: IconProps) => (
    <svg {...base} {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H5a1 1 0 0 0-1 1v8.5A1.5 1.5 0 0 0 5.5 15" /></svg>
  ),
  megaphone: (p: IconProps) => (
    <svg {...base} {...p}><path d="M4 10v4a2 2 0 0 0 2 2h2l8 4V4L8 8H6a2 2 0 0 0-2 2Z" /><path d="M19 9.5a3 3 0 0 1 0 5" /></svg>
  ),
};

export type IconName = keyof typeof Icon;
