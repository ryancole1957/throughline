import { randomUUID } from 'node:crypto';
import type { RiskSeverity } from '@throughline/shared';

import type { AppContext } from '../context';
import { recordEvent } from '../data/events';
import { listProjectMembers } from '../data/projects';
import { unprocessable } from '../lib/errors';

export interface RiskDraft {
  projectId: string;
  actorId: string;
  title: string;
  impact: string;
  mitigation: string;
  severity: RiskSeverity;
  ownerId: string;
  dueDate: string;
  itemIds: string[];
}

function nextRiskCode(db: AppContext['db'], projectId: string): string {
  const row = db
    .prepare(
      "SELECT code FROM risks WHERE project_id = ? AND code LIKE 'R-%' ORDER BY code DESC LIMIT 1",
    )
    .get(projectId) as { code: string } | undefined;
  const current = row ? Number.parseInt(row.code.slice(2), 10) : 0;
  return `R-${String((Number.isFinite(current) ? current : 0) + 1).padStart(2, '0')}`;
}

/** Insert an open risk with its item links and audit event. Call inside a transaction. */
export function createRiskRecord(ctx: AppContext, draft: RiskDraft): { id: string; code: string } {
  const member = listProjectMembers(ctx.db, draft.projectId).find(
    (item) => item.userId === draft.ownerId,
  );
  if (!member || member.role === 'observer') {
    throw unprocessable('The risk owner must be a project member', {
      ownerId: 'Select a project member',
    });
  }
  if (draft.itemIds.length) {
    const placeholders = draft.itemIds.map(() => '?').join(', ');
    const count = ctx.db
      .prepare(
        `SELECT COUNT(*) AS count FROM items WHERE project_id = ? AND id IN (${placeholders})`,
      )
      .get(draft.projectId, ...draft.itemIds) as { count: number };
    if (Number(count.count) !== draft.itemIds.length) {
      throw unprocessable('Linked items not found', { itemIds: 'Contains invalid items' });
    }
  }
  const timestamp = new Date().toISOString();
  const id = randomUUID();
  const code = nextRiskCode(ctx.db, draft.projectId);
  ctx.db
    .prepare(
      `
      INSERT INTO risks (id, project_id, code, title, impact, mitigation, severity, status, owner_id, due_date, progress, exception_note, exception_by, created_by, created_at, updated_at, closed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, '', '', '', ?, ?, ?, NULL)
    `,
    )
    .run(
      id,
      draft.projectId,
      code,
      draft.title,
      draft.impact,
      draft.mitigation,
      draft.severity,
      draft.ownerId,
      draft.dueDate,
      draft.actorId,
      timestamp,
      timestamp,
    );
  const insertLink = ctx.db.prepare('INSERT INTO risk_items (risk_id, item_id) VALUES (?, ?)');
  for (const itemId of draft.itemIds) insertLink.run(id, itemId);
  recordEvent(ctx.db, {
    projectId: draft.projectId,
    actorId: draft.actorId,
    action: 'risk.created',
    detail: `Risk ${code} created: ${draft.title}`,
  });
  return { id, code };
}
