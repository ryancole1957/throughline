import type {
  Condition,
  ConditionSeverity,
  ConditionStatus,
} from '@throughline/shared';

import type { AppDatabase } from '../db';

export interface ConditionRow {
  id: string;
  project_id: string;
  item_id: string;
  acceptance_id: string | null;
  code: string;
  description: string;
  owner_id: string;
  due_date: string;
  severity: ConditionSeverity;
  status: ConditionStatus;
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
}

interface ConditionListRow extends ConditionRow {
  ownerName: string;
  ownerEmail: string;
  ownerTitle: string;
  itemCode: string;
  itemTitle: string;
  closedByName: string | null;
  closedByEmail: string | null;
  closedByTitle: string | null;
}

export function listConditions(db: AppDatabase, projectId: string): Condition[] {
  const rows = db
    .prepare(`
      SELECT c.*, u.name AS ownerName, u.email AS ownerEmail, u.title AS ownerTitle,
             i.code AS itemCode, i.title AS itemTitle,
             cb.name AS closedByName, cb.email AS closedByEmail, cb.title AS closedByTitle
      FROM conditions c
      JOIN users u ON u.id = c.owner_id
      JOIN items i ON i.id = c.item_id
      LEFT JOIN users cb ON cb.id = c.closed_by
      WHERE c.project_id = ?
      ORDER BY CASE c.status WHEN 'open' THEN 0 ELSE 1 END,
               CASE c.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
               c.due_date ASC
    `)
    .all(projectId) as ConditionListRow[];

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    description: row.description,
    owner: {
      id: row.owner_id,
      name: row.ownerName,
      email: row.ownerEmail,
      title: row.ownerTitle,
    },
    dueDate: row.due_date,
    severity: row.severity,
    status: row.status,
    item: { id: row.item_id, code: row.itemCode, title: row.itemTitle },
    createdAt: row.created_at,
    closedAt: row.closed_at,
    closedBy:
      row.closed_by && row.closedByName && row.closedByEmail && row.closedByTitle
        ? {
            id: row.closed_by,
            name: row.closedByName,
            email: row.closedByEmail,
            title: row.closedByTitle,
          }
        : null,
  }));
}

export function getConditionRow(db: AppDatabase, id: string): ConditionRow | undefined {
  return db.prepare('SELECT * FROM conditions WHERE id = ?').get(id) as
    | ConditionRow
    | undefined;
}

export function listConditionsForItem(
  db: AppDatabase,
  projectId: string,
  itemId: string,
): Condition[] {
  return listConditions(db, projectId).filter((condition) => condition.item.id === itemId);
}

export function nextConditionCode(db: AppDatabase, projectId: string): string {
  const row = db
    .prepare("SELECT code FROM conditions WHERE project_id = ? AND code LIKE 'C-%' ORDER BY code DESC LIMIT 1")
    .get(projectId) as { code: string } | undefined;
  const current = row ? Number.parseInt(row.code.slice(2), 10) : 0;
  return `C-${String((Number.isFinite(current) ? current : 0) + 1).padStart(2, '0')}`;
}
