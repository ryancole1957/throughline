import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createTestContext,
  csrfHeader,
  loginAs,
  milestoneDates,
  sampleProjectId,
  sampleTeamId,
  TEST_USERS,
  type TestContext,
} from './helpers';

describe('projects, membership, and stage transitions', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(() => {
    ctx.close();
  });

  it('lists projects per membership and for system administrators', async () => {
    const receiver = await loginAs(ctx.app, TEST_USERS.receiver);
    const admin = await loginAs(ctx.app, TEST_USERS.admin);
    const delivery = await loginAs(ctx.app, TEST_USERS.delivery);

    const receiverProjects = await receiver.agent.get('/api/projects').expect(200);
    expect(receiverProjects.body.projects).toHaveLength(1);
    expect(receiverProjects.body.projects[0].myRole).toBe('receiver');
    expect(receiverProjects.body.projects[0].stats.totalItems).toBe(24);
    expect(receiverProjects.body.projects[0].stats.submittedItems).toBe(19);
    expect(receiverProjects.body.projects[0].stats.settledItems).toBe(8);

    const adminProjects = await admin.agent.get('/api/projects').expect(200);
    expect(adminProjects.body.projects).toHaveLength(1);
    expect(adminProjects.body.projects[0].isAdmin).toBe(true);
    expect(adminProjects.body.projects[0].myRole).toBeNull();

    const deliveryProjects = await delivery.agent.get('/api/projects').expect(200);
    expect(deliveryProjects.body.projects[0].myRole).toBe('delivery');
  });

  it('creates a project, registers milestones and steps, and assigns members', async () => {
    const receiver = await loginAs(ctx.app, TEST_USERS.receiver);
    const admin = await loginAs(ctx.app, TEST_USERS.admin);
    const delivery = await loginAs(ctx.app, TEST_USERS.delivery);
    const dates = milestoneDates();
    const code = `TL-T-${Date.now()}`;

    const created = await receiver.agent
      .post('/api/projects')
      .set(csrfHeader(receiver.csrf))
      .send({
        teamId: sampleTeamId(ctx.db),
        code,
        name: 'Identity Platform Delivery',
        client: 'Internal',
        kickoff: dates.kickoff,
        deadline: dates.deadline,
        scope: 'Production write access is out of scope.',
      })
      .expect(201);

    const project = created.body.project;
    expect(project.stage).toBe('draft');
    expect(project.myRole).toBe('receiver');
    expect(project.members).toHaveLength(1);
    expect(project.milestones).toHaveLength(7);
    expect(project.permissions.manageMembers).toBe(true);

    const projectId = project.id as string;
    const steps = await receiver.agent
      .get(`/api/projects/${projectId}/steps`)
      .expect(200);
    expect(steps.body.steps).toHaveLength(4);

    const deliveryView = await delivery.agent
      .get(`/api/projects/${projectId}`)
      .expect(200);
    expect(deliveryView.body.project.myRole).toBeNull();
    expect(deliveryView.body.project.permissions.createItem).toBe(false);
    await admin.agent.get(`/api/projects/${projectId}`).expect(200);

    const added = await receiver.agent
      .post(`/api/projects/${projectId}/members`)
      .set(csrfHeader(receiver.csrf))
      .send({ email: TEST_USERS.delivery, role: 'delivery' })
      .expect(201);
    expect(added.body.members).toHaveLength(2);

    await receiver.agent
      .post(`/api/projects/${projectId}/members`)
      .set(csrfHeader(receiver.csrf))
      .send({ email: TEST_USERS.delivery, role: 'delivery' })
      .expect(409);

    await delivery.agent
      .post(`/api/projects/${projectId}/members`)
      .set(csrfHeader(delivery.csrf))
      .send({ email: TEST_USERS.core, role: 'core_reviewer' })
      .expect(403);

    const candidates = await receiver.agent
      .get(`/api/projects/${projectId}/member-candidates?q=Pri`)
      .expect(200);
    expect(candidates.body.users.some((user: { name: string }) => user.name === 'Priya Nair')).toBe(true);

    await receiver.agent
      .patch(`/api/projects/${projectId}`)
      .set(csrfHeader(receiver.csrf))
      .send({ name: 'Identity Platform Delivery (Phase 1)' })
      .expect(200);

    const paused = await receiver.agent
      .post(`/api/projects/${projectId}/stage`)
      .set(csrfHeader(receiver.csrf))
      .send({ action: 'pause' })
      .expect(200);
    expect(paused.body.project.status).toBe('paused');

    await receiver.agent
      .patch(`/api/projects/${projectId}`)
      .set(csrfHeader(receiver.csrf))
      .send({ name: 'Cannot edit while paused' })
      .expect(409);

    const resumed = await receiver.agent
      .post(`/api/projects/${projectId}/stage`)
      .set(csrfHeader(receiver.csrf))
      .send({ action: 'resume' })
      .expect(200);
    expect(resumed.body.project.status).toBe('active');

    const advanced = await receiver.agent
      .post(`/api/projects/${projectId}/stage`)
      .set(csrfHeader(receiver.csrf))
      .send({ action: 'advance' })
      .expect(200);
    expect(advanced.body.project.stage).toBe('scope');

    await receiver.agent
      .delete(`/api/projects/${projectId}/members/${delivery.user.id}`)
      .set(csrfHeader(receiver.csrf))
      .expect(200);
  });

  it('protects the sample project and its receiver membership', async () => {
    const receiver = await loginAs(ctx.app, TEST_USERS.receiver);
    const projectId = sampleProjectId(ctx.db);
    const delivery = await loginAs(ctx.app, TEST_USERS.delivery);

    await delivery.agent
      .post(`/api/projects/${projectId}/members`)
      .set(csrfHeader(delivery.csrf))
      .send({ email: TEST_USERS.business, role: 'observer' })
      .expect(403);

    await receiver.agent
      .delete(`/api/projects/${projectId}/members/${receiver.user.id}`)
      .set(csrfHeader(receiver.csrf))
      .expect(409);
  });
});
