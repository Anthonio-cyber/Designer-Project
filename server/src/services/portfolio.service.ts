import { db, json } from '../db/index.js';
import { slugify } from '../lib/ids.js';
import { publicUrl } from './storage.service.js';

export interface PortfolioRow {
  id: string;
  title: string;
  slug: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  summary: string | null;
  description: string | null;
  designerNotes: string | null;
  tools: string;
  thumbnailUrl: string | null;
  mainImageUrl: string | null;
  gallery: string;
  clientName: string | null;
  projectDate: string | null;
  featured: number;
  status: 'draft' | 'published';
  visibility: 'public' | 'private';
  views: number;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PORTFOLIO_SELECT = `
  SELECT p.id, p.title, p.slug, p.category_id AS categoryId, c.name AS categoryName, c.slug AS categorySlug,
         p.summary, p.description, p.designer_notes AS designerNotes, p.tools,
         p.thumbnail_url AS thumbnailUrl, p.main_image_url AS mainImageUrl, p.gallery,
         p.client_name AS clientName, p.project_date AS projectDate, p.featured, p.status, p.visibility,
         p.views, p.seo_title AS seoTitle, p.seo_description AS seoDescription,
         p.created_at AS createdAt, p.updated_at AS updatedAt
    FROM portfolio_projects p
    LEFT JOIN portfolio_categories c ON c.id = p.category_id`;

/** Resolves a stored image reference: either a file id or an absolute URL. */
function imageUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return publicUrl(value);
}

export function serializePortfolio(row: PortfolioRow, opts: { admin?: boolean } = {}) {
  const gallery = json<string[]>(row.gallery, []);
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    category: row.categoryId
      ? { id: row.categoryId, name: row.categoryName, slug: row.categorySlug }
      : null,
    summary: row.summary,
    description: row.description,
    designerNotes: row.designerNotes,
    tools: json<string[]>(row.tools, []),
    thumbnailUrl: imageUrl(row.thumbnailUrl),
    mainImageUrl: imageUrl(row.mainImageUrl) ?? imageUrl(row.thumbnailUrl),
    gallery: gallery.map((entry) => imageUrl(entry)).filter((entry): entry is string => !!entry),
    clientName: row.clientName,
    projectDate: row.projectDate,
    featured: !!row.featured,
    status: row.status,
    visibility: row.visibility,
    views: row.views,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Raw references are only useful to the admin editor.
    raw: opts.admin
      ? { thumbnail: row.thumbnailUrl, mainImage: row.mainImageUrl, gallery }
      : undefined,
  };
}

/** Produces a slug that does not collide with an existing project. */
export function uniqueSlug(title: string, excludeId?: string): string {
  const base = slugify(title);
  let candidate = base;
  let counter = 2;
  for (;;) {
    const clash = db
      .prepare(`SELECT id FROM portfolio_projects WHERE slug = ? AND id != ?`)
      .get(candidate, excludeId ?? '') as { id: string } | undefined;
    if (!clash) return candidate;
    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

export function uniqueCategorySlug(name: string, excludeId?: string): string {
  const base = slugify(name);
  let candidate = base;
  let counter = 2;
  for (;;) {
    const clash = db
      .prepare(`SELECT id FROM portfolio_categories WHERE slug = ? AND id != ?`)
      .get(candidate, excludeId ?? '') as { id: string } | undefined;
    if (!clash) return candidate;
    candidate = `${base}-${counter}`;
    counter += 1;
  }
}
