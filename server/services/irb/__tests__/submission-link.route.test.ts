/**
 * The link from an IRB submission to its Submission Center submission (D1 of
 * docs/design/IRB_SUBMISSION.md), end to end from an HTTP body to the column.
 *
 * Two defects, both invisible on a 201:
 *
 *   • ONLY CREATION COULD SET THE LINK. An IRB submission recorded without one
 *     (from AnA's command, or before the package existed) could never have a
 *     package: the manifest read `linkedSubmissionId: null` for ever, and the
 *     protocol workspace told the person to "link the submission in the
 *     Submission Center first", which nothing could do.
 *   • THE LINK ACCEPTED ANOTHER ORGANIZATION'S SUBMISSION. The foreign key
 *     checks that the id exists, not whose it is, and an approval threads a
 *     provenance link to it.
 *
 * Routed through the real router with a PGlite-backed pool, as
 * submission-context.route.test.ts is, and the assertions are on the STORED
 * column.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;

const query = async (sql: string, params?: unknown[]) => {
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql)) return { rows: [], rowCount: 0 };
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
};

const ledger = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock('../../../db', () => ({
  pool: {
    query: (s: string, p?: unknown[]) => query(s, p),
    connect: async () => ({ query: (s: string, p?: unknown[]) => query(s, p), release: () => undefined }),
  },
  db: {},
}));
vi.mock('../../../routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn(async (_client: unknown, row: Record<string, unknown>) => { ledger.rows.push(row); return { actionId: ledger.rows.length }; }),
}));
vi.mock('../../tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
vi.mock('../../irb-metrics', () => ({
  recordIrbSubmissionCreated: vi.fn(),
  recordIrbApproval: vi.fn(),
  recordIrbReportableEvent: vi.fn(),
}));

import irbRouter from '../../../routes/irb';

const ORG = 7;
const OTHER_ORG = 9;
const USER = 3;
const REASON = 'Linking the ethics submission to its filing.';

const DDL = `
CREATE TABLE submissions (id serial PRIMARY KEY, organization_id int NOT NULL, title text, deleted_at timestamptz);
CREATE TABLE irb_submissions (
  id serial PRIMARY KEY, organization_id int NOT NULL, study_id int, submission_id int REFERENCES submissions(id),
  protocol_number text NOT NULL, title text NOT NULL, review_type text,
  risk_level text NOT NULL DEFAULT 'minimal',
  involves_vulnerable_populations boolean, vulnerable_population_protections text,
  is_single_irb boolean NOT NULL DEFAULT false,
  consent_waiver_requested boolean NOT NULL DEFAULT false,
  involves_children boolean, is_ind_study boolean, uses_phi boolean, uses_recruitment_material boolean,
  status text NOT NULL DEFAULT 'draft', approval_date date, expiration_date date,
  created_by int NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
`;

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG, role: 'member' };
  next();
});
app.use('/api/irb', irbRouter);

const BASE = { protocolNumber: 'P-1', title: 'A study', riskLevel: 'minimal', reason: REASON };

let own: number;      // this organization's Submission Center submission
let ownSecond: number;
let foreign: number;  // another organization's
let removed: number;  // this organization's, soft-deleted

async function linkOf(id: number): Promise<number | null> {
  const r = await pglite.query<{ submission_id: number | null }>('SELECT submission_id FROM irb_submissions WHERE id = $1', [id]);
  return r.rows[0]?.submission_id ?? null;
}
async function seedUnlinked(org = ORG): Promise<number> {
  const r = await pglite.query<{ id: number }>(
    `INSERT INTO irb_submissions (organization_id, protocol_number, title, created_by) VALUES ($1,'P-1','A study',$2) RETURNING id`, [org, USER]);
  return r.rows[0].id;
}

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); });
beforeEach(async () => {
  ledger.rows.length = 0;
  await pglite.exec('TRUNCATE irb_submissions, submissions RESTART IDENTITY CASCADE;');
  const ins = async (org: number, deleted = false) => (await pglite.query<{ id: number }>(
    `INSERT INTO submissions (organization_id, title, deleted_at) VALUES ($1,'An IND',$2) RETURNING id`, [org, deleted ? new Date() : null])).rows[0].id;
  own = await ins(ORG); ownSecond = await ins(ORG); foreign = await ins(OTHER_ORG); removed = await ins(ORG, true);
});

describe('PATCH /submissions/:id/link', () => {
  it('links an unlinked IRB submission to this organization\'s submission, under a governed update', async () => {
    const id = await seedUnlinked();
    const res = await request(app).patch(`/api/irb/submissions/${id}/link`).send({ submissionId: own, reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ id, submissionId: own });
    expect(await linkOf(id)).toBe(own);
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({ orgId: ORG, userId: USER, command: 'update', target: `irb-submission:${id}`, reason: REASON, domain: 'irb', payload: { linkedSubmissionId: own } });
  });

  it('refuses another organization\'s submission, and a removed one, and writes nothing', async () => {
    const id = await seedUnlinked();
    for (const target of [foreign, removed, 9999]) {
      const res = await request(app).patch(`/api/irb/submissions/${id}/link`).send({ submissionId: target, reason: REASON });
      expect(res.status, String(target)).toBe(400);
      expect(res.body.error.code).toBe('BAD_INPUT');
      expect(res.body.error.message).toMatch(/Nothing was changed/);
    }
    expect(await linkOf(id)).toBeNull();
    expect(ledger.rows).toHaveLength(0);
  });

  it('does not move a link that exists', async () => {
    const id = await seedUnlinked();
    await request(app).patch(`/api/irb/submissions/${id}/link`).send({ submissionId: own, reason: REASON });
    const res = await request(app).patch(`/api/irb/submissions/${id}/link`).send({ submissionId: ownSecond, reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
    expect(res.body.error.message).toContain(`submission ${own}`);
    expect(await linkOf(id)).toBe(own);
    expect(ledger.rows).toHaveLength(1);
  });

  it('answers 404 for another organization\'s IRB submission', async () => {
    const id = await seedUnlinked(OTHER_ORG);
    const res = await request(app).patch(`/api/irb/submissions/${id}/link`).send({ submissionId: own, reason: REASON });
    expect(res.status).toBe(404);
    expect(await linkOf(id)).toBeNull();
  });

  it('refuses a body with no reason, a short reason, a non-integer id or an unknown field', async () => {
    const id = await seedUnlinked();
    for (const body of [{ submissionId: own }, { submissionId: own, reason: 'short' }, { submissionId: '1', reason: REASON }, { submissionId: own, reason: REASON, submission_id: own }]) {
      const res = await request(app).patch(`/api/irb/submissions/${id}/link`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await linkOf(id)).toBeNull();
  });
});

describe('POST /submissions — the link at creation', () => {
  it('stores this organization\'s submission as the link', async () => {
    const res = await request(app).post('/api/irb/submissions').send({ ...BASE, submissionId: own });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await linkOf(res.body.id)).toBe(own);
  });

  it('refuses another organization\'s submission and creates nothing', async () => {
    const res = await request(app).post('/api/irb/submissions').send({ ...BASE, submissionId: foreign });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_INPUT');
    expect((await pglite.query('SELECT id FROM irb_submissions')).rows).toHaveLength(0);
    expect(ledger.rows).toHaveLength(0);
  });
});

describe('GET /submissions — the facts a person recorded are in the list', () => {
  it('returns each tri-state fact as stored: true, false, and null for not recorded', async () => {
    await request(app).post('/api/irb/submissions').send({ ...BASE, isIndStudy: true, usesPhi: false, involvesVulnerablePopulations: true });
    const res = await request(app).get('/api/irb/submissions');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      is_ind_study: true, uses_phi: false, involves_children: null, uses_recruitment_material: null,
      involves_vulnerable_populations: true, consent_waiver_requested: false,
    });
  });
});
