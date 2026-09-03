import { db } from '../db/index.js';
import { uuid } from './ids.js';

export type ActorType = 'admin' | 'client' | 'system' | 'ai' | 'visitor';

export interface ActivityInput {
  actorId?: string | null;
  actorType?: ActorType;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}

const insert = db.prepare(
  `INSERT INTO activity_logs (id, actor_id, actor_type, action, entity_type, entity_id, meta)
   VALUES (@id, @actorId, @actorType, @action, @entityType, @entityId, @meta)`,
);

export function logActivity(input: ActivityInput): void {
  insert.run({
    id: uuid(),
    actorId: input.actorId ?? null,
    actorType: input.actorType ?? 'system',
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    meta: JSON.stringify(input.meta ?? {}),
  });
}
