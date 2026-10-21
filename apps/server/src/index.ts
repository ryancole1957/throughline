import 'dotenv/config';

import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { bootstrapDatabase } from './db/bootstrap';
import { SqliteSessionStore } from './db/session-store';
import { createLogger } from './lib/logger';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const db = openDatabase({ filename: config.databasePath });
const sessionStore = new SqliteSessionStore(db, config.sessionTtlDays);

try {
  const bootstrap = await bootstrapDatabase(db, config, logger);
  logger.info(
    { database: config.databasePath, bootstrap, environment: config.nodeEnv },
    'database ready',
  );
} catch (error) {
  logger.fatal({ err: error, database: config.databasePath }, 'database bootstrap failed');
  db.close();
  process.exit(1);
}

const app = createApp({ db, config, logger, sessionStore });
const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(
    { port: config.port, environment: config.nodeEnv, version: config.version },
    'Throughline API listening',
  );
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => {
    logger.error('graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  force.unref();
  server.close(() => {
    sessionStore.close();
    try {
      db.close();
    } catch (error) {
      logger.warn({ err: error }, 'database close failed');
    }
    logger.info('shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  shutdown('uncaughtException');
});
