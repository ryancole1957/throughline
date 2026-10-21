import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { TeamDetail, TeamRole } from '@throughline/shared';
import {
  addTeamMemberSchema,
  createTeamSchema,
  joinTeamSchema,
  updateTeamSchema,
} from '@throughline/shared';

import type { AppContext } from '../context';
import { listProjectSummariesForTeam } from '../data/projects';
import {
  countTeamMembers,
  generateJoinCode,
  getTeamByJoinCode,
  getTeamMembership,
  getTeamRow,
  listTeamMembers,
  listTeamsForUser,
} from '../data/teams';
import { getUserRecordByEmail } from '../data/users';
import type { AuthUserRecord } from '../domain/access';
import { currentUser } from '../http/access';
import { requireAuth } from '../http/middleware';
import { conflict, forbidden, notFound } from '../lib/errors';
import { parseUuid, parseWith } from '../lib/validate';

interface TeamContext {
  team: NonNullable<ReturnType<typeof getTeamRow>>;
  role: TeamRole;
}

function teamContext(ctx: AppContext, teamId: string, user: AuthUserRecord): TeamContext {
  const team = getTeamRow(ctx.db, teamId);
  if (!team) throw notFound('Team not found');
  const membership = getTeamMembership(ctx.db, teamId, user.id);
  if (!membership && user.system_role !== 'admin') throw notFound('Team not found');
  return { team, role: membership?.role ?? 'owner' };
}

function buildTeamDetail(
  ctx: AppContext,
  user: AuthUserRecord,
  teamId: string,
  role: TeamRole,
): TeamDetail {
  const team = getTeamRow(ctx.db, teamId);
  if (!team) throw notFound('Team not found');
  const projects = listProjectSummariesForTeam(ctx.db, user, teamId);
  return {
    id: team.id,
    name: team.name,
    role,
    memberCount: countTeamMembers(ctx.db, teamId),
    projectCount: projects.length,
    createdAt: team.created_at,
    joinCode: team.join_code,
    members: listTeamMembers(ctx.db, teamId),
    projects,
  };
}

