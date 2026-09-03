import { Router } from 'express';
import { db } from '../db/index.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../middleware/error.js';
import { getSettings } from '../services/settings.service.js';
import { publicUrl } from '../services/storage.service.js';

export const seoRouter = Router();

const escapeXml = (value: string): string =>
  value.replace(/[<>&'"]/g, (char) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] as string,
  );

seoRouter.get(
  '/sitemap.xml',
  asyncHandler(async (_req, res) => {
    const base = env.publicSiteUrl;
    const staticPages = ['', '/portfolio', '/services', '/about', '/contact', '/request'];

    const projects = db
      .prepare(
        `SELECT slug, updated_at AS updatedAt FROM portfolio_projects
          WHERE status = 'published' AND visibility = 'public'`,
      )
      .all() as { slug: string; updatedAt: string }[];

    const urls = [
      ...staticPages.map((path) => ({ loc: `${base}${path}`, lastmod: null as string | null, priority: path === '' ? '1.0' : '0.8' })),
      ...projects.map((project) => ({
        loc: `${base}/portfolio/${project.slug}`,
        lastmod: project.updatedAt.replace(' ', 'T') + 'Z',
        priority: '0.7',
      })),
    ];

    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map(
          (url) =>
            `  <url><loc>${escapeXml(url.loc)}</loc>${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}<priority>${url.priority}</priority></url>`,
        )
        .join('\n')}\n</urlset>`,
    );
  }),
);

seoRouter.get('/robots.txt', (_req, res) => {
  res
    .type('text/plain')
    .send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /dashboard',
        'Disallow: /api/',
        '',
        `Sitemap: ${env.publicSiteUrl}/sitemap.xml`,
      ].join('\n'),
    );
});

/** Per-page metadata the client uses to set title, description and OG tags. */
seoRouter.get(
  '/api/seo/meta',
  asyncHandler(async (req, res) => {
    const settings = getSettings();
    const path = typeof req.query.path === 'string' ? req.query.path : '/';
    const base = {
      title: settings.seo.defaultTitle,
      description: settings.seo.defaultDescription,
      image: publicUrl(settings.seo.ogImageFileId),
      url: `${env.publicSiteUrl}${path}`,
      type: 'website',
    };

    const match = path.match(/^\/portfolio\/([^/?#]+)/);
    if (match) {
      const project = db
        .prepare(
          `SELECT title, summary, seo_title AS seoTitle, seo_description AS seoDescription,
                  thumbnail_url AS thumbnailUrl, main_image_url AS mainImageUrl, project_date AS projectDate
             FROM portfolio_projects
            WHERE slug = ? AND status = 'published' AND visibility = 'public'`,
        )
        .get(match[1]) as
        | {
            title: string;
            summary: string | null;
            seoTitle: string | null;
            seoDescription: string | null;
            thumbnailUrl: string | null;
            mainImageUrl: string | null;
            projectDate: string | null;
          }
        | undefined;

      if (project) {
        const image = project.mainImageUrl ?? project.thumbnailUrl;
        res.json({
          meta: {
            ...base,
            title: project.seoTitle ?? `${project.title} — ${settings.brandName}`,
            description: project.seoDescription ?? project.summary ?? settings.seo.defaultDescription,
            image: image && /^https?:|^\//.test(image) ? image : publicUrl(image),
            type: 'article',
          },
          structuredData: {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: project.title,
            description: project.summary ?? undefined,
            dateCreated: project.projectDate ?? undefined,
            creator: { '@type': 'Person', name: settings.brandName },
          },
        });
        return;
      }
    }

    const titles: Record<string, string> = {
      '/portfolio': `Portfolio — ${settings.brandName}`,
      '/services': `Services & pricing — ${settings.brandName}`,
      '/about': `About ${settings.brandName}`,
      '/contact': `Contact — ${settings.brandName}`,
      '/request': `Start a project — ${settings.brandName}`,
    };

    res.json({
      meta: { ...base, title: titles[path] ?? base.title },
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'ProfessionalService',
        name: settings.brandName,
        description: settings.tagline,
        email: settings.contactEmail,
        url: env.publicSiteUrl,
        areaServed: settings.showLocation ? settings.location : undefined,
      },
    });
  }),
);
