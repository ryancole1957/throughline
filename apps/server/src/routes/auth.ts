import { randomBytes, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthUser, SessionInfo } from '@throughline/shared';

import type { AppContext } from '../context';
import type { AuthUserRecord } from '../domain/access';
import { getTeamByJoinCode } from '../data/teams';
import { getUserRecordByEmail, getUserRecordByLogin, getUserRecordById } from '../data/users';
import { ApiError, forbidden, unauthorized, unprocessable } from '../lib/errors';
import {
  hashPassword,
  verifyPassword,
  verifyPasswordAgainstDummy,
} from '../lib/password';
import { parseWith } from '../lib/validate';
import { changePasswordSchema, loginSchema, registerSchema } from '@throughline/shared';
import { currentUser } from '../http/access';

function toAuthUser(user: AuthUserRecord): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    title: user.title,
    systemRole: user.system_role,
    createdAt: user.created_at,
  };
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

function sessionInfo(user: AuthUserRecord, csrfToken: string): SessionInfo {
  return { user: toAuthUser(user), csrfToken };
}

async function establishSession(
  req: Request,
  ctx: AppContext,
  record: AuthUserRecord,
): Promise<SessionInfo> {
  const csrfToken = randomBytes(32).toString('base64url');
  await regenerateSession(req);
  req.session.userId = record.id;
  req.session.csrfToken = csrfToken;
  await saveSession(req);

  const timestamp = new Date().toISOString();
  ctx.db
    .prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?')
    .run(timestamp, timestamp, record.id);
  const fresh = getUserRecordById(ctx.db, record.id) ?? record;
  req.user = fresh;
  return sessionInfo(fresh, csrfToken);
}

export function authRouter(ctx: AppContext): Router {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many sign-in attempts. Try again in 15 minutes.',
          requestId: req.requestId,
        },
      });
    },
  });

  const registerLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many registration attempts. Try again in 15 minutes.',
          requestId: req.requestId,
        },
      });
    },
  });

  const loginPipeline = ctx.config.rateLimitEnabled ? [loginLimiter] : [];
  const registerPipeline = ctx.config.rateLimitEnabled ? [registerLimiter] : [];

  router.post('/register', ...registerPipeline, async (req, res) => {
    if (!ctx.config.allowRegistration) {
      throw forbidden('Self-registration is disabled for this deployment', 'registration_disabled');
    }
    const input = parseWith(registerSchema, req.body, 'Registration details are incomplete');
    if (getUserRecordByEmail(ctx.db, input.email)) {
      throw new ApiError(409, 'email_exists', 'An account with this email already exists', {
        email: 'An account with this email already exists',
      });
    }
    const team = input.inviteCode ? getTeamByJoinCode(ctx.db, input.inviteCode) : undefined;
    if (input.inviteCode && !team) {
      throw unprocessable('Invite code is invalid', { inviteCode: 'Invite code is invalid' });
    }

    const passwordHash = await hashPassword(input.password);
    const userId = randomUUID();
    const timestamp = new Date().toISOString();
    const run = ctx.db.transaction(() => {
      ctx.db
        .prepare(`
          INSERT INTO users (id, email, name, title, password_hash, system_role, status, created_at, updated_at, last_login_at)
          VALUES (?, ?, ?, ?, ?, 'member', 'active', ?, ?, NULL)
        `)
        .run(userId, input.email, input.name, input.title, passwordHash, timestamp, timestamp);
      if (team) {
        ctx.db
          .prepare(`
            INSERT INTO team_members (team_id, user_id, role, created_at)
            VALUES (?, ?, 'member', ?)
          `)
          .run(team.id, userId, timestamp);
      }
    });
    run();

    const record = getUserRecordById(ctx.db, userId);
    if (!record) throw new Error('registration failed');
    const session = await establishSession(req, ctx, record);
    ctx.logger.info({ userId, requestId: req.requestId }, 'account registered');
    res.status(201).json(session);
  });

  router.post('/login', ...loginPipeline, async (req, res) => {
    const input = parseWith(loginSchema, req.body, 'Sign-in details are incomplete');
    const record = getUserRecordByLogin(ctx.db, input.identifier);
    let valid = false;
    if (record && record.status === 'active') {
      valid = await verifyPassword(input.password, record.password_hash);
    } else {
      await verifyPasswordAgainstDummy(input.password);
    }
    if (!record || record.status !== 'active' || !valid) {
      ctx.logger.warn(
        { identifier: input.identifier, ip: req.ip, requestId: req.requestId },
        'failed login attempt',
      );
      throw unauthorized('Invalid email, username, or password', 'invalid_credentials');
    }

    const session = await establishSession(req, ctx, record);
    ctx.logger.info({ userId: record.id, requestId: req.requestId }, 'user signed in');
    res.json(session);
  });

  router.get('/me', (req, res) => {
    if (!req.user) throw unauthorized();
    if (!req.session.csrfToken) {
      req.session.csrfToken = randomBytes(32).toString('base64url');
      req.session.save(() => undefined);
    }
    res.json(sessionInfo(req.user, req.session.csrfToken));
  });

  router.post('/logout', (req, res) => {
    currentUser(req);
    const cookieName = ctx.config.sessionCookieName;
    destroySession(req)
      .catch((error) => ctx.logger.warn({ err: error }, 'session destroy failed'))
      .finally(() => {
        res.clearCookie(cookieName, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: ctx.config.isProduction,
        });
        res.status(204).end();
      });
  });

  router.post('/password', async (req, res) => {
    const user = currentUser(req);
    const input = parseWith(changePasswordSchema, req.body);
    const valid = await verifyPassword(input.currentPassword, user.password_hash);
    if (!valid) {
      throw unauthorized('Current password is incorrect', 'invalid_password');
    }
    const newHash = await hashPassword(input.newPassword);
    ctx.db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(newHash, new Date().toISOString(), user.id);
    ctx.sessionStore.clearAllForUser(user.id, req.sessionID);
    ctx.logger.info({ userId: user.id, requestId: req.requestId }, 'password changed');
    res.json({ ok: true });
  });

  return router;
}
