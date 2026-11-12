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

// This domain suite retains its existing fixture admission; current project denial is covered separately.
vi.mock('../../services/rbm/rbm-access', async original => ({ ...(await original<Record<string, unknown>>()), rbmRequestAdmission: (_req: unknown, _res: unknown, next: () => void) => next(), recheckRbmWrite: async () => {} }));

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
    Object.assign(req, { dbClient: { query } });
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

  it('reports an unreadable source as 502 with its reason, not as an empty study', async () => {
    on(/FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2/, [{ id: PROGRAM }]);
    // The register exists and this role may not read it. (Until 2026-11-11 this case used 42P01, a register that
    // is not installed; that one now has a second source, below.)
    on(/site_intel\.sites/, Object.assign(new Error('permission denied for schema site_intel'), { code: '42501' }));
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
    expect(res.body.meta).toMatchObject({ count: 1, source: 'site_intelligence' });
    expect(stmts()).toContain('COMMIT');
  });

  // GA-S8-02: nothing a person can reach writes Site Intelligence, so a study's sites come from its own site-level
  // indicator readings when that register holds none, or is not installed. The answer says which source it used.
  const READING = { site_number: '104', kri_name: 'Open query aging', unit: 'days', value: '58', threshold_amber: '14', threshold_red: '21', direction: 'higher_worse', observed_at: '2026-10-31T00:00:00Z', data_cutoff: '2026-10-31' };

  it('scores the sites from the study\'s indicator readings when Site Intelligence holds none', async () => {
    on(/FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2/, [{ id: PROGRAM }]);
    on(/FROM rbm_metric_observations/, [READING]);
    const res = await request(app()).post('/api/mdx/rbm-site-risk/recompute').send({ programId: PROGRAM });
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ count: 1, source: 'study_indicators' });
    expect(res.body.data[0]).toMatchObject({ siteNumber: '104', compositeRisk: 100, monitoringTier: 'enhanced' });
    expect(stmts()).toContain('COMMIT');
  });

  it('does the same where Site Intelligence is not installed, which is not a failure of the study\'s data', async () => {
    on(/FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2/, [{ id: PROGRAM }]);
    on(/site_intel\.sites/, Object.assign(new Error('relation "site_intel.sites" does not exist'), { code: '42P01' }));
    on(/FROM rbm_metric_observations/, [READING]);
    const res = await request(app()).post('/api/mdx/rbm-site-risk/recompute').send({ programId: PROGRAM });
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ count: 1, source: 'study_indicators' });
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

// GA-S8-02: an extract that carries site-level rows changes what the study knows about its sites, so the load
// rescores them. The load stands whether or not the rescore does, and the answer says which.
describe('POST /rbm-metric-ingest rescores the study\'s sites when the extract carried site rows', () => {
  const SITE_CSV = 'metric_key,scope_level,scope_id,value\nOpen query aging,study,,22\nOpen query aging,site,104,58\n';
  const STUDY_CSV = 'metric_key,scope_level,scope_id,value\nOpen query aging,study,,22\n';
  const load = (csv: string) => request(app()).post('/api/mdx/rbm-metric-ingest').send({ programId: PROGRAM, source: 'edc', csv });
  const READING = { site_number: '104', kri_name: 'Open query aging', unit: 'days', value: '58', threshold_amber: '14', threshold_red: '21', direction: 'higher_worse', observed_at: '2026-10-31T00:00:00Z', data_cutoff: '2026-10-31' };
  beforeEach(() => { on(/INSERT INTO rbm_data_runs/, [{ id: 5 }]); });

  it('a load with site rows answers with how many sites were rescored and from which source', async () => {
    on(/FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2/, [{ id: PROGRAM }]);
    on(/FROM rbm_metric_observations/, [READING]);
    const res = await load(SITE_CSV);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta.siteRisk).toEqual({ rescored: 1, source: 'study_indicators' });
    expect(res.body.data.siteRisk).toEqual({ rescored: 1, source: 'study_indicators' });
    // The rescore runs after the load's own COMMIT, never inside it.
    const commit = stmts().indexOf('COMMIT');
    expect(commit).toBeGreaterThan(-1);
    expect(h.calls.findIndex(c => c.sql.includes('DELETE FROM rbm_site_risk_scores'))).toBeGreaterThan(commit);
  });

  it('a load with no site rows does not touch site risk', async () => {
    const res = await load(STUDY_CSV);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta.siteRisk).toBeUndefined();
    expect(h.calls.some(c => /site_intel|rbm_site_risk_scores/.test(c.sql))).toBe(false);
  });

  it('a rescore that cannot run leaves the load in place and says why', async () => {
    on(/FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2/, [{ id: PROGRAM }]);
    on(/site_intel\.sites/, Object.assign(new Error('permission denied for schema site_intel'), { code: '42501' }));
    const res = await load(SITE_CSV);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta.siteRisk.notRescored).toMatch(/Site Intelligence is not available/);
    expect(stmts()).toContain('COMMIT');
    expect(h.calls.some(c => c.sql.includes('DELETE FROM rbm_site_risk_scores'))).toBe(false);
  });
});

