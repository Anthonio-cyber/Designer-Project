export function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, options ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "just now", "6m", "3h", "2d", then a date. */
export function relativeTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)}d ago`;
  return formatDate(value, { day: 'numeric', month: 'short' });
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatMoney(value?: number | null): string {
  if (value === null || value === undefined) return 'Contact for pricing';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

export const PROJECT_STATUS_META: Record<
  string,
  { label: string; dot: string; chip: string; step: number }
> = {
  request_received: { label: 'Request received', dot: 'bg-amber-400', chip: 'bg-amber-500/12 text-amber-700 dark:text-amber-300', step: 0 },
  discussion: { label: 'Discussion', dot: 'bg-sky-400', chip: 'bg-sky-500/12 text-sky-700 dark:text-sky-300', step: 1 },
  designing: { label: 'Designing', dot: 'bg-violet-400', chip: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', step: 2 },
  review: { label: 'Client review', dot: 'bg-orange-400', chip: 'bg-orange-500/12 text-orange-700 dark:text-orange-300', step: 3 },
  completed: { label: 'Completed', dot: 'bg-emerald-400', chip: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300', step: 4 },
  cancelled: { label: 'Cancelled', dot: 'bg-neutral-400', chip: 'bg-neutral-500/12 text-neutral-600 dark:text-neutral-300', step: 0 },
};

export const PROJECT_STEPS = [
  { key: 'request_received', label: 'Request received' },
  { key: 'discussion', label: 'Designer reviewing' },
  { key: 'designing', label: 'Design in progress' },
  { key: 'review', label: 'Client review' },
  { key: 'completed', label: 'Completed' },
];

export const REQUEST_STATUS_META: Record<string, { label: string; chip: string }> = {
  new: { label: 'New', chip: 'bg-accent/12 text-accent' },
  reviewing: { label: 'Reviewing', chip: 'bg-sky-500/12 text-sky-700 dark:text-sky-300' },
  converted: { label: 'Converted', chip: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
  declined: { label: 'Declined', chip: 'bg-neutral-500/12 text-neutral-600 dark:text-neutral-300' },
};
