import { afterEach, describe, expect, it } from 'vitest';

import {
  createTestContext,
  csrfHeader,
  loginAs,
  riskIdByCode,
  sampleProjectId,
  TEST_USERS,
  type LoggedInAgent,
  type TestContext,
} from './helpers';

interface Setup {
  ctx: TestContext;
  projectId: string;
  receiver: LoggedInAgent;
  delivery: LoggedInAgent;
  core: LoggedInAgent;
  business: LoggedInAgent;
  admin: LoggedInAgent;
}

async function setup(): Promise<Setup> {
  const ctx = await createTestContext();
  return {
    ctx,
    projectId: sampleProjectId(ctx.db),
    receiver: await loginAs(ctx.app, TEST_USERS.receiver),
    delivery: await loginAs(ctx.app, TEST_USERS.delivery),
    core: await loginAs(ctx.app, TEST_USERS.core),
    business: await loginAs(ctx.app, TEST_USERS.business),
    admin: await loginAs(ctx.app, TEST_USERS.admin),
  };
}

describe('risk, asset, verification, and account governance', () => {
  let active: Setup | null = null;

  afterEach(() => {
    active?.ctx.close();
    active = null;
  });

  it('runs the risk lifecycle with owner and manager authority checks', async () => {
    active = await setup();
    const { ctx, receiver, core, business } = active;
    const riskId = riskIdByCode(ctx.db, 'R-01');

    await business.agent
      .post(`/api/risks/${riskId}/transition`)
      .set(csrfHeader(business.csrf))
      .send({ action: 'mitigate', note: 'Unauthorized' })
      .expect(403);

    await core.agent
      .post(`/api/risks/${riskId}/transition`)
      .set(csrfHeader(core.csrf))
      .send({ action: 'mitigate', note: 'Reconciliation script now covers the full month.' })
      .expect(200);

    const closed = await receiver.agent
      .post(`/api/risks/${riskId}/transition`)
      .set(csrfHeader(receiver.csrf))
      .send({ action: 'close', note: 'Verified with no remaining mismatch.' })
      .expect(200);
    expect(closed.body.risk.status).toBe('closed');

    const escalatedRiskId = riskIdByCode(ctx.db, 'R-02');
    await business.agent
      .post(`/api/risks/${escalatedRiskId}/transition`)
      .set(csrfHeader(business.csrf))
      .send({ action: 'approve', note: 'Unauthorized approval' })
      .expect(403);

    const approved = await receiver.agent
      .post(`/api/risks/${escalatedRiskId}/transition`)
      .set(csrfHeader(receiver.csrf))
      .send({
        action: 'approve',
        note: 'The customer accepted a written deferral; tracked under C-01.',
      })
      .expect(200);
    expect(approved.body.risk.status).toBe('closed');
    expect(approved.body.risk.exceptionNote).toContain('written deferral');
    const openHigh = ctx.db
      .prepare(
        "SELECT COUNT(*) AS count FROM risks WHERE project_id = ? AND severity = 'high' AND status NOT IN ('closed', 'mitigated')",
      )
      .get(active.projectId) as { count: number };
    expect(Number(openHigh.count)).toBe(1);
  });

  it('records E2E results and asset rotation with the right roles', async () => {
    active = await setup();
    const { ctx, projectId, receiver, core, admin } = active;
    const step = ctx.db
      .prepare('SELECT id FROM e2e_steps WHERE project_id = ? AND position = 5')
      .get(projectId) as { id: string };

    await core.agent
      .post(`/api/steps/${step.id}/result`)
      .set(csrfHeader(core.csrf))
      .send({ status: 'passed', note: 'Unauthorized entry', environment: 'Staging' })
      .expect(403);

    await receiver.agent
      .post(`/api/steps/${step.id}/result`)
      .set(csrfHeader(receiver.csrf))
      .send({
        status: 'passed',
        note: 'Business confirmation path passed end to end.',
        environment: 'Staging',
      })
      .expect(200);

    const overview = await receiver.agent
      .get(`/api/projects/${projectId}/overview`)
      .expect(200);
    expect(overview.body.overview.stats.e2ePassed).toBe(5);

    const asset = ctx.db
      .prepare("SELECT id FROM assets WHERE project_id = ? AND code = 'A-07'")
      .get(projectId) as { id: string };
    await receiver.agent
      .post(`/api/assets/${asset.id}/action`)
      .set(csrfHeader(receiver.csrf))
      .send({ action: 'rotate' })
      .expect(403);

    const rotated = await admin.agent
      .post(`/api/assets/${asset.id}/action`)
      .set(csrfHeader(admin.csrf))
      .send({ action: 'rotate' })
      .expect(200);
    expect(rotated.body.asset.status).toBe('verified');

    const prodAsset = ctx.db
      .prepare("SELECT id FROM assets WHERE project_id = ? AND code = 'A-04'")
      .get(projectId) as { id: string };
    const verified = await receiver.agent
      .post(`/api/assets/${prodAsset.id}/action`)
      .set(csrfHeader(receiver.csrf))
      .send({ action: 'verify' })
      .expect(200);
    expect(verified.body.asset.status).toBe('verified');
  });

  it('creates and disables accounts with admin-only access and last-admin protection', async () => {
    active = await setup();
    const { ctx, receiver, admin } = active;

    await receiver.agent.get('/api/users').expect(403);
    await receiver.agent
      .post('/api/users')
      .set(csrfHeader(receiver.csrf))
      .send({
        name: 'Unauthorized Account',
        email: 'forbidden@example.com',
        title: '',
        password: 'Initial-Password!2026',
        systemRole: 'member',
      })
      .expect(403);

    const email = `new.user.${Date.now()}@example.com`;
    const created = await admin.agent
      .post('/api/users')
      .set(csrfHeader(admin.csrf))
      .send({
        name: 'Morgan Chen',
        email,
        title: 'Finance Partner',
        password: 'Initial-Password!2026',
        systemRole: 'member',
      })
      .expect(201);
    expect(created.body.user.email).toBe(email);

    const newUser = await loginAs(ctx.app, email, 'Initial-Password!2026');
    expect(newUser.user.name).toBe('Morgan Chen');

    await admin.agent
      .patch(`/api/users/${created.body.user.id}`)
      .set(csrfHeader(admin.csrf))
      .send({ status: 'disabled' })
      .expect(200);

    await newUser.agent.get('/api/auth/me').expect(401);

    await admin.agent
      .patch(`/api/users/${admin.user.id}`)
      .set(csrfHeader(admin.csrf))
      .send({ status: 'disabled' })
      .expect(409);
    await admin.agent
      .patch(`/api/users/${admin.user.id}`)
      .set(csrfHeader(admin.csrf))
      .send({ systemRole: 'member' })
      .expect(409);
  });
});
