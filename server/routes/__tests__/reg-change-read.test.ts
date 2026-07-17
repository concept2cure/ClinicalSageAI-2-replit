/**
 * GET /api/reg-change — regulatory-change horizon-scan read contract.
 *
 * The v2 RegChange surface adopts this list only when it carries the full
 * display shape. Locks: 403 without org, the { data } envelope with the display
 * keys ({ id, src, kind, when, sev, live, title, summary, affects, action, doc,
 * owner, due }, with when_label → when), and 42P01 fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import regChangeRouter from '../reg-change.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/reg-change', regChangeRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/reg-change', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/reg-change');
    expect(res.status).toBe(403);
  });

  it('returns changes shaped to the display contract (when_label → when, affects from JSONB)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'QMSR', src: 'FDA · final rule', kind: 'regulation', when_label: 'Effective 2 Feb 2026',
          sev: 'high', live: true, title: 'QMSR — 21 CFR 820 harmonized to ISO 13485:2016',
          summary: 'FDA replaces the Quality System Regulation…',
          affects: [{ dev: 'BX-204 CGM', what: 'DHF terminology', sub: '510(k) OR-902' }],
          action: 'QMSR transition plan + gap analysis', doc: 'QMSR gap analysis & transition plan',
          owner: 'Quality', due: 'Effective now',
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/reg-change');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['id', 'src', 'kind', 'when', 'sev', 'live', 'title', 'summary', 'affects', 'action', 'doc', 'owner', 'due']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.when).toBe('Effective 2 Feb 2026');
    expect(Array.isArray(first.affects)).toBe(true);
    expect(first.affects[0]).toHaveProperty('dev');
    expect(first.affects[0]).toHaveProperty('what');
    expect(first.affects[0]).toHaveProperty('sub');
    expect(res.body.meta.count).toBe(1);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/reg-change');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
