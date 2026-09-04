import { db } from './index.js';

/**
 * Additive column migrations. `schema.sql` handles tables (it is written with
 * IF NOT EXISTS), but SQLite has no `ADD COLUMN IF NOT EXISTS`, so columns added
 * after the first release are applied here against the live table definition.
 */
interface ColumnMigration {
  table: string;
  column: string;
  definition: string;
}

const COLUMNS: ColumnMigration[] = [
  // Services gained an explicit pricing mode: a fixed price, a "from" price, or
  // a custom quote handled off-site.
  { table: 'services', column: 'price_mode', definition: `TEXT NOT NULL DEFAULT 'from'` },
  { table: 'services', column: 'price_fixed', definition: 'REAL' },
  { table: 'services', column: 'currency', definition: `TEXT NOT NULL DEFAULT 'USD'` },
];

function hasColumn(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

function tableExists(table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return !!row;
}

export function runColumnMigrations(): void {
  for (const migration of COLUMNS) {
    if (!tableExists(migration.table)) continue;
    if (hasColumn(migration.table, migration.column)) continue;
    db.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.definition}`);
  }

  // Existing services keep behaving as they did: a price means "from", no price
  // means "contact for pricing".
  if (tableExists('services') && hasColumn('services', 'price_mode')) {
    db.prepare(
      `UPDATE services SET price_mode = 'custom'
        WHERE price_from IS NULL AND price_label IS NULL AND price_mode = 'from'`,
    ).run();
  }
}
