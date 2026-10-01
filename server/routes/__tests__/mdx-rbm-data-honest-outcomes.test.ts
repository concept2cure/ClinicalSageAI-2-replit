/**
 * RBM data routes — every outcome is named, none is rendered as an empty result.
 *
 *   - POST /rbm-site-risk/recompute on a program that is not a live project of
 *     the caller's organization (programInOrganization, 38a9417c6) is a 404 and never reads site_intel (#1128); a source failure is a
 *     502 with a machine-readable reason, not `200 []`.
 *   - POST /rbm-metric-ingest of an extract already loaded is a 409 naming the
 *     run; a reprocess without a reason is a 422; neither commits (#1130).
 *   - POST /rbm-patient-profiles/score persists the per-dimension breakdown as
 *     metadata.dimensionScores (#1127).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  routes: [] as { match: RegExp; rows: unknown[] | Error }[],
  calls: [] as { sql: string; args: unknown[] }[],
}));
const query = vi.hoisted(() => vi.fn(async (sql: string, args: unknown[] = []) => {
  h.calls.push({ sql, args });
  for (const r of h.routes) {
    if (r.match.test(sql)) {
      if (r.rows instanceof Error) throw r.rows;
      return { rows: r.rows, rowCount: r.rows.length };
    }
  }
  return { rows: [], rowCount: 0 };
}));
vi.mock('../../db', () => ({
  pool: { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) },
}));

import dataRouter from '../mdx-rbm-data';

const PROGRAM = '11111111-2222-3333-4444-555555555555';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 7, organizationId: 1, role: 'admin' };
    next();
  });
  a.use('/api/mdx', dataRouter);
  return a;
}
const on = (match: RegExp, rows: unknown[] | Error) => h.routes.push({ match, rows });
const stmts = () => h.calls.map(c => c.sql.trim());

beforeEach(() => {
  query.mockClear();
  h.routes.length = 0;
  h.calls.length = 0;
});

describe('POST /rbm-site-risk/recompute', () => {
  it('refuses another tenant\'s program with 404 and never reads Site Intelligence', async () => {
    // The one program check (programInOrganization) finds no live program of the org.
    const res = await request(app()).post('/api/mdx/rbm-site-risk/recompute').send({ programId: PROGRAM });
    expect(res.status).toBe(404);
    expect(h.calls.some(c => c.sql.includes('site_intel'))).toBe(false);
    expect(h.calls.some(c => c.sql.includes('DELETE'))).toBe(false);
  });

  it('reports an unavailable source as 502 with its reason, not as an empty study', async () => {
    on(/FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2/, [{ id: PROGRAM }]);
    on(/site_intel\.sites/, Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    const res = await request(app()).post('/api/mdx/rbm-site-risk/recompute').send({ programId: PROGRAM });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).toContain('source_unavailable');
    expect(h.calls.some(c => c.sql.includes('DELETE'))).toBe(false);
  });

  it('returns the snapshots on a successful read', async () => {
    on(/FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2/, [{ id: PROGRAM }]);
    on(/site_intel\.sites/, [{ id: 1, site_number: 'S1', quality_score: 30 }]);
    const res = await request(app()).post('/api/mdx/rbm-site-risk/recompute').send({ programId: PROGRAM });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(stmts()).toContain('COMMIT');
  });
});

describe('POST /rbm-metric-ingest', () => {
  const body = { programId: PROGRAM, source: 'edc', csv: 'metric_key,value\nQuery rate,12\n' };

  it('refuses a duplicate extract with 409 naming the prior run, and commits nothing', async () => {
    on(/FROM rbm_data_runs/, [{ id: 7, status: 'succeeded', data_cutoff: '2026-07-01', started_at: '2026-07-02T00:00:00Z', rows_accepted: 12, mapping_version: 'v1' }]);
    const res = await request(app()).post('/api/mdx/rbm-metric-ingest').send(body);
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toMatch(/already loaded/);
    expect(JSON.stringify(res.body)).toContain('#7');
    expect(stmts()).not.toContain('COMMIT');
    expect(h.calls.some(c => c.sql.includes('INSERT INTO rbm_data_runs'))).toBe(false);
  });

  it('refuses a reprocess with no reason (422)', async () => {
    on(/FROM rbm_data_runs/, [{ id: 7, status: 'succeeded', rows_accepted: 1 }]);
    const res = await request(app()).post('/api/mdx/rbm-metric-ingest').send({ ...body, reprocess: true });
    expect(res.status).toBe(422);
    expect(stmts()).not.toContain('COMMIT');
  });

  it('maps the concurrent-duplicate unique violation to 409, not 500', async () => {
    on(/INSERT INTO rbm_data_runs/, [{ id: 9 }]);
    on(/UPDATE rbm_data_runs\s+SET status/, Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'rbm_data_runs_replay_uq' }));
    const res = await request(app()).post('/api/mdx/rbm-metric-ingest').send(body);
    expect(res.status).toBe(409);
    expect(stmts()).toContain('ROLLBACK');
  });
});

describe('POST /rbm-patient-profiles/score', () => {
  it('persists the per-dimension breakdown as metadata.dimensionScores', async () => {
    const cohort = [1, 2, 3, 4, 5].map(i => ({ id: i, subject_id: `P${i}`, site_id: null, metrics: { queries: i === 5 ? 40 : 2 + (i % 2) } }));
    on(/SELECT id, subject_id, site_id, metrics FROM rbm_patient_profiles/, cohort);
    const res = await request(app()).post('/api/mdx/rbm-patient-profiles/score').send({ programId: PROGRAM });
    expect(res.status).toBe(200);
    const updates = h.calls.filter(c => c.sql.includes('UPDATE rbm_patient_profiles'));
    expect(updates).toHaveLength(5);
    expect(updates[0].sql).toContain('dimensionScores');
    const p5 = updates.find(u => u.args.includes(5))!;
    const dims = JSON.parse(p5.args[3] as string);
    expect(dims[0]).toMatchObject({ dimension: 'queries' });
    expect(dims[0].z).toBeGreaterThan(0);
  });
});