// A snapshot scored from the study's own site-level indicators is scanned indicator by indicator. Its composite
// ties at 0 for most sites and could never be flagged; the readings are what a cross-site comparison is for.
describe('POST /rbm-central-monitoring/run', () => {
  const indicatorRow = (n: string, aging: number) => ({ site_id: n, site_number: n, composite_risk: n === '104' ? '100' : '0',
    enrollment_risk: null, quality_risk: null, operational_risk: null,
    metadata: { source: 'study_indicators', indicators: [{ kriName: 'Open query aging', value: aging, unit: 'days', direction: 'higher_worse', status: n === '104' ? 'red' : 'green' }] } });
  const AGING: Array<[string, number]> = [['101', 12], ['102', 10], ['103', 14], ['104', 58], ['105', 11], ['106', 16], ['107', 6], ['108', 2]];
  const run = () => request(app()).post('/api/mdx/rbm-central-monitoring/run').send({ programId: PROGRAM });
  const signalInsert = () => h.calls.find(c => c.sql.includes('INSERT INTO rbm_signals'));

  it('raises a signal for the site that stands apart on an indicator, with the reading, the study median and the cohort', async () => {
    on(/FROM rbm_site_risk_scores WHERE organization_id = \$1 AND program_id = \$2/, AGING.map(([n, v]) => indicatorRow(n, v)));
    on(/INSERT INTO rbm_signals/, [{ id: 1 }]);
    const res = await run();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta).toMatchObject({ cohortSize: 8, flagged: 1, basis: 'study_indicators' });
    const args = signalInsert()!.args;
    expect(args.slice(2, 6)).toEqual(['104', 'outlier_indicator', 'critical', 'Site 104 stands apart on Open query aging']);
    expect(args[6]).toMatch(/^Central statistical monitoring: at site 104, Open query aging is 58 days against a study median of 11\.5 days across 8 sites \(robust score [\d.]+\)\. Higher is worse for this indicator\.$/);
    expect(JSON.parse(String(args[7]))).toMatchObject({ basis: 'study_indicators', dimension: 'Open query aging', value: 58, cohortMedian: 11.5, cohortSize: 8 });
  });

  it('a snapshot from Site Intelligence is still scanned on its risk scores, with the wording it had', async () => {
    const scores = [10, 12, 11, 13, 12, 11, 10, 95];
    on(/FROM rbm_site_risk_scores WHERE organization_id = \$1 AND program_id = \$2/, scores.map((v, i) => ({ site_id: String(i + 1), site_number: `S${i + 1}`,
      composite_risk: String(v), enrollment_risk: null, quality_risk: null, operational_risk: null, metadata: { source: 'site_intelligence' } })));
    on(/INSERT INTO rbm_signals/, [{ id: 1 }]);
    const res = await run();
    expect(res.body.meta).toMatchObject({ cohortSize: 8, flagged: 1, basis: 'site_intelligence' });
    expect(signalInsert()!.args.slice(3, 6)).toEqual(['outlier_composite', 'critical', 'Site S8 is a composite-risk outlier']);
  });

  it('with no site scored it scans nothing and raises nothing', async () => {
    const res = await run();
    expect(res.body.meta).toMatchObject({ cohortSize: 0, flagged: 0 });
    expect(signalInsert()).toBeUndefined();
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
