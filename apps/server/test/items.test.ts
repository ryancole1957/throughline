import { afterEach, describe, expect, it } from 'vitest';

import {
  createTestContext,
  csrfHeader,
  itemIdByCode,
  loginAs,
  milestoneDates,
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
  };
}

function evidence(
  delivery: LoggedInAgent,
  itemId: string,
  description = 'Additional test record',
) {
  return delivery.agent
    .post(`/api/items/${itemId}/evidence`)
    .set(csrfHeader(delivery.csrf))
    .send({
      type: 'test_record',
      environment: 'Staging',
      version: 'v2.4.0',
      reference: 'records/test-run.md',
      description,
    });
}

describe('item evidence, review, and acceptance rules', () => {
  let active: Setup | null = null;

  afterEach(() => {
    active?.ctx.close();
    active = null;
  });

  it('enforces role gates and submits evidence before acceptance', async () => {
    active = await setup();
    const { ctx, receiver, delivery } = active;
    const itemId = itemIdByCode(ctx.db, 'TL-013');

    await delivery.agent
      .post(`/api/items/${itemId}/acceptance`)
      .set(csrfHeader(delivery.csrf))
      .send({
        decision: 'passed',
        remarks: '',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: '',
      })
      .expect(403);

    await receiver.agent
      .post(`/api/items/${itemId}/evidence`)
      .set(csrfHeader(receiver.csrf))
      .send({
        type: 'document',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: '',
        description: 'Should not be allowed',
      })
      .expect(403);

    const withEvidence = await evidence(delivery, itemId);
    expect(withEvidence.status).toBe(201);
    expect(withEvidence.body.item.supplyStatus).toBe('submitted');
    expect(withEvidence.body.gate.ready).toBe(true);

    await delivery.agent
      .post(`/api/items/${itemId}/reviews`)
      .set(csrfHeader(delivery.csrf))
      .send({ stage: 'core', decision: 'passed', remarks: '' })
      .expect(403);

    await active.business.agent
      .post(`/api/items/${itemId}/reviews`)
      .set(csrfHeader(active.business.csrf))
      .send({ stage: 'core', decision: 'passed', remarks: '' })
      .expect(403);

    await receiver.agent
      .post(`/api/items/${itemId}/acceptance`)
      .set(csrfHeader(receiver.csrf))
      .send({
        decision: 'passed',
        remarks: 'Reproduced successfully in staging.',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: 'records/test-run.md',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.item.acceptanceStatus).toBe('passed');
        const acceptance = response.body.acceptances.at(-1);
        expect(acceptance.environment).toBe('Staging');
        expect(acceptance.version).toBe('v2.4.0');
        expect(acceptance.reviewer.name).toBe('Alex Morgan');
      });
  });

  it('blocks acceptance until business confirmation and records conditional obligations', async () => {
    active = await setup();
    const { ctx, receiver, business } = active;
    const itemId = itemIdByCode(ctx.db, 'TL-002');

    await receiver.agent
      .post(`/api/items/${itemId}/acceptance`)
      .set(csrfHeader(receiver.csrf))
      .send({
        decision: 'passed',
        remarks: '',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: '',
      })
      .expect(422);

    const confirmed = await business.agent
      .post(`/api/items/${itemId}/reviews`)
      .set(csrfHeader(business.csrf))
      .send({
        stage: 'business',
        decision: 'confirmed',
        remarks: 'Confirmed with the product team.',
        environment: 'Staging',
        version: 'v2.4.0',
      })
      .expect(201);
    expect(confirmed.body.gate.ready).toBe(true);

    const dates = milestoneDates();
    const accepted = await receiver.agent
      .post(`/api/items/${itemId}/acceptance`)
      .set(csrfHeader(receiver.csrf))
      .send({
        decision: 'conditional',
        remarks: 'A recording of the release process is still required.',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: 'records/contract.md',
        condition: {
          description: 'Attach a recorded walkthrough of the release process',
          ownerId: business.user.id,
          dueDate: dates.deadline,
          severity: 'high',
        },
      })
      .expect(201);

    expect(accepted.body.item.acceptanceStatus).toBe('conditional');
    expect(accepted.body.conditions).toHaveLength(1);
    expect(accepted.body.conditions[0]).toMatchObject({
      status: 'open',
      severity: 'high',
      owner: { name: 'Sofia Reyes' },
    });

    const condition = ctx.db
      .prepare('SELECT code, owner_id, status FROM conditions WHERE item_id = ?')
      .get(itemId) as { code: string; owner_id: string; status: string };
    expect(condition.code).toBe('C-02');
    expect(condition.owner_id).toBe(business.user.id);
    expect(condition.status).toBe('open');

    await receiver.agent
      .post(`/api/items/${itemId}/acceptance`)
      .set(csrfHeader(receiver.csrf))
      .send({
        decision: 'passed',
        remarks: '',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: '',
      })
      .expect(409);
  });

  it('supports rejection without a complete gate and restarts the review chain after resubmission', async () => {
    active = await setup();
    const { ctx, receiver, delivery, core } = active;
    const itemId = itemIdByCode(ctx.db, 'TL-003');

    await receiver.agent
      .post(`/api/items/${itemId}/acceptance`)
      .set(csrfHeader(receiver.csrf))
      .send({
        decision: 'passed',
        remarks: '',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: '',
      })
      .expect(422);

    const rejected = await receiver.agent
      .post(`/api/items/${itemId}/acceptance`)
      .set(csrfHeader(receiver.csrf))
      .send({
        decision: 'rejected',
        remarks: 'The runbook does not show the post-incident notification step.',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: 'records/runbook.md',
      })
      .expect(201);
    expect(rejected.body.item.acceptanceStatus).toBe('rejected');
    expect(rejected.body.item.supplyStatus).toBe('needs_information');

    const resubmitted = await evidence(delivery, itemId, 'Added the notification step.');
    expect(resubmitted.body.item.supplyStatus).toBe('submitted');
    expect(resubmitted.body.item.acceptanceStatus).toBe('pending_review');

    const reviewed = await core.agent
      .post(`/api/items/${itemId}/reviews`)
      .set(csrfHeader(core.csrf))
      .send({
        stage: 'core',
        decision: 'passed',
        remarks: 'The updated runbook matches the observed behavior.',
        environment: 'Staging',
        version: 'v2.4.0',
      })
      .expect(201);
    expect(reviewed.body.gate.ready).toBe(true);

    const accepted = await receiver.agent
      .post(`/api/items/${itemId}/acceptance`)
      .set(csrfHeader(receiver.csrf))
      .send({
        decision: 'passed',
        remarks: 'Reproduced successfully.',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: 'records/runbook.md',
      })
      .expect(201);
    expect(accepted.body.item.acceptanceStatus).toBe('passed');
  });

  it('invalidates historical reviews when the acceptance standard is revised', async () => {
    active = await setup();
    const { ctx, receiver, core, business } = active;
    const itemId = itemIdByCode(ctx.db, 'TL-001');

    const revised = await receiver.agent
      .post(`/api/items/${itemId}/rule`)
      .set(csrfHeader(receiver.csrf))
      .send({ rule: 'Revision 2: replay the full flow in staging and compare the result with production.' })
      .expect(200);

    expect(revised.body.item.revision).toBe(2);
    expect(revised.body.item.acceptanceStatus).toBe('pending_review');
    expect(revised.body.gate.ready).toBe(false);
    expect(revised.body.reviews.every((review: { effective: boolean }) => !review.effective)).toBe(true);
    expect(revised.body.acceptances.every((acceptance: { effective: boolean }) => !acceptance.effective)).toBe(true);

    await core.agent
      .post(`/api/items/${itemId}/reviews`)
      .set(csrfHeader(core.csrf))
      .send({
        stage: 'core',
        decision: 'passed',
        remarks: 'Checked against revision 2.',
        environment: 'Staging',
        version: 'v2.4.0',
      })
      .expect(201);

    await business.agent
      .post(`/api/items/${itemId}/reviews`)
      .set(csrfHeader(business.csrf))
      .send({
        stage: 'business',
        decision: 'confirmed',
        remarks: 'Confirmed against revision 2.',
      })
      .expect(201);

    const accepted = await receiver.agent
      .post(`/api/items/${itemId}/acceptance`)
      .set(csrfHeader(receiver.csrf))
      .send({
        decision: 'passed',
        remarks: 'Reproduced under revision 2.',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: 'records/v2.md',
      })
      .expect(201);
    expect(accepted.body.item.acceptanceStatus).toBe('passed');
    expect(accepted.body.item.revision).toBe(2);
  });

  it('uses the latest review in the current revision as the effective gate signal', async () => {
    active = await setup();
    const { ctx, receiver, delivery, core } = active;
    const itemId = itemIdByCode(ctx.db, 'TL-011');

    await core.agent
      .post(`/api/items/${itemId}/reviews`)
      .set(csrfHeader(core.csrf))
      .send({ stage: 'core', decision: 'passed', remarks: 'Initial review passed.' })
      .expect(201);

    const returned = await core.agent
      .post(`/api/items/${itemId}/reviews`)
      .set(csrfHeader(core.csrf))
      .send({ stage: 'core', decision: 'returned', remarks: 'The supported Node version is missing.' })
      .expect(201);
    expect(returned.body.item.supplyStatus).toBe('needs_information');
    expect(returned.body.gate.ready).toBe(false);

    await evidence(delivery, itemId, 'Added the runtime version notes and startup log.').expect(201);

    await receiver.agent
      .post(`/api/items/${itemId}/acceptance`)
      .set(csrfHeader(receiver.csrf))
      .send({
        decision: 'passed',
        remarks: '',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: '',
      })
      .expect(422);

    await core.agent
      .post(`/api/items/${itemId}/reviews`)
      .set(csrfHeader(core.csrf))
      .send({ stage: 'core', decision: 'passed', remarks: 'The additional material is sufficient.' })
      .expect(201);

    await receiver.agent
      .post(`/api/items/${itemId}/acceptance`)
      .set(csrfHeader(receiver.csrf))
      .send({
        decision: 'passed',
        remarks: 'Reproduced successfully.',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: '',
      })
      .expect(201);
  });

  it('creates items, assigns follow-up questions, and enforces answer ownership', async () => {
    active = await setup();
    const { projectId, receiver, delivery, core } = active;

    const created = await receiver.agent
      .post(`/api/projects/${projectId}/items`)
      .set(csrfHeader(receiver.csrf))
      .send({
        module: 'Operations',
        title: 'Canary release runbook',
        scope: 'Canary strategy, rollback, and observation window.',
        priority: 'medium',
        dueDate: milestoneDates().deadline,
        rule: 'The receiver completes one canary release and rollback in staging.',
        coreRequired: false,
        businessRequired: false,
      })
      .expect(201);
    expect(created.body.item.code).toBe('TL-025');
    expect(created.body.item.supplyStatus).toBe('pending_submission');

    await evidence(delivery, created.body.item.id, 'Initial canary release runbook.').expect(201);
    const accepted = await receiver.agent
      .post(`/api/items/${created.body.item.id}/acceptance`)
      .set(csrfHeader(receiver.csrf))
      .send({
        decision: 'passed',
        remarks: 'Completed one canary release and rollback.',
        environment: 'Staging',
        version: 'v2.4.0',
        reference: 'records/canary.md',
      })
      .expect(201);
    expect(accepted.body.item.acceptanceStatus).toBe('passed');

    const question = await delivery.agent
      .post(`/api/items/${created.body.item.id}/notes`)
      .set(csrfHeader(delivery.csrf))
      .send({
        body: 'Does the rollback window include weekends? Please confirm.',
        isQuestion: true,
        assigneeId: core.user.id,
      })
      .expect(201);
    const note = question.body.notes.at(-1);
    expect(note.kind).toBe('question');
    expect(note.assignee.name).toBe('Priya Nair');

    await receiver.agent
      .post(`/api/notes/${note.id}/answer`)
      .set(csrfHeader(receiver.csrf))
      .send({ body: 'Unauthorized answer' })
      .expect(403);

    const answered = await core.agent
      .post(`/api/notes/${note.id}/answer`)
      .set(csrfHeader(core.csrf))
      .send({ body: 'Yes, the rollback window includes weekends.' })
      .expect(200);
    const original = answered.body.notes.find((item: { id: string }) => item.id === note.id);
    expect(original.answeredAt).toBeTruthy();
    expect(
      answered.body.notes.some(
        (item: { kind: string; parentId: string }) =>
          item.kind === 'answer' && item.parentId === note.id,
      ),
    ).toBe(true);
  });
});
