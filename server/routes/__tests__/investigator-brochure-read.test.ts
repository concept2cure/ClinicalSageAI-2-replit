/**
 * GET /api/investigator-brochure — ICH E6(R2) §7 IB section-structure read.
 *
 * The v2 InvestigatorBrochure surface adopts this list on shape match. Locks:
 * 403 without org, the { data } envelope with the display keys ({ number, title,
 * required, status, gaps, description, depth }), the honest deterministic
 * skeleton when no program is provisioned, and fail-closed to that skeleton
 * (never 500, never fabricated content) when the store errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import ibRouter from '../investigator-brochure.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/investigator-brochure', ibRouter);
  return app;
}

const DISPLAY_KEYS = ['number', 'title', 'required', 'status', 'gaps', 'description', 'depth'];

beforeEach(() => query.mockReset());

describe('GET /api/investigator-brochure', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/investigator-brochure');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('returns the honest ICH E6(R2) §7 skeleton when no program is provisioned', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(7)).get('/api/investigator-brochure');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);

    // Display-key contract on every row.
    for (const k of DISPLAY_KEYS) expect(res.body.data[0]).toHaveProperty(k);
    const numbers = res.body.data.map((r: { number: string }) => r.number);
    expect(numbers).toEqual(
      expect.arrayContaining(['0', '1', '2', '3', '4', '4.1', '4.2', '4.3', '5', '5.1', '5.2', '5.3', '6', '7']),
    );

    // Honest verdicts: boilerplate renders, data-bearing sections are missing.
    const byNum = (n: string) => res.body.data.find((r: { number: string }) => r.number === n);
    expect(byNum('0').status).toBe('rendered'); // Title Page (boilerplate)
    expect(byNum('4').status).toBe('missing'); // Nonclinical — no inputs linked
    expect(byNum('4').gaps.length).toBeGreaterThan(0);
    expect(byNum('4.1').depth).toBe(1);

    expect(res.body.meta.provisioned).toBe(false);
    expect(typeof res.body.meta.completeness).toBe('number');
  });

  it('fails closed to the skeleton when the store is not provisioned (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/investigator-brochure');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const k of DISPLAY_KEYS) expect(res.body.data[0]).toHaveProperty(k);
    expect(res.body.meta.provisioned).toBe(false);
    expect(res.body.meta.pendingStore).toBe(true);
  });

  it('fails closed to the skeleton on an unexpected store error (never 500)', async () => {
    query.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(7)).get('/api/investigator-brochure');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta.provisioned).toBe(false);
    expect(res.body.meta.pendingStore).toBe(false);
  });
});
