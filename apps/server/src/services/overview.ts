import type {
  GapSet,
  ItemRef,
  ItemSummary,
  ModuleStat,
  Overview,
  Todo,
  TodoKind,
} from '@throughline/shared';
import { SIGNOFF_ROLES } from '@throughline/shared';

import type { AppDatabase } from '../db';
import type { AuthUserRecord, ProjectAccess } from '../domain/access';
import { listAssets } from '../data/assets';
import { listConditions } from '../data/conditions';
import { listProjectEvents } from '../data/events';
import { listAllItemSummaries } from '../data/items';
import { listOpenQuestionsForUser } from '../data/notes';
import { getProjectStats } from '../data/projects';
import { listRisks } from '../data/risks';
import { listSteps } from '../data/steps';

const TODO_PRIORITY: Record<TodoKind, number> = {
  signoff: 0,
  conclusion: 1,
  acceptance: 2,
  submit_evidence: 2,
  supplement: 2,
  core_review: 3,
  business_review: 3,
  risk_decision: 4,
  condition: 5,
  risk_owner: 5,
  answer_question: 6,
  asset_rotation: 7,
  asset_verification: 7,
};

function itemRef(item: ItemSummary): ItemRef {
  return { id: item.id, code: item.code, title: item.title };
}

function needsCoreReview(item: ItemSummary): boolean {
  return (
    item.coreRequired &&
    item.supplyStatus === 'submitted' &&
    !['passed', 'conditional', 'not_applicable'].includes(item.acceptanceStatus) &&
    item.latestCore?.decision !== 'passed'
  );
}

function needsBusinessReview(item: ItemSummary): boolean {
  return (
    item.businessRequired &&
    item.supplyStatus === 'submitted' &&
    !['passed', 'conditional', 'not_applicable'].includes(item.acceptanceStatus) &&
    item.latestBusiness?.decision !== 'confirmed'
  );
}

export function computeModules(
  items: ItemSummary[],
  risks: ReturnType<typeof listRisks>,
): ModuleStat[] {
  const activeHighRiskCodes = new Set(
    risks
      .filter(
        (risk) =>
          risk.severity === 'high' &&
          !['closed', 'mitigated'].includes(risk.status),
      )
      .map((risk) => risk.code),
  );
  const groups = new Map<
    string,
    { order: number; total: number; submitted: number; settled: number; highRiskIds: Set<string> }
  >();
  for (const item of items) {
    const group = groups.get(item.module) ?? {
      order: item.seq,
      total: 0,
      submitted: 0,
      settled: 0,
      highRiskIds: new Set<string>(),
    };
    group.order = Math.min(group.order, item.seq);
    group.total += 1;
    if (item.supplyStatus === 'submitted') group.submitted += 1;
    if (['passed', 'conditional'].includes(item.acceptanceStatus)) group.settled += 1;
    if (item.riskCodes.some((code) => activeHighRiskCodes.has(code))) {
      group.highRiskIds.add(item.id);
    }
    groups.set(item.module, group);
  }
  return [...groups.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([module, group]) => ({
      module,
      total: group.total,
      submitted: group.submitted,
      settled: group.settled,
      highRisks: group.highRiskIds.size,
    }));
}

function buildGaps(items: ItemSummary[]): GapSet {
  const delivery = items.filter((item) => item.supplyStatus !== 'submitted');
  const review = items.filter((item) => needsCoreReview(item) || needsBusinessReview(item));
  const acceptance = items.filter(
    (item) => !['passed', 'conditional', 'not_applicable'].includes(item.acceptanceStatus),
  );
  return {
    delivery: { count: delivery.length, items: delivery.slice(0, 3).map(itemRef) },
    review: { count: review.length, items: review.slice(0, 3).map(itemRef) },
    acceptance: { count: acceptance.length, items: acceptance.slice(0, 3).map(itemRef) },
  };
}

