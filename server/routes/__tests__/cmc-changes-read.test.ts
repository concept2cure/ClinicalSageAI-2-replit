/**
 * GET /api/cmc-changes — governed proposed-change store projected through the
 * SUPAC/variations classifier into the Lifecycle "CMC change control" card shape.
 *
 * Locks: 403 without org; the live { data } contract (org id as $1, computed
 * risk/fdaCategory present); and fail-closed to an honest empty list (never 500)
 * with pendingStore on a missing store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import cmcRouter from '../cmc-changes.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/cmc-changes', cmcRouter);
  return app;
}

function dbRow(over: Record<string, unknown> = {}) {
  return {
    title: 'Bioreactor scale-up',
    area: 'Drug substance',
    programs: 'BX-099',
    status: 'evaluating',
    dosage_form_family: 'biologic',
    change_category: 'scale_up',
    scale_change_factor: 'within_10x',
    excipient_level_change: null,
    site_change_kind: null,
    process_change_kind: null,
    touches_critical_step: true,
    affects: 'drug_substance',
    has_comparability_data: false,
    description: null,
    ...over,
  };
}

beforeEach(() => query.mockReset());

describe('GET /api/cmc-changes', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/cmc-changes');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('projects the governed changes through the classifier', async () => {
    query.mockResolvedValueOnce({ rows: [dbRow(), dbRow({ title: 'Tighten spec', change_category: 'specifications', has_comparability_data: true, touches_critical_step: false })] });
    const res = await request(appWith(9)).get('/api/cmc-changes');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([9]);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toHaveProperty('risk');
    expect(res.body.data[0]).toHaveProperty('fdaCategory');
    expect(res.body.meta.provisioned).toBe(true);
  });

  it('fails closed to an empty list when the store is missing (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(9)).get('/api/cmc-changes');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
    expect(res.body.meta.provisioned).toBe(false);
  });

  it('fails closed to an empty list on any store error (never 500)', async () => {
    query.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(9)).get('/api/cmc-changes');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(false);
  });
});
