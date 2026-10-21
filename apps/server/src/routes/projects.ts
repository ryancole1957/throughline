import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  PROJECT_STAGES,
  addMemberSchema,
  createProjectSchema,
  projectStageActionSchema,
  updateProjectSchema,
  userLookupSchema,
} from '@throughline/shared';

import type { AppContext } from '../context';
import {
  getProjectDetailForUser,
  listProjectMembers,
  listProjectSummaries,
} from '../data/projects';
import { listProjectEvents, recordEvent } from '../data/events';
import { getTeamMembership, getTeamRow } from '../data/teams';
import { getUserRecordByEmail, lookupUsers } from '../data/users';
import {
  assertPermission,
  assertWritable,
  currentUser,
  projectAccess,
} from '../http/access';
import { requireAuth } from '../http/middleware';
import { conflict, forbidden, notFound } from '../lib/errors';
import { addDays, daysBetween } from '../lib/time';
import { parseWith, parseUuid } from '../lib/validate';
import { buildOverview } from '../services/overview';
import {
  advanceProject,
  getProjectById,
  pauseProject,
  reopenProject,
  resumeProject,
} from '../services/projectLifecycle';

const ROLE_LABELS: Record<string, string> = {
  receiver: 'Acceptance owner',
  delivery: 'Delivery',
  core_reviewer: 'Technical reviewer',
  business_reviewer: 'Business reviewer',
  observer: 'Observer',
};

const MILESTONE_FRACTIONS: Record<string, number> = {
  draft: 0,
  scope: 0.15,
  collection: 0.35,
  walkthrough: 0.55,
  verification: 0.78,
  signoff: 0.92,
  closed: 1,
};

function createMilestones(
  db: AppContext['db'],
  projectId: string,
  kickoff: string,
  deadline: string,
): void {
  const span = Math.max(daysBetween(kickoff, deadline), 1);
  const insert = db.prepare(`
    INSERT INTO project_milestones (project_id, stage, planned_date, completed_at)
    VALUES (?, ?, ?, NULL)
  `);
  for (const stage of PROJECT_STAGES) {
    const planned = addDays(kickoff, Math.round(span * (MILESTONE_FRACTIONS[stage] ?? 0)));
    insert.run(projectId, stage, planned > deadline ? deadline : planned);
  }
}

const DEFAULT_STEPS = [
  'Data and access verification',
  'Core workflow walkthrough',
  'Permissions and role checks',
  'Failure and recovery drill',
];

function createDefaultSteps(db: AppContext['db'], projectId: string): void {
  const insert = db.prepare(`
    INSERT INTO e2e_steps (id, project_id, position, name, status, note, environment, recorded_by, recorded_at, created_at)
    VALUES (?, ?, ?, ?, 'pending', '', '', NULL, NULL, ?)
  `);
  const timestamp = new Date().toISOString();
  DEFAULT_STEPS.forEach((name, index) => {
    insert.run(randomUUID(), projectId, index + 1, name, timestamp);
  });
}

