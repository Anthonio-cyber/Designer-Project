import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const db = new Database(path.join(env.dataDir, 'designer-platform.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/** Applies schema.sql. It is written with IF NOT EXISTS so it is safe to re-run. */
export function migrate(): void {
  const schemaPath = [
    path.join(here, 'schema.sql'),
    path.join(here, '../../src/db/schema.sql'),
  ].find((candidate) => fs.existsSync(candidate));

  if (!schemaPath) throw new Error('schema.sql not found next to the compiled db module');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
}

/** Runs `fn` inside a transaction and returns its value. */
export function transaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}

// Run migrations as soon as the database module loads. Service modules prepare
// their statements at import time, so the tables must exist before they do.
migrate();

// Column-level migrations live in a separate module to avoid an import cycle;
// bootstrap runs them immediately after this module is first loaded.

export type Row = Record<string, unknown>;

export const now = (): string => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const today = (): string => new Date().toISOString().slice(0, 10);

/** Safely parse a JSON column, falling back when the value is malformed. */
export function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