export function teamsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    const user = currentUser(req);
    res.json({ teams: listTeamsForUser(ctx.db, user.id) });
  });

  router.post('/', (req, res) => {
    const user = currentUser(req);
    const input = parseWith(createTeamSchema, req.body);
    const teamId = randomUUID();
    const timestamp = new Date().toISOString();
    const joinCode = generateJoinCode(ctx.db);
    const run = ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          INSERT INTO teams (id, name, join_code, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(teamId, input.name, joinCode, user.id, timestamp, timestamp);
      ctx.db
        .prepare(`
          INSERT INTO team_members (team_id, user_id, role, created_at)
          VALUES (?, ?, 'owner', ?)
        `)
        .run(teamId, user.id, timestamp);
    });
    run();
    res.status(201).json({ team: buildTeamDetail(ctx, user, teamId, 'owner') });
  });

  router.post('/join', (req, res) => {
    const user = currentUser(req);
    const input = parseWith(joinTeamSchema, req.body);
    const team = getTeamByJoinCode(ctx.db, input.code);
    if (!team) throw notFound('Invite code is invalid or has expired', 'invalid_join_code');
    const existing = getTeamMembership(ctx.db, team.id, user.id);
    if (existing) {
      res.json({ team: buildTeamDetail(ctx, user, team.id, existing.role), alreadyMember: true });
      return;
    }
    const timestamp = new Date().toISOString();
    ctx.db
      .prepare(`
        INSERT INTO team_members (team_id, user_id, role, created_at)
        VALUES (?, ?, 'member', ?)
      `)
      .run(team.id, user.id, timestamp);
    res.status(201).json({
      team: buildTeamDetail(ctx, user, team.id, 'member'),
      alreadyMember: false,
    });
  });

  router.get('/:teamId', (req, res) => {
    const user = currentUser(req);
    const teamId = parseUuid(req.params.teamId, 'teamId');
    const { role } = teamContext(ctx, teamId, user);
    res.json({ team: buildTeamDetail(ctx, user, teamId, role) });
  });

  router.patch('/:teamId', (req, res) => {
    const user = currentUser(req);
    const teamId = parseUuid(req.params.teamId, 'teamId');
    const { role } = teamContext(ctx, teamId, user);
    if (role !== 'owner') throw forbidden('Only the team owner can update the team', 'owner_required');
    const input = parseWith(updateTeamSchema, req.body);
    if (input.name !== undefined) {
      ctx.db
        .prepare('UPDATE teams SET name = ?, updated_at = ? WHERE id = ?')
        .run(input.name, new Date().toISOString(), teamId);
    }
    res.json({ team: buildTeamDetail(ctx, user, teamId, role) });
  });

  router.post('/:teamId/join-code/rotate', (req, res) => {
    const user = currentUser(req);
    const teamId = parseUuid(req.params.teamId, 'teamId');
    const { role } = teamContext(ctx, teamId, user);
    if (role !== 'owner') {
      throw forbidden('Only the team owner can regenerate the invite code', 'owner_required');
    }
    const joinCode = generateJoinCode(ctx.db);
    ctx.db
      .prepare('UPDATE teams SET join_code = ?, updated_at = ? WHERE id = ?')
      .run(joinCode, new Date().toISOString(), teamId);
    res.json({ team: buildTeamDetail(ctx, user, teamId, role) });
  });

  router.post('/:teamId/members', (req, res) => {
    const user = currentUser(req);
    const teamId = parseUuid(req.params.teamId, 'teamId');
    const { role } = teamContext(ctx, teamId, user);
    if (role !== 'owner') throw forbidden('Only the team owner can add members', 'owner_required');
    const input = parseWith(addTeamMemberSchema, req.body);
    const target = getUserRecordByEmail(ctx.db, input.email);
    if (!target || target.status !== 'active') {
      throw notFound('No active account uses that email. Ask them to register first.', 'user_not_found');
    }
    if (getTeamMembership(ctx.db, teamId, target.id)) {
      throw conflict('This user is already a member of the team', 'member_exists');
    }
    ctx.db
      .prepare(`
        INSERT INTO team_members (team_id, user_id, role, created_at)
        VALUES (?, ?, 'member', ?)
      `)
      .run(teamId, target.id, new Date().toISOString());
    res.status(201).json({ team: buildTeamDetail(ctx, user, teamId, role) });
  });

  router.delete('/:teamId/members/:userId', (req, res) => {
    const user = currentUser(req);
    const teamId = parseUuid(req.params.teamId, 'teamId');
    const targetUserId = parseUuid(req.params.userId, 'userId');
    const { role } = teamContext(ctx, teamId, user);
    if (role !== 'owner') throw forbidden('Only the team owner can remove members', 'owner_required');
    const membership = getTeamMembership(ctx.db, teamId, targetUserId);
    if (!membership) throw notFound('Team member not found');
    if (membership.role === 'owner') {
      throw conflict('The team owner cannot be removed from the team', 'owner_protected');
    }
    const run = ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          DELETE FROM project_members
          WHERE user_id = ?
            AND project_id IN (SELECT id FROM projects WHERE team_id = ?)
        `)
        .run(targetUserId, teamId);
      ctx.db
        .prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?')
        .run(teamId, targetUserId);
    });
    run();
    res.json({ team: buildTeamDetail(ctx, user, teamId, role) });
  });

  router.post('/:teamId/leave', (req, res) => {
    const user = currentUser(req);
    const teamId = parseUuid(req.params.teamId, 'teamId');
    const membership = getTeamMembership(ctx.db, teamId, user.id);
    if (!membership) throw notFound('Team not found');
    if (membership.role === 'owner') {
      throw conflict('The team owner cannot leave the team; transfer or remove the team first', 'owner_protected');
    }
    const run = ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          DELETE FROM project_members
          WHERE user_id = ?
            AND project_id IN (SELECT id FROM projects WHERE team_id = ?)
        `)
        .run(user.id, teamId);
      ctx.db
        .prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?')
        .run(teamId, user.id);
    });
    run();
    res.status(204).end();
  });

  return router;
}
