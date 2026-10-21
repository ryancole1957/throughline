import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { openDatabase, type AppDatabase } from '../src/db';
import { migrate } from '../src/db/migrate';
import { SqliteSessionStore } from '../src/db/session-store';
import { createLogger } from '../src/lib/logger';
import { seedSampleDataset } from './fixtures/sample-dataset';

export const TEST_PASSWORD = 'Test-Password!2026';
export const TEST_USERS = {
  receiver: 'alex@example.com',
  delivery: 'jordan@example.com',
  core: 'priya@example.com',
  business: 'sofia@example.com',
  admin: 'admin@example.com',
};

export interface TestContext {
  app: Express;
  db: AppDatabase;
  sessionStore: SqliteSessionStore;
  close: () => void;
}

export interface LoggedInAgent {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  user: { id: string; email: string; name: string; systemRole: string };
}

export async function createTestContext(): Promise<TestContext> {
  const db = openDatabase({ filename: ':memory:' });
  migrate(db);
  await seedSampleDataset(db, { password: TEST_PASSWORD });
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    SESSION_SECRET: 'test-session-secret-that-is-long-enough',
    LOG_LEVEL: 'silent',
  });
  const logger = createLogger('silent');
  const sessionStore = new SqliteSessionStore(db, 1);
  const app = createApp({ db, config, logger, sessionStore });
  return {
    app,
    db,
    sessionStore,
    close: () => {
      sessionStore.close();
      db.close();
    },
  };
}

export async function loginAs(
  app: Express,
  identifier: string,
  password = TEST_PASSWORD,
): Promise<LoggedInAgent> {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/auth/login')
    .send({ identifier, password })
    .expect(200);
  return {
    agent,
    csrf: response.body.csrfToken as string,
    user: response.body.user as LoggedInAgent['user'],
  };
}

export function csrfHeader(csrf: string): Record<string, string> {
  return { 'X-CSRF-Token': csrf };
}

export function sampleProjectId(db: AppDatabase): string {
  const row = db.prepare("SELECT id FROM projects WHERE code = 'TL-2026-007'").get() as
    | { id: string }
    | undefined;
  if (!row) throw new Error('sample project missing');
  return row.id;
}

export function sampleTeamId(db: AppDatabase): string {
  const row = db.prepare("SELECT id FROM teams WHERE join_code = 'ATLAS2026'").get() as
    | { id: string }
    | undefined;
  if (!row) throw new Error('sample team missing');
  return row.id;
}

export function itemIdByCode(db: AppDatabase, code: string): string {
  const row = db.prepare('SELECT id FROM items WHERE code = ?').get(code) as
    | { id: string }
    | undefined;
  if (!row) throw new Error(`item ${code} missing`);
  return row.id;
}

export function riskIdByCode(db: AppDatabase, code: string): string {
  const row = db.prepare('SELECT id FROM risks WHERE code = ?').get(code) as
    | { id: string }
    | undefined;
  if (!row) throw new Error(`risk ${code} missing`);
  return row.id;
}

export function milestoneDates(): { kickoff: string; deadline: string } {
  const today = new Date();
  const kickoff = new Date(today);
  kickoff.setDate(today.getDate() - 1);
  const deadline = new Date(today);
  deadline.setDate(today.getDate() + 20);
  const format = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { kickoff: format(kickoff), deadline: format(deadline) };
}
