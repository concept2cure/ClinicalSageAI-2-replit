/**
 * What is on file for an IRB submission can be read back, a determination is
 * the submission's status, and the vulnerable-populations answer can be
 * recorded after creation.
 *
 * Three defects, each invisible on a 201:
 *
 *   • WRITES WITH NO READ. Sites, consent documents, determinations,
 *     amendments and reportable events each had a governed write and nothing
 *     returned them, so a person who added a site could not see it.
 *   • A DISAPPROVAL LEFT THE STATUS ALONE. `deferred` and `disapproved`
 *     inserted a review row and left the submission reading "under review".
 *   • 46.111(b) COULD BE ANSWERED ONLY AT CREATION. A submission recorded
 *     without the answer (from AnA's command, for one) left the safeguards
 *     check "not assessed" for ever.
 *
 * The real router on PGlite. A checked-out connection sees nothing before
 * BEGIN, as row-level security leaves it, so every read here must go through
 * the scoped pool (completeness-reads-in-tenant-scope.route.test.ts).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const run = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
};
function connection() {
  let scoped = false;
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (/^\s*BEGIN\s*$/i.test(sql)) { scoped = true; return { rows: [], rowCount: 0 }; }
      if (/^\s*(COMMIT|ROLLBACK)\s*$/i.test(sql)) { scoped = false; return { rows: [], rowCount: 0 }; }
      return scoped ? run(sql, params) : { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
}

vi.mock('../../../db', () => {
  const pool = { query: (s: string, p?: unknown[]) => run(s, p), connect: async () => connection() };
  return { pool, getPool: () => pool, db: {} };
});
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: vi.fn(async () => ({ actionId: 1 })) }));
vi.mock('../../tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
vi.mock('../../irb-metrics', () => ({ recordIrbSubmissionCreated: vi.fn(), recordIrbApproval: vi.fn(), recordIrbReportableEvent: vi.fn() }));

import irbRouter from '../../../routes/irb';

const ORG = 7;
const REASON = 'Recording what the board has on file.';

const DDL = `
CREATE TABLE submissions (id serial PRIMARY KEY, organization_id int NOT NULL, deleted_at timestamptz);
CREATE TABLE irb_submissions (
  id serial PRIMARY KEY, organization_id int NOT NULL, study_id int, submission_id int,
  protocol_number text NOT NULL, title text NOT NULL, review_type text, risk_level text NOT NULL DEFAULT 'minimal',
  involves_vulnerable_populations boolean, vulnerable_population_protections text,
  is_single_irb boolean NOT NULL DEFAULT false, consent_waiver_requested boolean NOT NULL DEFAULT false,
  involves_children boolean, is_ind_study boolean, uses_phi boolean, uses_recruitment_material boolean,
  status text NOT NULL DEFAULT 'draft', approval_date date, expiration_date date,
  created_by int NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE irb_sites (id serial PRIMARY KEY, organization_id int NOT NULL, irb_submission_id int NOT NULL, site_name text NOT NULL, principal_investigator text, local_context text, status text NOT NULL DEFAULT 'pending', created_by int NOT NULL, deleted_at timestamptz);
CREATE TABLE irb_consent_documents (id serial PRIMARY KEY, organization_id int NOT NULL, irb_submission_id int NOT NULL, document_name text NOT NULL, version text NOT NULL, status text NOT NULL DEFAULT 'draft', approved_date date, created_by int NOT NULL, deleted_at timestamptz);
CREATE TABLE irb_reviews (id serial PRIMARY KEY, organization_id int NOT NULL, irb_submission_id int NOT NULL, review_type text NOT NULL, outcome text NOT NULL, conditions text, determination_date date, created_by int NOT NULL, deleted_at timestamptz);
CREATE TABLE irb_amendments (id serial PRIMARY KEY, organization_id int NOT NULL, irb_submission_id int NOT NULL, description text NOT NULL, substantive boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'submitted', created_by int NOT NULL, deleted_at timestamptz);
CREATE TABLE irb_reportable_events (id serial PRIMARY KEY, organization_id int NOT NULL, irb_submission_id int NOT NULL, event_type text NOT NULL, description text NOT NULL, reported_date date, status text NOT NULL DEFAULT 'reported', created_by int NOT NULL, deleted_at timestamptz);
`;

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as unknown as { user: unknown }).user = { id: 3, organizationId: ORG, role: 'member' };
  next();
});
app.use('/api/irb', irbRouter);

async function seed(extra: Record<string, unknown> = {}): Promise<number> {
  const res = await request(app).post('/api/irb/submissions').send({ protocolNumber: 'P-1', title: 'A study', riskLevel: 'greater_than_minimal', reason: REASON, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as number;
}
const post = (id: number, path: string, body: Record<string, unknown>) => request(app).post(`/api/irb/submissions/${id}/${path}`).send({ ...body, reason: REASON });
const statusOf = async (id: number) => (await pglite.query<{ status: string; review_type: string | null }>('SELECT status, review_type FROM irb_submissions WHERE id = $1', [id])).rows[0];

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); });
beforeEach(async () => { await pglite.exec('TRUNCATE irb_submissions, irb_sites, irb_consent_documents, irb_reviews, irb_amendments, irb_reportable_events RESTART IDENTITY;'); });

describe('GET /submissions/:id/record', () => {
  it('returns what each write recorded, with dates as the dates recorded', async () => {
    const id = await seed();
    expect((await post(id, 'sites', { siteName: 'Site 104', principalInvestigator: 'Dr. Example' })).status).toBe(201);
    expect((await post(id, 'consent-documents', { documentName: 'Main consent form', version: '2.1' })).status).toBe(201);
    expect((await post(id, 'amendments', { description: 'Adds a week 12 visit.', substantive: true })).status).toBe(201);
    expect((await post(id, 'reportable-events', { eventType: 'unanticipated_problem', description: 'A dosing error.', reportedDate: '2026-11-02' })).status).toBe(201);
    expect((await post(id, 'reviews', { reviewType: 'full_board', outcome: 'modifications_required', determinationDate: '2026-10-20', conditions: 'Shorten the consent form.' })).status).toBe(201);

    const res = await request(app).get(`/api/irb/submissions/${id}/record`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      irbSubmissionId: id,
      reviews: [{ id: 1, reviewType: 'full_board', outcome: 'modifications_required', conditions: 'Shorten the consent form.', determinationDate: '2026-10-20' }],
      sites: [{ id: 1, siteName: 'Site 104', principalInvestigator: 'Dr. Example', localContext: null, status: 'pending' }],
      consentDocuments: [{ id: 1, documentName: 'Main consent form', version: '2.1', status: 'draft', approvedDate: null }],
      amendments: [{ id: 1, description: 'Adds a week 12 visit.', substantive: true, status: 'submitted' }],
      reportableEvents: [{ id: 1, eventType: 'unanticipated_problem', description: 'A dosing error.', reportedDate: '2026-11-02', status: 'reported' }],
    });
  });

  it('returns empty registers for a submission with nothing on file, and leaves out removed and foreign rows', async () => {
    const id = await seed();
    await pglite.query(`INSERT INTO irb_sites (organization_id, irb_submission_id, site_name, created_by, deleted_at) VALUES (7, $1, 'Removed site', 3, now())`, [id]);
    await pglite.query(`INSERT INTO irb_sites (organization_id, irb_submission_id, site_name, created_by) VALUES (9, $1, 'Another organization''s row', 3)`, [id]);
    const res = await request(app).get(`/api/irb/submissions/${id}/record`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ irbSubmissionId: id, reviews: [], sites: [], consentDocuments: [], amendments: [], reportableEvents: [] });
  });

  it('answers 404 for another organization\'s submission and for none', async () => {
    const other = (await pglite.query<{ id: number }>(`INSERT INTO irb_submissions (organization_id, protocol_number, title, created_by) VALUES (9, 'P-9', 'Theirs', 3) RETURNING id`)).rows[0].id;
    for (const id of [other, 999]) {
      const res = await request(app).get(`/api/irb/submissions/${id}/record`);
      expect(res.status, String(id)).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });
});

describe('a determination is the submission\'s status', () => {
  it.each(['modifications_required', 'deferred', 'disapproved'] as const)('%s sets the status and the board\'s review type', async (outcome) => {
    const id = await seed();
    await request(app).patch(`/api/irb/submissions/${id}/status`).send({ status: 'under_review', reason: REASON });
    const res = await post(id, 'reviews', { reviewType: 'full_board', outcome, determinationDate: '2026-10-20' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await statusOf(id)).toEqual({ status: outcome, review_type: 'full_board' });
  });
});

describe('PATCH /submissions/:id/context — vulnerable populations and their safeguards', () => {
  const stored = async (id: number) => (await pglite.query<Record<string, unknown>>(
    'SELECT involves_vulnerable_populations AS involved, vulnerable_population_protections AS safeguards, is_ind_study FROM irb_submissions WHERE id = $1', [id])).rows[0];

  it('records the answer after creation, and the safeguards text, and leaves the other facts alone', async () => {
    const id = await seed({ isIndStudy: true });
    expect(await stored(id)).toEqual({ involved: null, safeguards: null, is_ind_study: true });
    const res = await request(app).patch(`/api/irb/submissions/${id}/context`).send({ involvesVulnerablePopulations: true, vulnerablePopulationProtections: '  An independent advocate attends consent.  ', reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.recorded).toEqual({ involvesVulnerablePopulations: true, vulnerablePopulationProtections: 'An independent advocate attends consent.' });
    expect(await stored(id)).toEqual({ involved: true, safeguards: 'An independent advocate attends consent.', is_ind_study: true });
  });

  it('takes the answer back with null, and the safeguards with null or a blank', async () => {
    const id = await seed({ involvesVulnerablePopulations: true, vulnerablePopulationProtections: 'An advocate.' });
    await request(app).patch(`/api/irb/submissions/${id}/context`).send({ involvesVulnerablePopulations: null, reason: REASON });
    expect(await stored(id)).toMatchObject({ involved: null, safeguards: 'An advocate.' });
    await request(app).patch(`/api/irb/submissions/${id}/context`).send({ vulnerablePopulationProtections: '   ', reason: REASON });
    expect(await stored(id)).toMatchObject({ involved: null, safeguards: null });
  });

  it('settles the safeguards check, which then reports its finding', async () => {
    const id = await seed();
    const before = await request(app).get(`/api/irb/submissions/${id}/completeness`);
    expect(before.body.completeness.notAssessed.join(' ')).toMatch(/whether vulnerable populations are involved is not recorded/);
    await request(app).patch(`/api/irb/submissions/${id}/context`).send({ involvesVulnerablePopulations: true, reason: REASON });
    const after = await request(app).get(`/api/irb/submissions/${id}/completeness`);
    expect(after.body.completeness.notAssessed.join(' ')).not.toMatch(/vulnerable populations/);
    expect(after.body.completeness.findings.map((f: { message: string }) => f.message)).toContain('Vulnerable populations are involved but no additional safeguards are documented.');
  });

  it('returns the answer and the safeguards in the list', async () => {
    const id = await seed({ involvesVulnerablePopulations: false, vulnerablePopulationProtections: 'None needed.' });
    const res = await request(app).get('/api/irb/submissions');
    expect(res.body.find((r: { id: number }) => r.id === id)).toMatchObject({ involves_vulnerable_populations: false, vulnerable_population_protections: 'None needed.' });
  });
});
