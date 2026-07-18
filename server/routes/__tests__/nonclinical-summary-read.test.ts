/**
 * GET /api/nonclinical-summary — live M2.6 / Module 4 / SEND projection of the
 * governed nonclinical registry.
 *
 * Locks: 403 without org; the { data: { m26, m4, send, completeness, gaps,
 * provisioned } } envelope; a live projection over governed rows; the honest
 * all-missing skeleton when the org has no studies; and fail-closed to that
 * skeleton (never 500, never fabricated) when the store errors — with
 * meta.pendingStore on a missing table (42P01).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import ncRouter from '../nonclinical-summary.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/nonclinical-summary', ncRouter);
  return app;
}

/** A governed row in the raw SQL shape `listStudiesForSummary` returns. */
function row(over: Record<string, unknown> = {}) {
  return {
    study_number: 'TX-701',
    study_type: 'repeat_dose_tox',
    species: 'Rat',
    glp_compliant: true,
    noael: '100 mg/kg/day',
    duration_label: '26-week',
    key_finding: 'Minimal hepatocellular hypertrophy (adaptive)',
    status: 'finalized',
    domains_present: ['TS', 'DM', 'EX', 'BW', 'CL', 'LB', 'OM', 'MA', 'MI', 'FW'],
    define_xml_present: true,
    nsdrc_present: true,
    validation_status: 'passed',
    validator_error_count: 0,
    ...over,
  };
}

beforeEach(() => query.mockReset());

describe('GET /api/nonclinical-summary', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/nonclinical-summary');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('projects the governed registry live (M2.6 / M4 / SEND)', async () => {
    query.mockResolvedValueOnce({
      rows: [row(), row({ study_number: 'PK-301', study_type: 'adme_pk', status: 'in_reporting', validation_status: null, domains_present: null })],
    });
    const res = await request(appWith(7)).get('/api/nonclinical-summary');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);

    const { data } = res.body;
    expect(data.provisioned).toBe(true);
    // M2.6: tox + PK present → those subsections complete.
    expect(data.m26).toHaveLength(7);
    expect(data.m26.find((s: { n: string }) => s.n === '2.6.6').st).toBe('complete'); // tox
    expect(data.m26.find((s: { n: string }) => s.n === '2.6.4').st).toBe('complete'); // PK (adme_pk)
    // M4: 4.2.3 has the finalized repeat-dose tox → 100%.
    expect(data.m4.find((m: { code: string }) => m.code === '4.2.3').pct).toBe(100);
    // SEND: repeat-dose tox in scope + fully validated → validated >= 1.
    expect(data.send.inScope).toBeGreaterThanOrEqual(1);
    expect(data.send.validated).toBeGreaterThanOrEqual(1);
    expect(typeof data.completeness).toBe('number');
  });

  it('returns the honest all-missing skeleton when the org has no studies', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(7)).get('/api/nonclinical-summary');
    expect(res.status).toBe(200);
    expect(res.body.data.provisioned).toBe(false);
    expect(res.body.data.m26.find((s: { n: string }) => s.n === '2.6.6').st).toBe('missing');
    expect(res.body.data.m26.find((s: { n: string }) => s.n === '2.6.1').st).toBe('complete');
    expect(res.body.meta.provisioned).toBe(false);
  });

  it('fails closed to the skeleton when the store is missing (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/nonclinical-summary');
    expect(res.status).toBe(200);
    expect(res.body.data.provisioned).toBe(false);
    expect(res.body.data.m26).toHaveLength(7);
    expect(res.body.meta.pendingStore).toBe(true);
  });

  it('fails closed to the skeleton on an unexpected store error (never 500)', async () => {
    query.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(7)).get('/api/nonclinical-summary');
    expect(res.status).toBe(200);
    expect(res.body.data.provisioned).toBe(false);
    expect(res.body.meta.pendingStore).toBe(false);
  });
});
