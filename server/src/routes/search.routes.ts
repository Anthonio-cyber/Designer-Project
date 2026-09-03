import { Router } from 'express';
import { db } from '../db/index.js';
import { asyncHandler } from '../middleware/error.js';

export const searchRouter = Router();

interface SearchHit {
  type: 'portfolio' | 'service' | 'project' | 'client' | 'message' | 'request';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

/**
 * One search endpoint for every surface. What it returns depends entirely on the
 * caller's role: visitors get published work and services, clients additionally
 * get their own projects and messages, admins get everything.
 */
searchRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (term.length < 2) {
      res.json({ results: [], term });
      return;
    }
    const like = `%${term}%`;
    const viewer = req.auth;
    const results: SearchHit[] = [];

    const portfolio = db
      .prepare(
        `SELECT id, title, slug, summary, status, visibility FROM portfolio_projects
          WHERE (title LIKE ? OR summary LIKE ? OR description LIKE ?)
            AND (? = 'admin' OR (status = 'published' AND visibility = 'public'))
          LIMIT 8`,
      )
      .all(like, like, like, viewer?.role ?? 'guest') as {
      id: string;
      title: string;
      slug: string;
      summary: string | null;
    }[];
    results.push(
      ...portfolio.map((row) => ({
        type: 'portfolio' as const,
        id: row.id,
        title: row.title,
        subtitle: row.summary ?? 'Portfolio project',
        href: `/portfolio/${row.slug}`,
      })),
    );

    const services = db
      .prepare(
        `SELECT id, name, slug, description FROM services
          WHERE (name LIKE ? OR description LIKE ?) AND (? = 'admin' OR active = 1) LIMIT 5`,
      )
      .all(like, like, viewer?.role ?? 'guest') as {
      id: string;
      name: string;
      slug: string;
      description: string | null;
    }[];
    results.push(
      ...services.map((row) => ({
        type: 'service' as const,
        id: row.id,
        title: row.name,
        subtitle: row.description?.slice(0, 90) ?? 'Service',
        href: `/services#${row.slug}`,
      })),
    );

    if (viewer) {
      const isAdmin = viewer.role === 'admin';
      const projects = db
        .prepare(
          `SELECT p.id, p.code, p.title, p.status, u.name AS clientName
             FROM client_projects p JOIN users u ON u.id = p.client_id
            WHERE (p.title LIKE ? OR p.code LIKE ?) AND (? = 1 OR p.client_id = ?)
            LIMIT 8`,
        )
        .all(like, like, isAdmin ? 1 : 0, viewer.id) as {
        id: string;
        code: string;
        title: string;
        status: string;
        clientName: string;
      }[];
      results.push(
        ...projects.map((row) => ({
          type: 'project' as const,
          id: row.id,
          title: row.title,
          subtitle: `${row.code} · ${row.status.replace(/_/g, ' ')}${isAdmin ? ` · ${row.clientName}` : ''}`,
          href: isAdmin ? `/admin/projects/${row.id}` : `/dashboard/projects/${row.id}`,
        })),
      );

      // Message search is scoped to the viewer's own conversation unless admin.
      const messages = db
        .prepare(
          `SELECT m.id, m.body, m.conversation_id AS conversationId, u.name AS senderName, c.client_id AS clientId
             FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN users u ON u.id = m.sender_id
            WHERE m.body LIKE ? AND m.deleted_at IS NULL AND (? = 1 OR c.client_id = ?)
            ORDER BY m.created_at DESC LIMIT 8`,
        )
        .all(like, isAdmin ? 1 : 0, viewer.id) as {
        id: string;
        body: string;
        conversationId: string;
        senderName: string;
      }[];
      results.push(
        ...messages.map((row) => ({
          type: 'message' as const,
          id: row.id,
          title: row.body.slice(0, 70),
          subtitle: `Message from ${row.senderName}`,
          href: isAdmin
            ? `/admin/messages?conversation=${row.conversationId}`
            : '/dashboard/messages',
        })),
      );

      if (isAdmin) {
        const clients = db
          .prepare(
            `SELECT id, name, email FROM users WHERE role = 'client' AND (name LIKE ? OR email LIKE ?) LIMIT 8`,
          )
          .all(like, like) as { id: string; name: string; email: string }[];
        results.push(
          ...clients.map((row) => ({
            type: 'client' as const,
            id: row.id,
            title: row.name,
            subtitle: row.email,
            href: `/admin/clients/${row.id}`,
          })),
        );

        const requests = db
          .prepare(
            `SELECT id, name, project_type AS projectType, description FROM project_requests
              WHERE name LIKE ? OR email LIKE ? OR description LIKE ? ORDER BY created_at DESC LIMIT 8`,
          )
          .all(like, like, like) as {
          id: string;
          name: string;
          projectType: string | null;
          description: string;
        }[];
        results.push(
          ...requests.map((row) => ({
            type: 'request' as const,
            id: row.id,
            title: `${row.projectType ?? 'Request'} — ${row.name}`,
            subtitle: row.description.slice(0, 90),
            href: `/admin/requests/${row.id}`,
          })),
        );
      }
    }

    res.json({ term, results });
  }),
);
