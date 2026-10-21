import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { AdminUser } from '@throughline/shared';
import { createUserSchema, updateUserSchema } from '@throughline/shared';

import type { AppContext } from '../context';
import { getUserRecordByEmail, getUserRecordById, listAdminUsers } from '../data/users';
import { currentUser } from '../http/access';
import { requireAuth } from '../http/middleware';
import { conflict, forbidden, notFound } from '../lib/errors';
import { hashPassword } from '../lib/password';
import { parseWith, parseUuid } from '../lib/validate';

function adminUser(db: AppContext['db'], id: string): AdminUser {
  const user = listAdminUsers(db).find((item) => item.id === id);
  if (!user) throw notFound('User not found');
  return user;
}

export function usersRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);
  router.use((req, _res, next) => {
    if (currentUser(req).system_role !== 'admin') throw forbidden('Only system administrators can manage users');
    next();
  });

  router.get('/', (_req, res) => {
    res.json({ users: listAdminUsers(ctx.db) });
  });

  router.post('/', async (req, res) => {
    const input = parseWith(createUserSchema, req.body);
    if (getUserRecordByEmail(ctx.db, input.email)) {
      throw conflict('This email address is already in use', 'email_exists');
    }
    const passwordHash = await hashPassword(input.password);
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    ctx.db
      .prepare(`
        INSERT INTO users (id, email, name, title, password_hash, system_role, status, created_at, updated_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
      `)
      .run(id, input.email, input.name, input.title, passwordHash, input.systemRole, timestamp, timestamp);
    ctx.logger.info(
      { actorId: currentUser(req).id, userId: id, email: input.email },
      'user account created',
    );
    res.status(201).json({ user: adminUser(ctx.db, id) });
  });

  router.patch('/:userId', async (req, res) => {
    const actor = currentUser(req);
    const userId = parseUuid(req.params.userId, 'userId');
    const target = getUserRecordById(ctx.db, userId);
    if (!target) throw notFound('User not found');
    const input = parseWith(updateUserSchema, req.body);

    if (actor.id === userId && input.status === 'disabled') {
      throw conflict('You cannot disable your own account');
    }
    const willNoLongerBeActiveAdmin =
      target.system_role === 'admin' &&
      target.status === 'active' &&
      ((input.systemRole !== undefined && input.systemRole !== 'admin') ||
        (input.status !== undefined && input.status !== 'active'));
    if (willNoLongerBeActiveAdmin) {
      const others = ctx.db
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE system_role = 'admin' AND status = 'active' AND id <> ?",
        )
        .get(userId) as { count: number };
      if (Number(others.count) === 0) {
        throw conflict('At least one active administrator must remain');
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.title !== undefined) {
      updates.push('title = ?');
      values.push(input.title);
    }
    if (input.systemRole !== undefined) {
      updates.push('system_role = ?');
      values.push(input.systemRole);
    }
    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
    }
    if (input.password) {
      updates.push('password_hash = ?');
      values.push(await hashPassword(input.password));
    }
    if (!updates.length) {
      res.json({ user: adminUser(ctx.db, userId) });
      return;
    }
    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(userId);
    ctx.db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    if (input.status === 'disabled' || input.password) {
      ctx.sessionStore.clearAllForUser(
        userId,
        actor.id === userId ? req.sessionID : undefined,
      );
    }
    ctx.logger.info(
      { actorId: actor.id, userId, fields: Object.keys(input) },
      'user account updated',
    );
    res.json({ user: adminUser(ctx.db, userId) });
  });

  return router;
}
