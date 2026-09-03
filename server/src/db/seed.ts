/**
 * Development seed. Creates demo portfolio work, a client account, an example
 * project with a delivery, and a short conversation so every screen has content.
 *
 *   npm run seed            (adds anything missing)
 *   npm run seed -- --reset (wipes demo content first)
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { db, migrate } from './index.js';
import { ensureBootstrapData } from './bootstrap.js';
import { projectCode, slugify, uuid } from '../lib/ids.js';
import { hashPassword } from '../lib/password.js';
import { ensureConversationForClient } from '../services/messaging.service.js';

const RESET = process.argv.includes('--reset');

const PALETTES: [string, string, string][] = [
  ['#6d5efc', '#22d3ee', '#0f172a'],
  ['#f97316', '#fbbf24', '#1c1917'],
  ['#ec4899', '#8b5cf6', '#18122b'],
  ['#10b981', '#3b82f6', '#052e2b'],
  ['#ef4444', '#f59e0b', '#1a1a1a'],
  ['#0ea5e9', '#a855f7', '#0c1222'],
  ['#84cc16', '#14b8a6', '#0f1a12'],
  ['#f43f5e', '#fb7185', '#1f0a12'],
];

/**
 * Generates placeholder artwork as SVG so the seeded portfolio has real images
 * without shipping binary assets in the repository.
 */