export function projectsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    const user = currentUser(req);
    res.json({ projects: listProjectSummaries(ctx.db, user) });
  });

  router.post('/', (req, res) => {
    const user = currentUser(req);
    const input = parseWith(createProjectSchema, req.body);
    const team = getTeamRow(ctx.db, input.teamId);
    if (!team) throw notFound('Team not found');
    if (user.system_role !== 'admin' && !getTeamMembership(ctx.db, team.id, user.id)) {
      throw forbidden('You are not a member of this team', 'team_access_denied');
    }
    const existing = ctx.db
      .prepare('SELECT id FROM projects WHERE code = ? COLLATE NOCASE')
      .get(input.code);
    if (existing) throw conflict('A project with this code already exists', 'project_code_exists');

    const projectId = randomUUID();
    const timestamp = new Date().toISOString();
    const run = ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          INSERT INTO projects (id, team_id, code, name, client, stage, status, scope, kickoff, deadline, created_by, closed_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'draft', 'active', ?, ?, ?, ?, NULL, ?, ?)
        `)
        .run(
          projectId,
          team.id,
          input.code,
          input.name,
          input.client,
          input.scope,
          input.kickoff,
          input.deadline,
          user.id,
          timestamp,
          timestamp,
        );
      ctx.db
        .prepare(`
          INSERT INTO project_members (project_id, user_id, role, created_at)
          VALUES (?, ?, 'receiver', ?)
        `)
        .run(projectId, user.id, timestamp);
      createMilestones(ctx.db, projectId, input.kickoff, input.deadline);
      createDefaultSteps(ctx.db, projectId);
      recordEvent(ctx.db, {
        projectId,
        actorId: user.id,
        action: 'project.created',
        detail: `Project "${input.name}" created`,
      });
    });
    run();
    const project = getProjectDetailForUser(ctx.db, projectId, user);
    if (!project) throw new Error('project creation failed');
    res.status(201).json({ project });
  });

  router.get('/:projectId', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    projectAccess(ctx, projectId, user);
    const project = getProjectDetailForUser(ctx.db, projectId, user);
    if (!project) throw notFound('Project not found');
    res.json({ project });
  });

  router.patch('/:projectId', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    assertPermission(access, 'manageProject', 'Only the project owner or a system administrator can edit this project');
    assertWritable(access);
    const input = parseWith(updateProjectSchema, req.body);
    if (input.deadline && input.deadline < access.project.kickoff) {
      throw conflict('Deadline cannot be earlier than the kickoff date', 'invalid_deadline');
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ['name', 'client', 'scope', 'deadline'] as const) {
      if (input[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(input[key]);
      }
    }
    if (!fields.length) {
      const current = getProjectDetailForUser(ctx.db, projectId, user);
      res.json({ project: current });
      return;
    }
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(projectId);
    ctx.db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    recordEvent(ctx.db, {
      projectId,
      actorId: user.id,
      action: 'project.updated',
      detail: 'Project details updated',
    });
    res.json({ project: getProjectDetailForUser(ctx.db, projectId, user) });
  });

  router.get('/:projectId/overview', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    res.json({ overview: buildOverview(ctx.db, access, user) });
  });

  router.post('/:projectId/stage', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    assertPermission(access, 'manageProject', 'Only the acceptance owner or a system administrator can change the project stage');
    const { action } = parseWith(projectStageActionSchema, req.body);
    const project = getProjectById(ctx.db, projectId);
    switch (action) {
      case 'pause':
        pauseProject(ctx.db, project, user.id);
        break;
      case 'resume':
        resumeProject(ctx.db, project, user.id);
        break;
      case 'advance':
        advanceProject(ctx.db, project, user.id);
        break;
      case 'reopen':
        reopenProject(ctx.db, project, user.id);
        break;
    }
    const projectDetail = getProjectDetailForUser(ctx.db, projectId, user);
    res.json({ project: projectDetail });
  });

  router.get('/:projectId/members', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    projectAccess(ctx, projectId, user);
    res.json({ members: listProjectMembers(ctx.db, projectId) });
  });

  router.get('/:projectId/member-candidates', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    assertPermission(access, 'manageMembers', 'Only the acceptance owner or a system administrator can manage members');
    const query = parseWith(userLookupSchema, req.query);
    if (!query.email && !query.q) {
      res.json({ users: [] });
      return;
    }
    const existing = new Set(listProjectMembers(ctx.db, projectId).map((member) => member.userId));
    const users = lookupUsers(ctx.db, { ...query, teamId: access.project.team_id }).filter(
      (candidate) => !existing.has(candidate.id),
    );
    res.json({ users });
  });

  router.post('/:projectId/members', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const access = projectAccess(ctx, projectId, user);
    assertPermission(access, 'manageMembers', 'Only the acceptance owner or a system administrator can manage members');
    assertWritable(access);
    const input = parseWith(addMemberSchema, req.body);
    const target = getUserRecordByEmail(ctx.db, input.email);
    if (!target || target.status !== 'active') throw notFound('No active account found to add');
    if (!getTeamMembership(ctx.db, access.project.team_id, target.id)) {
      throw conflict('This user is not a member of the project team', 'team_member_required');
    }
    const existing = ctx.db
      .prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(projectId, target.id);
    if (existing) throw conflict('This user is already a member of the project', 'member_exists');
    if (input.role !== 'observer') {
      const occupied = ctx.db
        .prepare(`
          SELECT u.name FROM project_members pm
          JOIN users u ON u.id = pm.user_id
          WHERE pm.project_id = ? AND pm.role = ?
        `)
        .get(projectId, input.role) as { name: string } | undefined;
      if (occupied) {
        throw conflict(`The ${ROLE_LABELS[input.role]} role is already held by ${occupied.name}`, 'role_occupied');
      }
    }
    ctx.db
      .prepare(
        'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(projectId, target.id, input.role, new Date().toISOString());
    recordEvent(ctx.db, {
      projectId,
      actorId: user.id,
      action: 'project.member.added',
      detail: `Added ${target.name} as ${ROLE_LABELS[input.role]}`,
    });
    res.status(201).json({ members: listProjectMembers(ctx.db, projectId) });
  });

  router.delete('/:projectId/members/:userId', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    const targetUserId = parseUuid(req.params.userId, 'userId');
    const access = projectAccess(ctx, projectId, user);
    assertPermission(access, 'manageMembers', 'Only the acceptance owner or a system administrator can manage members');
    assertWritable(access);
    const member = ctx.db
      .prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(projectId, targetUserId) as { role: string } | undefined;
    if (!member) throw notFound('Member not found');
    if (member.role === 'receiver' && !access.isAdmin) {
      throw conflict(
        'The acceptance owner cannot remove their own membership; contact a system administrator to transfer the role',
        'receiver_protected',
      );
    }
    const activeSignoff = ctx.db
      .prepare(
        'SELECT 1 FROM signoffs WHERE project_id = ? AND user_id = ? AND voided_at IS NULL',
      )
      .get(projectId, targetUserId);
    if (activeSignoff) throw conflict('This member has an active sign-off and cannot be removed');
    const openRisk = ctx.db
      .prepare(
        "SELECT COUNT(*) AS count FROM risks WHERE project_id = ? AND owner_id = ? AND status <> 'closed'",
      )
      .get(projectId, targetUserId) as { count: number };
    const openCondition = ctx.db
      .prepare(
        "SELECT COUNT(*) AS count FROM conditions WHERE project_id = ? AND owner_id = ? AND status = 'open'",
      )
      .get(projectId, targetUserId) as { count: number };
    if (Number(openRisk.count) > 0 || Number(openCondition.count) > 0) {
      throw conflict('This member still owns open risks or conditions; reassign them first');
    }
    const target = ctx.db.prepare('SELECT name FROM users WHERE id = ?').get(targetUserId) as
      | { name: string }
      | undefined;
    ctx.db
      .prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')
      .run(projectId, targetUserId);
    recordEvent(ctx.db, {
      projectId,
      actorId: user.id,
      action: 'project.member.removed',
      detail: `Removed member ${target?.name ?? ''} (${ROLE_LABELS[member.role] ?? member.role})`,
    });
    res.json({ members: listProjectMembers(ctx.db, projectId) });
  });

  router.get('/:projectId/events', (req, res) => {
    const user = currentUser(req);
    const projectId = parseUuid(req.params.projectId, 'projectId');
    projectAccess(ctx, projectId, user);
    const requested = Number(req.query.limit ?? 30);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 30;
    res.json({ events: listProjectEvents(ctx.db, projectId, limit) });
  });

  return router;
}
