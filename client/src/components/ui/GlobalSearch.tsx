import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Icon } from './Icons';
import { Spinner } from './Button';
import type { SearchHit } from '@/lib/types';

const TYPE_LABELS: Record<SearchHit['type'], string> = {
  portfolio: 'Work',
  service: 'Service',
  project: 'Project',
  client: 'Client',
  message: 'Message',
  request: 'Request',
};

/**
 * Command-palette style search. Opens with ⌘K / Ctrl-K and queries the single
 * role-aware search endpoint, so a client never sees admin-only results.
 */
export function GlobalSearch({ variant = 'button' }: { variant?: 'button' | 'inline' }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
    else {
      setTerm('');
      setResults([]);
      setActive(0);
    }
  }, [open]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const data = await api.get<{ results: SearchHit[] }>('/search', { q: term.trim() });
        setResults(data.results);
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [term]);

  const go = useCallback(
    (hit: SearchHit) => {
      setOpen(false);
      navigate(hit.href);
    },
    [navigate],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      go(results[active]);
    }
  };

  return (
    <>
      {variant === 'button' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 text-sm text-ink-faint transition hover:border-accent/40 hover:text-ink sm:min-w-[200px]"
        >
          <Icon.search className="h-4 w-4" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="ml-auto hidden rounded border border-line px-1.5 py-0.5 font-sans text-[10px] sm:inline">
            ⌘K
          </kbd>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition hover:bg-ink/5 dark:hover:bg-white/5"
        >
          <Icon.search className="h-[18px] w-[18px]" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[95] flex items-start justify-center px-4 pt-[10vh]">
          <div className="absolute inset-0 animate-fade-in bg-neutral-950/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-xl animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-lift">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Icon.search className="h-4 w-4 shrink-0 text-ink-faint" />
              <input
                ref={inputRef}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search work, projects, messages…"
                className="h-14 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
              />
              {loading && <Spinner className="text-ink-faint" />}
            </div>

            <div className="scrollbar-thin max-h-[52vh] overflow-y-auto p-2">
              {term.trim().length < 2 ? (
                <p className="px-3 py-8 text-center text-sm text-ink-faint">
                  Type at least two characters to search.
                </p>
              ) : results.length === 0 && !loading ? (
                <p className="px-3 py-8 text-center text-sm text-ink-faint">
                  Nothing matched “{term.trim()}”.
                </p>
              ) : (
                <ul>
                  {results.map((hit, index) => (
                    <li key={`${hit.type}-${hit.id}`}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(hit)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                          index === active ? 'bg-accent/10' : 'hover:bg-ink/4 dark:hover:bg-white/5',
                        )}
                      >
                        <span className="shrink-0 rounded-md bg-ink/6 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted dark:bg-white/8">
                          {TYPE_LABELS[hit.type]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{hit.title}</span>
                          {hit.subtitle && (
                            <span className="block truncate text-xs text-ink-muted">{hit.subtitle}</span>
                          )}
                        </span>
                        <Icon.arrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