function artwork(title: string, subtitle: string, index: number, wide = false): string {
  const [from, to, ink] = PALETTES[index % PALETTES.length];
  const width = wide ? 1600 : 1200;
  const height = wide ? 900 : 1200;
  const escape = (value: string) => value.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${ink}"/>
  <circle cx="${width * 0.72}" cy="${height * 0.28}" r="${width * 0.3}" fill="url(#g)" opacity="0.85"/>
  <circle cx="${width * 0.28}" cy="${height * 0.75}" r="${width * 0.18}" fill="url(#g)" opacity="0.5"/>
  <rect x="${width * 0.08}" y="${height * 0.08}" width="${width * 0.36}" height="6" fill="#ffffff" opacity="0.7"/>
  <text x="${width * 0.08}" y="${height * 0.5}" font-family="Helvetica, Arial, sans-serif" font-size="${width * 0.075}" font-weight="700" fill="#ffffff">${escape(title.slice(0, 22))}</text>
  <text x="${width * 0.08}" y="${height * 0.56}" font-family="Helvetica, Arial, sans-serif" font-size="${width * 0.028}" fill="#ffffff" opacity="0.75">${escape(subtitle.slice(0, 46))}</text>
</svg>`;
}

function storeArtwork(title: string, subtitle: string, index: number, wide = false): string {
  const bucket = path.join(env.uploadDir, 'seed');
  fs.mkdirSync(bucket, { recursive: true });

  const id = uuid();
  const fileName = `${id}.svg`;
  const body = artwork(title, subtitle, index, wide);
  fs.writeFileSync(path.join(bucket, fileName), body, 'utf8');

  db.prepare(
    `INSERT INTO files (id, original_name, stored_path, mime_type, size_bytes, kind, visibility)
     VALUES (?, ?, ?, 'image/svg+xml', ?, 'portfolio', 'public')`,
  ).run(id, `${slugify(title)}.svg`, path.join('seed', fileName), Buffer.byteLength(body));

  return id;
}

const DEMO_PROJECTS = [
  { title: 'Kola Coffee Roasters', category: 'Branding', summary: 'A warm, unfussy identity for a single-origin roaster opening its first storefront.', tools: ['Illustrator', 'InDesign', 'Photoshop'], featured: true },
  { title: 'Northwind Festival', category: 'Posters', summary: 'Three-poster series for a coastal music festival, printed at A0 on uncoated stock.', tools: ['Illustrator', 'Photoshop'], featured: true },
  { title: 'Loop Fintech Mark', category: 'Logos', summary: 'A single continuous stroke resolving into an L — built to survive a 16px favicon.', tools: ['Illustrator'], featured: true },
  { title: 'Verde Skincare Launch', category: 'Social Media Designs', summary: 'A launch month of posts, stories and paid variants from one flexible grid.', tools: ['Figma', 'Photoshop'], featured: false },
  { title: 'Atlas Studio Cards', category: 'Business Cards', summary: 'Duplexed 600gsm cards with a blind deboss and a single hit of fluorescent ink.', tools: ['InDesign'], featured: false },
  { title: 'Harbour Banking App', category: 'UI/UX', summary: 'Account, transfers and budgeting flows plus a 40-component design system.', tools: ['Figma'], featured: true },
  { title: 'Midnight Records Sleeve', category: 'Other Designs', summary: 'Gatefold sleeve artwork and label design for a late-night jazz reissue.', tools: ['Photoshop', 'Illustrator'], featured: false },
  { title: 'Clearview Optical Ads', category: 'Advertisements', summary: 'Out-of-home campaign adapted across six formats without losing the joke.', tools: ['Illustrator', 'After Effects'], featured: false },
  { title: 'Sabi Kitchen Flyers', category: 'Flyers', summary: 'Weekly menu flyers a two-person team can update themselves in ten minutes.', tools: ['InDesign'], featured: false },
  { title: 'Ranked Gaming Thumbnails', category: 'Thumbnails', summary: 'A thumbnail system that lifted click-through by making one face the hero.', tools: ['Photoshop'], featured: false },
  { title: 'Aduke & Femi Invitations', category: 'Invitations', summary: 'Letterpress wedding suite in deep indigo with hand-set gold foil initials.', tools: ['InDesign', 'Illustrator'], featured: false },
  { title: 'Tenspeed Cycling Kit', category: 'Branding', summary: 'Team identity carried onto jerseys, bidons and the race-day livery.', tools: ['Illustrator', 'Blender'], featured: false },
];

async function seed(): Promise<void> {
  migrate();
  ensureBootstrapData();

  if (RESET) {
    console.log('Resetting demo content…');
    db.transaction(() => {
      db.prepare(`DELETE FROM messages`).run();
      db.prepare(`DELETE FROM conversations`).run();
      db.prepare(`DELETE FROM deliveries`).run();
      db.prepare(`DELETE FROM revisions`).run();
      db.prepare(`DELETE FROM client_projects`).run();
      db.prepare(`DELETE FROM project_requests`).run();
      db.prepare(`DELETE FROM portfolio_projects`).run();
      db.prepare(`DELETE FROM files WHERE kind = 'portfolio'`).run();
      db.prepare(`DELETE FROM users WHERE role = 'client'`).run();
      db.prepare(`DELETE FROM analytics_events`).run();
      db.prepare(`DELETE FROM notifications`).run();
    })();
  }

  const existing = db.prepare(`SELECT COUNT(*) AS n FROM portfolio_projects`).get() as { n: number };
  if (existing.n > 0) {
    console.log(`Portfolio already has ${existing.n} project(s); skipping demo work. Use --reset to rebuild.`);
  } else {
    const categories = db.prepare(`SELECT id, name FROM portfolio_categories`).all() as {
      id: string;
      name: string;
    }[];
    const byName = new Map(categories.map((category) => [category.name, category.id]));

    DEMO_PROJECTS.forEach((project, index) => {
      const thumbnail = storeArtwork(project.title, project.category, index);
      const main = storeArtwork(project.title, project.summary, index, true);
      const gallery = [
        storeArtwork(`${project.title} — detail`, 'Detail view', index + 1, true),
        storeArtwork(`${project.title} — applied`, 'Applied to collateral', index + 2, true),
      ];

      const monthsAgo = index * 2 + 1;
      const date = new Date();
      date.setMonth(date.getMonth() - monthsAgo);

      db.prepare(
        `INSERT INTO portfolio_projects
           (id, title, slug, category_id, summary, description, designer_notes, tools,
            thumbnail_url, main_image_url, gallery, client_name, project_date, featured,
            status, visibility, views, seo_title, seo_description, position)
         VALUES (@id, @title, @slug, @categoryId, @summary, @description, @notes, @tools,
                 @thumbnail, @main, @gallery, @clientName, @projectDate, @featured,
                 'published', 'public', @views, @seoTitle, @seoDescription, @position)`,
      ).run({
        id: uuid(),
        title: project.title,
        slug: slugify(project.title),
        categoryId: byName.get(project.category) ?? null,
        summary: project.summary,
        description: `${project.summary}\n\nThe brief asked for something that would still read clearly at a glance from across a room, and hold up in the hand at close range. We started from the way people actually meet the brand — on a shelf, on a phone, at a counter — and worked backwards to the mark.\n\nEverything was delivered with production files, a short usage guide, and the working sources so the team can keep building without coming back for every small change.`,
        notes: 'Two rounds of direction, one round of refinement. Type set in a single family with a tight weight range to keep the system easy to hand over.',
        tools: JSON.stringify(project.tools),
        thumbnail,
        main,
        gallery: JSON.stringify(gallery),
        clientName: project.title.split(' ')[0],
        projectDate: date.toISOString().slice(0, 10),
        featured: project.featured ? 1 : 0,
        views: 40 + ((index * 37) % 400),
        seoTitle: `${project.title} — ${project.category} by the studio`,
        seoDescription: project.summary,
        position: index,
      });
    });
    console.log(`Seeded ${DEMO_PROJECTS.length} portfolio projects.`);
  }

  // ------------------------------------------------------------- demo client ---
  const demoEmail = 'client@example.com';
  let client = db.prepare(`SELECT id FROM users WHERE email = ?`).get(demoEmail) as { id: string } | undefined;

  if (!client) {
    const id = uuid();
    const passwordHash = await hashPassword('ClientDemo123');
    db.transaction(() => {
      db.prepare(
        `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'client')`,
      ).run(id, 'Tolu Adeyemi', demoEmail, passwordHash);
      db.prepare(`INSERT INTO profiles (user_id, company, location) VALUES (?, ?, ?)`).run(
        id,
        'Kola Coffee Roasters',
        'Lagos, Nigeria',
      );
    })();
    client = { id };
    console.log(`Created demo client ${demoEmail} / ClientDemo123`);
  }

  const admin = db.prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`).get() as
    | { id: string }
    | undefined;

  const hasProject = db.prepare(`SELECT COUNT(*) AS n FROM client_projects`).get() as { n: number };
  if (hasProject.n === 0 && admin) {
    const projectId = uuid();
    db.transaction(() => {
      db.prepare(
        `INSERT INTO client_projects (id, code, client_id, title, description, status, budget, deadline, progress)
         VALUES (?, ?, ?, ?, ?, 'designing', ?, ?, 55)`,
      ).run(
        projectId,
        projectCode(),
        client!.id,
        'Kola Coffee — packaging refresh',
        'Refresh the retail bag design across three roast levels, keeping the existing mark but fixing the hierarchy and the shelf presence.',
        '$1,200 – $2,000',
        '6 weeks',
      );
      for (const [status, note] of [
        ['request_received', 'Brief received'],
        ['discussion', 'Kick-off call held, references agreed'],
        ['designing', 'First direction in progress'],
      ] as const) {
        db.prepare(
          `INSERT INTO project_status_events (id, project_id, status, note, actor_id) VALUES (?, ?, ?, ?, ?)`,
        ).run(uuid(), projectId, status, note, admin.id);
      }
    })();

    const conversation = ensureConversationForClient(client!.id);
    const thread: [string, string][] = [
      [client!.id, 'Hi! Sending over the current bag photos and the roast names. The 250g bag is the priority.'],
      [admin.id, 'Got them, thanks. Quick question before I start — do you want to keep the existing mark exactly as-is, or is a small cleanup on the table?'],
      [client!.id, 'A cleanup is fine as long as it still reads as us from a distance.'],
      [admin.id, 'Perfect. I will bring two directions on Thursday: one conservative, one that pushes the type harder.'],
    ];
    thread.forEach(([senderId, body], index) => {
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, project_id, read_at, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', ?))`,
      ).run(uuid(), conversation.id, senderId, body, projectId, `-${thread.length - index} hours`);
    });
    db.prepare(`UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?`).run(conversation.id);

    db.prepare(
      `INSERT INTO project_requests (id, user_id, name, email, project_type, budget_range, deadline,
                                     preferred_style, brand_name, colors, dimensions, target_audience, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uuid(),
      client!.id,
      'Tolu Adeyemi',
      demoEmail,
      'Packaging design',
      '$1,000 – $2,500',
      '6 weeks',
      'Warm, editorial, lots of white space',
      'Kola Coffee Roasters',
      'Deep green, cream, a single warm accent',
      '250g and 1kg bags',
      'Home brewers aged 25–45 buying in specialty grocers',
      'We need the retail bags redrawn across three roast levels. The current design was made in a hurry and the roast level is impossible to find on shelf. Keep the mark, fix everything else.',
    );

    // A little analytics history so the charts are not empty on first run.
    const insertEvent = db.prepare(
      `INSERT INTO analytics_events (id, type, entity_type, entity_id, day, count) VALUES (?, ?, NULL, NULL, ?, ?)
       ON CONFLICT (type, COALESCE(entity_id, ''), day) DO UPDATE SET count = excluded.count`,
    );
    for (let dayOffset = 29; dayOffset >= 0; dayOffset -= 1) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() - dayOffset);
      const key = day.toISOString().slice(0, 10);
      insertEvent.run(uuid(), 'portfolio_view', key, 8 + ((dayOffset * 13) % 34));
      insertEvent.run(uuid(), 'message_sent', key, (dayOffset * 7) % 9);
      if (dayOffset % 4 === 0) insertEvent.run(uuid(), 'project_request', key, 1 + (dayOffset % 3));
      if (dayOffset % 9 === 0) insertEvent.run(uuid(), 'project_completed', key, 1);
    }

    console.log('Seeded a demo project, conversation, request and 30 days of analytics.');
  }

  console.log('\nSeed complete.');
  console.log(`  Admin  : ${env.adminEmail} / ${env.adminPassword}`);
  console.log(`  Client : ${demoEmail} / ClientDemo123\n`);
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
