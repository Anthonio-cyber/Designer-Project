import { useEffect, useRef } from 'react';

/**
 * Adds a one-shot reveal when a section scrolls into view. Falls back to
 * immediately visible when IntersectionObserver is unavailable.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.12) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (typeof IntersectionObserver === 'undefined') {
      element.dataset.revealed = 'true';
      return;
    }

    element.style.opacity = '0';
    element.style.transform = 'translateY(18px)';
    element.style.transition = 'opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1)';

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          element.style.opacity = '1';
          element.style.transform = 'none';
          observer.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -60px 0px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);

  return ref;
}
