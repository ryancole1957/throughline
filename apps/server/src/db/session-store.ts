import session from 'express-session';

import type { AppDatabase } from './index';

type Callback = (error?: unknown, session?: session.SessionData | null) => void;

interface SessionRow {
  data: string;
  expires: number;
}

/**
 * Session store backed by the same SQLite database. Keeping sessions in the
 * database means restarts and rolling deploys do not sign users out.
 */
export class SqliteSessionStore extends session.Store {
  private readonly db: AppDatabase;
  private readonly ttlMs: number;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(db: AppDatabase, ttlDays: number) {
    super();
    this.db = db;
    this.ttlMs = ttlDays * 86_400_000;
    this.cleanupTimer = setInterval(() => this.prune(), 15 * 60_000);
    this.cleanupTimer.unref();
  }

  override get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void): void {
    try {
      const row = this.db
        .prepare('SELECT data, expires FROM sessions WHERE sid = ?')
        .get(sid) as SessionRow | undefined;
      if (!row) return callback(null, null);
      if (row.expires <= Date.now()) {
        this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.data) as session.SessionData);
    } catch (error) {
      return callback(error);
    }
  }

  override set(
    sid: string,
    sess: session.SessionData,
    callback?: (err?: unknown) => void,
  ): void {
    try {
      const expires = sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + this.ttlMs;
      this.db
        .prepare(
          `INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?)
           ON CONFLICT (sid) DO UPDATE SET expires = excluded.expires, data = excluded.data`,
        )
        .run(sid, expires, JSON.stringify(sess));
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  override touch(sid: string, sess: session.SessionData, callback?: () => void): void {
    try {
      const expires = sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + this.ttlMs;
      this.db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').run(expires, sid);
      callback?.();
    } catch {
      callback?.();
    }
  }

  clearAllForUser(userId: string, exceptSid?: string): void {
    const rows = this.db.prepare('SELECT sid, data FROM sessions').all() as Array<{
      sid: string;
      data: string;
    }>;
    const remove = this.db.prepare('DELETE FROM sessions WHERE sid = ?');
    const run = this.db.transaction(() => {
      for (const row of rows) {
        if (exceptSid && row.sid === exceptSid) continue;
        try {
          const data = JSON.parse(row.data) as session.SessionData;
          if (data.userId === userId) remove.run(row.sid);
        } catch {
          // Corrupt session payloads are pruned by the next cleanup pass.
        }
      }
    });
    run();
  }

  close(): void {
    clearInterval(this.cleanupTimer);
  }

  private prune(): void {
    try {
      this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
    } catch {
      // Losing a cleanup pass is harmless; the next request still checks expiry.
    }
  }
}

export type { Callback };
