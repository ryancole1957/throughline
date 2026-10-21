import type { Logger } from 'pino';

import type { AppConfig } from './config';
import type { AppDatabase } from './db';
import type { SqliteSessionStore } from './db/session-store';

export interface AppContext {
  db: AppDatabase;
  config: AppConfig;
  logger: Logger;
  sessionStore: SqliteSessionStore;
}
