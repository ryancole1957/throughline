import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { assetActionSchema, createAssetSchema } from '@throughline/shared';

import type { AppContext } from '../context';
import { getAsset, listAssets } from '../data/assets';
import { recordEvent } from '../data/events';
import {
  assertPermission,
  assertWritable,
  assetContext,
  currentUser,
  projectAccess,
} from '../http/access';
import { requireAuth } from '../http/middleware';
import { conflict } from '../lib/errors';
import { parseWith, parseUuid } from '../lib/validate';

function nextAssetCode(ctx: AppContext, projectId: string): string {
  const row = ctx.db
    .prepare(
      "SELECT code FROM assets WHERE project_id = ? AND code LIKE 'A-%' ORDER BY code DESC LIMIT 1",
    )
    .get(projectId) as { code: string } | undefined;
  const current = row ? Number.parseInt(row.code.slice(2), 10) : 0;
  return `A-${String((Number.isFinite(current) ? current : 0) + 1).padStart(2, '0')}`;
}

export function assetsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/projects/:projectId/assets', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    projectAccess(ctx, projectId, user);
    res.json({ assets: listAssets(ctx.db, projectId) });
  });

  router.post('/projects/:projectId/assets', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    assertPermission(access, 'manageProject', 'Only the acceptance owner or a system administrator can register assets');
    assertWritable(access);
    const input = parseWith(createAssetSchema, req.body);
    const id = randomUUID();
    const code = nextAssetCode(ctx, projectId);
    const timestamp = new Date().toISOString();
    ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          INSERT INTO assets (id, project_id, code, name, type, sensitivity, reference, custodian, status, verified_at, note, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_verification', NULL, ?, ?, ?)
        `)
        .run(
          id,
          projectId,
          code,
          input.name,
          input.type,
          input.sensitivity,
          input.reference,
          input.custodian,
          input.note,
          timestamp,
          timestamp,
        );
      recordEvent(ctx.db, {
        projectId,
        actorId: user.id,
        action: 'asset.created',
        detail: `Asset "${input.name}" registered (${code})`,
      });
    })();
    res.status(201).json({ asset: getAsset(ctx.db, id) });
  });

  router.post('/assets/:assetId/action', (req, res) => {
    const user = currentUser(req);
    const assetId = parseUuid(req.params.assetId, 'assetId');
    const context = assetContext(ctx, assetId, user);
    const input = parseWith(assetActionSchema, req.body);
    if (input.action === 'verify') {
      assertPermission(context.access, 'verifyAssets', 'Only the acceptance owner can record access verification');
      if (context.asset.status !== 'pending_verification') {
        throw conflict('This asset does not require access verification');
      }
    } else {
      assertPermission(context.access, 'rotateAssets', 'Only a system administrator can rotate credentials');
      if (context.asset.status !== 'pending_rotation') {
        throw conflict('This asset does not require rotation');
      }
    }
    assertWritable(context.access);
    const timestamp = new Date().toISOString();
    ctx.db.transaction(() => {
      if (input.action === 'verify') {
        ctx.db
          .prepare(`
            UPDATE assets SET status = 'verified', verified_at = ?, updated_at = ? WHERE id = ?
          `)
          .run(timestamp, timestamp, assetId);
      } else {
        ctx.db
          .prepare(`
            UPDATE assets SET status = 'verified', verified_at = ?, note = ?, updated_at = ? WHERE id = ?
          `)
          .run(
            new Date().toISOString().slice(0, 10),
            'Credentials rotated and confirmed by the acceptance owner.',
            timestamp,
            assetId,
          );
      }
      recordEvent(ctx.db, {
        projectId: context.access.project.id,
        actorId: user.id,
        action: input.action === 'verify' ? 'asset.verified' : 'asset.rotated',
        detail:
          input.action === 'verify'
            ? `Access verified for asset ${context.asset.code}`
            : `Credentials rotated and confirmed for asset ${context.asset.code}`,
      });
    })();
    res.json({ asset: getAsset(ctx.db, assetId) });
  });

  return router;
}
