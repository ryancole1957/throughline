import type { AdminUser, AuthUser, UserRef } from '@throughline/shared';

import type { AuthUserRecord } from '../domain/access';
import type { AppDatabase } from '../db';

interface UserRefRow {
  id: string;
  name: string;
  email: string;
  title: string;
}

interface AuthUserRow extends UserRefRow {
  systemRole: string;
  createdAt: string;
}

export function mapUserRef(row: UserRefRow): UserRef {
  return { id: row.id, name: row.name, email: row.email, title: row.title };
}

export function mapAuthUser(row: AuthUserRow): AuthUser {
  return {
    ...mapUserRef(row),
    systemRole: row.systemRole as AuthUser['systemRole'],
    createdAt: row.createdAt,
  };
}

const userRefColumns = 'u.id, u.name, u.email, u.title';

export function getUserRecordById(db: AppDatabase, id: string): AuthUserRecord | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as AuthUserRecord | undefined;
}

export function getUserRecordByEmail(db: AppDatabase, email: string): AuthUserRecord | undefined {
  return db
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .get(email) as AuthUserRecord | undefined;
}

export function getUserRecordByLogin(
  db: AppDatabase,
  identifier: string,
): AuthUserRecord | undefined {
  return db
    .prepare(`
      SELECT * FROM users
      WHERE email = ? COLLATE NOCASE OR name = ? COLLATE NOCASE
      ORDER BY CASE WHEN email = ? COLLATE NOCASE THEN 0 ELSE 1 END
      LIMIT 1
    `)
    .get(identifier, identifier, identifier) as AuthUserRecord | undefined;
}

export function getUserRef(db: AppDatabase, id: string): UserRef | undefined {
  const row = db
    .prepare(`SELECT ${userRefColumns} FROM users u WHERE u.id = ?`)
    .get(id) as UserRefRow | undefined;
  return row ? mapUserRef(row) : undefined;
}

export function listAdminUsers(db: AppDatabase): AdminUser[] {
  const rows = db
    .prepare(`
      SELECT u.id, u.name, u.email, u.title, u.system_role AS systemRole,
             u.status, u.last_login_at AS lastLoginAt, u.created_at AS createdAt,
             (SELECT COUNT(*) FROM project_members pm WHERE pm.user_id = u.id) AS projectCount
      FROM users u
      ORDER BY CASE u.system_role WHEN 'admin' THEN 0 ELSE 1 END, u.created_at ASC
    `)
    .all() as Array<
    UserRefRow & {
      systemRole: string;
      status: string;
      lastLoginAt: string | null;
      createdAt: string;
      projectCount: number;
    }
  >;
  return rows.map((row) => ({
    ...mapUserRef(row),
    systemRole: row.systemRole as AdminUser['systemRole'],
    status: row.status as AdminUser['status'],
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    projectCount: Number(row.projectCount),
  }));
}

export function lookupUsers(
  db: AppDatabase,
  options: { email?: string; q?: string; teamId: string },
): UserRef[] {
  if (options.email) {
    const row = db
      .prepare(`
        SELECT ${userRefColumns} FROM users u
        JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = ?
        WHERE u.email = ? COLLATE NOCASE AND u.status = 'active'
      `)
      .get(options.teamId, options.email) as UserRefRow | undefined;
    return row ? [mapUserRef(row)] : [];
  }
  const term = `%${(options.q ?? '').replace(/[\\%_]/g, '\\$&')}%`;
  const rows = db
    .prepare(`
      SELECT ${userRefColumns} FROM users u
      JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = ?
      WHERE u.status = 'active'
        AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
      ORDER BY u.name ASC
      LIMIT 12
    `)
    .all(options.teamId, term, term) as UserRefRow[];
  return rows.map(mapUserRef);
}
