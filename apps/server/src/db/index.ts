import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type AppDatabase = Database.Database;

export interface OpenDatabaseOptions {
  filename: string;
  readonly?: boolean;
}

export function openDatabase({ filename, readonly = false }: OpenDatabaseOptions): AppDatabase {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new Database(filename, { readonly });
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  if (!readonly) db.pragma('journal_mode = WAL');
  return db;
}
