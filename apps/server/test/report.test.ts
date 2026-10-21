import { afterEach, describe, expect, it } from 'vitest';

import {
  createTestContext,
  csrfHeader,
  loginAs,
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

function recordConclusion(receiver: LoggedInAgent, projectId: string) {
  return receiver.agent
    .post(`/api/projects/${projectId}/conclusion`)
    .set(csrfHeader(receiver.csrf))
    .send({
      decision: 'conditionally_accepted',
      note: 'Acceptance depends on closing C-01 and resolving the high-risk items.',
    });
}

function sign(
  actor: LoggedInAgent,
  projectId: string,
  decision: 'agree' | 'agree_with_reservations' | 'disagree',
  note = '',
) {
  return actor.agent
    .post(`/api/projects/${projectId}/signoffs`)
    .set(csrfHeader(actor.csrf))
    .send({ decision, note });
}

describe('report snapshot and signoff lifecycle', () => {
  let active: Setup | null = null;

  afterEach(() => {
    active?.ctx.close();
    active = null;
  });

  it('builds the report, exports Markdown, and blocks signoff before a conclusion', async () => {
    active = await setup();
    const { projectId, receiver } = active;

    const report = await receiver.agent.get(`/api/projects/${projectId}/report`).expect(200);
    expect(report.body.report.conclusion).toBeNull();
    expect(report.body.report.project.stage).toBe('verification');
    expect(report.body.report.signoffs).toHaveLength(4);
    expect(report.body.report.differences).toHaveLength(3);
    expect(report.body.report.canSignOff).toBe(false);

    await sign(receiver, projectId, 'agree').expect(409);

    const markdown = await receiver.agent
      .get(`/api/projects/${projectId}/report.md`)
      .expect(200);
    expect(markdown.headers['content-type']).toContain('text/markdown');
    expect(markdown.text).toContain('# Delivery Report');
    expect(markdown.text).toContain('## 1. Completion snapshot');
    expect(markdown.text).toContain(report.body.report.currentSnapshotHash);
    expect(markdown.text).toContain('Open items may remain');
  });

  it('requires a conclusion, records signatures, and closes only after every role signs', async () => {
    active = await setup();
    const { ctx, projectId, receiver, delivery, core, business } = active;

    const conclusion = await recordConclusion(receiver, projectId).expect(201);
    expect(conclusion.body.report.project.stage).toBe('signoff');
    expect(conclusion.body.report.conclusion.decision).toBe('conditionally_accepted');
    expect(conclusion.body.report.canSignOff).toBe(true);

    const receiverReport = await sign(receiver, projectId, 'agree').expect(201);
    expect(receiverReport.body.report.project.stage).toBe('signoff');
    expect(receiverReport.body.report.canSignOff).toBe(false);

    await sign(delivery, projectId, 'agree_with_reservations').expect(422);
    const deliveryReport = await sign(
      delivery,
      projectId,
      'agree_with_reservations',
      'Evidence archive still to be completed.',
    ).expect(201);
    expect(deliveryReport.body.report.project.stage).toBe('signoff');

    await sign(core, projectId, 'agree').expect(201);
    const closed = await sign(business, projectId, 'agree').expect(201);
    expect(closed.body.report.project.stage).toBe('closed');
    expect(closed.body.report.signoffs).toHaveLength(4);
    expect(closed.body.report.signoffs.every((entry: { decision: string | null }) => entry.decision !== null)).toBe(true);
    expect(
      closed.body.report.signoffs.every(
        (entry: { hashState: string }) => entry.hashState === 'current',
      ),
    ).toBe(true);
    expect(
      new Set(
        closed.body.report.signoffs.map((entry: { snapshotHash: string }) => entry.snapshotHash),
      ).size,
    ).toBe(1);

    const projectRow = ctx.db
      .prepare('SELECT stage FROM projects WHERE id = ?')
      .get(projectId) as { stage: string };
    expect(projectRow.stage).toBe('closed');

    const reopened = await receiver.agent
      .post(`/api/projects/${projectId}/stage`)
      .set(csrfHeader(receiver.csrf))
      .send({ action: 'reopen' })
      .expect(200);
    expect(reopened.body.project.stage).toBe('verification');

    const reopenedReport = await receiver.agent
      .get(`/api/projects/${projectId}/report`)
      .expect(200);
    expect(reopenedReport.body.report.conclusion).toBeNull();
    expect(
      reopenedReport.body.report.signoffs.every(
        (entry: { decision: string | null }) => entry.decision === null,
      ),
    ).toBe(true);
  });

  it('marks a signature stale when the report scope changes after signing', async () => {
    active = await setup();
    const { ctx, projectId, receiver, business } = active;
    await recordConclusion(receiver, projectId).expect(201);
    await sign(receiver, projectId, 'agree').expect(201);

    const condition = ctx.db
      .prepare("SELECT id FROM conditions WHERE project_id = ? AND code = 'C-01'")
      .get(projectId) as { id: string };
    await business.agent
      .post(`/api/conditions/${condition.id}/close`)
      .set(csrfHeader(business.csrf))
      .expect(200);

    const report = await receiver.agent
      .get(`/api/projects/${projectId}/report`)
      .expect(200);
    const receiverSignoff = report.body.report.signoffs.find(
      (entry: { role: string }) => entry.role === 'receiver',
    );
    expect(receiverSignoff.hashState).toBe('stale');
    expect(
      report.body.report.conditions.find(
        (entry: { code: string }) => entry.code === 'C-01',
      ).status,
    ).toBe('closed');
  });
});
