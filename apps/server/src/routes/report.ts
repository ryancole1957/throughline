import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { conclusionSchema, signoffSchema } from '@throughline/shared';

import type { AppContext } from '../context';
import { recordEvent } from '../data/events';
import { signoffRoleFor } from '../domain/access';
import {
  assertPermission,
  assertWritable,
  currentUser,
  projectAccess,
} from '../http/access';
import { requireAuth } from '../http/middleware';
import { conflict, forbidden, unprocessable } from '../lib/errors';
import { parseWith, parseUuid } from '../lib/validate';
import {
  buildReport,
  getCurrentSnapshotHash,
  renderReportMarkdown,
} from '../services/report';
import {
  getProjectById,
  maybeCloseProject,
  moveToSignoffAfterConclusion,
} from '../services/projectLifecycle';

const SIGNOFF_LABELS = {
  agree: 'agreed',
  agree_with_reservations: 'agreed with reservations',
  disagree: 'disagreed',
} as const;

const CONCLUSION_LABELS = {
  accepted: 'Accepted',
  conditionally_accepted: 'Conditionally accepted',
  not_accepted: 'Not accepted',
} as const;

function activeConclusion(db: AppContext['db'], projectId: string): { id: string } | undefined {
  return db
    .prepare(
      'SELECT id FROM conclusions WHERE project_id = ? AND voided_at IS NULL ORDER BY decided_at DESC LIMIT 1',
    )
    .get(projectId) as { id: string } | undefined;
}

export function reportRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/projects/:projectId/report', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    res.json({ report: buildReport(ctx.db, access, user) });
  });

  router.get('/projects/:projectId/report.md', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    const report = buildReport(ctx.db, access, user);
    const markdown = renderReportMarkdown(report);
    const fileName = `delivery-report-${report.project.code}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(`delivery-report-${report.project.code}.md`)}`,
    );
    res.send(markdown);
  });

  router.post('/projects/:projectId/conclusion', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    assertPermission(access, 'conclude', 'Only the acceptance owner can record the delivery conclusion');
    assertWritable(access);
    if (!['verification', 'signoff'].includes(access.project.stage)) {
      throw conflict('Complete Verification before recording the delivery conclusion');
    }
    if (activeConclusion(ctx.db, projectId)) {
      throw conflict('The delivery conclusion is already confirmed; reopen the project to change it');
    }
    const input = parseWith(conclusionSchema, req.body);
    const timestamp = new Date().toISOString();
    ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          INSERT INTO conclusions (id, project_id, decision, note, decided_by, decided_at, voided_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL)
        `)
        .run(randomUUID(), projectId, input.decision, input.note, user.id, timestamp);
      recordEvent(ctx.db, {
        projectId,
        actorId: user.id,
        action: 'project.conclusion.recorded',
        detail: `Delivery conclusion: ${CONCLUSION_LABELS[input.decision]}${input.note ? ` (${input.note})` : ''}`,
      });
      moveToSignoffAfterConclusion(ctx.db, getProjectById(ctx.db, projectId), user.id);
    })();
    const freshAccess = projectAccess(ctx, projectId, user);
    res.status(201).json({ report: buildReport(ctx.db, freshAccess, user) });
  });

  router.post('/projects/:projectId/signoffs', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    if (access.project.status !== 'active' || access.project.stage !== 'signoff') {
      throw conflict('Sign-off is only available during the Sign-off stage');
    }
    const role = signoffRoleFor(access.role);
    if (!role) throw forbidden('Your role does not carry sign-off responsibility');
    const conclusion = activeConclusion(ctx.db, projectId);
    if (!conclusion) throw conflict('Confirm the delivery conclusion first');
    const existing = ctx.db
      .prepare(
        'SELECT id FROM signoffs WHERE project_id = ? AND user_id = ? AND voided_at IS NULL',
      )
      .get(projectId, user.id);
    if (existing) throw conflict('You have already signed off');
    const input = parseWith(signoffSchema, req.body);
    if (input.decision !== 'agree' && !input.note) {
      throw unprocessable('A note is required when signing off with reservations or disagreement', {
        note: 'Enter a sign-off note',
      });
    }
    const snapshotHash = getCurrentSnapshotHash(ctx.db, access);
    const timestamp = new Date().toISOString();
    ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          INSERT INTO signoffs (id, project_id, user_id, role, decision, note, snapshot_hash, signed_at, voided_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `)
        .run(
          randomUUID(),
          projectId,
          user.id,
          role,
          input.decision,
          input.note,
          snapshotHash,
          timestamp,
        );
      recordEvent(ctx.db, {
        projectId,
        actorId: user.id,
        action: 'project.signoff.recorded',
        detail: `${user.name} signed off: ${SIGNOFF_LABELS[input.decision]} (snapshot ${snapshotHash})`,
      });
      maybeCloseProject(ctx.db, projectId, user.id);
    })();
    const freshAccess = projectAccess(ctx, projectId, user);
    res.status(201).json({ report: buildReport(ctx.db, freshAccess, user) });
  });

  return router;
}
