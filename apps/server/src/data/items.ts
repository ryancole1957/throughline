import type {
  Acceptance,
  AcceptanceDecision,
  AcceptanceStatus,
  Evidence,
  EvidenceType,
  ItemDetail,
  ItemSummary,
  ItemsPage,
  ItemsQueryInput,
  Priority,
  ProjectRole,
  Review,
  ReviewBrief,
  ReviewDecision,
  ReviewStage,
  SupplyStatus,
} from '@throughline/shared';

import type { AppDatabase } from '../db';
import type { ProjectAccess } from '../domain/access';
import {
  evaluateGate,
  type ReviewSignal,
} from '../domain/gate';
import { listAssetsForItem } from './assets';
import { listConditionsForItem } from './conditions';
import { listItemEvents } from './events';
import { listNotesForItem } from './notes';
import { listRisksForItem } from './risks';
import { getUserRef } from './users';

export interface ItemRow {
  id: string;
  project_id: string;
  seq: number;
  code: string;
  module: string;
  title: string;
  scope: string;
  priority: Priority;
  due_date: string;
  supply_status: SupplyStatus;
  acceptance_status: AcceptanceStatus;
  rule: string;
  revision: number;
  core_required: number;
  business_required: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ItemListRow extends ItemRow {
  evidenceCount: number;
  riskCodes: string | null;
}

interface ReviewRow {
  id: string;
  item_id: string;
  author_id: string;
  stage: ReviewStage;
  decision: ReviewDecision;
  remarks: string;
  environment: string;
  version: string;
  reference: string;
  revision: number;
  created_at: string;
  orderKey: number;
  authorName: string;
  authorEmail: string;
  authorTitle: string;
}

interface AcceptanceRow {
  id: string;
  item_id: string;
  reviewer_id: string;
  decision: AcceptanceDecision;
  remarks: string;
  environment: string;
  version: string;
  reference: string;
  revision: number;
  created_at: string;
  orderKey: number;
  reviewerName: string;
  reviewerEmail: string;
  reviewerTitle: string;
}

interface EvidenceRow {
  id: string;
  item_id: string;
  author_id: string;
  type: EvidenceType;
  environment: string;
  version: string;
  reference: string;
  description: string;
  created_at: string;
  authorName: string;
  authorEmail: string;
  authorTitle: string;
}

const itemColumns = `
  i.id, i.project_id, i.seq, i.code, i.module, i.title, i.scope, i.priority, i.due_date,
  i.supply_status, i.acceptance_status, i.rule, i.revision, i.core_required, i.business_required,
  i.created_by, i.created_at, i.updated_at
`;

const latestCoreDecision = `COALESCE((SELECT r.decision FROM reviews r WHERE r.item_id = i.id AND r.stage = 'core' AND r.revision = i.revision ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1), '')`;
const latestBusinessDecision = `COALESCE((SELECT r.decision FROM reviews r WHERE r.item_id = i.id AND r.stage = 'business' AND r.revision = i.revision ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1), '')`;
const gateReadySql = `
  i.supply_status = 'submitted'
  AND EXISTS (SELECT 1 FROM evidence e WHERE e.item_id = i.id)
  AND (i.core_required = 0 OR ${latestCoreDecision} = 'passed')
  AND (i.business_required = 0 OR ${latestBusinessDecision} = 'confirmed')
`;
const openQuestionSql = `EXISTS (
  SELECT 1 FROM notes n WHERE n.item_id = i.id AND n.kind = 'question'
    AND n.answered_at IS NULL AND n.assignee_id = @userId
)`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function getItemRow(db: AppDatabase, itemId: string): ItemRow | undefined {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as ItemRow | undefined;
}

export function getProjectIdForItem(db: AppDatabase, itemId: string): string | undefined {
  const row = db.prepare('SELECT project_id AS projectId FROM items WHERE id = ?').get(itemId) as
    | { projectId: string }
    | undefined;
  return row?.projectId;
}

export function countEvidence(db: AppDatabase, itemId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM evidence WHERE item_id = ?')
    .get(itemId) as { count: number };
  return Number(row.count);
}

export function loadItemReviews(db: AppDatabase, itemIds: string[]): Map<string, ReviewRow[]> {
  const result = new Map<string, ReviewRow[]>();
  if (!itemIds.length) return result;
  const placeholders = itemIds.map(() => '?').join(', ');
  const rows = db
    .prepare(`
      SELECT r.*, r.rowid AS orderKey, u.name AS authorName, u.email AS authorEmail, u.title AS authorTitle
      FROM reviews r
      JOIN users u ON u.id = r.author_id
      WHERE r.item_id IN (${placeholders})
      ORDER BY r.created_at ASC, r.rowid ASC
    `)
    .all(...itemIds) as ReviewRow[];
  for (const row of rows) {
    const list = result.get(row.item_id) ?? [];
    list.push(row);
    result.set(row.item_id, list);
  }
  return result;
}

export function loadItemRisks(db: AppDatabase, projectId: string): Map<string, string[]> {
  const rows = db
    .prepare(`
      SELECT ri.item_id AS itemId, r.code
      FROM risk_items ri
      JOIN risks r ON r.id = ri.risk_id
      WHERE r.project_id = ?
      ORDER BY r.code
    `)
    .all(projectId) as Array<{ itemId: string; code: string }>;
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.itemId) ?? [];
    list.push(row.code);
    grouped.set(row.itemId, list);
  }
  return grouped;
}

