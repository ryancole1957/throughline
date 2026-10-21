import type { Logger } from 'pino';

import type { AppConfig } from '../config';
import { hashPassword } from '../lib/password';
import { nowIso } from '../lib/time';
import type { AppDatabase } from './index';
import { migrate } from './migrate';

export interface BootstrapResult {
  seeded: boolean;
  mode: 'existing' | 'admin';
}

export async function bootstrapDatabase(
  db: AppDatabase,
  config: AppConfig,
  logger?: Logger,
): Promise<BootstrapResult> {
  migrate(db, logger);
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (count.count > 0) return { seeded: false, mode: 'existing' };

  if (!config.bootstrapAdmin) {
    throw new Error(
      'Database is empty. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create the first administrator.',
    );
  }

  const { name, email, password } = config.bootstrapAdmin;
  if (password.length < 6) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 6 characters');
  }
  if (password.length < 12) {
    logger?.warn(
      { email },
      'bootstrap administrator uses a short password; change it after the first sign-in',
    );
  }

  const passwordHash = await hashPassword(password);
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO users (id, email, name, title, password_hash, system_role, status, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, '', ?, 'admin', 'active', ?, ?, NULL)
  `).run(crypto.randomUUID(), email.toLowerCase(), name, passwordHash, createdAt, createdAt);

  logger?.info({ email }, 'bootstrap administrator created');
  return { seeded: true, mode: 'admin' };
}
