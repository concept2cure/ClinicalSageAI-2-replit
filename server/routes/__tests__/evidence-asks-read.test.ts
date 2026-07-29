/**
 * GET /api/evidence-asks — saved evidence-ask read contract.
 *
 * The v2 Evidence surface adopts this single object as its answer/chunks/
 * suggestions when the store is live. Locks: 403 without org, the { data }
 * envelope with the display keys ({ pedigree, answer, cites, chunks,
 * suggestions }, chunks carrying { n, doc, page, sim, snip }), and 42P01
 * fail-closed to `null`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import evidenceRouter from '../evidence-asks.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/evidence-asks', evidenceRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/evidence-asks', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/evidence-asks');
    expect(res.status).toBe(403);
  });

  it('returns the display-shaped ask (pedigree/answer/cites/chunks/suggestions)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'ask-bx204-cgm',
          question: 'What testing does 14-day wear require?',
          pedigree: 'model_assisted',
          answer: 'For a 14-day wear CGM, FDA precedent requires ISO 10993-11…',
          cites: [1, 2, 3],
          chunks: [
            { n: 1, doc: 'K221847 Decision Summary.pdf', page: 'p. 7', sim: 0.92, snip: '…extended-wear sensors…' },
          ],
          suggestions: ['What testing does 14-day wear require?'],
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/evidence-asks');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const data = res.body.data;
    for (const k of ['pedigree', 'answer', 'cites', 'chunks', 'suggestions']) {
      expect(data).toHaveProperty(k);
    }
    expect(Array.isArray(data.chunks)).toBe(true);
    expect(data.chunks.length).toBeGreaterThan(0);
    for (const k of ['n', 'doc', 'page', 'sim', 'snip']) {
      expect(data.chunks[0]).toHaveProperty(k);
    }
    expect(res.body.meta.count).toBe(1);
  });

  it('fails closed to null when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/evidence-asks');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
