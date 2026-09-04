import { env } from '../config/env.js';
import { db } from './index.js';
import { runColumnMigrations } from './migrations.js';
import { uuid } from '../lib/ids.js';
import { hashPassword } from '../lib/password.js';
import { CORE_FEATURES, getFeature } from '../services/features.service.js';
import { DEFAULT_SETTINGS } from '../services/settings.service.js';

const DEFAULT_CATEGORIES = [
  'Logos',
  'Branding',
  'Posters',
  'Flyers',
  'Social Media Designs',
  'Business Cards',
  'UI/UX',
  'Thumbnails',
  'Invitations',
  'Advertisements',
  'Other Designs',
];

const DEFAULT_SERVICES = [
  { name: 'Logo Design', description: 'A single distinctive mark with the full file set: vector, colour variants and clear-space rules.', priceMode: 'fixed', price: 350, deliveryTime: '5–7 days', icon: 'pen' },
  { name: 'Brand Identity', description: 'The complete system — logo, palette, typography, layout rules and a guidelines document your team can actually follow.', priceMode: 'from', price: 1200, deliveryTime: '3–4 weeks', icon: 'sparkles' },
  { name: 'Poster Design', description: 'Event and campaign posters built for print and screen, supplied press-ready.', priceMode: 'fixed', price: 180, deliveryTime: '3–5 days', icon: 'image' },
  { name: 'Flyer Design', description: 'Single or double-sided flyers with a clear hierarchy that survives being read in three seconds.', priceMode: 'fixed', price: 120, deliveryTime: '2–4 days', icon: 'file' },
  { name: 'Social Media Graphics', description: 'A month of on-brand posts and stories, sized for every platform.', priceMode: 'fixed', price: 300, deliveryTime: '5–7 days', icon: 'share' },
  { name: 'Business Card Design', description: 'Cards designed with the printer in mind: bleed, stock and finish decided up front.', priceMode: 'fixed', price: 120, deliveryTime: '2–3 days', icon: 'card' },
  { name: 'YouTube Thumbnail Design', description: 'Thumbnails built to be legible at 120px wide, in a template you can reuse.', priceMode: 'fixed', price: 60, deliveryTime: '1–2 days', icon: 'play' },
  { name: 'UI/UX Design', description: 'Product and marketing interfaces — flows, wireframes and a component library handed off in Figma.', priceMode: 'from', price: 1500, deliveryTime: '3–6 weeks', icon: 'layout' },
  { name: 'Advertising Design', description: 'Display, print and out-of-home creative adapted across every placement you need.', priceMode: 'custom', price: null, deliveryTime: '1–2 weeks', icon: 'megaphone' },
];

/**
 * Creates the rows the platform cannot run without: the administrator account,
 * the starter categories and services, and the feature registry. Safe to run on
 * every boot — it only fills in what is missing.
 */
export function ensureBootstrapData(): void {
  runColumnMigrations();

  const adminCount = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get() as { n: number };

  if (adminCount.n === 0) {
    const id = uuid();
    // Synchronous boot needs a hash now; scrypt is promise-based, so this runs
    // as a floating task and the account appears a moment after start-up.
    void hashPassword(env.adminPassword).then((passwordHash) => {
      db.transaction(() => {
        db.prepare(
          `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`,
        ).run(id, env.adminName, env.adminEmail, passwordHash);
        db.prepare(`INSERT INTO profiles (user_id, bio) VALUES (?, ?)`).run(
          id,
          DEFAULT_SETTINGS.about.bio,
        );
      })();
      console.log(`  admin    ${env.adminEmail} (created on first boot)`);
    });
  }

  const categoryCount = db.prepare(`SELECT COUNT(*) AS n FROM portfolio_categories`).get() as { n: number };
  if (categoryCount.n === 0) {
    const insert = db.prepare(
      `INSERT INTO portfolio_categories (id, name, slug, position) VALUES (?, ?, ?, ?)`,
    );
    db.transaction(() => {
      DEFAULT_CATEGORIES.forEach((name, index) => {
        insert.run(uuid(), name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), index);
      });
    })();
  }

  const serviceCount = db.prepare(`SELECT COUNT(*) AS n FROM services`).get() as { n: number };
  if (serviceCount.n === 0) {
    const insert = db.prepare(
      `INSERT INTO services (id, name, slug, description, price_mode, price_fixed, price_from,
                             delivery_time, icon, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    db.transaction(() => {
      DEFAULT_SERVICES.forEach((service, index) => {
        insert.run(
          uuid(),
          service.name,
          service.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          service.description,
          service.priceMode,
          service.priceMode === 'fixed' ? service.price : null,
          service.priceMode === 'from' ? service.price : null,
          service.deliveryTime,
          service.icon,
          index,
        );
      });
    })();
  }

  // The feature registry is additive: new platform features appear for existing
  // installs without disturbing whatever the designer has already toggled.
  const insertFeature = db.prepare(
    `INSERT INTO features (id, key, name, description, category, status, config, is_core, created_by)
     VALUES (?, ?, ?, ?, ?, ?, '{}', ?, 'system')`,
  );
  for (const feature of CORE_FEATURES) {
    const key = feature.key!;
    if (getFeature(key)) continue;
    insertFeature.run(
      uuid(),
      key,
      feature.name,
      feature.description ?? null,
      feature.category ?? 'general',
      feature.status ?? 'disabled',
      feature.isCore ? 1 : 0,
    );
  }
}
