import { db, today } from '../db/index.js';
import { uuid } from '../lib/ids.js';

const upsert = db.prepare(
  `INSERT INTO analytics_events (id, type, entity_type, entity_id, day, count)
   VALUES (@id, @type, @entityType, @entityId, @day, 1)
   ON CONFLICT (type, COALESCE(entity_id, ''), day)
   DO UPDATE SET count = count + 1`,
);

export function track(
  type: string,
  options: { entityType?: string; entityId?: string } = {},
): void {
  upsert.run({
    id: uuid(),
    type,
    entityType: options.entityType ?? null,
    entityId: options.entityId ?? null,
    day: today(),
  });
}

export interface SeriesPoint {
  day: string;
  count: number;
}

/** Dense daily series (missing days filled with 0) so charts never jump. */
export function series(type: string, days = 30): SeriesPoint[] {
  const rows = db
    .prepare(
      `SELECT day, SUM(count) AS count FROM analytics_events
       WHERE type = ? AND day >= date('now', ?) GROUP BY day`,
    )
    .all(type, `-${days} days`) as SeriesPoint[];

  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  const out: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - i);
    const day = date.toISOString().slice(0, 10);
    out.push({ day, count: byDay.get(day) ?? 0 });
  }
  return out;
}

export function totalFor(type: string, days = 30): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(count), 0) AS total FROM analytics_events
       WHERE type = ? AND day >= date('now', ?)`,
    )
    .get(type, `-${days} days`) as { total: number };
  return row.total;
}
