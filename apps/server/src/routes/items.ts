import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { EvidenceType } from '@throughline/shared';
import {
  ACCEPTANCE_DECISIONS,
  addEvidenceSchema,
  answerNoteSchema,
  createItemSchema,
  createNoteSchema,
  itemsQuerySchema,
  reviewSchema,
  updateItemSchema,
  updateRuleSchema,
  acceptanceSchema,
} from '@throughline/shared';

import type { AppContext } from '../context';
import { listConditions, nextConditionCode } from '../data/conditions';
import { recordEvent } from '../data/events';
import {
  countEvidence,
  getItemDetail,
  loadItemReviews,
  listItems,
  mapReviewToSignal,
} from '../data/items';
import { listProjectMembers } from '../data/projects';
import {
  assertMember,
  assertPermission,
  assertWritable,
  currentUser,
  itemContext,
  noteContext,
  projectAccess,
} from '../http/access';
import { requireAuth } from '../http/middleware';
import {
  conflict,
  forbidden,
  notFound,
  unprocessable,
} from '../lib/errors';
import { parseWith, parseUuid } from '../lib/validate';
import {
  acceptanceStatusFor,
  allowedDecisionsForStage,
  evaluateGate,
  reviewEffect,
  supplyStatusAfterAcceptance,
} from '../domain/gate';

const EVIDENCE_LABELS: Record<EvidenceType, string> = {
  document: 'Documentation',
  interface: 'Interface contract',
  test_record: 'Test record',
  demo_recording: 'Demo recording',
  configuration: 'Configuration sample',
  meeting_minutes: 'Meeting notes',
  other: 'Other',
};

const REVIEW_STAGE_LABELS = { core: 'Technical review', business: 'Business review' } as const;
const REVIEW_DECISION_LABELS: Record<string, string> = {
  passed: 'passed',
  confirmed: 'confirmed',
  returned: 'returned for updates',
  failed: 'failed',
};
const ACCEPTANCE_LABELS: Record<string, string> = {
  passed: 'Acceptance passed',
  conditional: 'Conditional acceptance',
  rejected: 'Acceptance rejected',
  not_applicable: 'Marked not applicable',
};