export function mapReviewToSignal(row: ReviewRow): ReviewSignal {
  return {
    stage: row.stage,
    decision: row.decision,
    revision: row.revision,
    createdAt: row.created_at,
  };
}

export function toReview(row: ReviewRow, itemRevision: number, effectiveId: string | null): Review {
  return {
    id: row.id,
    stage: row.stage,
    decision: row.decision,
    remarks: row.remarks,
    environment: row.environment,
    version: row.version,
    reference: row.reference,
    revision: row.revision,
    author: {
      id: row.author_id,
      name: row.authorName,
      email: row.authorEmail,
      title: row.authorTitle,
    },
    createdAt: row.created_at,
    effective: row.id === effectiveId && row.revision === itemRevision,
  };
}

function latestReviewRow(
  reviews: ReviewRow[],
  stage: ReviewStage,
  revision: number,
): ReviewRow | null {
  let latest: ReviewRow | null = null;
  for (const review of reviews) {
    if (review.stage !== stage || review.revision !== revision) continue;
    if (!latest || review.created_at >= latest.created_at) latest = review;
  }
  return latest;
}

function toBrief(row: ReviewRow | null): ReviewBrief | null {
  if (!row) return null;
  return {
    id: row.id,
    stage: row.stage,
    decision: row.decision,
    author: {
      id: row.author_id,
      name: row.authorName,
      email: row.authorEmail,
      title: row.authorTitle,
    },
    createdAt: row.created_at,
    revision: row.revision,
    effective: true,
  };
}

