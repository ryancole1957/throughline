import 'express-session';

import type { AuthUserRecord } from '../domain/access';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserRecord;
      requestId: string;
    }
  }
}

export {};
