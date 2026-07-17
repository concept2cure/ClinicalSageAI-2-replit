/**
 * GET/POST /api/maa-module1/:market — persisted non-US Module-1 readiness.
 *
 * Locks: 403 without org; 404 for an unmodeled market; the { data: { market,
 * requirements, provided, assessment } } envelope; readiness computed from the
 * persisted assembled set via the real assessRegionalModule1 engine; fail-closed
 * to the empty-provided assessment on a missing store (42P01, pendingStore);
 * POST toggle (assembled/not) + validation of the component code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import maaRouter from '../maa-module1.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/maa-module1', maaRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/maa-module1/:market', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/maa-module1/EMA');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('404 for an unmodeled market', async () => {
    const res = await request(appWith(7)).get('/api/maa-module1/ATLANTIS');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('UNKNOWN_MARKET');
    expect(query).not.toHaveBeenCalled();
  });

  it('projects the persisted assembled set into a live EMA readiness assessment', async () => {
    // Two of the six EMA components assembled.
    query.mockResolvedValueOnce({ rows: [{ component_code: 'eu_cover_letter' }, { component_code: 'eu_eaf' }] });
    const res = await request(appWith(7)).get('/api/maa-module1/EMA');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7, 'EMA']);
    const { data } = res.body;
    expect(data.market).toBe('EMA');
    expect(data.requirements.length).toBe(6);
    expect(data.provided).toEqual(['eu_cover_letter', 'eu_eaf']);
    // 4 required components still missing → not ready.
    expect(data.assessment.ready).toBe(false);
    expect(data.assessment.missing).toContain('eu_rmp');
    expect(data.assessment.missing).not.toContain('eu_eaf');
  });

  it('is ready when every required component is assembled', async () => {
    query.mockResolvedValueOnce({
      rows: ['jp_application_form', 'jp_product_information', 'jp_gmp', 'jp_manufacturer_certificate'].map((c) => ({ component_code: c })),
    });
    const res = await request(appWith(7)).get('/api/maa-module1/PMDA');
    expect(res.status).toBe(200);
    expect(res.body.data.assessment.ready).toBe(true);
    expect(res.body.data.assessment.missing).toEqual([]);
  });

  it('fails closed to the empty-provided assessment on a missing store (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/maa-module1/EMA');
    expect(res.status).toBe(200);
    expect(res.body.data.provided).toEqual([]);
    expect(res.body.data.assessment.ready).toBe(false);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('POST /api/maa-module1/:market', () => {
  it('rejects a component code not required for the market', async () => {
    const res = await request(appWith(7)).post('/api/maa-module1/EMA').send({ componentCode: 'not_a_real_code', assembled: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
    expect(query).not.toHaveBeenCalled();
  });

  it('marks a component assembled and returns the refreshed assessment', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // upsert
      .mockResolvedValueOnce({ rows: [{ component_code: 'eu_eaf' }] }); // re-read
    const res = await request(appWith(7)).post('/api/maa-module1/EMA').send({ componentCode: 'eu_eaf', assembled: true });
    expect(res.status).toBe(200);
    expect(res.body.data.provided).toEqual(['eu_eaf']);
    expect(res.body.meta.updated).toBe(true);
  });

  it('503 PENDING_STORE when the store is missing (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).post('/api/maa-module1/EMA').send({ componentCode: 'eu_eaf', assembled: true });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PENDING_STORE');
  });
});
