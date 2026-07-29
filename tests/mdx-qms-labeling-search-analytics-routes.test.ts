/**
 * Integration tests for the four new backend domains: QMS, Labeling,
 * Global search, Analytics. SQL mocked at pool layer.
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

import qmsRouter from '../server/routes/mdx-qms';
import labelingRouter from '../server/routes/mdx-labeling';
import searchRouter from '../server/routes/mdx-search';
import analyticsRouter from '../server/routes/mdx-analytics';

function makeApp(opts: { withAuth?: boolean } = { withAuth: true }) {
  const app = express();
  app.use(express.json());
  if (opts.withAuth) {
    app.use((req, _res, next) => {
      (req as any).user = { id: 777, organizationId: 99 };
      next();
    });
  }
  app.use('/api/mdx', qmsRouter);
  app.use('/api/mdx', labelingRouter);
  app.use('/api/mdx', searchRouter);
  app.use('/api/mdx', analyticsRouter);
  return app;
}

beforeEach(() => {
  queryFn.mockReset();
  queryFn.mockResolvedValue({ rows: [], rowCount: 0 });
});

/* ─── Auth gate ──────────────────────────────────────────────── */

describe('auth gate', () => {
  it.each([
    ['GET', '/api/mdx/qms/documents'],
    ['POST', '/api/mdx/qms/documents'],
    ['GET', '/api/mdx/qms/suppliers'],
    ['GET', '/api/mdx/labeling'],
    ['POST', '/api/mdx/labeling'],
    ['GET', '/api/mdx/search?q=foo'],
    ['GET', '/api/mdx/analytics/portfolio'],
  ])('%s %s returns 403 without org context', async (method, url) => {
    const req = request(makeApp({ withAuth: false }));
    const res = await (method === 'GET' ? req.get(url) : req.post(url).send({}));
    expect(res.status).toBe(403);
  });
});

/* ─── QMS ────────────────────────────────────────────────────── */

describe('QMS routes', () => {
  it('POST document rejects unknown doc_type', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/qms/documents')
      .send({ docNumber: 'SOP-001', title: 'foo', docType: 'wat' });
    expect(res.status).toBe(422);
  });

  it('POST document 201 on valid', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, doc_number: 'SOP-001', title: 'CAPA', status: 'draft' }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/qms/documents')
      .send({ docNumber: 'SOP-001', title: 'CAPA', docType: 'sop' });
    expect(res.status).toBe(201);
  });

  it('POST document 409 on duplicate docNumber', async () => {
    const err = Object.assign(new Error('duplicate'), { code: '23505' });
    queryFn.mockRejectedValueOnce(err);
    const res = await request(makeApp())
      .post('/api/mdx/qms/documents')
      .send({ docNumber: 'SOP-001', title: 'CAPA', docType: 'sop' });
    expect(res.status).toBe(409);
  });

  it('approve flips draft → effective', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'effective', effective_date: '2026-05-19' }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/qms/documents/1/approve')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('effective');
  });

  it('approve 409 when not in draft/in_review', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp())
      .post('/api/mdx/qms/documents/1/approve')
      .send({});
    expect(res.status).toBe(409);
  });

  it('training-ack requires document in tenant', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] }); // tenant gate empty
    const res = await request(makeApp())
      .post('/api/mdx/qms/documents/999/training-ack')
      .send({});
    expect(res.status).toBe(404);
  });

  it('supplier criticality required', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/qms/suppliers')
      .send({ supplierName: 'Acme' });
    expect(res.status).toBe(422);
  });

  it('NC disposition 200', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, disposition: 'rework' }],
    });
    const res = await request(makeApp())
      .patch('/api/mdx/qms/nonconforming/1/disposition')
      .send({ disposition: 'rework', dispositionRationale: 'process miss' });
    expect(res.status).toBe(200);
    expect(res.body.data.disposition).toBe('rework');
  });
});

/* ─── Labeling ──────────────────────────────────────────────── */

