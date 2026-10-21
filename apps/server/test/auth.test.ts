import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createTestContext,
  csrfHeader,
  loginAs,
  milestoneDates,
  sampleTeamId,
  TEST_PASSWORD,
  TEST_USERS,
  type TestContext,
} from './helpers';

describe('authentication and session security', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(() => {
    ctx.close();
  });

  it('serves health anonymously and rejects unauthenticated API access', async () => {
    const anonymous = request(ctx.app);
    const health = await anonymous.get('/api/health').expect(200);
    expect(health.body.status).toBe('ok');
    await anonymous.get('/api/projects').expect(401);
    await anonymous.get('/api/auth/me').expect(401);
  });

  it('logs in by email or username, issues CSRF protection, and logs out cleanly', async () => {
    const anonymous = request(ctx.app);
    await anonymous
      .post('/api/auth/login')
      .send({ identifier: TEST_USERS.receiver, password: 'not-the-password' })
      .expect(401);

    const session = await loginAs(ctx.app, TEST_USERS.receiver);
    expect(session.user.email).toBe(TEST_USERS.receiver);
    expect(session.csrf.length).toBeGreaterThan(20);

    const me = await session.agent.get('/api/auth/me').expect(200);
    expect(me.body.user.name).toBe('Alex Morgan');

    const byUsername = await loginAs(ctx.app, 'Alex Morgan');
    expect(byUsername.user.email).toBe(TEST_USERS.receiver);

    const dates = milestoneDates();
    const payload = {
      teamId: sampleTeamId(ctx.db),
      code: `TL-T-${Date.now()}`,
      name: 'Security Test Project',
      client: '',
      kickoff: dates.kickoff,
      deadline: dates.deadline,
      scope: '',
    };
    await session.agent.post('/api/projects').send(payload).expect(403);
    await session.agent
      .post('/api/projects')
      .set(csrfHeader(session.csrf))
      .send(payload)
      .expect(201);

    await session.agent.post('/api/auth/logout').expect(403);
    await session.agent
      .post('/api/auth/logout')
      .set(csrfHeader(session.csrf))
      .expect(204);
    await session.agent.get('/api/auth/me').expect(401);
  });

  it('rotates the password and invalidates the previous credential', async () => {
    const session = await loginAs(ctx.app, TEST_USERS.delivery);
    const newPassword = 'New-Delivery-Password!2026';
    await session.agent
      .post('/api/auth/password')
      .set(csrfHeader(session.csrf))
      .send({ currentPassword: 'wrong-password', newPassword })
      .expect(401);
    await session.agent
      .post('/api/auth/password')
      .set(csrfHeader(session.csrf))
      .send({ currentPassword: TEST_PASSWORD, newPassword })
      .expect(200);

    const refreshed = await loginAs(ctx.app, TEST_USERS.delivery, newPassword);
    expect(refreshed.user.name).toBe('Jordan Lee');

    await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: TEST_USERS.delivery, password: TEST_PASSWORD })
      .expect(401);
  });
});
