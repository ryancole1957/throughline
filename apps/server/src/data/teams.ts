import { randomBytes } from 'node:crypto';
import type { TeamMember, TeamRole, TeamSummary } from '@throughline/shared';

import type { AppDatabase } from '../db';

export interface TeamRow {
  id: string;
  name: string;
  join_code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMembershipRow {
  team_id: string;
  user_id: string;
  role: TeamRole;
  created_at: string;
}

interface TeamSummaryRow {
  id: string;
  name: string;
  role: TeamRole;
  createdAt: string;
  memberCount: number;
  projectCount: number;
}

interface TeamMemberRow {
  userId: string;
  name: string;
  email: string;
  title: string;
  role: TeamRole;
  joinedAt: string;
}

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newJoinCode(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, (byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length]).join('');
}

export function generateJoinCode(db: AppDatabase): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = newJoinCode();
    const existing = db
      .prepare('SELECT 1 FROM teams WHERE join_code = ? COLLATE NOCASE')
      .get(code);
    if (!existing) return code;
  }
  throw new Error('could not generate a unique join code');
}

export function getTeamRow(db: AppDatabase, teamId: string): TeamRow | undefined {
  return db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as TeamRow | undefined;
}

export function getTeamByJoinCode(db: AppDatabase, code: string): TeamRow | undefined {
  return db
    .prepare('SELECT * FROM teams WHERE join_code = ? COLLATE NOCASE')
    .get(code) as TeamRow | undefined;
}

export function getTeamMembership(
  db: AppDatabase,
  teamId: string,
  userId: string,
): TeamMembershipRow | undefined {
  return db
    .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
    .get(teamId, userId) as TeamMembershipRow | undefined;
}

export function listTeamMembers(db: AppDatabase, teamId: string): TeamMember[] {
  const rows = db
    .prepare(`
      SELECT tm.user_id AS userId, u.name, u.email, u.title, tm.role, tm.created_at AS joinedAt
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
      ORDER BY CASE tm.role WHEN 'owner' THEN 0 ELSE 1 END, u.name ASC
    `)
    .all(teamId) as TeamMemberRow[];
  return rows;
}

export function countTeamMembers(db: AppDatabase, teamId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM team_members WHERE team_id = ?')
    .get(teamId) as { count: number };
  return Number(row.count);
}

export function listTeamsForUser(db: AppDatabase, userId: string): TeamSummary[] {
  const rows = db
    .prepare(`
      SELECT t.id, t.name, tm.role, t.created_at AS createdAt,
             (SELECT COUNT(*) FROM team_members x WHERE x.team_id = t.id) AS memberCount,
             (SELECT COUNT(*) FROM projects p WHERE p.team_id = t.id) AS projectCount
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
      ORDER BY t.name ASC, t.created_at ASC
    `)
    .all(userId) as TeamSummaryRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    memberCount: Number(row.memberCount),
    projectCount: Number(row.projectCount),
    createdAt: row.createdAt,
  }));
}

export function getTeamSummaryForUser(
  db: AppDatabase,
  teamId: string,
  userId: string,
): TeamSummary | null {
  const row = db
    .prepare(`
      SELECT t.id, t.name, tm.role, t.created_at AS createdAt,
             (SELECT COUNT(*) FROM team_members x WHERE x.team_id = t.id) AS memberCount,
             (SELECT COUNT(*) FROM projects p WHERE p.team_id = t.id) AS projectCount
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
      WHERE t.id = ?
    `)
    .get(userId, teamId) as TeamSummaryRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    memberCount: Number(row.memberCount),
    projectCount: Number(row.projectCount),
    createdAt: row.createdAt,
  };
}
