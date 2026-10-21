import type { Permissions, ProjectRole } from '@throughline/shared';

import type { AppContext } from '../context';
import type {
  AuthUserRecord,
  ProjectAccess,
} from '../domain/access';
import { assertProjectWritable } from '../domain/access';
import { getAssetRow } from '../data/assets';
import { getConditionRow } from '../data/conditions';
import { getItemRow, getProjectIdForItem, type ItemRow } from '../data/items';
import { getNoteRow, type NoteRow } from '../data/notes';
import { resolveProjectAccess } from '../data/projects';
import { getRiskRow, type RiskRow } from '../data/risks';
import { getStepRow, type StepRow } from '../data/steps';
import { forbidden, notFound, unauthorized } from '../lib/errors';

export function currentUser(req: { user?: AuthUserRecord }): AuthUserRecord {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function projectAccess(
  ctx: AppContext,
  projectId: string,
  user: AuthUserRecord,
): ProjectAccess {
  const access = resolveProjectAccess(ctx.db, projectId, user);
  if (!access) throw notFound('Project not found or access denied');
  return access;
}

export function assertPermission(
  access: ProjectAccess,
  permission: keyof Permissions,
  message = 'You do not have permission to perform this action',
): void {
  if (!access.permissions[permission]) throw forbidden(message);
}

export function assertWritable(access: ProjectAccess): void {
  assertProjectWritable(access);
}

export function assertMember(access: ProjectAccess): ProjectRole {
  if (!access.role) throw forbidden('Only project members can perform this action');
  return access.role;
}

export interface ItemContext {
  access: ProjectAccess;
  item: ItemRow;
}

export function itemContext(
  ctx: AppContext,
  itemId: string,
  user: AuthUserRecord,
): ItemContext {
  const projectId = getProjectIdForItem(ctx.db, itemId);
  if (!projectId) throw notFound('Item not found');
  const access = projectAccess(ctx, projectId, user);
  const item = getItemRow(ctx.db, itemId);
  if (!item) throw notFound('Item not found');
  return { access, item };
}

export interface RiskContext {
  access: ProjectAccess;
  risk: RiskRow;
}

export function riskContext(
  ctx: AppContext,
  riskId: string,
  user: AuthUserRecord,
): RiskContext {
  const risk = getRiskRow(ctx.db, riskId);
  if (!risk) throw notFound('Risk not found');
  const access = projectAccess(ctx, risk.project_id, user);
  return { access, risk };
}

export function assetContext(
  ctx: AppContext,
  assetId: string,
  user: AuthUserRecord,
) {
  const asset = getAssetRow(ctx.db, assetId);
  if (!asset) throw notFound('Asset not found');
  const access = projectAccess(ctx, asset.project_id, user);
  return { access, asset };
}

export function conditionContext(
  ctx: AppContext,
  conditionId: string,
  user: AuthUserRecord,
) {
  const condition = getConditionRow(ctx.db, conditionId);
  if (!condition) throw notFound('Condition not found');
  const access = projectAccess(ctx, condition.project_id, user);
  return { access, condition };
}

export function stepContext(ctx: AppContext, stepId: string, user: AuthUserRecord) {
  const step = getStepRow(ctx.db, stepId);
  if (!step) throw notFound('Verification step not found');
  const access = projectAccess(ctx, step.project_id, user);
  return { access, step };
}

export interface NoteContext {
  access: ProjectAccess;
  note: NoteRow;
  item: ItemRow;
}

export function noteContext(
  ctx: AppContext,
  noteId: string,
  user: AuthUserRecord,
): NoteContext {
  const note = getNoteRow(ctx.db, noteId);
  if (!note) throw notFound('Discussion not found');
  const item = getItemRow(ctx.db, note.item_id);
  if (!item) throw notFound('Item not found');
  const access = projectAccess(ctx, item.project_id, user);
  return { access, note, item };
}

export type { StepRow };
