import { db } from '../../db/index.js';
import { listFeatures } from '../features.service.js';
import { getSettings } from '../settings.service.js';

/**
 * A compact, read-only snapshot of the studio used to ground the assistant.
 * Deliberately excludes message bodies, client emails and anything private
 * unless the admin explicitly asks for a specific conversation summary.
 */
export function buildStudioContext(): string {
  const settings = getSettings();
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM portfolio_projects) AS portfolio,
         (SELECT COUNT(*) FROM portfolio_projects WHERE status = 'published') AS published,
         (SELECT COUNT(*) FROM portfolio_categories) AS categories,
         (SELECT COUNT(*) FROM services WHERE active = 1) AS services,
         (SELECT COUNT(*) FROM users WHERE role = 'client') AS clients,
         (SELECT COUNT(*) FROM client_projects) AS projects,
         (SELECT COUNT(*) FROM client_projects WHERE status IN ('discussion','designing','review')) AS activeProjects,
         (SELECT COUNT(*) FROM project_requests WHERE status IN ('new','reviewing')) AS pendingRequests`,
    )
    .get() as Record<string, number>;

  const categories = db
    .prepare(
      `SELECT c.name, COUNT(p.id) AS projects FROM portfolio_categories c
         LEFT JOIN portfolio_projects p ON p.category_id = c.id GROUP BY c.id ORDER BY projects DESC`,
    )
    .all() as { name: string; projects: number }[];

  const topProjects = db
    .prepare(
      `SELECT title, views FROM portfolio_projects WHERE status = 'published' ORDER BY views DESC LIMIT 5`,
    )
    .all() as { title: string; views: number }[];

  const services = db
    .prepare(`SELECT name, price_from AS priceFrom, delivery_time AS deliveryTime FROM services WHERE active = 1`)
    .all() as { name: string; priceFrom: number | null; deliveryTime: string | null }[];

  const features = listFeatures().map((feature) => `${feature.key} (${feature.status})`);

  return [
    `Studio: ${settings.brandName} — ${settings.tagline}`,
    `Hero headline: "${settings.heroTitle}"`,
    `Counts: ${JSON.stringify(counts)}`,
    `Portfolio categories: ${categories.map((c) => `${c.name} (${c.projects})`).join(', ') || 'none yet'}`,
    `Most viewed work: ${topProjects.map((p) => `${p.title} (${p.views} views)`).join(', ') || 'no views yet'}`,
    `Services: ${services.map((s) => `${s.name}${s.priceFrom ? ` from ${s.priceFrom}` : ''}${s.deliveryTime ? `, ${s.deliveryTime}` : ''}`).join('; ') || 'none configured'}`,
    `Homepage sections: ${settings.homepageSections.map((s) => `${s.key}:${s.enabled ? 'on' : 'off'}`).join(', ')}`,
    `Registered features: ${features.join(', ')}`,
    `Preferred writing tone: ${settings.aiSettings.tone}`,
  ].join('\n');
}

/** Summary material for a specific client conversation, admin-requested only. */
export function conversationDigest(conversationId: string, limit = 40): string {
  const rows = db
    .prepare(
      `SELECT u.role, u.name, m.body, m.created_at AS createdAt
         FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ? AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC LIMIT ?`,
    )
    .all(conversationId, limit) as { role: string; name: string; body: string; createdAt: string }[];

  return rows
    .reverse()
    .map((row) => `[${row.createdAt}] ${row.role === 'admin' ? 'Designer' : row.name}: ${row.body}`)
    .join('\n');
}

export function requestDigest(requestId: string): string {
  const row = db
    .prepare(
      `SELECT name, email, project_type AS projectType, budget_range AS budgetRange, deadline,
              preferred_style AS preferredStyle, brand_name AS brandName, colors, dimensions,
              target_audience AS targetAudience, description
         FROM project_requests WHERE id = ?`,
    )
    .get(requestId) as Record<string, string | null> | undefined;
  if (!row) return '';
  return Object.entries(row)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}
