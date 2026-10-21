import { randomUUID } from 'node:crypto';
import express, { Router } from 'express';
import type { MappingEndpoint } from '@throughline/shared';
import { buildMappingName, createChainSchema, updateChainSchema } from '@throughline/shared';

import type { AppContext } from '../context';
import { getChainRow, getChainScreenshot, listChains } from '../data/chains';
import { recordEvent } from '../data/events';
import type { AuthUserRecord } from '../domain/access';
import { assertPermission, assertWritable, currentUser, projectAccess } from '../http/access';
import { requireAuth } from '../http/middleware';
import { ApiError, badRequest, notFound } from '../lib/errors';
import { parseWith, parseUuid } from '../lib/validate';

const SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

function assertManageable(ctx: AppContext, projectId: string, user: AuthUserRecord) {
  const access = projectAccess(ctx, projectId, user);
  assertPermission(
    access,
    'manageProject',
    'Only the acceptance owner or a system administrator can manage mappings',
  );
  assertWritable(access);
  return access;
}

export function chainsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/projects/:projectId/chains', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    projectAccess(ctx, projectId, user);
    res.json({ chains: listChains(ctx.db, projectId) });
  });

  router.post('/projects/:projectId/chains', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    assertManageable(ctx, projectId, user);
    const input = parseWith(createChainSchema, req.body);
    const timestamp = new Date().toISOString();
    ctx.db.transaction(() => {
      ctx.db
        .prepare(
          `
          INSERT INTO chains (id, project_id, name, title, page, url, endpoints, service, tables, environment, owner_name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          randomUUID(),
          projectId,
          buildMappingName(input.page, input.endpoints),
          input.title,
          input.page,
          input.url,
          JSON.stringify(input.endpoints),
          input.service,
          input.tables,
          input.environment,
          input.ownerName,
          timestamp,
          timestamp,
        );
      recordEvent(ctx.db, {
        projectId,
        actorId: user.id,
        action: 'mapping.created',
        detail: `Mapping "${input.page}" created with ${input.endpoints.length} endpoint(s)`,
      });
    })();
    res.status(201).json({ chains: listChains(ctx.db, projectId) });
  });

  router.patch('/chains/:chainId', (req, res) => {
    const user = currentUser(req);
    const chainId = parseUuid(req.params.chainId, 'chainId');
    const chain = getChainRow(ctx.db, chainId);
    if (!chain) throw notFound('Mapping not found');
    assertManageable(ctx, chain.project_id, user);
    const input = parseWith(updateChainSchema, req.body);
    const nextEndpoints =
      input.endpoints ?? (JSON.parse(chain.endpoints || '[]') as MappingEndpoint[]);
    const nextPage = input.page ?? chain.page;
    const fields: string[] = ['name = ?'];
    const values: unknown[] = [buildMappingName(nextPage, nextEndpoints)];
    const columnMap: Array<[keyof typeof input & string, string]> = [
      ['title', 'title'],
      ['page', 'page'],
      ['url', 'url'],
      ['service', 'service'],
      ['tables', 'tables'],
      ['environment', 'environment'],
      ['ownerName', 'owner_name'],
    ];
    for (const [key, column] of columnMap) {
      if (input[key] !== undefined) {
        fields.push(`${column} = ?`);
        values.push(input[key]);
      }
    }
    if (input.endpoints !== undefined) {
      fields.push('endpoints = ?');
      values.push(JSON.stringify(input.endpoints));
    }
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(chainId);
    ctx.db.prepare(`UPDATE chains SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    recordEvent(ctx.db, {
      projectId: chain.project_id,
      actorId: user.id,
      action: 'mapping.updated',
      detail: `Mapping "${nextPage}" updated`,
    });
    res.json({ chains: listChains(ctx.db, chain.project_id) });
  });

  router.put(
    '/chains/:chainId/screenshot',
    express.raw({ type: () => true, limit: MAX_SCREENSHOT_BYTES }),
    (req, res) => {
      const user = currentUser(req);
      const chainId = parseUuid(req.params.chainId, 'chainId');
      const chain = getChainRow(ctx.db, chainId);
      if (!chain) throw notFound('Mapping not found');
      assertManageable(ctx, chain.project_id, user);
      const contentType = req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (!contentType || !SCREENSHOT_TYPES.has(contentType)) {
        throw badRequest('Screenshot must be a PNG, JPEG, or WebP image', 'unsupported_media_type');
      }
      const body = req.body as Buffer | undefined;
      if (!body || body.length === 0) throw badRequest('Screenshot is empty');
      if (body.length > MAX_SCREENSHOT_BYTES) {
        throw new ApiError(413, 'payload_too_large', 'Screenshot is too large (max 4 MB)');
      }
      // Deliberately does not touch updated_at: attaching a screenshot is not a
      // contract change and must not invalidate end-to-end passes.
      ctx.db
        .prepare('UPDATE chains SET screenshot = ?, screenshot_type = ? WHERE id = ?')
        .run(body, contentType, chainId);
      recordEvent(ctx.db, {
        projectId: chain.project_id,
        actorId: user.id,
        action: 'mapping.screenshot_updated',
        detail: `Screenshot updated for mapping "${chain.page}"`,
      });
      res.json({ chains: listChains(ctx.db, chain.project_id) });
    },
  );

  router.get('/chains/:chainId/screenshot', (req, res) => {
    const user = currentUser(req);
    const chainId = parseUuid(req.params.chainId, 'chainId');
    const chain = getChainRow(ctx.db, chainId);
    if (!chain) throw notFound('Mapping not found');
    projectAccess(ctx, chain.project_id, user);
    const screenshot = getChainScreenshot(ctx.db, chainId);
    if (!screenshot) throw notFound('Screenshot not found');
    res.setHeader('Content-Type', screenshot.type);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(screenshot.data));
  });

  router.delete('/chains/:chainId/screenshot', (req, res) => {
    const user = currentUser(req);
    const chainId = parseUuid(req.params.chainId, 'chainId');
    const chain = getChainRow(ctx.db, chainId);
    if (!chain) throw notFound('Mapping not found');
    assertManageable(ctx, chain.project_id, user);
    ctx.db
      .prepare('UPDATE chains SET screenshot = NULL, screenshot_type = ? WHERE id = ?')
      .run('', chainId);
    res.json({ chains: listChains(ctx.db, chain.project_id) });
  });

  router.delete('/chains/:chainId', (req, res) => {
    const user = currentUser(req);
    const chainId = parseUuid(req.params.chainId, 'chainId');
    const chain = getChainRow(ctx.db, chainId);
    if (!chain) throw notFound('Mapping not found');
    assertManageable(ctx, chain.project_id, user);
    ctx.db.transaction(() => {
      ctx.db.prepare('DELETE FROM chains WHERE id = ?').run(chainId);
      recordEvent(ctx.db, {
        projectId: chain.project_id,
        actorId: user.id,
        action: 'mapping.deleted',
        detail: `Mapping "${chain.name}" deleted`,
      });
    })();
    res.json({ chains: listChains(ctx.db, chain.project_id) });
  });

  return router;
}
