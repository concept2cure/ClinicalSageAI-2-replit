/**
 * POST /api/c2c/projects — real project create contract.
 *
 * The v2 New-Project wizard persists here instead of the old client-only
 * window.C2C_PROJECT stub. This locks: org scoping, required-field + enum
 * validation (so bad input never reaches SQL), the INSERT into the SAME
 * regulatory_programs table the portfolio list reads, the org-unique code
 * retry on 23505, the { data } response shaped to the portfolio display
 * contract, and the 503 PENDING_STORE fail-soft on an unprovisioned store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import projectsRouter from '../projects';

function appWith(org: number | null, userId?: number) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { organizationId: number }).organizationId = org;
    if (userId !== undefined) (req as unknown as { userId: number }).userId = userId;
    next();
  });
  app.use('/api/c2c/projects', projectsRouter);
  return app;
}

beforeEach(() => query.mockReset());

const KEYS = ['id', 'title', 'ws', 'code', 'stage', 'readiness', 'status', 'lead', 'blocker', 'due', 'activity'];
const shapedRow = () => Object.fromEntries(KEYS.map((k) => [k, k === 'readiness' ? 0 : k === 'blocker' ? null : 'x']));
const validBody = {
  name: 'BX-204 — NDA',
  productName: 'BX-204',
  programType: 'nda',
  productType: 'drug',
  primaryAgency: 'FDA',
  indication: 'Solid tumors',
  targetSubmissionDate: '2026-12-01',
  teamMembers: ['Jordan Chen'],
};

describe('POST /api/c2c/projects', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('400 when name is missing', async () => {
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send({ ...validBody, name: '' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('400 on an invalid programType (never reaches SQL)', async () => {
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send({ ...validBody, programType: 'bogus' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('inserts into regulatory_programs and returns the portfolio display contract', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // INSERT ... RETURNING id
      .mockResolvedValueOnce({ rows: [shapedRow()] }); // re-select
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(true);
    for (const k of KEYS) expect(res.body.data).toHaveProperty(k);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO regulatory_programs');
    // org, program_type, product_type persisted as given
    expect(params[0]).toBe(7);
    expect(params).toContain('nda');
    expect(params).toContain('drug');
    // lead_user_id = the creating user
    expect(params).toContain(3);
  });

  it('derives product_type from program_type when the client omits it', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] })
      .mockResolvedValueOnce({ rows: [shapedRow()] });
    const { productType, ...noProduct } = validBody;
    void productType;
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send({ ...noProduct, programType: 'bla' });
    expect(res.status).toBe(201);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toContain('biologic'); // bla → biologic
  });

  it('retries with a suffixed code on a unique-code collision (23505)', async () => {
    query
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' })) // first INSERT collides
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // retry INSERT
      .mockResolvedValueOnce({ rows: [shapedRow()] }); // re-select
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(201);
    expect(query).toHaveBeenCalledTimes(3);
    const firstCode = (query.mock.calls[0] as [string, unknown[]])[1][2];
    const retryCode = (query.mock.calls[1] as [string, unknown[]])[1][2];
    expect(retryCode).not.toBe(firstCode);
    expect(String(retryCode).startsWith(String(firstCode))).toBe(true);
  });

  it('503 PENDING_STORE when the store is not provisioned (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PENDING_STORE');
  });
});
