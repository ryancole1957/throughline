import type { Risk, RiskSeverity, RiskStatus } from '@throughline/shared';

import type { AppDatabase } from '../db';

export interface RiskRow {
  id: string;
  project_id: string;
  code: string;
  title: string;
  impact: string;
  mitigation: string;
  severity: RiskSeverity;
  status: RiskStatus;
  owner_id: string;
  due_date: string;
  progress: string;
  exception_note: string;
  exception_by: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

interface RiskListRow extends RiskRow {
  ownerName: string;
  ownerEmail: string;
  ownerTitle: string;
}

interface RiskItemRow {
  riskId: string;
  id: string;
  code: string;
  title: string;
}

export function listRisks(db: AppDatabase, projectId: string): Risk[] {
  const rows = db
    .prepare(`
      SELECT r.*, u.name AS ownerName, u.email AS ownerEmail, u.title AS ownerTitle
      FROM risks r
      JOIN users u ON u.id = r.owner_id
      WHERE r.project_id = ?
      ORDER BY CASE r.status WHEN 'closed' THEN 1 ELSE 0 END,
               CASE r.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
               r.due_date ASC
    `)
    .all(projectId) as RiskListRow[];
  if (!rows.length) return [];

  const itemRows = db
    .prepare(`
      SELECT ri.risk_id AS riskId, i.id, i.code, i.title
      FROM risk_items ri
      JOIN items i ON i.id = ri.item_id
      WHERE i.project_id = ?
      ORDER BY i.code
    `)
    .all(projectId) as RiskItemRow[];
  const itemsByRisk = new Map<string, RiskItemRow[]>();
  for (const row of itemRows) {
    const list = itemsByRisk.get(row.riskId) ?? [];
    list.push(row);
    itemsByRisk.set(row.riskId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    impact: row.impact,
    mitigation: row.mitigation,
    severity: row.severity,
    status: row.status,
    owner: {
      id: row.owner_id,
      name: row.ownerName,
      email: row.ownerEmail,
      title: row.ownerTitle,
    },
    dueDate: row.due_date,
    progress: row.progress,
    items: (itemsByRisk.get(row.id) ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      title: item.title,
    })),
    exceptionNote: row.exception_note,
    exceptionBy: row.exception_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getRiskRow(db: AppDatabase, id: string): RiskRow | undefined {
  return db.prepare('SELECT * FROM risks WHERE id = ?').get(id) as RiskRow | undefined;
}

export function getRisk(db: AppDatabase, id: string): Risk | undefined {
  const row = getRiskRow(db, id);
  if (!row) return undefined;
  return listRisks(db, row.project_id).find((risk) => risk.id === id);
}

export function listRisksForItem(db: AppDatabase, projectId: string, itemId: string): Risk[] {
  return listRisks(db, projectId).filter((risk) =>
    risk.items.some((item) => item.id === itemId),
  );
}
