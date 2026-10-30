/**
 * Route test for GET /api/c2c/projects, GET /:id and POST — where "readiness"
 * comes from.
 *
 * ── The history ───────────────────────────────────────────────────────────────
 * The list once reported `COALESCE(p.progress_percent, 0) AS readiness`, a
 * column written once as 0 and never updated, so every project read 0%
 * forever. It was replaced by `readinessByProject`, which counted approved or
 * locked sections over EVERY document of the project, the home filing and its
 * added markets pooled. So adding EMA's MAA to an FDA NDA lowered the NDA's
 * figure, and Project home's own card (F23 2/9, one dossier read) disagreed
 * with the Projects card for the same program.
 *
 * ── Now (FILING_SPINE F23 3/9) ────────────────────────────────────────────────
 * The list, the detail and the create read the home filing's figure from
 * server/services/c2c/dossier-read.ts (`readDossierFigures`), the figure
 * Project home's card prints. Each row carries the figure's state:
 *   - 'measured': `readiness` is the share;
 *   - 'no_sections': nothing to count, `readiness` null;
 *   - 'unavailable': the sections could not be read, `readiness` null and
 *     `readinessReason` says why. The list still answers: it is the primary
 *     surface, and a failed enrichment is shown as unavailable, never 0.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../../db', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});

import router from '../projects';
import { clearSeats, seatMember, seatProgram } from './support/current-member';

const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';
const USER = 41;

function app(orgId: number | null) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    if (orgId != null) req.organizationId = orgId;
    req.userId = USER;
    req.dbClient = { query: (...args: unknown[]) => queryMock(...args) };
    next();
  });
  a.use('/api/c2c/projects', router);
  return a;
}

const isList = (sql: unknown) => /FROM regulatory_programs p[\s\S]*LIMIT \$2 OFFSET \$3/.test(String(sql));
const isDetail = (sql: unknown) => /FROM regulatory_programs p[\s\S]*WHERE p\.id = \$1 AND p\.organization_id = \$2/.test(String(sql)) && !/AS ws/.test(String(sql));
const isSections = (sql: unknown) => /FROM c2c_documents d\s+JOIN c2c_document_sections s/.test(String(sql));

/** A FACTORY: the route sets the readiness fields on the rows it got back. */
const listRows = () => [
  { id: P1, title: 'BX-204', ws: 'Biotech', code: 'BX-204', stage: 'Planning', status: 'active', lead: '—', blocker: null, due: '—', activity: 'Updated Aug 10' },
  { id: P2, title: 'DX-9', ws: 'MDX', code: 'DX-9', stage: 'Planning', status: 'active', lead: '—', blocker: null, due: '—', activity: 'Updated Aug 10' },
];
const detailRow = () => ({
  id: P1, code: 'BX-204', name: 'BX-204', program_type: 'IND', status: 'active', phase: 'planning',
  priority: 'high', description: null, product_name: null, indication: null, intended_use: null,
  primary_agency: 'FDA', target_agencies: null, target_submission_date: null, actual_submission_date: null,
  approval_date: null, lead_user_id: null, team_members: null,
  created_at: '2026-09-01', updated_at: '2026-09-02', application_number: null, product_type: 'drug',
  device_class: null, regulatory_path: null, product_code: null, predicate_devices: null, metadata: null,
  sponsor_name: 'Org',
});

let n = 0;
/** One governed section of a project's document, as DOSSIER_SECTIONS_SQL returns it. */
const section = (project: string, status: string, scope: 'home' | 'market' = 'home', doc = scope === 'home' ? 'home-doc' : 'ema-doc') => ({
  project_id: project, document_id: `${project}:${doc}`, doc_type: scope === 'home' ? 'ind' : 'maa', agency: scope === 'home' ? 'fda' : 'ema',
  title: null, filing_scope: scope, section_key: `2.${++n}`, parent_key: null, label: null, status, updated_at: null,
});

/** Answer each statement by what it is, not by its position. */
function serve(sections: unknown[] | Error) {
  queryMock.mockImplementation(async (sql: string) => {
    if (isList(sql)) return { rows: listRows() };
    if (/AS portfolio_counts/.test(sql)) return {rows:[{portfolio_counts:{total:2,byWorkstream:{Biotech:1,MDX:1},byPathway:{other:2},filingWithin60Days:0}}]};
    if (isDetail(sql)) return { rows: [detailRow()] };
    if (isSections(sql)) {
      if (sections instanceof Error) throw sections;
      return { rows: sections };
    }
    return { rows: [] };
  });
}

const unprovisioned = () => Object.assign(new Error('relation "c2c_document_sections" does not exist'), { code: '42P01' });
const connectionReset = () => Object.assign(new Error('connection reset'), { code: '08006' });

beforeEach(() => {
  queryMock.mockReset();
  clearSeats();
  seatMember(7, USER, 'member');
  seatProgram(7, P1);
  seatProgram(7, P2);
});