export function itemsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  function detail(itemId: string, access: ReturnType<typeof projectAccess>) {
    return getItemDetail(ctx.db, itemId, access);
  }

  router.get('/projects/:projectId/items', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    const query = parseWith(itemsQuerySchema, req.query);
    res.json(listItems(ctx.db, projectId, query, user, access.role));
  });

  router.post('/projects/:projectId/items', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    assertPermission(access, 'createItem', 'Only the acceptance owner or a system administrator can add items');
    assertWritable(access);
    const input = parseWith(createItemSchema, req.body);
    const timestamp = new Date().toISOString();
    const itemId = randomUUID();
    const run = ctx.db.transaction(() => {
      const seqRow = ctx.db
        .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM items WHERE project_id = ?')
        .get(projectId) as { seq: number };
      const seq = Number(seqRow.seq);
      const code = `TL-${String(seq).padStart(3, '0')}`;
      ctx.db
        .prepare(`
          INSERT INTO items (
            id, project_id, seq, code, module, title, scope, priority, due_date,
            supply_status, acceptance_status, rule, revision, core_required, business_required,
            created_by, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_submission', 'pending_review', ?, 1, ?, ?, ?, ?, ?
          )
        `)
        .run(
          itemId,
          projectId,
          seq,
          code,
          input.module,
          input.title,
          input.scope,
          input.priority,
          input.dueDate,
          input.rule,
          input.coreRequired ? 1 : 0,
          input.businessRequired ? 1 : 0,
          user.id,
          timestamp,
          timestamp,
        );
      recordEvent(ctx.db, {
        projectId,
        actorId: user.id,
        itemId,
        action: 'item.created',
        detail: `Item "${input.title}" created (${code})`,
      });
    });
    run();
    res.status(201).json(detail(itemId, access));
  });

  router.get('/items/:itemId', (req, res) => {
    const user = currentUser(req);
    const itemId = parseUuid(req.params.itemId, 'itemId');
    const context = itemContext(ctx, itemId, user);
    res.json(getItemDetail(ctx.db, itemId, context.access));
  });

  router.patch('/items/:itemId', (req, res) => {
    const user = currentUser(req);
    const itemId = parseUuid(req.params.itemId, 'itemId');
    const context = itemContext(ctx, itemId, user);
    assertPermission(context.access, 'createItem', 'Only the acceptance owner or a system administrator can edit items');
    assertWritable(context.access);
    const input = parseWith(updateItemSchema, req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.module !== undefined) {
      fields.push('module = ?');
      values.push(input.module);
    }
    if (input.title !== undefined) {
      fields.push('title = ?');
      values.push(input.title);
    }
    if (input.scope !== undefined) {
      fields.push('scope = ?');
      values.push(input.scope);
    }
    if (input.priority !== undefined) {
      fields.push('priority = ?');
      values.push(input.priority);
    }
    if (input.dueDate !== undefined) {
      fields.push('due_date = ?');
      values.push(input.dueDate);
    }
    if (input.coreRequired !== undefined) {
      fields.push('core_required = ?');
      values.push(input.coreRequired ? 1 : 0);
    }
    if (input.businessRequired !== undefined) {
      fields.push('business_required = ?');
      values.push(input.businessRequired ? 1 : 0);
    }
    if (!fields.length) {
      res.json(detail(itemId, context.access));
      return;
    }
    fields.push('updated_at = ?');
    values.push(new Date().toISOString(), itemId);
    ctx.db.prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    recordEvent(ctx.db, {
      projectId: context.access.project.id,
      actorId: user.id,
      itemId,
      action: 'item.updated',
      detail: `Item ${context.item.code} details updated`,
    });
    res.json(detail(itemId, context.access));
  });

  router.post('/items/:itemId/rule', (req, res) => {
    const user = currentUser(req);
    const itemId = parseUuid(req.params.itemId, 'itemId');
    const context = itemContext(ctx, itemId, user);
    assertPermission(context.access, 'manageProject', 'Only the acceptance owner or a system administrator can change acceptance criteria');
    assertWritable(context.access);
    const input = parseWith(updateRuleSchema, req.body);
    if (input.rule === context.item.rule) {
      res.json(detail(itemId, context.access));
      return;
    }
    const nextRevision = context.item.revision + 1;
    const timestamp = new Date().toISOString();
    ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          UPDATE items SET rule = ?, revision = ?, acceptance_status = 'pending_review', updated_at = ?
          WHERE id = ?
        `)
        .run(input.rule, nextRevision, timestamp, itemId);
      recordEvent(ctx.db, {
        projectId: context.access.project.id,
        actorId: user.id,
        itemId,
        action: 'item.rule.revised',
        detail: `Item ${context.item.code} acceptance criteria revised to v${nextRevision}; earlier reviews are void`,
      });
    })();
    res.json(detail(itemId, context.access));
  });

  router.post('/items/:itemId/evidence', (req, res) => {
    const user = currentUser(req);
    const itemId = parseUuid(req.params.itemId, 'itemId');
    const context = itemContext(ctx, itemId, user);
    assertPermission(context.access, 'submitEvidence', 'Only the Delivery role can submit evidence');
    assertWritable(context.access);
    const input = parseWith(addEvidenceSchema, req.body);
    const timestamp = new Date().toISOString();
    const nextAcceptance =
      context.item.acceptance_status === 'rejected' ? 'pending_review' : context.item.acceptance_status;
    ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          INSERT INTO evidence (id, item_id, author_id, type, environment, version, reference, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          randomUUID(),
          itemId,
          user.id,
          input.type,
          input.environment,
          input.version,
          input.reference,
          input.description,
          timestamp,
        );
      ctx.db
        .prepare(`
          UPDATE items SET supply_status = 'submitted', acceptance_status = ?, updated_at = ? WHERE id = ?
        `)
        .run(nextAcceptance, timestamp, itemId);
      recordEvent(ctx.db, {
        projectId: context.access.project.id,
        actorId: user.id,
        itemId,
        action: 'item.evidence.added',
        detail: `Evidence submitted (${EVIDENCE_LABELS[input.type]}): ${input.description.slice(0, 80)}`,
      });
    })();
    res.status(201).json(detail(itemId, context.access));
  });

  router.post('/items/:itemId/reviews', (req, res) => {
    const user = currentUser(req);
    const itemId = parseUuid(req.params.itemId, 'itemId');
    const context = itemContext(ctx, itemId, user);
    const input = parseWith(reviewSchema, req.body);
    if (input.stage === 'core') {
      assertPermission(context.access, 'reviewCore', 'Only a Technical reviewer can perform technical review');
      if (!context.item.core_required) throw forbidden('This item does not require technical review');
    } else {
      assertPermission(
        context.access,
        'reviewBusiness',
        'Only a Business reviewer can perform business review',
      );
      if (!context.item.business_required) throw forbidden('This item does not require business review');
    }
    assertWritable(context.access);
    if (!allowedDecisionsForStage(input.stage).includes(input.decision)) {
      throw unprocessable('This decision is not valid for this review stage');
    }
    if (context.item.supply_status !== 'submitted') {
      throw conflict('Evidence has not been submitted or still requires updates; review cannot proceed');
    }
    if (countEvidence(ctx.db, itemId) === 0) {
      throw conflict('No evidence has been submitted; review cannot proceed');
    }
    if (['passed', 'conditional', 'not_applicable'].includes(context.item.acceptance_status)) {
      throw conflict(
        'This item already has an acceptance decision; revise the acceptance criteria or reopen the project to review it again',
      );
    }
    const timestamp = new Date().toISOString();
    const effect = reviewEffect(input.stage, input.decision, {
      supplyStatus: context.item.supply_status,
      acceptanceStatus: context.item.acceptance_status,
    });
    ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          INSERT INTO reviews (id, item_id, author_id, stage, decision, remarks, environment, version, reference, revision, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          randomUUID(),
          itemId,
          user.id,
          input.stage,
          input.decision,
          input.remarks,
          input.environment,
          input.version,
          input.reference,
          context.item.revision,
          timestamp,
        );
      ctx.db
        .prepare(`
          UPDATE items SET supply_status = ?, acceptance_status = ?, updated_at = ? WHERE id = ?
        `)
        .run(effect.supplyStatus, effect.acceptanceStatus, timestamp, itemId);
      recordEvent(ctx.db, {
        projectId: context.access.project.id,
        actorId: user.id,
        itemId,
        action: 'item.review.recorded',
        detail: `${REVIEW_STAGE_LABELS[input.stage]} ${REVIEW_DECISION_LABELS[input.decision]}${input.remarks ? `: ${input.remarks}` : ''}`,
      });
    })();
    res.status(201).json(detail(itemId, context.access));
  });

  router.post('/items/:itemId/acceptance', (req, res) => {
    const user = currentUser(req);
    const itemId = parseUuid(req.params.itemId, 'itemId');
    const context = itemContext(ctx, itemId, user);
    assertPermission(context.access, 'acceptItems', 'Only the acceptance owner can record an acceptance decision');
    assertWritable(context.access);
    const input = parseWith(acceptanceSchema, req.body);
    if (!ACCEPTANCE_DECISIONS.includes(input.decision)) {
      throw unprocessable('Invalid acceptance decision');
    }
    if (['passed', 'conditional'].includes(context.item.acceptance_status)) {
      throw conflict(
        'This item already has a valid acceptance decision; revise the acceptance criteria or reopen the project to change it',
      );
    }
    const reviews = loadItemReviews(ctx.db, [itemId]).get(itemId) ?? [];
    const gate = evaluateGate({
      revision: context.item.revision,
      supplyStatus: context.item.supply_status,
      acceptanceStatus: context.item.acceptance_status,
      evidenceCount: countEvidence(ctx.db, itemId),
      coreRequired: context.item.core_required === 1,
      businessRequired: context.item.business_required === 1,
      reviews: reviews.map(mapReviewToSignal),
    });
    if ((input.decision === 'passed' || input.decision === 'conditional') && !gate.ready) {
      throw unprocessable(`Acceptance gate not met: ${gate.missing.join('; ')}`);
    }
    if (input.decision === 'rejected' && !input.remarks) {
      throw unprocessable('A rejection reason is required', {
        remarks: 'Enter a rejection reason',
      });
    }
    if (input.decision === 'not_applicable' && !input.remarks) {
      throw unprocessable('A reason is required when marking an item not applicable', {
        remarks: 'Explain why this item is not applicable',
      });
    }
    let owner: { id: string; role: string } | undefined;
    if (input.decision === 'conditional') {
      if (!input.condition) throw unprocessable('A condition is required for conditional acceptance');
      const member = listProjectMembers(ctx.db, context.access.project.id).find(
        (item) => item.userId === input.condition?.ownerId,
      );
      if (!member || member.role === 'observer') {
        throw unprocessable('The condition owner must be a project member', {
          'condition.ownerId': 'Select a project member',
        });
      }
      owner = { id: member.userId, role: member.role };
    }
    const timestamp = new Date().toISOString();
    const acceptanceId = randomUUID();
    const nextSupply = supplyStatusAfterAcceptance(input.decision, context.item.supply_status);
    const nextAcceptance = acceptanceStatusFor(input.decision);
    ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          INSERT INTO acceptances (id, item_id, reviewer_id, decision, remarks, environment, version, reference, revision, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          acceptanceId,
          itemId,
          user.id,
          input.decision,
          input.remarks,
          input.environment,
          input.version,
          input.reference,
          context.item.revision,
          timestamp,
        );
      ctx.db
        .prepare(`
          UPDATE items SET supply_status = ?, acceptance_status = ?, updated_at = ? WHERE id = ?
        `)
        .run(nextSupply, nextAcceptance, timestamp, itemId);
      if (input.decision === 'conditional' && input.condition && owner) {
        const code = nextConditionCode(ctx.db, context.access.project.id);
        ctx.db
          .prepare(`
            INSERT INTO conditions (id, project_id, item_id, acceptance_id, code, description, owner_id, due_date, severity, status, created_at, closed_at, closed_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL, NULL)
          `)
          .run(
            randomUUID(),
            context.access.project.id,
            itemId,
            acceptanceId,
            code,
            input.condition.description,
            owner.id,
            input.condition.dueDate,
            input.condition.severity,
            timestamp,
          );
        recordEvent(ctx.db, {
          projectId: context.access.project.id,
          actorId: user.id,
          itemId,
          action: 'item.acceptance.conditional',
          detail: `Conditional acceptance; condition ${code} created`,
        });
      } else {
        recordEvent(ctx.db, {
          projectId: context.access.project.id,
          actorId: user.id,
          itemId,
          action: 'item.acceptance.recorded',
          detail: `${ACCEPTANCE_LABELS[input.decision]}${input.remarks ? `: ${input.remarks}` : ''}`,
        });
      }
    })();
    res.status(201).json(detail(itemId, context.access));
  });

  router.post('/items/:itemId/notes', (req, res) => {
    const user = currentUser(req);
    const itemId = parseUuid(req.params.itemId, 'itemId');
    const context = itemContext(ctx, itemId, user);
    assertMember(context.access);
    assertWritable(context.access);
    const input = parseWith(createNoteSchema, req.body);
    let assigneeName = '';
    if (input.isQuestion && input.assigneeId) {
      const member = listProjectMembers(ctx.db, context.access.project.id).find(
        (item) => item.userId === input.assigneeId,
      );
      if (!member) {
        throw unprocessable('The question assignee must be a project member', {
          assigneeId: 'Select a project member',
        });
      }
      assigneeName = member.name;
    }
    const timestamp = new Date().toISOString();
    ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          INSERT INTO notes (id, item_id, author_id, kind, body, assignee_id, parent_id, answered_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)
        `)
        .run(
          randomUUID(),
          itemId,
          user.id,
          input.isQuestion ? 'question' : 'note',
          input.body,
          input.isQuestion ? input.assigneeId : null,
          timestamp,
        );
      recordEvent(ctx.db, {
        projectId: context.access.project.id,
        actorId: user.id,
        itemId,
        action: input.isQuestion ? 'note.question.created' : 'note.created',
        detail: input.isQuestion
          ? `Question raised for ${assigneeName}: ${input.body.slice(0, 80)}`
          : `Discussion posted: ${input.body.slice(0, 80)}`,
      });
    })();
    res.status(201).json(detail(itemId, context.access));
  });

  router.post('/notes/:noteId/answer', (req, res) => {
    const user = currentUser(req);
    const noteId = parseUuid(req.params.noteId, 'noteId');
    const context = noteContext(ctx, noteId, user);
    assertWritable(context.access);
    if (context.note.kind !== 'question') throw conflict('This discussion is not a question');
    if (context.note.answered_at) throw conflict('This question has already been answered');
    if (context.note.assignee_id !== user.id) throw forbidden('Only the assigned person can answer this question');
    const input = parseWith(answerNoteSchema, req.body);
    const timestamp = new Date().toISOString();
    ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          INSERT INTO notes (id, item_id, author_id, kind, body, assignee_id, parent_id, answered_at, created_at)
          VALUES (?, ?, ?, 'answer', ?, NULL, ?, NULL, ?)
        `)
        .run(randomUUID(), context.note.item_id, user.id, input.body, noteId, timestamp);
      ctx.db.prepare('UPDATE notes SET answered_at = ? WHERE id = ?').run(timestamp, noteId);
      recordEvent(ctx.db, {
        projectId: context.access.project.id,
        actorId: user.id,
        itemId: context.note.item_id,
        action: 'note.question.answered',
        detail: `${user.name} answered the question: ${input.body.slice(0, 80)}`,
      });
    })();
    res.json(detail(context.note.item_id, context.access));
  });

  router.post('/conditions/:conditionId/close', (req, res) => {
    const user = currentUser(req);
    const conditionId = parseUuid(req.params.conditionId, 'conditionId');
    const condition = ctx.db
      .prepare('SELECT * FROM conditions WHERE id = ?')
      .get(conditionId) as
      | {
          id: string;
          project_id: string;
          item_id: string;
          owner_id: string;
          code: string;
          status: string;
        }
      | undefined;
    if (!condition) throw notFound('Condition not found');
    const access = projectAccess(ctx, condition.project_id, user);
    const allowed = condition.owner_id === user.id || access.permissions.manageProject;
    if (!allowed) throw forbidden('Only the condition owner or the acceptance owner can close this condition');
    if (condition.status === 'closed') throw conflict('This condition is already closed');
    const timestamp = new Date().toISOString();
    ctx.db.transaction(() => {
      ctx.db
        .prepare(
          "UPDATE conditions SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ?",
        )
        .run(timestamp, user.id, conditionId);
      recordEvent(ctx.db, {
        projectId: condition.project_id,
        actorId: user.id,
        itemId: condition.item_id,
        action: 'condition.closed',
        detail: `Condition ${condition.code} closed`,
      });
    })();
    const updated = listConditions(ctx.db, condition.project_id).find(
      (item) => item.id === conditionId,
    );
    res.json({ condition: updated });
  });

  return router;
}
