/**
 * change-assessment + enablement route tests.
 *
 * `change-assessment` reads the org-scoped change_assessments store and returns
 * rows shaped to the surface's display contract, failing closed to an empty
 * envelope when the store isn't provisioned. `enablement` is still a contract
 * stub (empty envelope) pending its content store. The contract that must hold:
 * 403 without org context, a `{ data }` envelope with it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import changeAssessmentRouter from '../../routes/change-assessment.routes';
import enablementRouter from '../../routes/enablement';

function appWith(router: Router, org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/x', router);
  return app;
}

beforeEach(() => query.mockReset());

describe('enablement contract stub', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(enablementRouter, null)).get('/api/x');
    expect(res.status).toBe(403);
  });
  it('empty canonical envelope with org context', async () => {
    const res = await request(appWith(enablementRouter, 42)).get('/api/x');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('change-assessment route', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(changeAssessmentRouter, null)).get('/api/x');
    expect(res.status).toBe(403);
  });

  it('returns org-scoped rows shaped to the display contract', async () => {
    const row = {
      id: 'CH-118',
      title: 'Add predictive-low glucose alert algorithm',
      device: 'BX-204 CGM',
      area: 'Software / labeling',
      raised: '2026-06-10',
      owner: 'R. Okafor',
      fda: { outcome: 'new-submission', label: 'New 510(k) required', steps: [], rationale: '' },
      eu: { outcome: 'nb-notify', label: 'Significant change', steps: [], rationale: '' },
      doc: { kind: 'New 510(k)', status: 'draft' },
    };
    query.mockResolvedValueOnce({ rows: [row] });
    const res = await request(appWith(changeAssessmentRouter, 1)).get('/api/x');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    // Every display-contract key the surface renders is present.
    for (const k of ['id', 'title', 'device', 'area', 'raised', 'owner', 'fda', 'eu', 'doc']) {
      expect(res.body.data[0]).toHaveProperty(k);
    }
    // org-scoped query.
    expect(query).toHaveBeenCalledWith(expect.stringContaining('change_assessments'), [1]);
  });

  it('fails closed to an empty envelope when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    const res = await request(appWith(changeAssessmentRouter, 1)).get('/api/x');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});
