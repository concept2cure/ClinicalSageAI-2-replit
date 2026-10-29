/**
 * Integration tests for /api/mdx/notifications, /api/mdx/clinical-studies,
 * and /api/mdx/ana/memory/profile — auth gate, Zod validation, tenant scoping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { RequestSqlClient } from '../server/db/requestDb';
import type { NotificationRow } from '../server/services/notifications/notification-service';

const queryFn = vi.fn<RequestSqlClient['query']>();

vi.mock('../server/db', () => ({
  pool:    { query: (text: string, params?: unknown[]) => queryFn(text, params) },
  getPool: () => ({ query: (text: string, params?: unknown[]) => queryFn(text, params) }),
  db: {},
}));

import notificationsRouter from '../server/routes/mdx-notifications';
import clinicalRouter from '../server/routes/mdx-clinical-studies';
import anaMemoryRouter from '../server/routes/mdx-ana-memory';

function makeApp(opts: { withAuth?: boolean } = { withAuth: true }) {
  const app = express();
  app.use(express.json());
  if (opts.withAuth) {
    app.use((req, _res, next) => {
      const client: RequestSqlClient = { query: queryFn };
      Object.assign(req, { user: { id: 777, organizationId: 99 }, dbClient: client });
      next();
    });
  }
  app.use('/api/mdx', notificationsRouter);
  app.use('/api/mdx', clinicalRouter);
  app.use('/api/mdx', anaMemoryRouter);
  return app;
}

beforeEach(() => {
  queryFn.mockReset();
  queryFn.mockResolvedValue({ rows: [] });
});

/* ─── Auth gate ──────────────────────────────────────────────── */

describe('auth gate', () => {
  it.each([
    ['GET', '/api/mdx/notifications'],
    ['GET', '/api/mdx/notifications/unread-count'],
    ['POST', '/api/mdx/notifications'],
    ['GET', '/api/mdx/clinical-studies'],
    ['POST', '/api/mdx/clinical-studies'],
    ['GET', '/api/mdx/ana/memory/profile'],
  ])('%s %s returns 403/401 without org context', async (method, url) => {
    const req = request(makeApp({ withAuth: false }));
    const res = await (method === 'GET' ? req.get(url)
                     : req.post(url).send({}));
    expect([401, 403]).toContain(res.status);
  });
});

/* ─── Notifications ─────────────────────────────────────────── */

describe('notifications routes', () => {
  it('external notification channels refuse enabling instead of promising delivery', async () => {
    const res = await request(makeApp()).put('/api/mdx/notification-subscriptions/admin').send({ emailEnabled: true });
    expect(res.status).toBe(422);
    expect(queryFn).not.toHaveBeenCalled();
  });
  it('subscription capability metadata states which channel is implemented', async () => {
    const res = await request(makeApp()).get('/api/mdx/notification-subscriptions');
    expect(res.status).toBe(200);
    expect(res.body.meta.channels).toEqual({ inApp: true, email: false, push: false });
  });
  it('organization preference upserts preserve omitted settings', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ category: 'admin', in_app_enabled: false }] });
    const res = await request(makeApp()).put('/api/mdx/notification-subscriptions/admin').send({ inAppEnabled: false });
    expect(res.status).toBe(200);
    const [sql, values] = queryFn.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (organization_id, user_id, category)');
    expect(sql).toContain('COALESCE($4, mdx_notification_subscriptions.email_enabled)');
    expect(values).toEqual([99,777,'admin',null,null,false]);
  });
  it('list returns canonical envelope', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, organization_id: 99, recipient_user_id: 777, recipient_role: null,
        category: 'system', title: 'Hello', severity: 'info', body: null, resource_type: null,
        resource_id: null, action_url: null, read_at: null, archived_at: null, metadata: {},
        expires_at: null, created_at: new Date('2026-10-14T00:00:00Z') } satisfies NotificationRow],
    });
    const res = await request(makeApp()).get('/api/mdx/notifications');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.count).toBe(1);
  });

  it('rejects invalid severity filter', async () => {
    const res = await request(makeApp()).get('/api/mdx/notifications?severity=urgent');
    expect(res.status).toBe(422);
  });

  it('POST rejects invalid category', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/notifications')
      .send({ category: 'wat', severity: 'info', title: 'x' });
    expect(res.status).toBe(422);
  });

  it('POST 201 with id', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    const res = await request(makeApp())
      .post('/api/mdx/notifications')
      .send({ category: 'submission_status', severity: 'critical', title: 'Rejected' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(42);
  });

  it('unread-count returns { unread }', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ n: 7 }] });
    const res = await request(makeApp()).get('/api/mdx/notifications/unread-count');
    expect(res.status).toBe(200);
    expect(res.body.data.unread).toBe(7);
  });
});

