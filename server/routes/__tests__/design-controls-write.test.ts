/**
 * POST /api/design-controls — DHF design-input write-back contract.
 *
 * Adds one org-scoped design input into the same store that backs the GET read.
 * Locks: 403 without org, org-scoped INSERT with the submitted fields, the
 * created row echoed back in the GET display shape ({ id, cat, req, riskRef,
 * outputs, ver, verRef, val, valRef }) under { data, meta:{created} } at 201,
 * 400 when the requirement is missing, and 42P01 → 503 PENDING_STORE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import designControlsRouter from '../design-controls.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/design-controls', designControlsRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('POST /api/design-controls', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null))
      .post('/api/design-controls')
      .send({ req: 'Battery lasts a full 14-day wear period', cat: 'performance' });
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('400 when the requirement is missing', async () => {
    const res = await request(appWith(7)).post('/api/design-controls').send({ cat: 'performance' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('inserts org-scoped and returns the created row in the display shape', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'dc-1700000000000', cat: 'performance', req: 'Battery lasts a full 14-day wear period',
          risk_ref: 'HZ-02', outputs: [], ver: null, ver_ref: null, val: null, val_ref: null,
        },
      ],
    });
    const res = await request(appWith(7))
      .post('/api/design-controls')
      .send({ req: 'Battery lasts a full 14-day wear period', cat: 'performance', riskRef: 'HZ-02' });

    expect(res.status).toBe(201);

    // Org-scoped INSERT carrying the submitted fields.
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/INSERT INTO c2c_design_controls/i);
    expect(params[1]).toBe(7); // organization_id
    expect(params).toContain('performance'); // cat
    expect(params).toContain('Battery lasts a full 14-day wear period'); // req
    expect(params).toContain('HZ-02'); // risk_ref

    // Created row echoed back in the GET display shape.
    const data = res.body.data;
    for (const k of ['id', 'cat', 'req', 'riskRef', 'outputs', 'ver', 'verRef', 'val', 'valRef']) {
      expect(data).toHaveProperty(k);
    }
    expect(data.id).toBe('dc-1700000000000');
    expect(data.riskRef).toBe('HZ-02');
    expect(data.outputs).toEqual([]);
    expect(data.ver).toBeNull();
    expect(res.body.meta.created).toBe(true);
  });

  it('defaults an omitted category to functional', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'dc-2', cat: 'functional', req: 'Report every 5 minutes', risk_ref: null, outputs: [], ver: null, ver_ref: null, val: null, val_ref: null }],
    });
    const res = await request(appWith(7)).post('/api/design-controls').send({ req: 'Report every 5 minutes' });
    expect(res.status).toBe(201);
    expect(query.mock.calls[0][1]).toContain('functional');
  });

  it('503 PENDING_STORE when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7))
      .post('/api/design-controls')
      .send({ req: 'Battery lasts a full 14-day wear period', cat: 'performance' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PENDING_STORE');
  });
});
