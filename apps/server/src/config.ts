import path from 'node:path';

export interface AppConfig {
  version: string;
  nodeEnv: string;
  isProduction: boolean;
  isTest: boolean;
  port: number;
  databasePath: string;
  webDistPath: string;
  sessionSecret: string;
  sessionTtlDays: number;
  sessionCookieName: string;
  trustProxy: boolean;
  logLevel: string;
  rateLimitEnabled: boolean;
  allowRegistration: boolean;
  bootstrapAdmin: {
    name: string;
    email: string;
    password: string;
  } | null;
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';
  const rawSecret = env.SESSION_SECRET?.trim();
  const devSecret = 'development-only-session-secret-do-not-use-in-production';

  if (isProduction && (!rawSecret || rawSecret.length < 32)) {
    throw new Error('SESSION_SECRET is required in production and must be at least 32 characters');
  }

  const bootstrapName = env.BOOTSTRAP_ADMIN_NAME?.trim() ?? '';
  const bootstrapEmail = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ?? '';
  const bootstrapPassword = env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
  const bootstrapAdmin =
    bootstrapEmail && bootstrapPassword
      ? { name: bootstrapName || 'Administrator', email: bootstrapEmail, password: bootstrapPassword }
      : null;

  return {
    version: env.APP_VERSION?.trim() || '3.4.0',
    nodeEnv,
    isProduction,
    isTest,
    port: parsePositiveInt(env.PORT, 4000, 'PORT'),
    databasePath:
      env.DATABASE_PATH?.trim() || path.resolve(process.cwd(), 'data', 'throughline.db'),
    webDistPath: path.resolve(env.WEB_DIST_PATH?.trim() || 'apps/web/dist'),
    sessionSecret: rawSecret || devSecret,
    sessionTtlDays: parsePositiveInt(env.SESSION_TTL_DAYS, 7, 'SESSION_TTL_DAYS'),
    sessionCookieName: isProduction ? '__Host-tl.sid' : 'tl.sid',
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    logLevel: env.LOG_LEVEL?.trim() || (isTest ? 'silent' : 'info'),
    rateLimitEnabled: !isTest,
    allowRegistration: env.ALLOW_REGISTRATION !== 'false',
    bootstrapAdmin,
  };
}
