import { db } from '../../db/index.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { uuid } from '../../lib/ids.js';
import { logActivity } from '../../lib/activity.js';
import {
  createFeature,
  deleteFeature,
  getFeature,
  updateFeature,
} from '../features.service.js';
import { getSettings, saveSettings } from '../settings.service.js';
import { uniqueCategorySlug } from '../portfolio.service.js';

/**
 * The AI never touches the database directly. It may only propose calls to the
 * tools registered here, every one of which is:
 *   - explicitly allow-listed,
 *   - classified read / write / dangerous,
 *   - executed only after an administrator approves the plan,
 *   - recorded with an undo payload where reversal is possible.
 */
export type ToolRisk = 'read' | 'write' | 'dangerous';

export interface ToolContext {
  actorId: string;
  actorName: string;
}

export interface ToolResult {
  message: string;
  data?: unknown;
  /** Present when the change can be rolled back from the activity log. */
  undo?: { tool: string; input: Record<string, unknown> };
}

export interface ToolDefinition {
  name: string;
  risk: ToolRisk;
  summary: string;
  /** Human-readable parameter description used in the plan preview and prompt. */
  parameters: Record<string, string>;
  run(input: Record<string, unknown>, ctx: ToolContext): ToolResult;
}

const str = (input: Record<string, unknown>, key: string, required = true): string => {
  const value = input[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (required) throw badRequest(`The "${key}" value is required for this action.`);
  return '';
};

const obj = (input: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = input[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
};

export const TOOLS: Record<string, ToolDefinition> = {
  createFeature: {
    name: 'createFeature',
    risk: 'write',
    summary: 'Register a new optional site feature (disabled until you enable it).',
    parameters: {
      key: 'kebab-case identifier, e.g. "testimonials"',
      name: 'Display name',
      description: 'One sentence explaining what it does',
      category: 'website | clients | admin | marketing',
      config: 'Optional JSON configuration object',
    },
    run(input, ctx) {
      const feature = createFeature({
        key: str(input, 'key', false) || str(input, 'name'),
        name: str(input, 'name'),
        description: str(input, 'description', false),
        category: str(input, 'category', false) || 'general',
        // A newly proposed feature always starts off, so nothing changes on the
        // live site until the designer flips it on deliberately.
        status: 'disabled',
        config: obj(input, 'config'),
        createdBy: `AI (${ctx.actorName})`,
      });
      return {
        message: `Created the "${feature.name}" feature. It is disabled until you enable it.`,
        data: feature,
        undo: { tool: 'removeFeature', input: { key: feature.key } },
      };
    },
  },

  updateFeature: {
    name: 'updateFeature',
    risk: 'write',
    summary: 'Change a feature’s name, description or configuration.',
    parameters: { key: 'Feature key', name: 'New name', description: 'New description', config: 'Config patch' },
    run(input, ctx) {
      const key = str(input, 'key');
      const before = getFeature(key);
      if (!before) throw notFound(`No feature with the key "${key}".`);

      const feature = updateFeature(key, {
        name: str(input, 'name', false) || undefined,
        description: str(input, 'description', false) || undefined,
        config: Object.keys(obj(input, 'config')).length ? obj(input, 'config') : undefined,
        changeNote: 'Updated by Designer’s AI',
        actor: `AI (${ctx.actorName})`,
      });
      return {
        message: `Updated the "${feature.name}" feature.`,
        data: feature,
        undo: {
          tool: 'updateFeature',
          input: { key, name: before.name, description: before.description ?? '', config: before.config },
        },
      };
    },
  },

  enableFeature: {
    name: 'enableFeature',
    risk: 'write',
    summary: 'Turn a feature on so it appears on the live site.',
    parameters: { key: 'Feature key' },
    run(input, ctx) {
      const key = str(input, 'key');
      const feature = updateFeature(key, {
        status: 'enabled',
        changeNote: 'Enabled by Designer’s AI',
        actor: `AI (${ctx.actorName})`,
      });
      return {
        message: `"${feature.name}" is now live.`,
        data: feature,
        undo: { tool: 'disableFeature', input: { key } },
      };
    },
  },

  disableFeature: {
    name: 'disableFeature',
    risk: 'write',
    summary: 'Turn a feature off without deleting it.',
    parameters: { key: 'Feature key' },
    run(input, ctx) {
      const key = str(input, 'key');
      const feature = updateFeature(key, {
        status: 'disabled',
        changeNote: 'Disabled by Designer’s AI',
        actor: `AI (${ctx.actorName})`,
      });
      return {
        message: `"${feature.name}" is switched off.`,
        data: feature,
        undo: { tool: 'enableFeature', input: { key } },
      };
    },
  },

  removeFeature: {
    name: 'removeFeature',
    risk: 'dangerous',
    summary: 'Permanently remove a non-core feature.',
    parameters: { key: 'Feature key' },
    run(input, ctx) {
      const key = str(input, 'key');
      const removed = deleteFeature(key, `AI (${ctx.actorName})`);
      return {
        message: `Removed the "${removed.name}" feature.`,
        data: removed,
        undo: {
          tool: 'createFeature',
          input: {
            key: removed.key,
            name: removed.name,
            description: removed.description ?? '',
            category: removed.category,
            config: removed.config,
          },
        },
      };
    },
  },

  createPortfolioCategory: {
    name: 'createPortfolioCategory',
    risk: 'write',
    summary: 'Add a new portfolio category.',
    parameters: { name: 'Category name', description: 'Short description' },
    run(input, ctx) {
      const name = str(input, 'name');
      const existing = db
        .prepare(`SELECT id FROM portfolio_categories WHERE name = ? COLLATE NOCASE`)
        .get(name) as { id: string } | undefined;
      if (existing) throw badRequest(`The category "${name}" already exists.`);

      const id = uuid();
      db.prepare(
        `INSERT INTO portfolio_categories (id, name, slug, description, position) VALUES (?, ?, ?, ?, 99)`,
      ).run(id, name, uniqueCategorySlug(name), str(input, 'description', false) || null);

      logActivity({
        actorId: ctx.actorId,
        actorType: 'ai',
        action: 'category.created',
        entityType: 'portfolio_category',
        entityId: id,
        meta: { name },
      });
      return {
        message: `Added the "${name}" portfolio category.`,
        data: { id, name },
        undo: { tool: 'removePortfolioCategory', input: { id } },
      };
    },
  },

  removePortfolioCategory: {
    name: 'removePortfolioCategory',
    risk: 'dangerous',
    summary: 'Delete an empty portfolio category.',
    parameters: { id: 'Category id' },
    run(input, ctx) {
      const id = str(input, 'id');
      const category = db.prepare(`SELECT id, name, description FROM portfolio_categories WHERE id = ?`).get(id) as
        | { id: string; name: string; description: string | null }
        | undefined;
      if (!category) throw notFound('That category no longer exists.');

      const used = db.prepare(`SELECT COUNT(*) AS n FROM portfolio_projects WHERE category_id = ?`).get(id) as {
        n: number;
      };
      if (used.n > 0) throw badRequest(`${used.n} project(s) still use "${category.name}".`);

      db.prepare(`DELETE FROM portfolio_categories WHERE id = ?`).run(id);
      logActivity({
        actorId: ctx.actorId,
        actorType: 'ai',
        action: 'category.deleted',
        entityType: 'portfolio_category',
        entityId: id,
        meta: { name: category.name },
      });
      return {
        message: `Removed the "${category.name}" category.`,
        undo: {
          tool: 'createPortfolioCategory',
          input: { name: category.name, description: category.description ?? '' },
        },
      };
    },
  },

  updateContent: {
    name: 'updateContent',
    risk: 'write',
    summary: 'Change website copy or branding held in site settings.',
    parameters: {
      path: 'Dotted settings path, e.g. "heroTitle" or "about.philosophy"',
      value: 'The new value',
    },
    run(input, ctx) {
      const path = str(input, 'path');
      const value = input.value;
      if (value === undefined) throw badRequest('A new value is required.');

      const segments = path.split('.').filter(Boolean);
      if (segments.length === 0 || segments.length > 3) throw badRequest('That settings path is not supported.');

      const settings = getSettings() as unknown as Record<string, unknown>;
      let cursor: Record<string, unknown> = settings;
      for (const segment of segments.slice(0, -1)) {
        const next = cursor[segment];
        if (!next || typeof next !== 'object') throw badRequest(`"${path}" is not a settings field.`);
        cursor = next as Record<string, unknown>;
      }
      const leaf = segments[segments.length - 1];
      if (!(leaf in cursor)) throw badRequest(`"${path}" is not a settings field.`);

      const previous = cursor[leaf];
      // Rebuild the patch as a nested object so saveSettings merges rather than replaces.
      let patch: unknown = value;
      for (let index = segments.length - 1; index >= 0; index -= 1) {
        patch = { [segments[index]]: patch };
      }

      saveSettings(patch as Record<string, never>);
      logActivity({
        actorId: ctx.actorId,
        actorType: 'ai',
        action: 'settings.updated',
        entityType: 'settings',
        meta: { path },
      });
      return {
        message: `Updated "${path}".`,
        data: { path, value },
        undo: { tool: 'updateContent', input: { path, value: previous as never } },
      };
    },
  },

  updatePageSection: {
    name: 'updatePageSection',
    risk: 'write',
    summary: 'Show or hide a homepage section.',
    parameters: { key: 'Section key (hero, stats, featured, services, process, testimonials, cta)', enabled: 'true or false' },
    run(input, ctx) {
      const key = str(input, 'key');
      const enabled = input.enabled !== false && input.enabled !== 'false';
      const settings = getSettings();
      const section = settings.homepageSections.find((entry) => entry.key === key);
      if (!section) throw notFound(`There is no homepage section called "${key}".`);

      const previous = section.enabled;
      saveSettings({
        homepageSections: settings.homepageSections.map((entry) =>
          entry.key === key ? { ...entry, enabled } : entry,
        ),
      });
      logActivity({
        actorId: ctx.actorId,
        actorType: 'ai',
        action: 'settings.section_toggled',
        entityType: 'settings',
        meta: { key, enabled },
      });
      return {
        message: `The "${section.label}" section is now ${enabled ? 'visible' : 'hidden'}.`,
        undo: { tool: 'updatePageSection', input: { key, enabled: previous } },
      };
    },
  },

  createPage: {
    name: 'createPage',
    risk: 'write',
    summary: 'Register a new content page, stored as a feature with page config.',
    parameters: { title: 'Page title', slug: 'URL slug', body: 'Markdown-ish body copy' },
    run(input, ctx) {
      const title = str(input, 'title');
      const feature = createFeature({
        key: `page-${str(input, 'slug', false) || title}`,
        name: `Page: ${title}`,
        description: `Custom content page at /p/${str(input, 'slug', false) || title}`,
        category: 'website',
        status: 'disabled',
        config: {
          type: 'page',
          title,
          slug: str(input, 'slug', false) || title,
          body: str(input, 'body', false),
        },
        createdBy: `AI (${ctx.actorName})`,
      });
      return {
        message: `Drafted the "${title}" page. Enable it in the Feature Manager to publish.`,
        data: feature,
        undo: { tool: 'removeFeature', input: { key: feature.key } },
      };
    },
  },
};

export const TOOL_NAMES = Object.keys(TOOLS);

export function describeTools(): string {
  return Object.values(TOOLS)
    .map((tool) => {
      const params = Object.entries(tool.parameters)
        .map(([key, description]) => `      - ${key}: ${description}`)
        .join('\n');
      return `  ${tool.name} (${tool.risk}) — ${tool.summary}\n${params}`;
    })
    .join('\n');
}

export function highestRisk(steps: { tool: string }[]): ToolRisk {
  let risk: ToolRisk = 'read';
  for (const step of steps) {
    const definition = TOOLS[step.tool];
    if (!definition) continue;
    if (definition.risk === 'dangerous') return 'dangerous';
    if (definition.risk === 'write') risk = 'write';
  }
  return risk;
}
