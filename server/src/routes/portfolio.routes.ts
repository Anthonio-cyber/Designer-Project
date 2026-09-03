import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { conflict, notFound } from '../lib/errors.js';
import { uuid } from '../lib/ids.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { track } from '../services/analytics.service.js';
import {
  PORTFOLIO_SELECT,
  serializePortfolio,
  uniqueCategorySlug,
  uniqueSlug,
  type PortfolioRow,
} from '../services/portfolio.service.js';

export const portfolioRouter = Router();

const listQuery = z.object({
  category: z.string().trim().optional(),
  q: z.string().trim().optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.enum(['recent', 'oldest', 'popular', 'title']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
  status: z.enum(['draft', 'published', 'all']).optional(),
});

const ORDER: Record<string, string> = {
  recent: 'p.featured DESC, COALESCE(p.project_date, p.created_at) DESC',
  oldest: 'COALESCE(p.project_date, p.created_at) ASC',
  popular: 'p.views DESC, p.created_at DESC',
  title: 'p.title COLLATE NOCASE ASC',
};

portfolioRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsedQuery = listQuery.safeParse(req.query);
    const query = parsedQuery.success ? parsedQuery.data : listQuery.parse({});
    const admin = req.auth?.role === 'admin';

    // Visitors and clients never see drafts or private work.
    const visibility = admin
      ? query.status && query.status !== 'all'
        ? `p.status = '${query.status}'`
        : '1 = 1'
      : `p.status = 'published' AND p.visibility = 'public'`;

    const params = {
      category: query.category ?? '',
      search: query.q ?? '',
      like: `%${query.q ?? ''}%`,
      featured: query.featured === 'true' ? 1 : query.featured === 'false' ? 0 : -1,
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage,
    };

    const where = `
      WHERE ${visibility}
        AND (@category = '' OR c.slug = @category OR p.category_id = @category)
        AND (@search = '' OR p.title LIKE @like OR p.summary LIKE @like OR p.description LIKE @like)
        AND (@featured = -1 OR p.featured = @featured)`;

    const rows = db
      .prepare(`${PORTFOLIO_SELECT} ${where} ORDER BY ${ORDER[query.sort]} LIMIT @limit OFFSET @offset`)
      .all(params) as PortfolioRow[];

    const total = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM portfolio_projects p
             LEFT JOIN portfolio_categories c ON c.id = p.category_id ${where}`,
        )
        .get(params) as { n: number }
    ).n;

    res.json({
      projects: rows.map((row) => serializePortfolio(row, { admin })),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        pages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    });
  }),
);

portfolioRouter.get(
  '/featured',
  asyncHandler(async (_req, res) => {
    const rows = db
      .prepare(
        `${PORTFOLIO_SELECT}
          WHERE p.status = 'published' AND p.visibility = 'public'
          ORDER BY p.featured DESC, COALESCE(p.project_date, p.created_at) DESC LIMIT 6`,
      )
      .all() as PortfolioRow[];
    res.json({ projects: rows.map((row) => serializePortfolio(row)) });
  }),
);

portfolioRouter.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const admin = req.auth?.role === 'admin';
    const row = db
      .prepare(`${PORTFOLIO_SELECT} WHERE p.slug = ? OR p.id = ?`)
      .get(req.params.slug, req.params.slug) as PortfolioRow | undefined;

    if (!row) throw notFound('That project could not be found.');
    if (!admin && (row.status !== 'published' || row.visibility !== 'public')) {
      throw notFound('That project could not be found.');
    }

    if (!admin) {
      db.prepare(`UPDATE portfolio_projects SET views = views + 1 WHERE id = ?`).run(row.id);
      track('portfolio_view', { entityType: 'portfolio_project', entityId: row.id });
      if (row.categoryId) track('category_view', { entityType: 'portfolio_category', entityId: row.categoryId });
    }

    const related = db
      .prepare(
        `${PORTFOLIO_SELECT}
          WHERE p.status = 'published' AND p.visibility = 'public' AND p.id != ?
            AND (p.category_id = ? OR ? IS NULL)
          ORDER BY RANDOM() LIMIT 3`,
      )
      .all(row.id, row.categoryId, row.categoryId) as PortfolioRow[];

    res.json({
      project: serializePortfolio(row, { admin }),
      related: related.map((entry) => serializePortfolio(entry)),
    });
  }),
);

// ------------------------------------------------------------------ admin ---

const projectSchema = z.object({
  title: z.string().trim().min(2).max(140),
  categoryId: z.string().nullable().optional(),
  summary: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(8000).nullable().optional(),
  designerNotes: z.string().trim().max(4000).nullable().optional(),
  tools: z.array(z.string().trim().max(60)).max(20).default([]),
  thumbnail: z.string().trim().max(500).nullable().optional(),
  mainImage: z.string().trim().max(500).nullable().optional(),
  gallery: z.array(z.string().trim().max(500)).max(24).default([]),
  clientName: z.string().trim().max(120).nullable().optional(),
  projectDate: z.string().trim().max(30).nullable().optional(),
  featured: z.boolean().default(false),
  status: z.enum(['draft', 'published']).default('draft'),
  visibility: z.enum(['public', 'private']).default('public'),
  seoTitle: z.string().trim().max(160).nullable().optional(),
  seoDescription: z.string().trim().max(300).nullable().optional(),
});

portfolioRouter.post(
  '/',
  requireAdmin,
  validateBody(projectSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof projectSchema>;
    const id = uuid();

    db.prepare(
      `INSERT INTO portfolio_projects
         (id, title, slug, category_id, summary, description, designer_notes, tools,
          thumbnail_url, main_image_url, gallery, client_name, project_date, featured,
          status, visibility, seo_title, seo_description)
       VALUES (@id, @title, @slug, @categoryId, @summary, @description, @designerNotes, @tools,
               @thumbnail, @mainImage, @gallery, @clientName, @projectDate, @featured,
               @status, @visibility, @seoTitle, @seoDescription)`,
    ).run({
      id,
      title: input.title,
      slug: uniqueSlug(input.title),
      categoryId: input.categoryId ?? null,
      summary: input.summary ?? null,
      description: input.description ?? null,
      designerNotes: input.designerNotes ?? null,
      tools: JSON.stringify(input.tools),
      thumbnail: input.thumbnail ?? null,
      mainImage: input.mainImage ?? null,
      gallery: JSON.stringify(input.gallery),
      clientName: input.clientName ?? null,
      projectDate: input.projectDate ?? null,
      featured: input.featured ? 1 : 0,
      status: input.status,
      visibility: input.visibility,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
    });

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'portfolio.created',
      entityType: 'portfolio_project',
      entityId: id,
      meta: { title: input.title, status: input.status },
    });

    const row = db.prepare(`${PORTFOLIO_SELECT} WHERE p.id = ?`).get(id) as PortfolioRow;
    res.status(201).json({ project: serializePortfolio(row, { admin: true }) });
  }),
);

portfolioRouter.put(
  '/:id',
  requireAdmin,
  validateBody(projectSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = db
      .prepare(`SELECT id, title, slug FROM portfolio_projects WHERE id = ?`)
      .get(req.params.id) as { id: string; title: string; slug: string } | undefined;
    if (!existing) throw notFound('Project not found.');

    const input = req.body as Partial<z.infer<typeof projectSchema>>;
    const patch: Record<string, unknown> = {};
    const map: Record<string, string> = {
      title: 'title',
      categoryId: 'category_id',
      summary: 'summary',
      description: 'description',
      designerNotes: 'designer_notes',
      clientName: 'client_name',
      projectDate: 'project_date',
      status: 'status',
      visibility: 'visibility',
      seoTitle: 'seo_title',
      seoDescription: 'seo_description',
      thumbnail: 'thumbnail_url',
      mainImage: 'main_image_url',
    };

    for (const [key, column] of Object.entries(map)) {
      if (key in input) patch[column] = (input as Record<string, unknown>)[key] ?? null;
    }
    if (input.tools) patch.tools = JSON.stringify(input.tools);
    if (input.gallery) patch.gallery = JSON.stringify(input.gallery);
    if (input.featured !== undefined) patch.featured = input.featured ? 1 : 0;
    if (input.title && input.title !== existing.title) patch.slug = uniqueSlug(input.title, existing.id);

    if (Object.keys(patch).length > 0) {
      const assignments = Object.keys(patch)
        .map((column) => `${column} = @${column}`)
        .join(', ');
      db.prepare(
        `UPDATE portfolio_projects SET ${assignments}, updated_at = datetime('now') WHERE id = @id`,
      ).run({ ...patch, id: existing.id });
    }

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'portfolio.updated',
      entityType: 'portfolio_project',
      entityId: existing.id,
      meta: { fields: Object.keys(patch) },
    });

    const row = db.prepare(`${PORTFOLIO_SELECT} WHERE p.id = ?`).get(existing.id) as PortfolioRow;
    res.json({ project: serializePortfolio(row, { admin: true }) });
  }),
);

portfolioRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = db
      .prepare(`SELECT id, title FROM portfolio_projects WHERE id = ?`)
      .get(req.params.id) as { id: string; title: string } | undefined;
    if (!existing) throw notFound('Project not found.');

    db.prepare(`DELETE FROM portfolio_projects WHERE id = ?`).run(existing.id);
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'portfolio.deleted',
      entityType: 'portfolio_project',
      entityId: existing.id,
      meta: { title: existing.title },
    });
    res.json({ ok: true });
  }),
);

// ------------------------------------------------------------- categories ---

export const categoriesRouter = Router();

categoriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const admin = req.auth?.role === 'admin';
    const rows = db
      .prepare(
        `SELECT c.id, c.name, c.slug, c.description, c.position,
                (SELECT COUNT(*) FROM portfolio_projects p
                  WHERE p.category_id = c.id
                    AND (${admin ? '1 = 1' : "p.status = 'published' AND p.visibility = 'public'"})) AS projectCount
           FROM portfolio_categories c ORDER BY c.position ASC, c.name COLLATE NOCASE ASC`,
      )
      .all();
    res.json({ categories: rows });
  }),
);

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  position: z.number().int().min(0).max(999).optional(),
});

categoriesRouter.post(
  '/',
  requireAdmin,
  validateBody(categorySchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof categorySchema>;
    const id = uuid();
    db.prepare(
      `INSERT INTO portfolio_categories (id, name, slug, description, position)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, input.name, uniqueCategorySlug(input.name), input.description ?? null, input.position ?? 99);

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'category.created',
      entityType: 'portfolio_category',
      entityId: id,
      meta: { name: input.name },
    });
    res.status(201).json({ category: db.prepare(`SELECT * FROM portfolio_categories WHERE id = ?`).get(id) });
  }),
);

