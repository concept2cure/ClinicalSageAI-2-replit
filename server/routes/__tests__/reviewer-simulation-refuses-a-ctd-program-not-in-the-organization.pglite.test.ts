/**
 * The reviewer simulation — over HTTP (POST /api/regulatory-graph/programs/
 * :programId/reviewer-simulation) and through AnA (reviewer_simulation.run) —
 * refuses a ctdProgramId that is not on record for the caller's organization,
 * by name (CTD_PROGRAM_NOT_FOUND), as it refuses a defense packet it does not
 * hold.
 *
 * What it used to do (until 2026-10-15): the nonclinical loader answered such
 * an id with no studies, so the run went ahead and the preclinical persona
 * raised critical "no pivotal toxicology" questions against a program nobody in
 * the organization owns. Once the loader refused it, the route answered the
 * refusal as a 500 and AnA as EXECUTION_FAILED "Action failed: …".
 *
 * Real router, handler, simulator, loaders and program check over PGlite; the
 * auth middleware and the audit write are doubles; the reviewer flag is on.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { ctdNonclinicalStudies } from '../../../shared/schema/csr-knowledge-db';

const H = vi.hoisted(() => {
  const h = {
    pg: null as any,
    db: null as any,
    pool: {
      query: async (text: string, params?: unknown[]) => ({ rows: (await h.pg.query(text, params ?? [])).rows }),
    },
  };
  return h;
});
vi.mock('../../db', () => ({ get db() { return H.db; }, pool: H.pool, getPool: () => H.pool }));
vi.mock('../../db.js', () => ({ get db() { return H.db; }, pool: H.pool, getPool: () => H.pool }));
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 3, organizationId: 1 };
    // The route reads through the request-scoped client (requestPgClient).
    req.dbClient = H.pool;
    next();
  },
}));
// Program authority is resolved through authoring-program-access, as in the
// sibling reviewer-simulation route tests; it is not what these tests are about.
vi.mock('../../services/authoring/authoring-program-access', async original => ({
  ...(await original<typeof import('../../services/authoring/authoring-program-access')>()), authorizeAuthoringProgram: vi.fn(async () => undefined),
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
}));
vi.mock('../../services/preclinical/feature-flags', () => ({
  PRECLINICAL_REVIEWER_ENABLED: true,
  PRECLINICAL_INGEST_ENABLED: false,
}));

import router from '../regulatory-graph';
import { reviewerSimulationRun } from '../../services/ana-ri/mdx-command-handlers-phase2';

const ALPHA = 1;
const BETA = 2;
const ALPHA_PROGRAM = '0a000000-0000-4000-8000-00000000000a';
const ALPHA_CTD_PROGRAM = 10;
const BETA_CTD_PROGRAM = 20;
const ind = { programType: 'IND', productType: 'drug', deviceClass: null, primaryAgency: 'FDA', developmentStage: 'ind_enabling' };
const gate = { confirm: 'yes', reason: 'a sufficient explanatory reason' };

/** CREATE TABLE from the drizzle definition: columns and types. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

beforeAll(async () => {
  H.pg = new PGlite();
  H.db = drizzle(H.pg);
  await H.pg.exec(`CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamp)`);
  await H.pg.exec(`CREATE TABLE ctd_programs (id serial PRIMARY KEY, organization_id integer NOT NULL, program_name text NOT NULL)`);
  await H.pg.exec(ddlOf(ctdNonclinicalStudies as PgTable));
  await H.pg.query(`INSERT INTO regulatory_programs (id, organization_id) VALUES ($1, $2)`, [ALPHA_PROGRAM, ALPHA]);
  await H.pg.query(
    `INSERT INTO ctd_programs (id, organization_id, program_name) VALUES ($1, $2, 'Alpha AX-1'), ($3, $4, 'Beta BX-990')`,
    [ALPHA_CTD_PROGRAM, ALPHA, BETA_CTD_PROGRAM, BETA],
  );
  await H.pg.query(
    `INSERT INTO ctd_nonclinical_studies (program_id, study_type, study_title, species, duration_weeks, glp_compliant, noael)
     VALUES ($1, 'repeat_dose_tox', '13-week rat toxicity', 'rat', 13, true, '50 mg/kg/day')`,
    [ALPHA_CTD_PROGRAM],
  );
}, 60_000);

afterAll(async () => {
  await H.pg?.close();
});

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/regulatory-graph', router);
  return a;
}
const post = (body: Record<string, unknown>) =>
  request(app()).post(`/api/regulatory-graph/programs/${ALPHA_PROGRAM}/reviewer-simulation`).send(body);

beforeEach(() => vi.clearAllMocks());

describe('POST …/reviewer-simulation', () => {
  it("refuses 422, by name, another organization's ctdProgramId", async () => {
    const res = await post({ program: ind, ctdProgramId: BETA_CTD_PROGRAM, dryRun: true });

    expect(res.status, `ran against another organization's CTD program: ${JSON.stringify(res.body).slice(0, 300)}`).toBe(422);
    expect(res.body.code).toBe('CTD_PROGRAM_NOT_FOUND');
    expect(res.body.questions).toBeUndefined();
  });

  it("reads the caller's own CTD program's studies", async () => {
    const res = await post({ program: ind, ctdProgramId: ALPHA_CTD_PROGRAM, dryRun: true });

    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body.inputsSource.nonclinical).toBe('ctd_nonclinical_studies');
  });
});

describe('AnA reviewer_simulation.run', () => {
  it("refuses another organization's ctdProgramId as that refusal, not a failed action", async () => {
    const r = await reviewerSimulationRun(
      { userId: 3, organizationId: ALPHA },
      { ...gate, programId: ALPHA_PROGRAM, program: ind, ctdProgramId: BETA_CTD_PROGRAM },
    );

    expect(r.error, r.message).toBe('CTD_PROGRAM_NOT_FOUND');
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/CTD dossier 20 is not on record/);
  });
});