describe('Labeling routes', () => {
  it('POST rejects unknown doc_kind', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/labeling')
      .send({ deviceName: 'CGM v2', docKind: 'flyer' });
    expect(res.status).toBe(422);
  });

  it('POST 201 with default language en', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, device_name: 'CGM v2', doc_kind: 'ifu', language: 'en' }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/labeling')
      .send({ deviceName: 'CGM v2', docKind: 'ifu' });
    expect(res.status).toBe(201);
    expect(res.body.data.language).toBe('en');
  });

  it('POST translation 404 when document not in tenant', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp())
      .post('/api/mdx/labeling/999/translations')
      .send({ language: 'de-DE' });
    expect(res.status).toBe(404);
  });

  it('POST translation 409 on duplicate language', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // own check
    const err = Object.assign(new Error('duplicate'), { code: '23505' });
    queryFn.mockRejectedValueOnce(err);
    const res = await request(makeApp())
      .post('/api/mdx/labeling/1/translations')
      .send({ language: 'de-DE' });
    expect(res.status).toBe(409);
  });

  it('coverage returns counts', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // tenant gate
      .mockResolvedValueOnce({
        rows: [
          { language: 'de-DE', status: 'approved', back_translation_verified: true },
          { language: 'fr-FR', status: 'pending',  back_translation_verified: false },
        ],
      });
    const res = await request(makeApp()).get('/api/mdx/labeling/1/coverage');
    expect(res.status).toBe(200);
    expect(res.body.data.totalTranslations).toBe(2);
    expect(res.body.data.approved).toBe(1);
    expect(res.body.data.backTranslationVerified).toBe(1);
  });

  it('add symbol requires symbol_code', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = await request(makeApp())
      .post('/api/mdx/labeling/1/symbols')
      .send({ symbolName: 'Caution' });
    expect(res.status).toBe(422);
  });
});

/* ─── Global search ─────────────────────────────────────────── */

describe('Global search', () => {
  it('rejects q shorter than 2 chars', async () => {
    const res = await request(makeApp()).get('/api/mdx/search?q=a');
    expect(res.status).toBe(422);
  });

  it('returns grouped envelope', async () => {
    queryFn.mockResolvedValue({ rows: [{ id: '1', name: 'BX-204', code: 'BX', status: 'active', description: 'CGM' }] });
    const res = await request(makeApp()).get('/api/mdx/search?q=BX&type=program');
    expect(res.status).toBe(200);
    expect(res.body.meta.query).toBe('BX');
    expect(res.body.data.program).toHaveLength(1);
  });

  it('survives missing optional tables (42P01)', async () => {
    const err = Object.assign(new Error('missing'), { code: '42P01' });
    queryFn.mockRejectedValue(err);
    const res = await request(makeApp()).get('/api/mdx/search?q=test');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
  });
});

/* ─── Analytics ─────────────────────────────────────────────── */

describe('Analytics routes', () => {
  it('portfolio returns programs + byPathway + submissions', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ total: 6, active: 4, blocked: 1, complete: 1 }] })
      .mockResolvedValueOnce({ rows: [{ regulatory_path: '510k', n: 3 }, { regulatory_path: 'pma', n: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total: 12, received: 8, in_review: 3 }] });
    const res = await request(makeApp()).get('/api/mdx/analytics/portfolio');
    expect(res.status).toBe(200);
    expect(res.body.data.programs.total).toBe(6);
    expect(res.body.data.byPathway).toHaveLength(2);
    expect(res.body.data.submissions.received).toBe(8);
  });

  it('submissions cycle-times converts seconds to hours', async () => {
    queryFn
      .mockResolvedValueOnce({
        rows: [{ region: 'fda', total: 5, rejected: 1, received: 4, avg_to_ack_seconds: 7200 }],
      })
      .mockResolvedValueOnce({ rows: [{ error_class: 'gateway', n: 1 }] });
    const res = await request(makeApp()).get('/api/mdx/analytics/submissions');
    expect(res.status).toBe(200);
    expect(res.body.data.byRegion[0].avgToAckHours).toBe(2);
  });

  it('clinical roll-up survives missing tables', async () => {
    const err = Object.assign(new Error('missing'), { code: '42P01' });
    queryFn.mockRejectedValue(err);
    const res = await request(makeApp()).get('/api/mdx/analytics/clinical');
    expect(res.status).toBe(200);
    expect(res.body.data.studies.total).toBe(0);
  });

  it('blockers returns 3 sub-aggregates', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ category: 'engineering', open: 2, closed: 5 }] })
      .mockResolvedValueOnce({ rows: [{ validator: 'fda_evalidator', severity: 'error', n: 1, resolved: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 8, high_residual: 1, accepted: 7 }] });
    const res = await request(makeApp()).get('/api/mdx/analytics/blockers');
    expect(res.status).toBe(200);
    expect(res.body.data.risk.total).toBe(8);
  });
});
