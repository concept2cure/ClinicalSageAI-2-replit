/**
 * GET /api/cro-portfolio — CRO sponsor-portfolio read contract.
 *
 * The v2 CroPortfolio surface adopts this roster when the store returns the full
 * CroSponsor shape. Locks: 403 without org, the { data } envelope with the
 * display keys ({ id, name, type, lead, sow, sowNote, studies, subs }, with
 * sow_note → sowNote and studies/subs rehydrated from JSONB), and 42P01
 * fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import croRouter from '../cro-portfolio.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/cro-portfolio', croRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/cro-portfolio', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/cro-portfolio');
    expect(res.status).toBe(403);
  });

  it('returns sponsors shaped to the display contract (sow_note → sowNote, JSONB rehydrated)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'helix', name: 'Helix Therapeutics', type: 'biotech', lead: 'M. Webb',
          sow: 'on-track', sow_note: 'MSA + 2 active SOWs - renews Q1 2027',
          studies: [{ code: 'BX204-301', phase: 'Phase 3', ind: 'rezatinib - RTK-X+ solid tumors', status: 'Enrolling', n: '412 / 480' }],
          subs: [{ id: 'BLA 761204', type: 'BLA', region: 'FDA - CBER', state: 'assembling', gate: '2 gates open', due: 'Q4 2026' }],
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/cro-portfolio');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['id', 'name', 'type', 'lead', 'sow', 'sowNote', 'studies', 'subs']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.sowNote).toBe('MSA + 2 active SOWs - renews Q1 2027');
    // nested arrays rehydrate into the CroStudy / CroSub display shapes
    expect(first.studies[0]).toMatchObject({ code: 'BX204-301', phase: 'Phase 3', status: 'Enrolling', n: '412 / 480' });
    expect(first.subs[0]).toMatchObject({ id: 'BLA 761204', type: 'BLA', state: 'assembling' });
    expect(res.body.meta.count).toBe(1);
  });

  it('coerces non-array JSONB columns to empty lists', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'cohort', name: 'Cohort Bio', type: 'biotech', lead: 'R. Nair', sow: 'on-track', sow_note: null, studies: null, subs: null },
      ],
    });
    const res = await request(appWith(7)).get('/api/cro-portfolio');
    expect(res.status).toBe(200);
    expect(res.body.data[0].studies).toEqual([]);
    expect(res.body.data[0].subs).toEqual([]);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/cro-portfolio');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
