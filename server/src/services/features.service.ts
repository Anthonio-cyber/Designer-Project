import { db, json } from '../db/index.js';
import { conflict, notFound } from '../lib/errors.js';
import { slugify, uuid } from '../lib/ids.js';

export interface FeatureRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  status: 'enabled' | 'disabled';
  config: Record<string, unknown>;
  version: number;
  isCore: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const SELECT = `
  SELECT id, key, name, description, category, status, config, version,
         is_core AS isCore, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
    FROM features`;

function serialize(row: Record<string, unknown>): FeatureRecord {
  return {
    ...(row as unknown as FeatureRecord),
    config: json<Record<string, unknown>>(row.config, {}),
    isCore: !!row.isCore,
  };
}

export function listFeatures(): FeatureRecord[] {
  return (db.prepare(`${SELECT} ORDER BY category, name`).all() as Record<string, unknown>[]).map(serialize);
}

export function getFeature(keyOrId: string): FeatureRecord | undefined {
  const row = db.prepare(`${SELECT} WHERE key = ? OR id = ?`).get(keyOrId, keyOrId) as
    | Record<string, unknown>
    | undefined;
  return row ? serialize(row) : undefined;
}

/** Convenience used by public routes to gate optional site sections. */
export function isFeatureEnabled(key: string): boolean {
  return getFeature(key)?.status === 'enabled';
}

function snapshot(feature: FeatureRecord, note: string, actor: string): void {
  db.prepare(
    `INSERT INTO feature_versions (id, feature_id, version, snapshot, change_note, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(uuid(), feature.id, feature.version, JSON.stringify(feature), note, actor);
}

export interface CreateFeatureInput {
  key?: string;
  name: string;
  description?: string;
  category?: string;
  status?: 'enabled' | 'disabled';
  config?: Record<string, unknown>;
  createdBy?: string;
}

export function createFeature(input: CreateFeatureInput): FeatureRecord {
  const key = slugify(input.key ?? input.name);
  if (getFeature(key)) throw conflict(`A feature with the key "${key}" already exists.`);

  const id = uuid();
  db.prepare(
    `INSERT INTO features (id, key, name, description, category, status, config, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    key,
    input.name,
    input.description ?? null,
    input.category ?? 'general',
    input.status ?? 'disabled',
    JSON.stringify(input.config ?? {}),
    input.createdBy ?? 'admin',
  );

  const feature = getFeature(id)!;
  snapshot(feature, 'Feature created', input.createdBy ?? 'admin');
  return feature;
}

export interface UpdateFeatureInput {
  name?: string;
  description?: string | null;
  category?: string;
  status?: 'enabled' | 'disabled';
  config?: Record<string, unknown>;
  changeNote?: string;
  actor?: string;
}

export function updateFeature(keyOrId: string, input: UpdateFeatureInput): FeatureRecord {
  const existing = getFeature(keyOrId);
  if (!existing) throw notFound('Feature not found.');

  // Snapshot the previous state first so every change can be rolled back.
  snapshot(existing, input.changeNote ?? 'Feature updated', input.actor ?? 'admin');

  db.prepare(
    `UPDATE features SET
       name = COALESCE(@name, name),
       description = COALESCE(@description, description),
       category = COALESCE(@category, category),
       status = COALESCE(@status, status),
       config = COALESCE(@config, config),
       version = version + 1,
       updated_at = datetime('now')
     WHERE id = @id`,
  ).run({
    id: existing.id,
    name: input.name ?? null,
    description: input.description ?? null,
    category: input.category ?? null,
    status: input.status ?? null,
    config: input.config ? JSON.stringify({ ...existing.config, ...input.config }) : null,
  });

  return getFeature(existing.id)!;
}

export function deleteFeature(keyOrId: string, actor = 'admin'): FeatureRecord {
  const existing = getFeature(keyOrId);
  if (!existing) throw notFound('Feature not found.');
  if (existing.isCore) throw conflict('Core features cannot be removed, only disabled.');

  snapshot(existing, 'Feature removed', actor);
  db.prepare(`DELETE FROM features WHERE id = ?`).run(existing.id);
  return existing;
}

export function featureHistory(keyOrId: string) {
  const feature = getFeature(keyOrId);
  if (!feature) throw notFound('Feature not found.');
  return db
    .prepare(
      `SELECT id, version, snapshot, change_note AS changeNote, created_by AS createdBy, created_at AS createdAt
         FROM feature_versions WHERE feature_id = ? ORDER BY version DESC, created_at DESC`,
    )
    .all(feature.id)
    .map((row) => ({
      ...(row as Record<string, unknown>),
      snapshot: json<Record<string, unknown>>((row as { snapshot: string }).snapshot, {}),
    }));
}

/** Restores a feature to a previously captured version. */
export function restoreFeatureVersion(featureId: string, versionId: string, actor = 'admin'): FeatureRecord {
  const version = db
    .prepare(`SELECT snapshot FROM feature_versions WHERE id = ? AND feature_id = ?`)
    .get(versionId, featureId) as { snapshot: string } | undefined;
  if (!version) throw notFound('That version no longer exists.');

  const restored = json<FeatureRecord>(version.snapshot, {} as FeatureRecord);
  return updateFeature(featureId, {
    name: restored.name,
    description: restored.description ?? null,
    category: restored.category,
    status: restored.status,
    config: restored.config,
    changeNote: 'Restored from an earlier version',
    actor,
  });
}

/** Features shipped with the platform. Seeded once, then owned by the admin. */
export const CORE_FEATURES: (CreateFeatureInput & { isCore?: boolean })[] = [
  { key: 'portfolio', name: 'Portfolio gallery', description: 'Public portfolio grid, filtering and project pages.', category: 'website', status: 'enabled', isCore: true },
  { key: 'services', name: 'Services page', description: 'Public list of services with pricing and delivery times.', category: 'website', status: 'enabled', isCore: true },
  { key: 'project-requests', name: 'Project request form', description: 'Lets visitors send a full design brief with references.', category: 'clients', status: 'enabled', isCore: true },
  { key: 'client-accounts', name: 'Client accounts', description: 'Registration, login and the client dashboard.', category: 'clients', status: 'enabled', isCore: true },
  { key: 'private-messaging', name: 'Private messaging', description: 'One-to-one encrypted-at-rest thread between each client and the studio.', category: 'clients', status: 'enabled', isCore: true },
  { key: 'revisions', name: 'Revision system', description: 'Approve or request changes on delivered designs.', category: 'clients', status: 'enabled', isCore: true },
  { key: 'ai-assistant', name: "Designer's AI", description: 'Admin assistant for copy, planning and feature proposals.', category: 'admin', status: 'enabled', isCore: true },
  { key: 'testimonials', name: 'Testimonials', description: 'Client quotes shown on the homepage.', category: 'website', status: 'disabled' },
  { key: 'client-reviews', name: 'Client reviews', description: 'Star ratings collected after a project completes.', category: 'website', status: 'disabled' },
  { key: 'booking-system', name: 'Booking system', description: 'Discovery-call scheduling from the contact page.', category: 'website', status: 'disabled' },
  { key: 'newsletter', name: 'Newsletter', description: 'Email capture in the footer.', category: 'marketing', status: 'disabled' },
];
