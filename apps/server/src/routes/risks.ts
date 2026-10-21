import { Router } from 'express';
import {
  createRiskSchema,
  riskTransitionSchema,
  updateRiskSchema,
} from '@throughline/shared';

import type { AppContext } from '../context';
import { recordEvent } from '../data/events';
import { listProjectMembers } from '../data/projects';
import { getRisk, listRisks } from '../data/risks';
import {
  assertMember,
  assertWritable,
  currentUser,
  projectAccess,
  riskContext,
} from '../http/access';
import { requireAuth } from '../http/middleware';
import { conflict, forbidden, notFound, unprocessable } from '../lib/errors';
import { parseWith, parseUuid } from '../lib/validate';
import { createRiskRecord } from '../services/risks';

function validateOwner(ctx: AppContext, projectId: string, ownerId: string): void {
  const member = listProjectMembers(ctx.db, projectId).find((item) => item.userId === ownerId);
  if (!member || member.role === 'observer') {
    throw unprocessable('The risk owner must be a project member', {
      ownerId: 'Select a project member',
    });
  }
}

export function risksRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/projects/:projectId/risks', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    projectAccess(ctx, projectId, user);
    res.json({ risks: listRisks(ctx.db, projectId) });
  });

  router.post('/projects/:projectId/risks', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    if (!access.isAdmin) {
      assertMember(access);
      if (access.role === 'observer') throw forbidden('Observers cannot create risks');
    }
    assertWritable(access);
    const input = parseWith(createRiskSchema, req.body);
    const created = ctx.db.transaction(() =>
      createRiskRecord(ctx, {
        projectId,
        actorId: user.id,
        title: input.title,
        impact: input.impact,
        mitigation: input.mitigation,
        severity: input.severity,
        ownerId: input.ownerId,
        dueDate: input.dueDate,
        itemIds: input.itemIds,
      }),
    )();
    const risk = getRisk(ctx.db, created.id);
    res.status(201).json({ risk });
  });

  router.patch('/risks/:riskId', (req, res) => {
    const user = currentUser(req);
    const riskId = parseUuid(req.params.riskId, 'riskId');
    const context = riskContext(ctx, riskId, user);
    const manager = context.access.permissions.manageProject;
    if (!manager && context.risk.owner_id !== user.id) {
      throw forbidden('Only the risk owner, the acceptance owner, or a system administrator can edit this risk');
    }
    assertWritable(context.access);
    const input = parseWith(updateRiskSchema, req.body);
    if (input.ownerId) validateOwner(ctx, context.risk.project_id, input.ownerId);
    const fields: string[] = [];
    const values: unknown[] = [];
    const mapping = {
      title: 'title',
      impact: 'impact',
      mitigation: 'mitigation',
      progress: 'progress',
      severity: 'severity',
      ownerId: 'owner_id',
      dueDate: 'due_date',
    } as const;
    for (const key of Object.keys(mapping) as Array<keyof typeof mapping>) {
      const value = input[key];
      if (value !== undefined) {
        fields.push(`${mapping[key]} = ?`);
        values.push(value);
      }
    }
    if (!fields.length) {
      res.json({ risk: getRisk(ctx.db, riskId) });
      return;
    }
    fields.push('updated_at = ?');
    values.push(new Date().toISOString(), riskId);
    ctx.db.prepare(`UPDATE risks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    recordEvent(ctx.db, {
      projectId: context.risk.project_id,
      actorId: user.id,
      action: 'risk.updated',
      detail: `Risk ${context.risk.code} updated`,
    });
    res.json({ risk: getRisk(ctx.db, riskId) });
  });

  router.post('/risks/:riskId/transition', (req, res) => {
    const user = currentUser(req);
    const riskId = parseUuid(req.params.riskId, 'riskId');
    const context = riskContext(ctx, riskId, user);
    const input = parseWith(riskTransitionSchema, req.body);
    const manager = context.access.permissions.manageProject;
    const owner = context.risk.owner_id === user.id;
    const ownerActions = ['start', 'mitigate', 'escalate'];
    const managerActions = ['back', 'approve', 'close'];
    if (ownerActions.includes(input.action) && !(owner || manager)) {
      throw forbidden('Only the risk owner, the acceptance owner, or a system administrator can progress this risk');
    }
    if (managerActions.includes(input.action) && !manager) {
      throw forbidden('Only the acceptance owner or a system administrator can decide this risk');
    }
    const transitionMap: Record<
      string,
      { from: string[]; to: string; requireNote?: boolean; exception?: boolean }
    > = {
      start: { from: ['open'], to: 'in_progress' },
      mitigate: { from: ['in_progress'], to: 'mitigated' },
      escalate: { from: ['in_progress'], to: 'escalated', requireNote: true },
      back: { from: ['escalated'], to: 'in_progress', requireNote: true },
      approve: { from: ['escalated'], to: 'closed', requireNote: true, exception: true },
      close: { from: ['mitigated'], to: 'closed' },
    };
    const rule = transitionMap[input.action];
    if (!rule) throw unprocessable('Invalid risk action');
    if (!rule.from.includes(context.risk.status)) {
      throw conflict('This action is not allowed in the current risk status');
    }
    if (rule.requireNote && !input.note) {
      throw unprocessable('A note is required for this risk action', { note: 'Enter a note' });
    }
    const timestamp = new Date().toISOString();
    ctx.db.transaction(() => {
      if (rule.exception) {
        ctx.db
          .prepare(`
            UPDATE risks SET status = 'closed', exception_note = ?, exception_by = ?, progress = ?, updated_at = ?, closed_at = ? WHERE id = ?
          `)
          .run(input.note, user.name, input.note, timestamp, timestamp, riskId);
      } else if (rule.to === 'closed') {
        ctx.db
          .prepare(`
            UPDATE risks SET status = 'closed', progress = ?, updated_at = ?, closed_at = ? WHERE id = ?
          `)
          .run(input.note || context.risk.progress, timestamp, timestamp, riskId);
      } else {
        ctx.db
          .prepare(`
            UPDATE risks SET status = ?, progress = ?, updated_at = ? WHERE id = ?
          `)
          .run(rule.to, input.note || context.risk.progress, timestamp, riskId);
      }
      const actionLabels: Record<string, string> = {
        start: 'moved to in progress',
        mitigate: 'marked as mitigated',
        escalate: 'escalated to the acceptance owner',
        back: 'returned to in progress',
        approve: 'exception approved and closed',
        close: 'closed',
      };
      recordEvent(ctx.db, {
        projectId: context.risk.project_id,
        actorId: user.id,
        action: `risk.${input.action}`,
        detail: `Risk ${context.risk.code} ${actionLabels[input.action]}${input.note ? `: ${input.note}` : ''}`,
      });
    })();
    res.json({ risk: getRisk(ctx.db, riskId) });
  });

  router.get('/projects/:projectId/risks/:riskId', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const riskId = parseUuid(req.params.riskId, 'riskId');
    projectAccess(ctx, projectId, user);
    const risk = getRisk(ctx.db, riskId);
    if (!risk) throw notFound('Risk not found');
    res.json({ risk });
  });

  return router;
}
