import type {
  Milestone,
  ProjectDetail,
  ProjectMember,
  ProjectRole,
  ProjectStage,
  ProjectStats,
  ProjectStatus,
  ProjectSummary,
  SignoffRole,
} from '@throughline/shared';
import { PROJECT_STAGES, SIGNOFF_ROLES } from '@throughline/shared';

import type { AppDatabase } from '../db';
import {
  type AuthUserRecord,
  type MembershipRecord,
  type ProjectAccess,
  type ProjectRecord,
  computePermissions,
} from '../domain/access';
import { getTeamMembership } from './teams';
import { getUserRef } from './users';

interface ProjectSummaryRow {
  id: string;
  teamId: string;
  teamName: string;
  code: string;
  name: string;
  client: string;
  stage: ProjectStage;
  status: ProjectStatus;
  scope: string;
  kickoff: string;
  deadline: string;
  createdAt: string;
  updatedAt: string;
  myRole: ProjectRole | null;
}

interface ProjectMemberRow {
  userId: string;
  name: string;
  email: string;
  title: string;
  role: ProjectRole;
  joinedAt: string;
}

interface MilestoneRow {
  stage: ProjectStage;
  plannedDate: string | null;
  completedAt: string | null;
}

const summarySelect = `
  SELECT p.id, p.team_id AS teamId, t.name AS teamName, p.code, p.name, p.client,
         p.stage, p.status, p.scope, p.kickoff, p.deadline,
         p.created_at AS createdAt, p.updated_at AS updatedAt, pm.role AS myRole
  FROM projects p
  JOIN teams t ON t.id = p.team_id
  LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = @userId
`;

const memberOrder = `
  CASE pm.role
    WHEN 'receiver' THEN 0
    WHEN 'delivery' THEN 1
    WHEN 'core_reviewer' THEN 2
    WHEN 'business_reviewer' THEN 3
    ELSE 4
  END
`;

export function getProjectRow(db: AppDatabase, projectId: string): ProjectRecord | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
    | ProjectRecord
    | undefined;
}

export function getMembership(
  db: AppDatabase,
  projectId: string,
  userId: string,
): MembershipRecord | undefined {
  return db
    .prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(projectId, userId) as MembershipRecord | undefined;
}

export function resolveProjectAccess(
  db: AppDatabase,
  projectId: string,
  user: AuthUserRecord,
): ProjectAccess | null {
  const project = getProjectRow(db, projectId);
  if (!project) return null;
  const membership = getMembership(db, projectId, user.id);
  const teamMembership = getTeamMembership(db, project.team_id, user.id);
  const isAdmin = user.system_role === 'admin';
  if (!isAdmin && !teamMembership) return null;
  const role = membership?.role ?? null;
  return {
    project,
    role,
    teamRole: teamMembership?.role ?? null,
    isAdmin,
    permissions: computePermissions(role, isAdmin),
  };
}

export function listProjectMembers(db: AppDatabase, projectId: string): ProjectMember[] {
  const rows = db
    .prepare(`
      SELECT pm.user_id AS userId, u.name, u.email, u.title, pm.role, pm.created_at AS joinedAt
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
      ORDER BY ${memberOrder}
    `)
    .all(projectId) as ProjectMemberRow[];
  return rows;
}

export function getSignoffMembers(
  db: AppDatabase,
  projectId: string,
): Record<SignoffRole, ProjectMember | null> {
  const members = listProjectMembers(db, projectId);
  const result = {
    delivery: null,
    core_reviewer: null,
    business_reviewer: null,
    receiver: null,
  } as Record<SignoffRole, ProjectMember | null>;
  for (const member of members) {
    if ((SIGNOFF_ROLES as readonly string[]).includes(member.role)) {
      result[member.role as SignoffRole] = member;
    }
  }
  return result;
}

function emptyStats(): ProjectStats {
  return {
    totalItems: 0,
    submittedItems: 0,
    settledItems: 0,
    highRisks: 0,
    openConditions: 0,
    e2ePassed: 0,
    e2eTotal: 0,
    members: 0,
  };
}

