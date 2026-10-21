import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import session from 'express-session';

import type { AppContext } from './context';
import {
  attachRequestId,
  csrfProtection,
  errorHandler,
  loadUser,
  notFoundApi,
} from './http/middleware';
import { assetsRouter } from './routes/assets';
import { authRouter } from './routes/auth';
import { chainsRouter } from './routes/chains';
import { itemsRouter } from './routes/items';
import { projectsRouter } from './routes/projects';
import { reportRouter } from './routes/report';
import { risksRouter } from './routes/risks';
import { teamsRouter } from './routes/teams';
import { usersRouter } from './routes/users';
import { verificationRouter } from './routes/verification';

export function createApp(context: AppContext): express.Express {
  const { config, sessionStore, logger } = context;
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(attachRequestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(compression());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
        },
      },
      hsts: config.isProduction
        ? { maxAge: 15_552_000, includeSubDomains: true }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: config.version, uptime: Math.round(process.uptime()) });
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 900,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many requests; please try again later',
          requestId: req.requestId,
        },
      });
    },
  });
  if (config.rateLimitEnabled) app.use('/api', apiLimiter);

  app.use(
    session({
      name: config.sessionCookieName,
      secret: config.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        maxAge: config.sessionTtlDays * 86_400_000,
        path: '/',
      },
    }),
  );
  app.use(loadUser(context.db));
  app.use(csrfProtection);

  app.use('/api/auth', authRouter(context));
  app.use('/api/users', usersRouter(context));
  app.use('/api/teams', teamsRouter(context));
  app.use('/api/projects', projectsRouter(context));
  app.use('/api', itemsRouter(context));
  app.use('/api', risksRouter(context));
  app.use('/api', assetsRouter(context));
  app.use('/api', verificationRouter(context));
  app.use('/api', chainsRouter(context));
  app.use('/api', reportRouter(context));
  app.use('/api', notFoundApi);

  const indexFile = path.join(config.webDistPath, 'index.html');
  const hasFrontend = fs.existsSync(indexFile);
  if (hasFrontend) {
    app.use(
      express.static(config.webDistPath, {
        index: false,
        maxAge: 0,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api/')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexFile);
    });
  } else {
    logger.warn(
      { webDistPath: config.webDistPath },
      'frontend build not found; API-only mode (run npm run build to serve the SPA)',
    );
    app.get('/', (_req, res) => {
      res
        .status(503)
        .type('text/plain')
        .send('Throughline API is running. Build the web app with `npm run build`.');
    });
  }

  app.use(errorHandler(logger));
  return app;
}
