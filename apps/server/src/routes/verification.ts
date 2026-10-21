import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { createStepSchema, stepResultSchema, stepScopeSchema } from '@throughline/shared';

import type { AppContext } from '../context';
import { recordEvent } from '../data/events';
import { listSteps, stepScopeSignature } from '../data/steps';
import type { StepRow } from '../data/steps';
import {
  assertPermission,
  assertWritable,
  currentUser,
  projectAccess,
  stepContext,
} from '../http/access';
import { requireAuth } from '../http/middleware';
import { unprocessable } from '../lib/errors';
import { parseWith, parseUuid } from '../lib/validate';
import { createRiskRecord } from '../services/risks';

function assertProjectScope(
  ctx: AppContext,
  projectId: string,
  table: 'items' | 'chains',
  ids: string[],
  field: string,
): void {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(', ');
  const row = ctx.db
    .prepare(
      `SELECT COUNT(*) AS count FROM ${table} WHERE project_id = ? AND id IN (${placeholders})`,
    )
    .get(projectId, ...ids) as { count: number };
  if (Number(row.count) !== ids.length) {
    throw unprocessable(`Linked ${field} not found`, {
      [field]: 'Contains entries from another project',
    });
  }
}

function linkedItemIds(ctx: AppContext, step: StepRow): string[] {
  return (
    ctx.db
      .prepare('SELECT item_id AS itemId FROM e2e_step_items WHERE step_id = ? ORDER BY item_id')
      .all(step.id) as Array<{ itemId: string }>
  ).map((row) => row.itemId);
}

export function verificationRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/projects/:projectId/steps', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    projectAccess(ctx, projectId, user);
    res.json({ steps: listSteps(ctx.db, projectId) });
  });

  router.post('/projects/:projectId/steps', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    assertPermission(
      access,
      'recordVerification',
      'Only the acceptance owner can maintain end-to-end steps',
    );
    assertWritable(access);
    const input = parseWith(createStepSchema, req.body);
    const positionRow = ctx.db
      .prepare(
        'SELECT COALESCE(MAX(position), 0) + 1 AS position FROM e2e_steps WHERE project_id = ?',
      )
      .get(projectId) as { position: number };
    const position = Number(positionRow.position);
    if (position > 50) throw new Error('too many steps');
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    ctx.db.transaction(() => {
      ctx.db
        .prepare(
          `
          INSERT INTO e2e_steps (id, project_id, position, name, status, note, environment, fingerprint, recorded_by, recorded_at, created_at)
          VALUES (?, ?, ?, ?, 'pending', '', '', '', NULL, NULL, ?)
        `,
        )
        .run(id, projectId, position, input.name, timestamp);
      recordEvent(ctx.db, {
        projectId,
        actorId: user.id,
        action: 'e2e.step.created',
        detail: `End-to-end step added: ${input.name}`,
      });
    })();
    res.status(201).json({ steps: listSteps(ctx.db, projectId) });
  });

  router.patch('/steps/:stepId', (req, res) => {
    const user = currentUser(req);
    const stepId = parseUuid(req.params.stepId, 'stepId');
    const context = stepContext(ctx, stepId, user);
    assertPermission(
      context.access,
      'recordVerification',
      'Only the acceptance owner can maintain end-to-end steps',
    );
    assertWritable(context.access);
    const input = parseWith(stepScopeSchema, req.body);
    const projectId = context.access.project.id;
    assertProjectScope(ctx, projectId, 'items', input.itemIds, 'itemIds');
    assertProjectScope(ctx, projectId, 'chains', input.chainIds, 'chainIds');
    ctx.db.transaction(() => {
      ctx.db.prepare('DELETE FROM e2e_step_items WHERE step_id = ?').run(stepId);
      ctx.db.prepare('DELETE FROM e2e_step_chains WHERE step_id = ?').run(stepId);
      const insertItem = ctx.db.prepare(
        'INSERT INTO e2e_step_items (step_id, item_id) VALUES (?, ?)',
      );
      for (const itemId of input.itemIds) insertItem.run(stepId, itemId);
      const insertChain = ctx.db.prepare(
        'INSERT INTO e2e_step_chains (step_id, chain_id) VALUES (?, ?)',
      );
      for (const chainId of input.chainIds) insertChain.run(stepId, chainId);
      if (context.step.status === 'passed') {
        ctx.db
          .prepare('UPDATE e2e_steps SET fingerprint = ? WHERE id = ?')
          .run(stepScopeSignature(ctx.db, stepId), stepId);
      }
      recordEvent(ctx.db, {
        projectId,
        actorId: user.id,
        detail: `End-to-end step "${context.step.name}" now covers ${input.itemIds.length} item(s) and ${input.chainIds.length} page mapping(s)`,
        action: 'e2e.scope.updated',
      });
    })();
    res.json({ steps: listSteps(ctx.db, projectId) });
  });

  router.post('/steps/:stepId/result', (req, res) => {
    const user = currentUser(req);
    const stepId = parseUuid(req.params.stepId, 'stepId');
    const context = stepContext(ctx, stepId, user);
    assertPermission(
      context.access,
      'recordVerification',
      'Only the acceptance owner can record verification results',
    );
    assertWritable(context.access);
    const input = parseWith(stepResultSchema, req.body);
    const timestamp = new Date().toISOString();
    const projectId = context.access.project.id;
    let riskCode: string | null = null;
    ctx.db.transaction(() => {
      ctx.db
        .prepare(
          `
          UPDATE e2e_steps SET status = ?, note = ?, environment = ?, fingerprint = ?, recorded_by = ?, recorded_at = ?
          WHERE id = ?
        `,
        )
        .run(
          input.status,
          input.note,
          input.environment,
          input.status === 'passed' ? stepScopeSignature(ctx.db, stepId) : '',
          user.id,
          timestamp,
          stepId,
        );
      recordEvent(ctx.db, {
        projectId,
        actorId: user.id,
        action: 'e2e.result.recorded',
        detail: `End-to-end step "${context.step.name}" marked as ${
          input.status === 'passed'
            ? 'passed'
            : input.status === 'failed'
              ? 'failed'
              : input.status === 'in_progress'
                ? 'in progress'
                : 'not started'
        }`,
      });
      if (input.status === 'failed' && input.risk) {
        const code = createRiskRecord(ctx, {
          projectId,
          actorId: user.id,
          title: (input.risk.title.trim() || `End-to-end step failed: ${context.step.name}`).slice(
            0,
            240,
          ),
          impact: input.note,
          mitigation: '',
          severity: input.risk.severity,
          ownerId: input.risk.ownerId,
          dueDate: input.risk.dueDate,
          itemIds: linkedItemIds(ctx, context.step),
        }).code;
        riskCode = code;
      }
    })();
    const step = listSteps(ctx.db, projectId).find((item) => item.id === stepId);
    res.json({ step, riskCode });
  });

  return router;
}