function mapItemSummary(
  row: ItemListRow,
  reviews: ReviewRow[],
  risks: string[],
): ItemSummary {
  const signals = reviews.map(mapReviewToSignal);
  const coreRequired = row.core_required === 1;
  const businessRequired = row.business_required === 1;
  const gate = evaluateGate({
    revision: row.revision,
    supplyStatus: row.supply_status,
    acceptanceStatus: row.acceptance_status,
    evidenceCount: Number(row.evidenceCount),
    coreRequired,
    businessRequired,
    reviews: signals,
  });
  return {
    id: row.id,
    seq: row.seq,
    code: row.code,
    module: row.module,
    title: row.title,
    scope: row.scope,
    priority: row.priority,
    dueDate: row.due_date,
    supplyStatus: row.supply_status,
    acceptanceStatus: row.acceptance_status,
    revision: row.revision,
    coreRequired,
    businessRequired,
    evidenceCount: Number(row.evidenceCount),
    riskCodes: risks,
    gate,
    latestCore: toBrief(latestReviewRow(reviews, 'core', row.revision)),
    latestBusiness: toBrief(latestReviewRow(reviews, 'business', row.revision)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mineCondition(role: ProjectRole | null): string {
  const common = { openQuestion: openQuestionSql };
  switch (role) {
    case 'delivery':
      return `(i.supply_status IN ('pending_submission', 'needs_information') OR ${common.openQuestion})`;
    case 'core_reviewer':
      return `((i.core_required = 1 AND i.supply_status = 'submitted'
        AND i.acceptance_status NOT IN ('passed', 'conditional', 'not_applicable')
        AND ${latestCoreDecision} <> 'passed') OR ${common.openQuestion})`;
    case 'business_reviewer':
      return `((i.business_required = 1 AND i.supply_status = 'submitted'
        AND i.acceptance_status NOT IN ('passed', 'conditional', 'not_applicable')
        AND ${latestBusinessDecision} <> 'confirmed') OR ${common.openQuestion})`;
    case 'receiver':
      return `((${gateReadySql} AND i.acceptance_status NOT IN ('passed', 'conditional', 'not_applicable')) OR ${common.openQuestion})`;
    default:
      return common.openQuestion;
  }
}

function listModules(db: AppDatabase, projectId: string): string[] {
  const rows = db
    .prepare(
      'SELECT module FROM items WHERE project_id = ? GROUP BY module ORDER BY MIN(seq) ASC',
    )
    .all(projectId) as Array<{ module: string }>;
  return rows.map((row) => row.module);
}

export function listItems(
  db: AppDatabase,
  projectId: string,
  query: ItemsQueryInput,
  user: { id: string },
  role: ProjectRole | null,
): ItemsPage {
  const conditions: string[] = ['i.project_id = @projectId'];
  const params: Record<string, unknown> = {
    projectId,
    userId: user.id,
  };

  if (query.q) {
    const term = `%${escapeLike(query.q)}%`;
    conditions.push(`(
      i.title LIKE @q ESCAPE '\\' OR i.code LIKE @q ESCAPE '\\' OR i.scope LIKE @q ESCAPE '\\'
      OR i.module LIKE @q ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM reviews r WHERE r.item_id = i.id AND r.remarks LIKE @q ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM evidence e WHERE e.item_id = i.id AND e.description LIKE @q ESCAPE '\\')
    )`);
    params.q = term;
  }
  if (query.module) {
    conditions.push('i.module = @module');
    params.module = query.module;
  }
  if (query.supply) {
    conditions.push('i.supply_status = @supply');
    params.supply = query.supply;
  }
  if (query.acceptance) {
    conditions.push('i.acceptance_status = @acceptance');
    params.acceptance = query.acceptance;
  }
  if (query.priority) {
    conditions.push('i.priority = @priority');
    params.priority = query.priority;
  }
  if (query.risky === 'true') {
    conditions.push(
      'EXISTS (SELECT 1 FROM risk_items ri WHERE ri.item_id = i.id)',
    );
  }
  if (query.mine === 'true') {
    conditions.push(mineCondition(role));
  }

  const where = conditions.join(' AND ');
  const sort =
    query.sort === 'due'
      ? 'i.due_date ASC, CASE i.priority WHEN \'high\' THEN 0 WHEN \'medium\' THEN 1 ELSE 2 END ASC, i.seq ASC'
      : query.sort === 'priority'
        ? 'CASE i.priority WHEN \'high\' THEN 0 WHEN \'medium\' THEN 1 ELSE 2 END ASC, i.due_date ASC, i.seq ASC'
        : 'i.module ASC, i.seq ASC';

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM items i WHERE ${where}`)
    .get(params) as { count: number };
  const total = Number(totalRow.count);
  const offset = (query.page - 1) * query.pageSize;

  const pageRows = db
    .prepare(`
      SELECT ${itemColumns},
             (SELECT COUNT(*) FROM evidence e WHERE e.item_id = i.id) AS evidenceCount,
             (SELECT GROUP_CONCAT(r.code, ',') FROM risk_items ri JOIN risks r ON r.id = ri.risk_id WHERE ri.item_id = i.id) AS riskCodes
      FROM items i
      WHERE ${where}
      ORDER BY ${sort}
      LIMIT @limit OFFSET @offset
    `)
    .all({ ...params, limit: query.pageSize, offset }) as ItemListRow[];

  const reviewsByItem = loadItemReviews(
    db,
    pageRows.map((row) => row.id),
  );
  const risksByItem = loadItemRisks(db, projectId);

  return {
    items: pageRows.map((row) =>
      mapItemSummary(
        row,
        reviewsByItem.get(row.id) ?? [],
        risksByItem.get(row.id) ?? [],
      ),
    ),
    total,
    page: query.page,
    pageSize: query.pageSize,
    modules: listModules(db, projectId),
  };
}

export function listAllItemSummaries(
  db: AppDatabase,
  projectId: string,
): ItemSummary[] {
  const page = listItems(
    db,
    projectId,
    {
      q: '',
      mine: 'false',
      risky: 'false',
      sort: 'module',
      page: 1,
      pageSize: 200,
    },
    { id: '' },
    null,
  );
  return page.items;
}

export function loadEvidence(db: AppDatabase, itemId: string): Evidence[] {
  const rows = db
    .prepare(`
      SELECT e.*, u.name AS authorName, u.email AS authorEmail, u.title AS authorTitle
      FROM evidence e JOIN users u ON u.id = e.author_id
      WHERE e.item_id = ? ORDER BY e.created_at ASC, e.rowid ASC
    `)
    .all(itemId) as EvidenceRow[];
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    environment: row.environment,
    version: row.version,
    reference: row.reference,
    description: row.description,
    author: {
      id: row.author_id,
      name: row.authorName,
      email: row.authorEmail,
      title: row.authorTitle,
    },
    createdAt: row.created_at,
  }));
}

export function loadAcceptances(
  db: AppDatabase,
  itemId: string,
): AcceptanceRow[] {
  return db
    .prepare(`
      SELECT a.*, a.rowid AS orderKey, u.name AS reviewerName, u.email AS reviewerEmail, u.title AS reviewerTitle
      FROM acceptances a JOIN users u ON u.id = a.reviewer_id
      WHERE a.item_id = ? ORDER BY a.created_at ASC, a.rowid ASC
    `)
    .all(itemId) as AcceptanceRow[];
}

export function toAcceptance(
  row: AcceptanceRow,
  itemRevision: number,
  effectiveId: string | null,
): Acceptance {
  return {
    id: row.id,
    decision: row.decision,
    remarks: row.remarks,
    environment: row.environment,
    version: row.version,
    reference: row.reference,
    revision: row.revision,
    reviewer: {
      id: row.reviewer_id,
      name: row.reviewerName,
      email: row.reviewerEmail,
      title: row.reviewerTitle,
    },
    createdAt: row.created_at,
    effective: row.id === effectiveId && row.revision === itemRevision,
  };
}

export function getItemDetail(
  db: AppDatabase,
  itemId: string,
  access: ProjectAccess,
): ItemDetail {
  const item = getItemRow(db, itemId);
  if (!item) throw new Error('item not found');
  const evidence = loadEvidence(db, itemId);
  const reviews = loadItemReviews(db, [itemId]).get(itemId) ?? [];
  const acceptances = loadAcceptances(db, itemId);
  const effectiveCore = latestReviewRow(reviews, 'core', item.revision);
  const effectiveBusiness = latestReviewRow(reviews, 'business', item.revision);
  const latestAcceptance = acceptances
    .filter((row) => row.revision === item.revision)
    .at(-1);
  const signals = reviews.map(mapReviewToSignal);
  const gate = evaluateGate({
    revision: item.revision,
    supplyStatus: item.supply_status,
    acceptanceStatus: item.acceptance_status,
    evidenceCount: evidence.length,
    coreRequired: item.core_required === 1,
    businessRequired: item.business_required === 1,
    reviews: signals,
  });
  const writable = access.project.status === 'active' && access.project.stage !== 'closed';
  const conditions = listConditionsForItem(db, access.project.id, itemId);
  const risks = listRisksForItem(db, access.project.id, itemId);
  const assets = listAssetsForItem(db, access.project.id, itemId);
  const riskCodes = risks.map((risk) => risk.code);
  const summary = mapItemSummary(
    {
      ...item,
      evidenceCount: evidence.length,
      riskCodes: riskCodes.join(',') || null,
    },
    reviews,
    riskCodes,
  );
  const latestCore = toBrief(effectiveCore);
  const latestBusiness = toBrief(effectiveBusiness);
  const createdBy = getUserRef(db, item.created_by);
  if (!createdBy) throw new Error('item creator missing');
  return {
    item: {
      ...summary,
      latestCore,
      latestBusiness,
      gate,
      rule: item.rule,
      createdBy,
    },
    evidence,
    reviews: reviews.map((review) =>
      toReview(
        review,
        item.revision,
        review.stage === 'core'
          ? effectiveCore?.id ?? null
          : effectiveBusiness?.id ?? null,
      ),
    ),
    acceptances: acceptances.map((acceptance) =>
      toAcceptance(acceptance, item.revision, latestAcceptance?.id ?? null),
    ),
    conditions,
    notes: listNotesForItem(db, itemId),
    risks,
    assets,
    events: listItemEvents(db, itemId),
    gate,
    permissions: {
      submitEvidence: access.permissions.submitEvidence && writable,
      reviewCore: access.permissions.reviewCore && writable,
      reviewBusiness: access.permissions.reviewBusiness && writable,
      accept: access.permissions.acceptItems && writable,
      editRule: access.permissions.manageProject && writable,
      manageItem: access.permissions.createItem && writable,
    },
  };
}

