import { createHash } from 'node:crypto';

import type { MappingRef, Step, StepStatus } from '@throughline/shared';

import type { AppDatabase } from '../db';

export interface StepRow {
  id: string;
  project_id: string;
  position: number;
  name: string;
  status: StepStatus;
  note: string;
  environment: string;
  fingerprint: string;
  recorded_by: string | null;
  recorded_at: string | null;
  created_at: string;
}

interface StepListRow extends StepRow {
  recorderName: string | null;
  recorderEmail: string | null;
  recorderTitle: string | null;
}

interface StepItemRow {
  stepId: string;
  id: string;
  code: string;
  title: string;
  revision: number;
}

interface StepChainRow extends MappingRef {
  stepId: string;
  updatedAt: string;
}

function hashScope(parts: string[]): string {
  if (!parts.length) return '';
  // Sorted here because the write path and the read path load scope rows in different
  // orders; an unsorted join makes a fresh pass look like it drifted on arrival.
  const signature = [...parts].sort().join('|');
  return createHash('sha256').update(signature).digest('hex').slice(0, 32);
}

/**
 * Signature of what a step currently covers. A passed step only stays trustworthy
 * while its linked item revisions and mapping rows are unchanged.
 */
export function stepScopeSignature(db: AppDatabase, stepId: string): string {
  const items = db
    .prepare(`
      SELECT i.id || ':' || i.revision AS part
      FROM e2e_step_items si
      JOIN items i ON i.id = si.item_id
      WHERE si.step_id = ?
      ORDER BY i.id
    `)
    .all(stepId) as Array<{ part: string }>;
  const chains = db
    .prepare(`
      SELECT c.id || ':' || c.updated_at AS part
      FROM e2e_step_chains sc
      JOIN chains c ON c.id = sc.chain_id
      WHERE sc.step_id = ?
      ORDER BY c.id
    `)
    .all(stepId) as Array<{ part: string }>;
  return hashScope([...items, ...chains].map((row) => row.part));
}

export function listSteps(db: AppDatabase, projectId: string): Step[] {
  const rows = db
    .prepare(`
      SELECT s.*, u.name AS recorderName, u.email AS recorderEmail, u.title AS recorderTitle
      FROM e2e_steps s
      LEFT JOIN users u ON u.id = s.recorded_by
      WHERE s.project_id = ?
      ORDER BY s.position ASC
    `)
    .all(projectId) as StepListRow[];
  if (!rows.length) return [];
  const itemRows = db
    .prepare(`
      SELECT si.step_id AS stepId, i.id, i.code, i.title, i.revision
      FROM e2e_step_items si
      JOIN items i ON i.id = si.item_id
      WHERE i.project_id = ?
      ORDER BY i.code
    `)
    .all(projectId) as StepItemRow[];
  const chainRows = db
    .prepare(`
      SELECT sc.step_id AS stepId, c.id, c.page, c.title, c.updated_at AS updatedAt
      FROM e2e_step_chains sc
      JOIN chains c ON c.id = sc.chain_id
      WHERE c.project_id = ?
      ORDER BY c.page
    `)
    .all(projectId) as StepChainRow[];
  const itemsByStep = new Map<string, StepItemRow[]>();
  for (const row of itemRows) {
    const list = itemsByStep.get(row.stepId) ?? [];
    list.push(row);
    itemsByStep.set(row.stepId, list);
  }
  const chainsByStep = new Map<string, StepChainRow[]>();
  for (const row of chainRows) {
    const list = chainsByStep.get(row.stepId) ?? [];
    list.push(row);
    chainsByStep.set(row.stepId, list);
  }
  const signatures = new Map<string, string>();
  for (const stepId of new Set([...itemsByStep.keys(), ...chainsByStep.keys()])) {
    const parts = [
      ...(itemsByStep.get(stepId) ?? []).map((item) => `${item.id}:${item.revision}`),
      ...(chainsByStep.get(stepId) ?? []).map((chain) => `${chain.id}:${chain.updatedAt}`),
    ];
    signatures.set(stepId, hashScope(parts));
  }
  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    name: row.name,
    status: row.status,
    note: row.note,
    environment: row.environment,
    recordedBy:
      row.recorded_by && row.recorderName && row.recorderEmail && row.recorderTitle
        ? {
            id: row.recorded_by,
            name: row.recorderName,
            email: row.recorderEmail,
            title: row.recorderTitle,
          }
        : null,
    recordedAt: row.recorded_at,
    items: (itemsByStep.get(row.id) ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      title: item.title,
    })),
    mappings: (chainsByStep.get(row.id) ?? []).map((chain) => ({
      id: chain.id,
      page: chain.page,
      title: chain.title,
    })),
    stale:
      row.status === 'passed' &&
      row.fingerprint !== '' &&
      (signatures.get(row.id) ?? '') !== row.fingerprint,
  }));
}

export function getStepRow(db: AppDatabase, id: string): StepRow | undefined {
  return db.prepare('SELECT * FROM e2e_steps WHERE id = ?').get(id) as StepRow | undefined;
}
