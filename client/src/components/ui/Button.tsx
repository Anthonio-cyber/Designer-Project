import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white shadow-glow hover:brightness-110 active:brightness-95 disabled:shadow-none',
  secondary:
    'bg-ink text-surface hover:opacity-90 dark:bg-white dark:text-neutral-900',
  outline:
    'border border-line bg-surface-raised text-ink hover:border-accent/60 hover:bg-accent/5',
  ghost: 'text-ink-muted hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-[15px] gap-2.5 py-3.5',
};

const BASE =
  'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 select-none whitespace-nowrap';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, full, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(BASE, VARIANTS[variant], SIZES[size], full && 'w-full', className)}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

interface LinkButtonProps {
  to: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  full?: boolean;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}

export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  icon,
  full,
  className,
  children,
  onClick,
}: LinkButtonProps) {
  const external = /^https?:\/\//.test(to);
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], full && 'w-full', className);

  if (external) {
    return (
      <a href={to} target="_blank" rel="noreferrer noopener" className={classes} onClick={onClick}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={classes} onClick={onClick}>
      {icon}
      {children}
    </Link>
  );
}
