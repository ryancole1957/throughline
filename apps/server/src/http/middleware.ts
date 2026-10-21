import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';

import type { AppDatabase } from '../db';
import { ApiError, unauthorized } from '../lib/errors';
import { getUserRecordById } from '../data/users';

export const attachRequestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id')?.trim();
  req.requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};

export function loadUser(db: AppDatabase): RequestHandler {
  return (req, _res, next) => {
    const userId = req.session?.userId;
    if (!userId) return next();
    const user = getUserRecordById(db, userId);
    if (!user || user.status !== 'active') {
      req.session.destroy(() => undefined);
      return next();
    }
    req.user = user;
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw unauthorized();
  next();
};

export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next();
  const path = req.originalUrl.split('?')[0] ?? '';
  if (path === '/api/auth/login' || path === '/api/auth/register') return next();
  const expected = req.session?.csrfToken;
  const provided = req.header('x-csrf-token') ?? '';
  if (!expected || !provided || expected.length !== provided.length) {
    throw new ApiError(403, 'csrf_failed', 'Security check failed; refresh the page and try again');
  }
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
    throw new ApiError(403, 'csrf_failed', 'Security check failed; refresh the page and try again');
  }
  next();
};

export const notFoundApi: RequestHandler = (_req, _res, next) => {
  next(new ApiError(404, 'not_found', 'Resource not found'));
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    if (res.headersSent) return;
    const requestId = req.requestId;
    if (error instanceof ApiError) {
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
          ...(requestId ? { requestId } : {}),
        },
      });
      return;
    }
    if (
      error instanceof SyntaxError &&
      'status' in error &&
      (error as { status?: number }).status === 400
    ) {
      res.status(400).json({
        error: { code: 'invalid_json', message: 'Request body is not valid JSON', requestId },
      });
      return;
    }
    const code = (error as { code?: string })?.code ?? '';
    if (code.startsWith('SQLITE_CONSTRAINT')) {
      res.status(409).json({
        error: {
          code: 'data_conflict',
          message: 'The data conflicts with an existing record or constraint; refresh and try again',
          requestId,
        },
      });
      logger.warn({ err: error, requestId }, 'sqlite constraint violation');
      return;
    }
    logger.error({ err: error, requestId, method: req.method, url: req.originalUrl }, 'unhandled request error');
    res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'An error occurred while processing the request',
        requestId,
      },
    });
  };
}