export function getProjectStatsMap(
  db: AppDatabase,
  projectIds: string[],
): Map<string, ProjectStats> {
  const result = new Map<string, ProjectStats>();
  if (!projectIds.length) return result;
  const placeholders = projectIds.map(() => '?').join(', ');
  for (const id of projectIds) result.set(id, emptyStats());

  const itemRows = db
    .prepare(`
      SELECT project_id AS projectId, COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN supply_status = 'submitted' THEN 1 ELSE 0 END), 0) AS submitted,
             COALESCE(SUM(CASE WHEN acceptance_status IN ('passed', 'conditional') THEN 1 ELSE 0 END), 0) AS settled
      FROM items WHERE project_id IN (${placeholders}) GROUP BY project_id
    `)
    .all(...projectIds) as Array<{
    projectId: string;
    total: number;
    submitted: number;
    settled: number;
  }>;
  for (const row of itemRows) {
    const stats = result.get(row.projectId);
    if (stats) {
      stats.totalItems = Number(row.total);
      stats.submittedItems = Number(row.submitted);
      stats.settledItems = Number(row.settled);
    }
  }

  const riskRows = db
    .prepare(`
      SELECT project_id AS projectId, COUNT(*) AS count
      FROM risks
      WHERE project_id IN (${placeholders})
        AND severity = 'high' AND status NOT IN ('closed', 'mitigated')
      GROUP BY project_id
    `)
    .all(...projectIds) as Array<{ projectId: string; count: number }>;
  for (const row of riskRows) {
    const stats = result.get(row.projectId);
    if (stats) stats.highRisks = Number(row.count);
  }

  const conditionRows = db
    .prepare(`
      SELECT project_id AS projectId, COUNT(*) AS count
      FROM conditions WHERE project_id IN (${placeholders}) AND status = 'open'
      GROUP BY project_id
    `)
    .all(...projectIds) as Array<{ projectId: string; count: number }>;
  for (const row of conditionRows) {
    const stats = result.get(row.projectId);
    if (stats) stats.openConditions = Number(row.count);
  }

  const stepRows = db
    .prepare(`
      SELECT project_id AS projectId, COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END), 0) AS passed
      FROM e2e_steps WHERE project_id IN (${placeholders}) GROUP BY project_id
    `)
    .all(...projectIds) as Array<{ projectId: string; total: number; passed: number }>;
  for (const row of stepRows) {
    const stats = result.get(row.projectId);
    if (stats) {
      stats.e2eTotal = Number(row.total);
      stats.e2ePassed = Number(row.passed);
    }
  }

  const memberRows = db
    .prepare(`
      SELECT project_id AS projectId, COUNT(*) AS count
      FROM project_members WHERE project_id IN (${placeholders}) GROUP BY project_id
    `)
    .all(...projectIds) as Array<{ projectId: string; count: number }>;
  for (const row of memberRows) {
    const stats = result.get(row.projectId);
    if (stats) stats.members = Number(row.count);
  }

  return result;
}

export function getProjectStats(db: AppDatabase, projectId: string): ProjectStats {
  return getProjectStatsMap(db, [projectId]).get(projectId) ?? emptyStats();
}

function mapSummary(
  row: ProjectSummaryRow,
  isAdmin: boolean,
  stats: ProjectStats,
): ProjectSummary {
  return {
    id: row.id,
    teamId: row.teamId,
    teamName: row.teamName,
    code: row.code,
    name: row.name,
    client: row.client,
    stage: row.stage,
    status: row.status,
    scope: row.scope,
    kickoff: row.kickoff,
    deadline: row.deadline,
    myRole: row.myRole,
    isAdmin,
    stats,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listProjectSummaries(
  db: AppDatabase,
  user: AuthUserRecord,
): ProjectSummary[] {
  const isAdmin = user.system_role === 'admin';
  const rows = db
    .prepare(`
      ${summarySelect}
      WHERE (
        @isAdmin = 1
        OR EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = p.team_id AND tm.user_id = @userId
        )
      )
      ORDER BY t.name ASC, CASE p.stage WHEN 'closed' THEN 1 ELSE 0 END, p.deadline ASC, p.name ASC
    `)
    .all({ userId: user.id, isAdmin: isAdmin ? 1 : 0 }) as ProjectSummaryRow[];
  const stats = getProjectStatsMap(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => mapSummary(row, isAdmin, stats.get(row.id) ?? emptyStats()));
}

export function getProjectSummary(db: AppDatabase, access: ProjectAccess): ProjectSummary {
  const row = db
    .prepare(`
      SELECT p.id, p.team_id AS teamId, t.name AS teamName, p.code, p.name, p.client,
             p.stage, p.status, p.scope, p.kickoff, p.deadline,
             p.created_at AS createdAt, p.updated_at AS updatedAt, NULL AS myRole
      FROM projects p
      JOIN teams t ON t.id = p.team_id
      WHERE p.id = ?
    `)
    .get(access.project.id) as ProjectSummaryRow | undefined;
  if (!row) throw new Error('project summary not found');
  return mapSummary({ ...row, myRole: access.role }, access.isAdmin, getProjectStats(db, access.project.id));
}

export function listProjectSummariesForTeam(
  db: AppDatabase,
  user: AuthUserRecord,
  teamId: string,
): ProjectSummary[] {
  return listProjectSummaries(db, user).filter((project) => project.teamId === teamId);
}

function listMilestones(db: AppDatabase, projectId: string): Milestone[] {
  const rows = db
    .prepare(`
      SELECT stage, planned_date AS plannedDate, completed_at AS completedAt
      FROM project_milestones WHERE project_id = ?
    `)
    .all(projectId) as MilestoneRow[];
  const byStage = new Map(rows.map((row) => [row.stage, row]));
  return PROJECT_STAGES.map((stage) => {
    const row = byStage.get(stage);
    return {
      stage,
      plannedDate: row?.plannedDate ?? null,
      completedAt: row?.completedAt ?? null,
    };
  });
}

export function getProjectDetail(db: AppDatabase, access: ProjectAccess): ProjectDetail {
  const summary = getProjectSummary(db, access);
  const createdBy = getUserRef(db, access.project.created_by);
  if (!createdBy) throw new Error('project creator missing');
  return {
    ...summary,
    myRole: access.role,
    isAdmin: access.isAdmin,
    permissions: access.permissions,
    members: listProjectMembers(db, access.project.id),
    milestones: listMilestones(db, access.project.id),
    createdBy,
  };
}

export function getProjectDetailForUser(
  db: AppDatabase,
  projectId: string,
  user: AuthUserRecord,
): ProjectDetail | null {
  const access = resolveProjectAccess(db, projectId, user);
  if (!access) return null;
  return getProjectDetail(db, access);
}