describe('GET /api/c2c/projects: each card reads its home filing’s figure', () => {
  it('is the share of the home filing’s sections approved or locked, with its state', async () => {
    serve([section(P1, 'approved'), section(P1, 'locked'), section(P1, 'in_review'), section(P1, 'todo')]);
    const res = await request(app(7)).get('/api/c2c/projects');
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map((p: any) => [p.id, p]));
    expect(byId[P1]).toMatchObject({ readiness: 50, readinessState: 'measured' });
    // Nothing to count is no figure, and says so: never "0% ready".
    expect(byId[P2]).toMatchObject({ readiness: null, readinessState: 'no_sections' });
    expect(byId[P2]).not.toHaveProperty('readinessReason');
  });

  it('a market added to the project does not move the home figure (at head the two were pooled: 25)', async () => {
    serve([section(P1, 'approved'), section(P1, 'todo'), section(P1, 'todo', 'market'), section(P1, 'todo', 'market')]);
    const res = await request(app(7)).get('/api/c2c/projects');
    expect(res.body.data.find((p: any) => p.id === P1)).toMatchObject({ readiness: 50, readinessState: 'measured' });
  });

  it('asks only about the projects on this page, in the caller’s organization', async () => {
    serve([]);
    await request(app(7)).get('/api/c2c/projects');
    const [sql, params] = queryMock.mock.calls.find(([s]) => isSections(s))!;
    expect(String(sql)).toMatch(/d\.org_id = \$2/);
    expect(params).toEqual([[P1, P2], 7]);
  });

  it('never reads the stored progress_percent', async () => {
    serve([]);
    await request(app(7)).get('/api/c2c/projects');
    const [sql] = queryMock.mock.calls.find(([s]) => isList(s))!;
    expect(String(sql)).not.toMatch(/progress_percent/);
  });

  it('an unprovisioned section store: the list still answers, each figure unavailable with the reason', async () => {
    serve(unprovisioned());
    const res = await request(app(7)).get('/api/c2c/projects');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({
      readiness: null, readinessState: 'unavailable', readinessReason: 'The governed section store is not provisioned in this environment.',
    });
  });

  it('any other failure: the list still answers, each figure unavailable, never 0 and never "no sections"', async () => {
    serve(connectionReset());
    const res = await request(app(7)).get('/api/c2c/projects');
    expect(res.status).toBe(200);
    for (const p of res.body.data) {
      expect(p).toMatchObject({ readiness: null, readinessState: 'unavailable', readinessReason: 'The governed sections could not be read.' });
    }
  });
});

describe('GET /api/c2c/projects/:id: the same figure the card reads', () => {
  it('reads the home figure, its state and when it was measured', async () => {
    serve([section(P1, 'approved'), section(P1, 'todo'), section(P1, 'todo', 'market')]);
    const before = Date.now();
    const res = await request(app(7)).get(`/api/c2c/projects/${P1}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ readiness: 50, readinessState: 'measured' });
    const at = Date.parse(res.body.readinessAsOf);
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now());
    const [sql] = queryMock.mock.calls.find(([s]) => isDetail(s))!;
    expect(String(sql)).not.toMatch(/progress_percent/);
  });

  it('agrees with the list for the same program', async () => {
    serve([section(P1, 'approved'), section(P1, 'locked'), section(P1, 'todo'), section(P1, 'todo', 'market')]);
    const list = await request(app(7)).get('/api/c2c/projects');
    const detail = await request(app(7)).get(`/api/c2c/projects/${P1}`);
    const card = list.body.data.find((p: { id: string }) => p.id === P1);
    expect({ readiness: detail.body.readiness, readinessState: detail.body.readinessState })
      .toEqual({ readiness: card.readiness, readinessState: card.readinessState });
  });

  it('no governed sections: no figure, no time, and the state says why', async () => {
    serve([]);
    const res = await request(app(7)).get(`/api/c2c/projects/${P1}`);
    expect(res.body).toMatchObject({ readiness: null, readinessState: 'no_sections', readinessAsOf: null });
  });

  it('a failed read: the page still loads, the figure is unavailable with the reason, never the stored 0', async () => {
    serve(connectionReset());
    const res = await request(app(7)).get(`/api/c2c/projects/${P1}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      readiness: null, readinessState: 'unavailable', readinessReason: 'The governed sections could not be read.', readinessAsOf: null,
    });
  });

  it('an upper-case id in the URL reads the same measured figure (review of e6058e4126: it read "no sections")', async () => {
    const MIXED = 'abcdef12-3456-4789-8abc-def123456789';
    seatProgram(7, MIXED);
    serve([section(MIXED, 'approved'), section(MIXED, 'todo')]);
    const res = await request(app(7)).get(`/api/c2c/projects/${MIXED.toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ readiness: 50, readinessState: 'measured' });
  });

  it('scopes the read to this program and the caller’s organization', async () => {
    serve([]);
    await request(app(7)).get(`/api/c2c/projects/${P1}`);
    const [, params] = queryMock.mock.calls.find(([s]) => isSections(s))!;
    expect(params).toEqual([[P1], 7]);
  });
});
