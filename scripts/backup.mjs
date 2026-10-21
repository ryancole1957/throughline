#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const databasePath = path.resolve(process.env.DATABASE_PATH ?? 'data/throughline.db');
if (!fs.existsSync(databasePath)) {
  console.error(`Database not found: ${databasePath}`);
  process.exit(1);
}

const backupDir = path.resolve(
  process.env.BACKUP_DIR ?? path.join(path.dirname(databasePath), 'backups'),
);
fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(backupDir, `throughline-${timestamp}.db`);
const escaped = destination.replace(/'/g, "''");

const db = new Database(databasePath);
try {
  db.pragma('busy_timeout = 10000');
  db.exec(`VACUUM INTO '${escaped}'`);
  console.log(`Backup written: ${destination}`);
} finally {
  db.close();
}
