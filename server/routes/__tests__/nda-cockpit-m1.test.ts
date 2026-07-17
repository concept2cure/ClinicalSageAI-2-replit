/**
 * NDA/BLA cockpit — Module-1 admin worklist read+write contract.
 *
 * The v2 NdaCockpit "Module 1 admin" list adopts GET /api/nda-cockpit/m1 and
 * appends through POST /api/nda-cockpit/m1. Locks: 403 without org on both, the
 * { data } envelope with the display keys ({ id, label, st, blocker, note }),
 * GET fail-closed to an empty list on 42P01, POST 400 when label is missing,
 * the org-scoped INSERT returning the created row in display shape (201
 * { data, meta:{created} }), and POST 42P01 → 503 PENDING_STORE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import ndaRouter from '../nda-cockpit.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/nda-cockpit', ndaRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/nda-cockpit/m1', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/nda-cockpit/m1');
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns Module 1 docs shaped to the display contract', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: '356h', label: 'Form FDA 356h', st: 'complete', blocker: false, note: null },
        { id: 'fin', label: 'Financial disclosure', st: 'review', blocker: true, note: '2 investigators outstanding' },
      ],
    });
    const res = await request(appWith(7)).get('/api/nda-cockpit/m1');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['id', 'label', 'st', 'blocker']) {
      expect(first).toHaveProperty(k);
    }
    expect(res.body.data[1].blocker).toBe(true);
    expect(res.body.meta.count).toBe(2);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/nda-cockpit/m1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('POST /api/nda-cockpit/m1', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/nda-cockpit/m1').send({ label: 'X' });
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('400 when label is missing', async () => {
    const res = await request(appWith(7)).post('/api/nda-cockpit/m1').send({ st: 'draft' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('inserts org-scoped and returns the created row in display shape', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'm1-123', label: 'Establishment description', st: 'draft', blocker: false, note: 'DMF ref pending' },
      ],
    });
    const res = await request(appWith(7))
      .post('/api/nda-cockpit/m1')
      .send({ label: 'Establishment description', note: 'DMF ref pending' });

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(true);

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/INSERT INTO c2c_nda_m1_docs/);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe(7); // organization_id
    expect(params[1]).toMatch(/^m1-/); // generated id
    expect(params).toContain('Establishment description');
    expect(params).toContain('draft'); // st default

    const data = res.body.data;
    for (const k of ['id', 'label', 'st', 'blocker']) {
      expect(data).toHaveProperty(k);
    }
    expect(data.id).toBe('m1-123');
    expect(data.st).toBe('draft');
    expect(data.blocker).toBe(false);
  });

  it('42P01 → 503 PENDING_STORE (store not provisioned)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).post('/api/nda-cockpit/m1').send({ label: 'X' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PENDING_STORE');
  });
});
