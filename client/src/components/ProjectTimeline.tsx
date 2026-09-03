import { cn } from '@/lib/cn';
import { formatDate, PROJECT_STEPS, PROJECT_STATUS_META } from '@/lib/format';
import { Icon } from '@/components/ui/Icons';

/**
 * Visual five-stage timeline. Horizontal on desktop, vertical on phones so the
 * labels never truncate.
 */
export function ProjectTimeline({
  status,
  events,
  className,
}: {
  status: string;
  events?: { id: string; status: string; note: string | null; createdAt: string }[];
  className?: string;
}) {
  const currentStep = PROJECT_STATUS_META[status]?.step ?? 0;
  const cancelled = status === 'cancelled';
  const eventByStatus = new Map((events ?? []).map((event) => [event.status, event]));

  return (
    <div className={className}>
      {/* Horizontal track */}
      <ol className="hidden items-start sm:flex">
        {PROJECT_STEPS.map((step, index) => {
          const done = !cancelled && index < currentStep;
          const active = !cancelled && index === currentStep;
          const event = eventByStatus.get(step.key);

          return (
            <li key={step.key} className="relative flex-1">
              {index < PROJECT_STEPS.length - 1 && (
                <span
                  className={cn(
                    'absolute left-1/2 top-3.5 h-0.5 w-full',
                    done ? 'bg-accent' : 'bg-line',
                  )}
                />
              )}
              <div className="relative flex flex-col items-center px-1 text-center">
                <span
                  className={cn(
                    'z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold transition',
                    done
                      ? 'border-accent bg-accent text-white'
                      : active
                        ? 'border-accent bg-surface-raised text-accent ring-4 ring-accent/15'
                        : 'border-line bg-surface-raised text-ink-faint',
                  )}
                >
                  {done ? <Icon.check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    'mt-2 text-[11px] font-medium leading-tight',
                    done || active ? 'text-ink' : 'text-ink-faint',
                  )}
                >
                  {step.label}
                </span>
                {event && (
                  <span className="mt-0.5 text-[10px] text-ink-faint">
                    {formatDate(event.createdAt, { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Vertical track for narrow screens */}
      <ol className="space-y-0 sm:hidden">
        {PROJECT_STEPS.map((step, index) => {
          const done = !cancelled && index < currentStep;
          const active = !cancelled && index === currentStep;
          const event = eventByStatus.get(step.key);

          return (
            <li key={step.key} className="flex gap-3 pb-4 last:pb-0">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold',
                    done
                      ? 'border-accent bg-accent text-white'
                      : active
                        ? 'border-accent bg-surface-raised text-accent ring-4 ring-accent/15'
                        : 'border-line bg-surface-raised text-ink-faint',
                  )}
                >
                  {done ? <Icon.check className="h-3 w-3" /> : index + 1}
                </span>
                {index < PROJECT_STEPS.length - 1 && (
                  <span className={cn('mt-1 w-0.5 flex-1', done ? 'bg-accent' : 'bg-line')} />
                )}
              </div>
              <div className="pb-1">
                <p className={cn('text-sm font-medium', done || active ? 'text-ink' : 'text-ink-faint')}>
                  {step.label}
                </p>
                {event && (
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {formatDate(event.createdAt)}
                    {event.note ? ` · ${event.note}` : ''}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {cancelled && (
        <p className="mt-4 rounded-xl bg-ink/5 px-3 py-2 text-sm text-ink-muted dark:bg-white/5">
          This project was cancelled.
        </p>
      )}
    </div>
  );
}
