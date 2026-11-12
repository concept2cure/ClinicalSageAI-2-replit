/**
 * GET /api/irb/submissions/:id/completeness reads inside the tenant scope.
 *
 * Found on 2026-11-12 by opening the protocol workspace's IRB tab in the
 * running app: the list, the lifecycle and the package manifest answered, and
 * this route answered 404 "IRB submission not found for this organization" for
 * a submission the same person had just recorded.
 *
 * The cause is how the pool applies row-level security
 * (server/db/poolInstrumentation.ts). `pool.query` runs each statement in a
 * micro-transaction that first sets the tenant. A connection from
 * `pool.connect()` gets the tenant only when the caller issues BEGIN. This
 * route took a connection and read on it with no BEGIN, so the read ran with
 * no tenant and row security hid every row, for every customer. Its two
 * sibling reads (lifecycle, package manifest) use `pool.query`. AnA's
 * review_irb_submission read the same way.
 *
 * A mocked pool that hands back the same executor for both paths cannot see
 * this, which is how it shipped. This harness gives a checked-out connection
 * what row security gives it: nothing, until BEGIN.
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

/** A checked-out connection: tenant-scoped only between BEGIN and COMMIT / ROLLBACK. */
function connection() {
  let scoped = false;
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (/^\s*BEGIN\s*$/i.test(sql)) { scoped = true; return { rows: [], rowCount: 0 }; }
      if (/^\s*(COMMIT|ROLLBACK)\s*$/i.test(sql)) { scoped = false; return { rows: [], rowCount: 0 }; }
      // No tenant is set: row security returns no row of a tenant table.
      if (!scoped) return { rows: [], rowCount: 0 };
      return run(sql, params);
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
const REASON = 'Recording the ethics submission.';

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
CREATE TABLE irb_consent_documents (id serial PRIMARY KEY, organization_id int NOT NULL, irb_submission_id int NOT NULL, document_name text, version text, status text, created_by int, deleted_at timestamptz);
CREATE TABLE irb_sites (id serial PRIMARY KEY, organization_id int NOT NULL, irb_submission_id int NOT NULL, site_name text, principal_investigator text, local_context text, status text, created_by int, deleted_at timestamptz);
CREATE TABLE irb_amendments (id serial PRIMARY KEY, organization_id int NOT NULL, irb_submission_id int NOT NULL, substantive boolean, status text, deleted_at timestamptz);
CREATE TABLE irb_reportable_events (id serial PRIMARY KEY, organization_id int NOT NULL, irb_submission_id int NOT NULL, event_type text, status text, reported_date date, deleted_at timestamptz);
`;

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as unknown as { user: unknown }).user = { id: 3, organizationId: ORG, role: 'member' };
  next();
});
app.use('/api/irb', irbRouter);

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); });
beforeEach(async () => { await pglite.exec('TRUNCATE irb_submissions, irb_consent_documents, irb_sites, irb_amendments, irb_reportable_events RESTART IDENTITY;'); });

describe('GET /submissions/:id/completeness', () => {
  it('answers for a submission this organization recorded, with the checks and the lifecycle', async () => {
    const made = await request(app).post('/api/irb/submissions').send({ protocolNumber: 'P-1', title: 'A study', riskLevel: 'greater_than_minimal', reason: REASON });
    expect(made.status).toBe(201);

    const res = await request(app).get(`/api/irb/submissions/${made.body.id}/completeness`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.completeness.riskLevel).toBe('high');
    expect(res.body.completeness.findings.map((f: { basis: string }) => f.basis)).toContain('45 CFR 46.116 / 46.117');
    expect(res.body.completeness.notAssessed).toHaveLength(2);
    expect(res.body.lifecycle).toMatchObject({ approval: 'not_approved', expirationSource: 'none' });
  });

  it('counts the consent documents and the sites on file', async () => {
    const made = await request(app).post('/api/irb/submissions').send({ protocolNumber: 'P-1', title: 'A study', riskLevel: 'minimal', involvesVulnerablePopulations: false, reason: REASON });
    for (const site of ['Site 101', 'Site 102']) {
      expect((await request(app).post(`/api/irb/submissions/${made.body.id}/sites`).send({ siteName: site, reason: REASON })).status).toBe(201);
    }
    expect((await request(app).post(`/api/irb/submissions/${made.body.id}/consent-documents`).send({ documentName: 'Main consent', version: '1.0', reason: REASON })).status).toBe(201);

    const res = await request(app).get(`/api/irb/submissions/${made.body.id}/completeness`);
    expect(res.status).toBe(200);
    // Two sites and no single IRB of record: the major finding, and no consent finding.
    expect(res.body.completeness.findings).toEqual([expect.objectContaining({ severity: 'major', basis: 'Revised Common Rule 45 CFR 46.114' })]);
    expect(res.body.completeness.riskLevel).toBe('medium');
  });

  it('still answers 404 for a submission that does not exist', async () => {
    const res = await request(app).get('/api/irb/submissions/999/completeness');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
