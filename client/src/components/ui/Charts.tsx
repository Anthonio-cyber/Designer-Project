import { useId, useMemo } from 'react';
import { cn } from '@/lib/cn';

export interface Point {
  day: string;
  count: number;
}

/** Dependency-free area chart. Renders as inline SVG so it themes with CSS. */
export function AreaChart({
  data,
  height = 180,
  className,
  label,
}: {
  data: Point[];
  height?: number;
  className?: string;
  label?: string;
}) {
  const gradientId = useId();
  const width = 640;
  const padding = { top: 12, right: 4, bottom: 20, left: 4 };

  const { line, area, max, ticks } = useMemo(() => {
    if (data.length === 0) return { line: '', area: '', max: 0, ticks: [] as { x: number; label: string }[] };

    const maxValue = Math.max(1, ...data.map((point) => point.count));
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const step = data.length > 1 ? innerWidth / (data.length - 1) : 0;

    const coords = data.map((point, index) => ({
      x: padding.left + index * step,
      y: padding.top + innerHeight - (point.count / maxValue) * innerHeight,
    }));

    const path = coords
      .map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`)
      .join(' ');

    const closed = `${path} L${coords[coords.length - 1].x.toFixed(1)},${(height - padding.bottom).toFixed(1)} L${coords[0].x.toFixed(1)},${(height - padding.bottom).toFixed(1)} Z`;

    const tickCount = Math.min(5, data.length);
    const tickPositions = Array.from({ length: tickCount }, (_, index) => {
      const dataIndex = Math.round((index * (data.length - 1)) / Math.max(1, tickCount - 1));
      return {
        x: coords[dataIndex].x,
        label: new Date(`${data[dataIndex].day}T00:00:00Z`).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        }),
      };
    });

    return { line: path, area: closed, max: maxValue, ticks: tickPositions };
  }, [data, height]);

  if (data.length === 0) {
    return <div className={cn('flex h-40 items-center justify-center text-sm text-ink-faint', className)}>No data yet</div>;
  }

  return (
    <figure className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={label ? `${label}. Peak value ${max}.` : `Chart with peak value ${max}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.32" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1.5 flex justify-between text-[10px] text-ink-faint">
        {ticks.map((tick) => (
          <span key={tick.label + tick.x}>{tick.label}</span>
        ))}
      </div>
    </figure>
  );
}

export function BarList({
  items,
  className,
  emptyLabel = 'Nothing to show yet',
}: {
  items: { label: string; value: number; hint?: string }[];
  className?: string;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0) {
    return <p className={cn('py-6 text-center text-sm text-ink-faint', className)}>{emptyLabel}</p>;
  }
  return (
    <ul className={cn('space-y-2.5', className)}>
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink">{item.label}</span>
            <span className="shrink-0 tabular-nums text-ink-muted">{item.hint ?? item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/6 dark:bg-white/8">
            <div
              className="h-full rounded-full bg-accent/70 transition-all duration-700"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DonutChart({
  segments,
  size = 148,
  className,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-6', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution chart">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgb(var(--line))"
            strokeWidth="14"
          />
          {total > 0 &&
            segments.map((segment) => {
              const length = (segment.value / total) * circumference;
              const element = (
                <circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="14"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += length;
              return element;
            })}
        </g>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-ink font-display text-xl font-semibold"
        >
          {total}
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: segment.color }} />
            <span className="text-ink-muted">{segment.label}</span>
            <span className="tabular-nums text-ink">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('card p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium uppercase tracking-wider text-ink-faint">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums text-ink sm:text-3xl">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
        </div>
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}
