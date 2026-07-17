/**
 * NDA/BLA cockpit — Refuse-to-File (RtF) risk-log read+write contract.
 *
 * The v2 NdaCockpit "Refuse-to-File risk" list adopts GET /api/nda-cockpit/rtf
 * and appends through POST /api/nda-cockpit/rtf. Locks: 403 without org on both,
 * the { data } envelope with the display keys ({ id, sev, area, text, fix }),
 * GET fail-closed to an empty list on 42P01, POST 400 when area or text is
 * missing, the org-scoped INSERT returning the created row in display shape
 * (201 { data, meta:{created} }), and POST 42P01 → 503 PENDING_STORE.
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

describe('GET /api/nda-cockpit/rtf', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/nda-cockpit/rtf');
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns RtF risks shaped to the display contract', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'rtf-1', sev: 'high', area: 'Module 5 · datasets', text: 'define.xml validation error', fix: 'Resolve define.xml' },
        { id: 'rtf-2', sev: 'med', area: 'Module 1 · financial', text: '2 investigators missing 3454/3455', fix: 'Collect disclosures' },
      ],
    });
    const res = await request(appWith(7)).get('/api/nda-cockpit/rtf');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['id', 'sev', 'area', 'text', 'fix']) {
      expect(first).toHaveProperty(k);
    }
    expect(res.body.data[0].sev).toBe('high');
    expect(res.body.meta.count).toBe(2);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/nda-cockpit/rtf');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('POST /api/nda-cockpit/rtf', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/nda-cockpit/rtf').send({ area: 'Module 1', text: 'X' });
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('400 when area is missing', async () => {
    const res = await request(appWith(7)).post('/api/nda-cockpit/rtf').send({ text: 'X' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('400 when text is missing', async () => {
    const res = await request(appWith(7)).post('/api/nda-cockpit/rtf').send({ area: 'Module 1' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('inserts org-scoped and returns the created row in display shape', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'rtf-123', sev: 'high', area: 'Module 3 · CMC', text: 'Stability gap', fix: 'Close reconciliation' },
      ],
    });
    const res = await request(appWith(7))
      .post('/api/nda-cockpit/rtf')
      .send({ area: 'Module 3 · CMC', text: 'Stability gap', sev: 'high', fix: 'Close reconciliation' });

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(true);

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/INSERT INTO c2c_nda_rtf/);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe(7); // organization_id
    expect(params[1]).toMatch(/^rtf-/); // generated id
    expect(params).toContain('Module 3 · CMC');
    expect(params).toContain('Stability gap');

    const data = res.body.data;
    for (const k of ['id', 'sev', 'area', 'text', 'fix']) {
      expect(data).toHaveProperty(k);
    }
    expect(data.id).toBe('rtf-123');
    expect(data.sev).toBe('high');
  });

  it('defaults sev to med when omitted', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'rtf-9', sev: 'med', area: 'Module 2', text: 'Y', fix: null }],
    });
    const res = await request(appWith(7))
      .post('/api/nda-cockpit/rtf')
      .send({ area: 'Module 2', text: 'Y' });
    expect(res.status).toBe(201);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params).toContain('med'); // sev default
  });

  it('42P01 → 503 PENDING_STORE (store not provisioned)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).post('/api/nda-cockpit/rtf').send({ area: 'Module 1', text: 'X' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PENDING_STORE');
  });
});
