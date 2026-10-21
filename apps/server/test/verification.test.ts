import { afterEach, describe, expect, it } from 'vitest';

import type { Step } from '@throughline/shared';

import {
  createTestContext,
  csrfHeader,
  itemIdByCode,
  loginAs,
  milestoneDates,
  sampleProjectId,
  sampleTeamId,
  TEST_USERS,
  type LoggedInAgent,
  type TestContext,
} from './helpers';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

interface Setup {
  ctx: TestContext;
  projectId: string;
  receiver: LoggedInAgent;
  delivery: LoggedInAgent;
  core: LoggedInAgent;
}

async function setup(): Promise<Setup> {
  const ctx = await createTestContext();
  return {
    ctx,
    projectId: sampleProjectId(ctx.db),
    receiver: await loginAs(ctx.app, TEST_USERS.receiver),
    delivery: await loginAs(ctx.app, TEST_USERS.delivery),
    core: await loginAs(ctx.app, TEST_USERS.core),
  };
}

async function stepsOf(active: Setup): Promise<Step[]> {
  const response = await active.receiver.agent
    .get(`/api/projects/${active.projectId}/steps`)
    .expect(200);
  return response.body.steps as Step[];
}

function findStep(steps: Step[], name: string): Step {
  const step = steps.find((entry) => entry.name === name);
  if (!step) throw new Error(`step ${name} missing`);
  return step;
}

async function createMapping(active: Setup, page: string): Promise<string> {
  const created = await active.receiver.agent
    .post(`/api/projects/${active.projectId}/chains`)
    .set(csrfHeader(active.receiver.csrf))
    .send({ page, endpoints: [{ method: 'GET', path: `${page}/summary` }] })
    .expect(201);
  return (created.body.chains as Array<{ page: string; id: string }>).find(
    (entry) => entry.page === page,
  )!.id;
}

