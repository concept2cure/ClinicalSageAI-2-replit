/**
 * GET /api/labeling-pi — labeling / prescribing-information read contract.
 *
 * The v2 LabelingPi surface adopts this list only when it carries the full
 * display shape. Locks: 403 without org, the { data } envelope with the display
 * keys ({ n, label, st, flag, content, negotiation }, content/negotiation from
 * JSONB), and 42P01 fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import labelingPiRouter from '../labeling-pi.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/labeling-pi', labelingPiRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/labeling-pi', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/labeling-pi');
    expect(res.status).toBe(403);
  });

  it('returns sections shaped to the display contract (content/negotiation from JSONB)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          n: '1', label: 'Indications and usage', st: 'negotiation', flag: 'agency',
          content: { heading: '1  Indications and usage', body: ['BX-204 is indicated…'] },
          negotiation: {
            round: 'Labeling round 2', cycle: 'FDA -- day 312 of review',
            sponsor: 'BX-204 is indicated for…', agency: 'BX-204 is indicated for… second-line+',
            rationale: 'FDA proposes restricting the indicated population…',
          },
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/labeling-pi');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['n', 'label', 'st', 'flag', 'content', 'negotiation']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.n).toBe('1');
    expect(first.flag).toBe('agency');
    expect(first.content).toHaveProperty('heading');
    expect(Array.isArray(first.content.body)).toBe(true);
    expect(first.negotiation).toHaveProperty('sponsor');
    expect(first.negotiation).toHaveProperty('agency');
    expect(first.negotiation).toHaveProperty('rationale');
    expect(res.body.meta.count).toBe(1);
  });

  it('rehydrates null flag/content/negotiation for sections without them', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { n: '9', label: 'Drug abuse and dependence', st: 'na', flag: null, content: null, negotiation: null },
      ],
    });
    const res = await request(appWith(7)).get('/api/labeling-pi');
    expect(res.status).toBe(200);
    const first = res.body.data[0];
    expect(first.flag).toBeNull();
    expect(first.content).toBeNull();
    expect(first.negotiation).toBeNull();
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/labeling-pi');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
