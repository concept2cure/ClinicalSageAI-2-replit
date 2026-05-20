/**
 * Integration tests for /api/mdx/notifications, /api/mdx/clinical-studies,
 * and /api/mdx/ana/* — auth gate, Zod validation, tenant scoping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const queryFn = vi.fn();

vi.mock('../server/db', () => ({
  pool:    { query: (...args: unknown[]) => queryFn(...args) },
  getPool: () => ({ query: (...args: unknown[]) => queryFn(...args) }),
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
      (req as any).user = { id: 777, organizationId: 99 };
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
  queryFn.mockResolvedValue({ rows: [], rowCount: 0 });
});

/* ─── Auth gate ──────────────────────────────────────────────── */

describe('auth gate', () => {
  it.each([
    ['GET', '/api/mdx/notifications'],
    ['GET', '/api/mdx/notifications/unread-count'],
    ['POST', '/api/mdx/notifications'],
    ['GET', '/api/mdx/clinical-studies'],
    ['POST', '/api/mdx/clinical-studies'],
    ['GET', '/api/mdx/ana/memory'],
    ['GET', '/api/mdx/ana/threads'],
  ])('%s %s returns 403/401 without org context', async (method, url) => {
    const req = request(makeApp({ withAuth: false }));
    const res = await (method === 'GET' ? req.get(url)
                     : req.post(url).send({}));
    expect([401, 403]).toContain(res.status);
  });
});

/* ─── Notifications ─────────────────────────────────────────── */

describe('notifications routes', () => {
  it('list returns canonical envelope', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, title: 'Hello', severity: 'info', read_at: null }],
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

/* ─── AnA memory + threads ──────────────────────────────────── */

describe('AnA memory + threads', () => {
  it('memory list survives missing table (42P01)', async () => {
    const err = Object.assign(new Error('does not exist'), { code: '42P01' });
    queryFn.mockRejectedValueOnce(err);
    const res = await request(makeApp()).get('/api/mdx/ana/memory');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('memory verify rejects when not found', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp())
      .post('/api/mdx/ana/memory/999/verify')
      .send({});
    expect(res.status).toBe(404);
  });

  it('memory supersede requires supersededById', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/ana/memory/1/supersede')
      .send({});
    expect(res.status).toBe(422);
  });

  it('threads list returns canonical envelope', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 't-1', user_id: 1, organization_id: 99, title: 'Chat about K221847', metadata: {} }],
    });
    const res = await request(makeApp()).get('/api/mdx/ana/threads');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('thread pin toggles metadata.pinned', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 't-1', metadata: { pinned: true } }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/ana/threads/t-1/pin')
      .send({ pinned: true });
    expect(res.status).toBe(200);
    expect(res.body.data.metadata.pinned).toBe(true);
  });
});