describe('end-to-end verification scope', () => {
  let active: Setup | null = null;

  afterEach(() => {
    active?.ctx.close();
    active = null;
  });

  it('binds a step to work items and page mappings', async () => {
    active = await setup();
    const step = findStep(await stepsOf(active), 'Verify a delivery asset');
    expect(step.items).toHaveLength(0);

    const mappingId = await createMapping(active, '/assets');
    const updated = await active.receiver.agent
      .patch(`/api/steps/${step.id}`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ itemIds: [itemIdByCode(active.ctx.db, 'TL-001')], chainIds: [mappingId] })
      .expect(200);
    const saved = findStep(updated.body.steps as Step[], step.name);

    expect(saved.items.map((item) => item.code)).toEqual(['TL-001']);
    expect(saved.mappings.map((mapping) => mapping.page)).toEqual(['/assets']);
    expect(saved.stale).toBe(false);

    const cleared = await active.receiver.agent
      .patch(`/api/steps/${step.id}`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ itemIds: [], chainIds: [] })
      .expect(200);
    const emptied = findStep(cleared.body.steps as Step[], step.name);
    expect(emptied.items).toHaveLength(0);
    expect(emptied.mappings).toHaveLength(0);
  });

  it('rejects links pointing at another project', async () => {
    active = await setup();
    const step = findStep(await stepsOf(active), 'Verify a delivery asset');
    const dates = milestoneDates();

    const foreign = await active.receiver.agent
      .post('/api/projects')
      .set(csrfHeader(active.receiver.csrf))
      .send({
        teamId: sampleTeamId(active.ctx.db),
        code: `TL-FOREIGN-${Date.now()}`,
        name: 'Foreign Delivery',
        client: 'Internal',
        kickoff: dates.kickoff,
        deadline: dates.deadline,
        scope: 'Project isolation check.',
      })
      .expect(201);
    const foreignProjectId = foreign.body.project.id as string;

    const foreignItem = await active.receiver.agent
      .post(`/api/projects/${foreignProjectId}/items`)
      .set(csrfHeader(active.receiver.csrf))
      .send({
        module: 'Isolation',
        title: 'Foreign acceptance item',
        scope: 'Belongs to another project.',
        priority: 'medium',
        dueDate: dates.deadline,
        rule: 'Item exists only in the foreign project.',
      })
      .expect(201);
    const foreignItemId = foreignItem.body.item.id as string;

    const foreignMapping = await active.receiver.agent
      .post(`/api/projects/${foreignProjectId}/chains`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ page: '/foreign', endpoints: [{ method: 'GET', path: '/api/foreign' }] })
      .expect(201);
    const foreignMappingId = (
      foreignMapping.body.chains as Array<{ page: string; id: string }>
    ).find((entry) => entry.page === '/foreign')!.id;

    const rejectedItem = await active.receiver.agent
      .patch(`/api/steps/${step.id}`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ itemIds: [foreignItemId], chainIds: [] })
      .expect(422);
    expect(rejectedItem.body.error.fields.itemIds).toBeTruthy();

    const rejectedMapping = await active.receiver.agent
      .patch(`/api/steps/${step.id}`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ itemIds: [], chainIds: [foreignMappingId] })
      .expect(422);
    expect(rejectedMapping.body.error.fields.chainIds).toBeTruthy();

    const untouched = findStep(await stepsOf(active), step.name);
    expect(untouched.items).toHaveLength(0);
    expect(untouched.mappings).toHaveLength(0);
  });

  it('limits scope edits to the acceptance owner', async () => {
    active = await setup();
    const step = findStep(await stepsOf(active), 'Verify a delivery asset');

    await active.delivery.agent
      .patch(`/api/steps/${step.id}`)
      .set(csrfHeader(active.delivery.csrf))
      .send({ itemIds: [], chainIds: [] })
      .expect(403);
    await active.core.agent
      .post(`/api/steps/${step.id}/result`)
      .set(csrfHeader(active.core.csrf))
      .send({ status: 'passed', note: 'Checked by a reviewer who may not verify.' })
      .expect(403);

    const admin = await loginAs(active.ctx.app, TEST_USERS.admin);
    await admin.agent
      .patch(`/api/steps/${step.id}`)
      .set(csrfHeader(admin.csrf))
      .send({ itemIds: [], chainIds: [] })
      .expect(403);
  });

  it('flags a recorded pass once its scope changes', async () => {
    active = await setup();
    const step = findStep(await stepsOf(active), 'Verify a delivery asset');
    const itemId = itemIdByCode(active.ctx.db, 'TL-002');
    const otherItemId = itemIdByCode(active.ctx.db, 'TL-008');
    const mappingId = await createMapping(active, '/reports');
    const otherMappingId = await createMapping(active, '/settings');

    await active.receiver.agent
      .patch(`/api/steps/${step.id}`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ itemIds: [itemId, otherItemId], chainIds: [mappingId, otherMappingId] })
      .expect(200);

    const passed = await active.receiver.agent
      .post(`/api/steps/${step.id}/result`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ status: 'passed', note: 'Report export runs end to end.', environment: 'Staging' })
      .expect(200);
    expect(passed.body.step.stale).toBe(false);
    expect(passed.body.riskCode).toBeNull();

    await active.receiver.agent
      .put(`/api/chains/${mappingId}/screenshot`)
      .set(csrfHeader(active.receiver.csrf))
      .set('Content-Type', 'image/png')
      .send(PNG_1PX)
      .expect(200);
    expect(findStep(await stepsOf(active), step.name).stale).toBe(false);

    await active.receiver.agent
      .post(`/api/items/${itemId}/rule`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ rule: 'Report export must include the linked page owner.' })
      .expect(200);
    const afterItemChange = findStep(await stepsOf(active), step.name);
    expect(afterItemChange.status).toBe('passed');
    expect(afterItemChange.stale).toBe(true);

    const reconfirmed = await active.receiver.agent
      .post(`/api/steps/${step.id}/result`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ status: 'passed', note: 'Re-ran the export after the criteria change.' })
      .expect(200);
    expect(reconfirmed.body.step.stale).toBe(false);

    await active.receiver.agent
      .patch(`/api/chains/${mappingId}`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ endpoints: [{ method: 'GET', path: '/reports/rows' }] })
      .expect(200);
    expect(findStep(await stepsOf(active), step.name).stale).toBe(true);
  });

  it('does not flag steps whose scope is empty or unlinked', async () => {
    active = await setup();
    const step = findStep(await stepsOf(active), 'Sign in and load the workspace');
    expect(step.status).toBe('passed');

    const recorded = await active.receiver.agent
      .post(`/api/steps/${step.id}/result`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ status: 'passed', note: 'Sign-in still works.' })
      .expect(200);
    expect(recorded.body.step.stale).toBe(false);
    const linked = findStep(await stepsOf(active), 'Submit evidence for an item');
    expect(linked.items.length).toBeGreaterThan(0);
    expect(linked.stale).toBe(false);
  });

  it('raises a risk from a failed step', async () => {
    active = await setup();
    const step = findStep(await stepsOf(active), 'Record a business confirmation');
    const itemIds = [itemIdByCode(active.ctx.db, 'TL-004')];

    await active.receiver.agent
      .patch(`/api/steps/${step.id}`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ itemIds, chainIds: [] })
      .expect(200);

    const failed = await active.receiver.agent
      .post(`/api/steps/${step.id}/result`)
      .set(csrfHeader(active.receiver.csrf))
      .send({
        status: 'failed',
        note: 'Business confirmation never reaches the reviewer queue.',
        environment: 'Staging',
        risk: {
          severity: 'high',
          ownerId: active.core.user.id,
          dueDate: milestoneDates().deadline,
        },
      })
      .expect(200);
    expect(failed.body.step.status).toBe('failed');
    expect(failed.body.riskCode).toMatch(/^R-\d+$/);
    expect(failed.body.step.stale).toBe(false);

    const risks = await active.receiver.agent
      .get(`/api/projects/${active.projectId}/risks`)
      .expect(200);
    const risk = risks.body.risks.find(
      (entry: { code: string }) => entry.code === failed.body.riskCode,
    );
    expect(risk).toMatchObject({
      title: 'End-to-end step failed: Record a business confirmation',
      impact: 'Business confirmation never reaches the reviewer queue.',
      severity: 'high',
      status: 'open',
    });
    expect(risk.items.map((entry: { id: string }) => entry.id)).toEqual(itemIds);

    const events = await active.receiver.agent
      .get(`/api/projects/${active.projectId}/events?limit=20`)
      .expect(200);
    const actions = (events.body.events as Array<{ action: string }>).map((entry) => entry.action);
    expect(actions).toContain('e2e.result.recorded');
    expect(actions).toContain('risk.created');
    expect(actions).toContain('e2e.scope.updated');

    const plainFailure = await active.receiver.agent
      .post(`/api/steps/${step.id}/result`)
      .set(csrfHeader(active.receiver.csrf))
      .send({ status: 'failed', note: 'Still broken after the first pass.' })
      .expect(200);
    expect(plainFailure.body.riskCode).toBeNull();

    const count = await active.receiver.agent
      .get(`/api/projects/${active.projectId}/risks`)
      .expect(200);
    expect(count.body.risks).toHaveLength(risks.body.risks.length);
  });

  it('validates the risk draft attached to a failure', async () => {
    active = await setup();
    const step = findStep(await stepsOf(active), 'Verify a delivery asset');

    const noOwner = await active.receiver.agent
      .post(`/api/steps/${step.id}/result`)
      .set(csrfHeader(active.receiver.csrf))
      .send({
        status: 'failed',
        note: 'Asset console credentials are stale.',
        risk: { severity: 'medium', ownerId: 'not-a-uuid', dueDate: milestoneDates().deadline },
      })
      .expect(422);
    expect(noOwner.body.error.fields['risk.ownerId']).toBeTruthy();

    const nonMember = await loginAs(active.ctx.app, TEST_USERS.admin);
    const rejectedOwner = await active.receiver.agent
      .post(`/api/steps/${step.id}/result`)
      .set(csrfHeader(active.receiver.csrf))
      .send({
        status: 'failed',
        note: 'Asset console credentials are stale.',
        risk: {
          severity: 'medium',
          ownerId: nonMember.user.id,
          dueDate: milestoneDates().deadline,
        },
      })
      .expect(422);
    expect(rejectedOwner.body.error.message).toMatch(/owner must be a project member/i);

    const afterRollback = findStep(await stepsOf(active), step.name);
    expect(afterRollback.status).toBe('pending');
  });
});