/* ─── Clinical studies ──────────────────────────────────────── */

describe('clinical studies routes', () => {
  it('POST rejects missing title', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/clinical-studies')
      .send({ studyId: 'STU-001' });
    expect(res.status).toBe(422);
  });

  it('POST 201 on valid', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, study_id: 'STU-001', title: 'Pivotal A', status: 'planning' }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/clinical-studies')
      .send({ studyId: 'STU-001', title: 'Pivotal A' });
    expect(res.status).toBe(201);
  });

  it('POST deviation 404s when study not in tenant', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp())
      .post('/api/mdx/clinical-studies/1/deviations')
      .send({ deviationDate: '2026-05-01', category: 'major', description: 'protocol miss' });
    expect(res.status).toBe(404);
  });

  it('POST AE with unanticipated flag', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })  // own check
      .mockResolvedValueOnce({
        rows: [{ id: 1, ae_id: 'AE-1', serious: true, unanticipated: true }],
      });
    const res = await request(makeApp())
      .post('/api/mdx/clinical-studies/1/aes')
      .send({ aeId: 'AE-1', aeDate: '2026-05-01', serious: true, unanticipated: true });
    expect(res.status).toBe(201);
    expect(res.body.data.unanticipated).toBe(true);
  });

  it('summary returns enrollment + safety aggregates', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })  // own check
      .mockResolvedValueOnce({ rows: [{ sample_size_planned: 100, sample_size_enrolled: 60, sample_size_analyzed: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 5, activated: 4, enrolled_total: 60 }] })
      .mockResolvedValueOnce({ rows: [{ total: 3, major: 1, open: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 2, serious: 1, uade: 0, device_related: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 4, met: 2, not_met: 0, primary_met: 1 }] });
    const res = await request(makeApp()).get('/api/mdx/clinical-studies/1/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.enrollment.percent).toBe(60);
    expect(res.body.data.safety.serious).toBe(1);
  });

  it('PATCH endpoint with p_value > 1 rejected', async () => {
    const res = await request(makeApp())
      .patch('/api/mdx/clinical-endpoints/1')
      .send({ pValue: 1.5 });
    expect(res.status).toBe(422);
  });
});

/* ─── AnA memory ────────────────────────────────────────────── */

/* The router serves the caller's own relational profile and nothing else since
   ana-memory folded into the conversation (D2, 2026-10-29): its atom list,
   verify, supersede and thread routes had only the retired screen as caller
   (docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/). The profile read is
   tested on PostgreSQL in server/routes/__tests__/mdx-ana-memory-profile.pglite.test.ts. */
describe('AnA memory', () => {
  it.each([
    ['GET', '/api/mdx/ana/memory'],
    ['POST', '/api/mdx/ana/memory/999/verify'],
    ['POST', '/api/mdx/ana/memory/1/supersede'],
    ['GET', '/api/mdx/ana/threads'],
    ['GET', '/api/mdx/ana/threads/t-1'],
    ['POST', '/api/mdx/ana/threads/t-1/pin'],
  ])('%s %s is no longer served, and reads nothing', async (method, url) => {
    const req = request(makeApp());
    const res = await (method === 'GET' ? req.get(url) : req.post(url).send({}));
    expect(res.status).toBe(404);
    expect(queryFn).not.toHaveBeenCalled();
  });
});
