/**
 * The four package-manifest facts, end to end from an HTTP body to a column.
 *
 * `package-manifest.pglite.integration.test.ts` proves the READ side: a NULL
 * column arrives at the manifest as `undetermined`. This proves the WRITE
 * side, which is where the same mistake is cheaper to make and harder to see —
 * a single `.default(false)` in the zod schema, or an `x === true` in the
 * insert, and a request that simply never mentioned IND status is stored as a
 * sponsor's recorded statement that the study does not run under one. The
 * column is then a perfectly good tri-state holding a fabricated answer, and
 * Form FDA 1572 drops out of what a board is told it needs.
 *
 * So the assertion throughout is on the STORED value, not on a 201: absent in
 * must be NULL out.
 *
 * Routed through the real router with a PGlite-backed pool, because the defect
 * lives in the seam between zod and the INSERT and a unit test of either half
 * would step over it.
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

vi.mock('../../../db', () => ({
  pool: {
    query: (s: string, p?: unknown[]) => query(s, p),
    connect: async () => ({ query: (s: string, p?: unknown[]) => query(s, p), release: () => undefined }),
  },
  db: {},
}));
vi.mock('../../../routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn(async () => ({ actionId: 1 })),
}));
vi.mock('../../tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
vi.mock('../../irb-metrics', () => ({
  recordIrbSubmissionCreated: vi.fn(),
  recordIrbApproval: vi.fn(),
  recordIrbReportableEvent: vi.fn(),
}));

import irbRouter from '../../../routes/irb';

const ORG = 7;
const USER = 3;
const REASON = 'Recording the study facts the board asks about.';

/* The columns exactly as migrations/20260922d_irb_submission_context.sql
   leaves them: nullable, no default. */
const DDL = `
CREATE TABLE irb_submissions (
  id serial PRIMARY KEY, organization_id int NOT NULL, study_id int, submission_id int,
  protocol_number text NOT NULL, title text NOT NULL, review_type text,
  risk_level text NOT NULL DEFAULT 'minimal',
  involves_vulnerable_populations boolean NOT NULL DEFAULT false,
  vulnerable_population_protections text,
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
  (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG };
  next();
});
app.use('/api/irb', irbRouter);

const BASE = { protocolNumber: 'P-1', title: 'A study', riskLevel: 'minimal', reason: REASON };

async function stored(id: number): Promise<Record<string, boolean | null>> {
  const r = await pglite.query<Record<string, boolean | null>>(
    `SELECT involves_children, is_ind_study, uses_phi, uses_recruitment_material FROM irb_submissions WHERE id = $1`,
    [id],
  );
  return r.rows[0];
}

const ALL_NULL = { involves_children: null, is_ind_study: null, uses_phi: null, uses_recruitment_material: null };

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); });
beforeEach(async () => { await pglite.exec('TRUNCATE irb_submissions RESTART IDENTITY;'); });

describe('POST /submissions — absent must stay absent', () => {
  it('stores NULL for every fact the request does not mention', async () => {
    const res = await request(app).post('/api/irb/submissions').send(BASE);

    expect(res.status).toBe(201);
    expect(await stored(res.body.id)).toEqual(ALL_NULL);
  });

  it('stores an explicit false as false, and a missing sibling as NULL', async () => {
    /* The pair that a `.default(false)` makes indistinguishable. If this test
       ever reports `is_ind_study: false` for the field that was never sent,
       the schema has grown a default and every unanswered submission is now
       asserting something nobody said. */
    const res = await request(app).post('/api/irb/submissions').send({ ...BASE, isIndStudy: false });

    expect(res.status).toBe(201);
    expect(await stored(res.body.id)).toEqual({ ...ALL_NULL, is_ind_study: false });
  });

  it('stores true as true', async () => {
    const res = await request(app)
      .post('/api/irb/submissions')
      .send({ ...BASE, involvesChildren: true, isIndStudy: true, usesPhi: true, usesRecruitmentMaterial: true });

    expect(res.status).toBe(201);
    expect(await stored(res.body.id)).toEqual({
      involves_children: true, is_ind_study: true, uses_phi: true, uses_recruitment_material: true,
    });
  });

  it('refuses a non-boolean rather than coercing it', async () => {
    /* "false" the string and 0 are the shapes a form posts by accident. Either
       coerced to a boolean is a fabricated answer. */
    for (const bad of ['false', 0, 'no', null]) {
      const res = await request(app).post('/api/irb/submissions').send({ ...BASE, isIndStudy: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });
});

describe('PATCH /submissions/:id/context — recording, and un-recording', () => {
  async function seed(): Promise<number> {
    const res = await request(app).post('/api/irb/submissions').send(BASE);
    return res.body.id as number;
  }

  it('records the facts a sponsor answers and leaves the rest NULL', async () => {
    const id = await seed();

    const res = await request(app)
      .patch(`/api/irb/submissions/${id}/context`)
      .send({ isIndStudy: true, usesPhi: false, reason: REASON });

    expect(res.status).toBe(201);
    expect(res.body.recorded).toEqual({ isIndStudy: true, usesPhi: false });
    expect(await stored(id)).toEqual({ ...ALL_NULL, is_ind_study: true, uses_phi: false });
  });

  it('leaves an unmentioned fact exactly as it was — a patch, not a replace', async () => {
    const id = await seed();
    await request(app).patch(`/api/irb/submissions/${id}/context`).send({ involvesChildren: true, isIndStudy: false, reason: REASON });

    await request(app).patch(`/api/irb/submissions/${id}/context`).send({ usesPhi: true, reason: REASON });

    expect(await stored(id)).toEqual({
      involves_children: true, is_ind_study: false, uses_phi: true, uses_recruitment_material: null,
    });
  });

  it('retracts a fact to NOT RECORDED on an explicit null', async () => {
    /* A sponsor who answered in error must be able to take it back, and the
       manifest must then say `undetermined` again rather than carry a claim
       nobody stands behind. */
    const id = await seed();
    await request(app).patch(`/api/irb/submissions/${id}/context`).send({ isIndStudy: true, reason: REASON });

    await request(app).patch(`/api/irb/submissions/${id}/context`).send({ isIndStudy: null, reason: REASON });

    expect((await stored(id)).is_ind_study).toBeNull();
  });

  it('refuses a request that records nothing', async () => {
    const id = await seed();

    const res = await request(app).patch(`/api/irb/submissions/${id}/context`).send({ reason: REASON });

    expect(res.status).toBe(400);
  });

  it('refuses an unknown field rather than silently doing nothing', async () => {
    const id = await seed();

    const res = await request(app)
      .patch(`/api/irb/submissions/${id}/context`)
      .send({ isIndStudy2: true, reason: REASON });

    expect(res.status).toBe(400);
    expect((await stored(id)).is_ind_study).toBeNull();
  });

  it('does not touch another organization’s submission', async () => {
    const id = await seed();
    await pglite.query(`UPDATE irb_submissions SET organization_id = 99 WHERE id = $1`, [id]);

    const res = await request(app).patch(`/api/irb/submissions/${id}/context`).send({ isIndStudy: true, reason: REASON });

    expect(res.status).toBe(404);
    expect((await stored(id)).is_ind_study).toBeNull();
  });
});
