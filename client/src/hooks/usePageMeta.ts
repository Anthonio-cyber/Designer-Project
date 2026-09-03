import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '@/lib/api';

interface MetaResponse {
  meta: { title: string; description: string; image: string | null; url: string; type: string };
  structuredData: Record<string, unknown>;
}

function setTag(selector: string, attribute: string, value: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    const [, key, name] = /\[(\w+)="([^"]+)"\]/.exec(selector) ?? [];
    if (key && name) element.setAttribute(key, name);
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, value);
}

/**
 * Fetches per-route metadata from the server so every page — including each
 * portfolio project — has its own title, description, canonical URL, Open Graph
 * tags and JSON-LD.
 */
export function usePageMeta(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    let cancelled = false;

    void api
      .get<MetaResponse>('/seo/meta', { path: pathname })
      .then(({ meta, structuredData }) => {
        if (cancelled) return;

        document.title = meta.title;
        setTag('meta[name="description"]', 'content', meta.description);
        setTag('meta[property="og:title"]', 'content', meta.title);
        setTag('meta[property="og:description"]', 'content', meta.description);
        setTag('meta[property="og:type"]', 'content', meta.type);
        setTag('meta[property="og:url"]', 'content', meta.url);
        setTag('meta[name="twitter:card"]', 'content', meta.image ? 'summary_large_image' : 'summary');
        if (meta.image) {
          setTag('meta[property="og:image"]', 'content', new URL(meta.image, window.location.origin).toString());
        }

        let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        if (!canonical) {
          canonical = document.createElement('link');
          canonical.rel = 'canonical';
          document.head.appendChild(canonical);
        }
        canonical.href = meta.url;

        let script = document.head.querySelector<HTMLScriptElement>('script[data-seo="ld"]');
        if (!script) {
          script = document.createElement('script');
          script.type = 'application/ld+json';
          script.dataset.seo = 'ld';
          document.head.appendChild(script);
        }
        script.textContent = JSON.stringify(structuredData);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [pathname]);
}
