/**
 * GET /api/shadow-review — pre-file reviewer worklist read contract.
 *
 * The v2 ShadowReview surface adopts this list only when it carries the full
 * display shape. Locks: 403 without org, the { data } envelope with the display
 * keys ({ lens, findings[] }, each finding carrying
 * { dimension, severity, title, detail, basis, recommendation, leafRef } from
 * JSONB), and 42P01 fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import shadowReviewRouter from '../shadow-review.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/shadow-review', shadowReviewRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/shadow-review', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/shadow-review');
    expect(res.status).toBe(403);
  });

  it('returns lenses shaped to the display contract (findings[] from JSONB)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          lens: 'fda_filing',
          findings: [
            {
              dimension: 'crl', severity: 'major',
              title: 'Single pivotal trial without confirmatory support',
              detail: 'Efficacy rests on one pivotal study (BX204-301).',
              basis: 'FDA 1998 guidance; 21 CFR 314.126.',
              recommendation: 'Pre-empt in §2.5.4.',
              leafRef: '2.5.4',
            },
          ],
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/shadow-review');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    expect(first).toHaveProperty('lens', 'fda_filing');
    expect(Array.isArray(first.findings)).toBe(true);
    const f = first.findings[0];
    for (const k of ['dimension', 'severity', 'title', 'detail', 'basis', 'recommendation', 'leafRef']) {
      expect(f).toHaveProperty(k);
    }
    expect(f.dimension).toBe('crl');
    expect(f.leafRef).toBe('2.5.4');
    expect(res.body.meta.count).toBe(1);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/shadow-review');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