categoriesRouter.put(
  '/:id',
  requireAdmin,
  validateBody(categorySchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = db
      .prepare(`SELECT id, name FROM portfolio_categories WHERE id = ?`)
      .get(req.params.id) as { id: string; name: string } | undefined;
    if (!existing) throw notFound('Category not found.');

    const input = req.body as Partial<z.infer<typeof categorySchema>>;
    db.prepare(
      `UPDATE portfolio_categories
          SET name = COALESCE(@name, name),
              slug = COALESCE(@slug, slug),
              description = COALESCE(@description, description),
              position = COALESCE(@position, position)
        WHERE id = @id`,
    ).run({
      id: existing.id,
      name: input.name ?? null,
      slug: input.name ? uniqueCategorySlug(input.name, existing.id) : null,
      description: input.description ?? null,
      position: input.position ?? null,
    });

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'category.updated',
      entityType: 'portfolio_category',
      entityId: existing.id,
    });
    res.json({ category: db.prepare(`SELECT * FROM portfolio_categories WHERE id = ?`).get(existing.id) });
  }),
);

categoriesRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const inUse = db
      .prepare(`SELECT COUNT(*) AS n FROM portfolio_projects WHERE category_id = ?`)
      .get(req.params.id) as { n: number };
    if (inUse.n > 0) {
      throw conflict(`${inUse.n} project(s) still use this category. Move them first.`);
    }
    db.prepare(`DELETE FROM portfolio_categories WHERE id = ?`).run(req.params.id);
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'category.deleted',
      entityType: 'portfolio_category',
      entityId: req.params.id,
    });
    res.json({ ok: true });
  }),
);
