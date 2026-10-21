import type { Logger } from 'pino';

import type { AppDatabase } from './index';
import { migrations } from './migrations';

export function migrate(db: AppDatabase, logger?: Logger): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all() as Array<{ version: number }>;
  const applied = new Set(appliedRows.map((row) => row.version));
  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  let count = 0;
  for (const migration of sorted) {
    if (applied.has(migration.version)) continue;
    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      ).run(migration.version, migration.name, new Date().toISOString());
      db.pragma(`user_version = ${migration.version}`);
    });
    run();
    logger?.info({ version: migration.version, name: migration.name }, 'database migration applied');
    count += 1;
  }
  return count;
}
