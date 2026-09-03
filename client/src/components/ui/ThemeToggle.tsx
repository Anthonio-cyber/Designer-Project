import { useTheme } from '@/context/ThemeContext';
import { Icon } from './Icons';
import { cn } from '@/lib/cn';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Icon.sun },
  { value: 'dark', label: 'Dark', icon: Icon.moon },
  { value: 'system', label: 'System', icon: Icon.monitor },
] as const;

/** Compact icon button that cycles light → dark → system. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, cycle } = useTheme();
  const current = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[2];
  const Glyph = current.icon;

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${current.label} (click to change)`}
      aria-label={`Theme: ${current.label}. Click to change.`}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5',
        className,
      )}
    >
      <Glyph className="h-[18px] w-[18px]" />
    </button>
  );
}

/** Full three-way selector for settings screens. */
export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface-sunken p-1">
      {OPTIONS.map((option) => {
        const Glyph = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition',
              theme === option.value
                ? 'bg-surface-raised text-ink shadow-sm'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            <Glyph className="h-4 w-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
