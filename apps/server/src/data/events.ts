import { randomUUID } from 'node:crypto';
import type { Event } from '@throughline/shared';

import type { AppDatabase } from '../db';

interface EventRow {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorTitle: string;
  itemId: string | null;
  itemCode: string | null;
  itemTitle: string | null;
}

const eventSelect = `
  SELECT e.id, e.action, e.detail, e.created_at AS createdAt,
         u.id AS actorId, u.name AS actorName, u.email AS actorEmail, u.title AS actorTitle,
         i.id AS itemId, i.code AS itemCode, i.title AS itemTitle
  FROM events e
  JOIN users u ON u.id = e.actor_id
  LEFT JOIN items i ON i.id = e.item_id
`;

function mapEvent(row: EventRow): Event {
  return {
    id: row.id,
    action: row.action,
    detail: row.detail,
    actor: {
      id: row.actorId,
      name: row.actorName,
      email: row.actorEmail,
      title: row.actorTitle,
    },
    item:
      row.itemId && row.itemCode && row.itemTitle
        ? { id: row.itemId, code: row.itemCode, title: row.itemTitle }
        : null,
    createdAt: row.createdAt,
  };
}

export interface RecordEventInput {
  projectId: string;
  actorId: string;
  itemId?: string | null;
  action: string;
  detail: string;
}

export function recordEvent(db: AppDatabase, input: RecordEventInput): void {
  db.prepare(`
    INSERT INTO events (id, project_id, actor_id, item_id, action, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.projectId,
    input.actorId,
    input.itemId ?? null,
    input.action,
    input.detail,
    new Date().toISOString(),
  );
}

export function listProjectEvents(db: AppDatabase, projectId: string, limit = 30): Event[] {
  const rows = db
    .prepare(`${eventSelect} WHERE e.project_id = ? ORDER BY e.created_at DESC, e.rowid DESC LIMIT ?`)
    .all(projectId, limit) as EventRow[];
  return rows.map(mapEvent);
}

export function listItemEvents(db: AppDatabase, itemId: string): Event[] {
  const rows = db
    .prepare(`${eventSelect} WHERE e.item_id = ? ORDER BY e.created_at DESC, e.rowid DESC`)
    .all(itemId) as EventRow[];
  return rows.map(mapEvent);
}

