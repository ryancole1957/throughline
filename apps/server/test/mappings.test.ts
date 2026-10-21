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
}

async function setup(): Promise<Setup> {
  const ctx = await createTestContext();
  return {
    ctx,
    projectId: sampleProjectId(ctx.db),
    receiver: await loginAs(ctx.app, TEST_USERS.receiver),
    delivery: await loginAs(ctx.app, TEST_USERS.delivery),
  };
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('page and API mapping', () => {
  let active: Setup | null = null;

  afterEach(() => {
    active?.ctx.close();
    active = null;
  });

  it('creates, edits, and deletes a mapping with several endpoints', async () => {
    active = await setup();
    const { receiver, projectId } = active;

    const created = await receiver.agent
      .post(`/api/projects/${projectId}/chains`)
      .set(csrfHeader(receiver.csrf))
      .send({
        title: 'Order management',
        page: '/orders/detail',
        url: 'https://app.example.com/orders/detail',
        endpoints: [
          { method: 'GET', path: '/api/orders', note: 'Page through orders' },
          { method: 'POST', path: '/api/orders', note: 'Create an order' },
          { method: 'DELETE', path: '/api/orders/:id', note: '' },
        ],
        service: 'orders-api',
        tables: 'orders',
        environment: 'Staging',
        ownerName: 'Alex Morgan',
      })
      .expect(201);
    expect(created.body.chains).toHaveLength(4);

    const mapping = created.body.chains.find(
      (entry: { page: string }) => entry.page === '/orders/detail',
    );
    expect(mapping.title).toBe('Order management');
    expect(mapping.url).toBe('https://app.example.com/orders/detail');
    expect(mapping.endpoints).toHaveLength(3);
    expect(mapping.endpoints[1]).toMatchObject({ method: 'POST', path: '/api/orders' });
    expect(mapping.name).toContain('/orders');
    expect(mapping.hasScreenshot).toBe(false);

    const updated = await receiver.agent
      .patch(`/api/chains/${mapping.id}`)
      .set(csrfHeader(receiver.csrf))
      .send({
        endpoints: [{ method: 'PUT', path: '/api/orders/:id', note: 'Edit an order' }],
        ownerName: 'Jordan Lee',
      })
      .expect(200);
    const edited = updated.body.chains.find((entry: { id: string }) => entry.id === mapping.id);
    expect(edited.endpoints).toHaveLength(1);
    expect(edited.endpoints[0].method).toBe('PUT');
    expect(edited.name).toContain('PUT /api/orders/:id');
    expect(edited.ownerName).toBe('Jordan Lee');
    expect(edited.title).toBe('Order management');
    expect(edited.service).toBe('orders-api');
    expect(edited.tables).toBe('orders');

    const removed = await receiver.agent
      .delete(`/api/chains/${mapping.id}`)
      .set(csrfHeader(receiver.csrf))
      .expect(200);
    expect(removed.body.chains).toHaveLength(3);
  });

  it('rejects mappings without endpoints or with unknown fields', async () => {
    active = await setup();
    const { receiver, projectId } = active;

    const missing = await receiver.agent
      .post(`/api/projects/${projectId}/chains`)
      .set(csrfHeader(receiver.csrf))
      .send({ page: '/orders' })
      .expect(422);
    expect(missing.body.error.fields.endpoints).toBeTruthy();

    const unknown = await receiver.agent
      .post(`/api/projects/${projectId}/chains`)
      .set(csrfHeader(receiver.csrf))
      .send({ page: '/orders', api: 'GET /api/orders' })
      .expect(422);
    expect(unknown.body.error.fields.form).toBeTruthy();

    const badMethod = await receiver.agent
      .post(`/api/projects/${projectId}/chains`)
      .set(csrfHeader(receiver.csrf))
      .send({ page: '/orders', endpoints: [{ method: 'FETCH', path: '/api/orders' }] })
      .expect(422);
    expect(badMethod.body.error.fields['endpoints.0.method']).toBeTruthy();
  });

  it('stores, serves, and clears a page screenshot', async () => {
    active = await setup();
    const { receiver, delivery, projectId } = active;

    const created = await receiver.agent
      .post(`/api/projects/${projectId}/chains`)
      .set(csrfHeader(receiver.csrf))
      .send({ page: '/checkout', endpoints: [{ method: 'POST', path: '/api/checkout' }] })
      .expect(201);
    const mapping = created.body.chains.find((entry: { page: string }) => entry.page === '/checkout');

    await receiver.agent
      .put(`/api/chains/${mapping.id}/screenshot`)
      .set(csrfHeader(receiver.csrf))
      .set('Content-Type', 'image/png')
      .send(PNG_1PX)
      .expect(200);

    const listed = await receiver.agent.get(`/api/projects/${projectId}/chains`).expect(200);
    const stored = listed.body.chains.find((entry: { id: string }) => entry.id === mapping.id);
    expect(stored.hasScreenshot).toBe(true);

    const image = await receiver.agent
      .get(`/api/chains/${mapping.id}/screenshot`)
      .buffer()
      .expect(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.body).toEqual(PNG_1PX);

    await delivery.agent.get(`/api/chains/${mapping.id}/screenshot`).expect(200);
    await delivery.agent
      .put(`/api/chains/${mapping.id}/screenshot`)
      .set(csrfHeader(delivery.csrf))
      .set('Content-Type', 'image/png')
      .send(PNG_1PX)
      .expect(403);

    await receiver.agent
      .put(`/api/chains/${mapping.id}/screenshot`)
      .set(csrfHeader(receiver.csrf))
      .set('Content-Type', 'text/plain')
      .send(Buffer.from('not an image'))
      .expect(400);

    const cleared = await receiver.agent
      .delete(`/api/chains/${mapping.id}/screenshot`)
      .set(csrfHeader(receiver.csrf))
      .expect(200);
    expect(
      cleared.body.chains.find((entry: { id: string }) => entry.id === mapping.id).hasScreenshot,
    ).toBe(false);
    await receiver.agent.get(`/api/chains/${mapping.id}/screenshot`).expect(404);
  });

  it('lets team members read mappings but blocks edits', async () => {
    active = await setup();
    const { receiver, delivery, projectId } = active;

    const created = await receiver.agent
      .post(`/api/projects/${projectId}/chains`)
      .set(csrfHeader(receiver.csrf))
      .send({ page: '/billing', endpoints: [{ method: 'GET', path: '/api/invoices' }] })
      .expect(201);
    const mappingId = created.body.chains.find(
      (entry: { page: string }) => entry.page === '/billing',
    ).id as string;

    const listed = await delivery.agent.get(`/api/projects/${projectId}/chains`).expect(200);
    expect(listed.body.chains).toHaveLength(4);
    expect(listed.body.chains[0].endpoints.length).toBeGreaterThan(0);

    await delivery.agent
      .post(`/api/projects/${projectId}/chains`)
      .set(csrfHeader(delivery.csrf))
      .send({ page: '/billing', endpoints: [{ method: 'GET', path: '/api/billing' }] })
      .expect(403);
    await delivery.agent
      .patch(`/api/chains/${mappingId}`)
      .set(csrfHeader(delivery.csrf))
      .send({ page: '/settled' })
      .expect(403);
    await delivery.agent
      .delete(`/api/chains/${mappingId}`)
      .set(csrfHeader(delivery.csrf))
      .expect(403);
  });
});