function buildTodos(
  db: AppDatabase,
  access: ProjectAccess,
  user: AuthUserRecord,
  items: ItemSummary[],
): Todo[] {
  if (access.project.status === 'paused' || access.project.stage === 'closed') return [];
  const todos: Todo[] = [];
  const role = access.role;
  const canDecideRisks = access.isAdmin || role === 'receiver';
  const risks = listRisks(db, access.project.id);
  const conditions = listConditions(db, access.project.id);
  const questions = listOpenQuestionsForUser(db, access.project.id, user.id);
  const activeConclusion = db
    .prepare(
      'SELECT id FROM conclusions WHERE project_id = ? AND voided_at IS NULL ORDER BY decided_at DESC LIMIT 1',
    )
    .get(access.project.id) as { id: string } | undefined;
  const activeSignoff = db
    .prepare(
      'SELECT id FROM signoffs WHERE project_id = ? AND user_id = ? AND voided_at IS NULL LIMIT 1',
    )
    .get(access.project.id, user.id) as { id: string } | undefined;
  const canSign =
    access.project.stage === 'signoff' &&
    !!activeConclusion &&
    role !== null &&
    (SIGNOFF_ROLES as readonly string[]).includes(role) &&
    !activeSignoff;

  if (canSign) {
    todos.push({
      id: 'signoff',
      kind: 'signoff',
      title: 'Delivery report awaiting sign-off',
      meta: `${access.project.code} - Due ${access.project.deadline}`,
      dueDate: access.project.deadline,
    });
  }

  if (role === 'receiver' && !activeConclusion) {
    todos.push({
      id: 'conclusion',
      kind: 'conclusion',
      title: 'Confirm delivery conclusion',
      meta: 'Record a conclusion per scope after acceptance, then start sign-off',
    });
  }

  if (role === 'delivery') {
    for (const item of items) {
      if (item.supplyStatus === 'pending_submission' || item.supplyStatus === 'needs_information') {
        todos.push({
          id: `delivery:${item.id}`,
          kind: item.supplyStatus === 'pending_submission' ? 'submit_evidence' : 'supplement',
          title: item.title,
          meta: `${item.code} - ${
            item.supplyStatus === 'pending_submission'
              ? 'Evidence pending submission'
              : 'Additional evidence required'
          }`,
          dueDate: item.dueDate,
          itemId: item.id,
          itemCode: item.code,
        });
      }
    }
  }

  if (role === 'core_reviewer') {
    for (const item of items.filter(needsCoreReview)) {
      todos.push({
        id: `core:${item.id}`,
        kind: 'core_review',
        title: item.title,
        meta: `${item.code} - Awaiting technical review`,
        dueDate: item.dueDate,
        itemId: item.id,
        itemCode: item.code,
      });
    }
  }

  if (role === 'business_reviewer') {
    for (const item of items.filter(needsBusinessReview)) {
      todos.push({
        id: `business:${item.id}`,
        kind: 'business_review',
        title: item.title,
        meta: `${item.code} - Awaiting business review`,
        dueDate: item.dueDate,
        itemId: item.id,
        itemCode: item.code,
      });
    }
  }

  if (role === 'receiver') {
    for (const item of items) {
      const settled = ['passed', 'conditional', 'not_applicable'].includes(item.acceptanceStatus);
      if (item.gate.ready && !settled) {
        todos.push({
          id: `acceptance:${item.id}`,
          kind: 'acceptance',
          title: item.title,
          meta: `${item.code} - Gate met, awaiting acceptance`,
          dueDate: item.dueDate,
          itemId: item.id,
          itemCode: item.code,
        });
      }
    }
  }

  for (const risk of risks) {
    if (risk.owner.id === user.id && ['open', 'in_progress'].includes(risk.status)) {
      todos.push({
        id: `risk-owner:${risk.id}`,
        kind: 'risk_owner',
        title: risk.title,
        meta: `${risk.code} - ${risk.status === 'open' ? 'Open' : 'In progress'}`,
        dueDate: risk.dueDate,
        riskId: risk.id,
        riskCode: risk.code,
      });
    }
    if (canDecideRisks && ['escalated', 'mitigated'].includes(risk.status)) {
      todos.push({
        id: `risk-decision:${risk.id}`,
        kind: 'risk_decision',
        title: risk.title,
        meta: `${risk.code} - ${
          risk.status === 'escalated' ? 'Decision required' : 'Awaiting closure confirmation'
        }`,
        dueDate: risk.dueDate,
        riskId: risk.id,
        riskCode: risk.code,
      });
    }
  }

  for (const condition of conditions) {
    if (condition.status !== 'open' || condition.owner.id !== user.id) continue;
    todos.push({
      id: `condition:${condition.id}`,
      kind: 'condition',
      title: condition.description,
      meta: `${condition.item.code} - Condition ${condition.code}`,
      dueDate: condition.dueDate,
      itemId: condition.item.id,
      itemCode: condition.item.code,
    });
  }

  for (const question of questions) {
    todos.push({
      id: `question:${question.note.id}`,
      kind: 'answer_question',
      title: question.note.body,
      meta: `${question.item.code} - Question from ${question.note.author.name}`,
      itemId: question.item.id,
      itemCode: question.item.code,
    });
  }

  if (access.permissions.rotateAssets) {
    for (const asset of listAssets(db, access.project.id)) {
      if (asset.status !== 'pending_rotation') continue;
      todos.push({
        id: `asset-rotation:${asset.id}`,
        kind: 'asset_rotation',
        title: asset.name,
        meta: `${asset.code} - Rotation and ownership transfer required`,
        assetId: asset.id,
        assetCode: asset.code,
      });
    }
  }
  if (role === 'receiver') {
    for (const asset of listAssets(db, access.project.id)) {
      if (asset.status !== 'pending_verification') continue;
      todos.push({
        id: `asset-verification:${asset.id}`,
        kind: 'asset_verification',
        title: asset.name,
        meta: `${asset.code} - Access verification pending`,
        assetId: asset.id,
        assetCode: asset.code,
      });
    }
  }

  return todos.sort((left, right) => {
    const priority = TODO_PRIORITY[left.kind] - TODO_PRIORITY[right.kind];
    if (priority !== 0) return priority;
    if (left.dueDate && right.dueDate) return left.dueDate.localeCompare(right.dueDate);
    if (left.dueDate) return -1;
    if (right.dueDate) return 1;
    return left.title.localeCompare(right.title, 'en');
  });
}

export function buildOverview(
  db: AppDatabase,
  access: ProjectAccess,
  user: AuthUserRecord,
): Overview {
  const items = listAllItemSummaries(db, access.project.id);
  const risks = listRisks(db, access.project.id);
  const steps = listSteps(db, access.project.id);
  return {
    stats: getProjectStats(db, access.project.id),
    modules: computeModules(items, risks),
    gaps: buildGaps(items),
    todos: buildTodos(db, access, user, items),
    highRisks: risks.filter(
      (risk) =>
        risk.severity === 'high' && !['closed', 'mitigated'].includes(risk.status),
    ),
    recentEvents: listProjectEvents(db, access.project.id, 8),
    steps,
  };
}
