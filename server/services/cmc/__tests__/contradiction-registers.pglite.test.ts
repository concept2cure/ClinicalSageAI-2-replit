/**
 * The contradictions sweep reads only the caller's registers.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The sweep existed twice. The AnA command handler
 * (services/ana-ri/module3-command-handlers.ts::module3Contradictions) declared
 * `const orgId = ctx.organizationId` and then never used it: all five register
 * reads filtered by `project_id` alone. The project id is caller-supplied and
 * register project ids share one uuid space, so asking with another
 * organization's project id returned that organization's specifications,
 * methods, stability studies, batch records and comparability assessments.
 *
 * That same SQL also selected `method_name` and `study_name` — columns
 * analytical_methods and stability_studies do not have (`title`,
 * `study_title`) — so against a provisioned database it raised instead of
 * answering. Both defects are fixed by both callers sharing this one function.
 *
 * Runs on PGlite against the real column shapes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readContradictionRegisters, type RegisterQueryable } from '../contradiction-registers';

let pglite: PGlite;

const MINE = 11;
const THEIRS = 22;
const MY_PROJECT = '11111111-1111-4111-8111-111111111111';
const THEIR_PROJECT = '22222222-2222-4222-8222-222222222222';

/** Anything from this list appearing in a result for org MINE is a cross-tenant read. */
const THEIR_SECRETS = [
  'THEIR SECRET API',
  'THEIR HPLC METHOD',
  'THEIR STABILITY STUDY',
  'THEIR-BATCH-001',
  'THEIR COMPARABILITY',
];

// Generic, matching RegisterQueryable — a non-generic shim compiles under
// vitest (which erases types) but not under tsc.
const pool: RegisterQueryable = {
  query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) => {
    const r = await pglite.query(text, params as unknown[]);
    return { rows: r.rows as T[] };
  },
};

beforeAll(async () => {
  pglite = new PGlite();
  // Column shapes as the migrations declare them — including the names the old
  // SQL got wrong (analytical_methods.title, stability_studies.study_title).
  await pglite.exec(`
    CREATE TABLE quality_specifications (
      -- integer here, matching migrations/20260823_cmc_register_store_parity.sql:62
      -- (a fresh install). Legacy installs carry TEXT, which is why the read casts.
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id int, project_id uuid,
      material_name text, acceptance_criteria jsonb);
    CREATE TABLE analytical_methods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int,
      title text, purpose text, status text);
    CREATE TABLE stability_studies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int,
      study_title text, status text);
    CREATE TABLE cmc_batch_records (
      -- tenant_id is TEXT here (db/migrations/20260401_cmc_convergence_os.sql:121),
      -- organization_id INTEGER NOT NULL (migrations/0006). The two types are the
      -- point: a single bound param cannot serve both comparisons.
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text, organization_id int,
      project_id uuid, batch_number text, disposition text);
    CREATE TABLE cmc_comparability_assessments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, project_id uuid,
      assessment_name text, regulatory_risk_level text);
  `);
  await pglite.exec(`
    INSERT INTO quality_specifications (tenant_id, project_id, material_name, acceptance_criteria)
      VALUES (${THEIRS}, '${THEIR_PROJECT}', 'THEIR SECRET API', '{"assay":"98-102%"}'::jsonb),
             (${MINE},   '${MY_PROJECT}',   'My API',           '{"assay":"95-105%"}'::jsonb);
    INSERT INTO analytical_methods (organization_id, title, purpose, status)
      VALUES (${THEIRS}, 'THEIR HPLC METHOD', 'assay', 'validated'),
             (${MINE},   'My HPLC',           'assay', 'validated');
    INSERT INTO stability_studies (organization_id, study_title, status)
      VALUES (${THEIRS}, 'THEIR STABILITY STUDY', 'ongoing'),
             (${MINE},   'My stability',          'ongoing');
    INSERT INTO cmc_batch_records (tenant_id, organization_id, project_id, batch_number, disposition)
      VALUES ('${THEIRS}', ${THEIRS}, '${THEIR_PROJECT}', 'THEIR-BATCH-001', 'released'),
             ('${MINE}',   ${MINE},   '${MY_PROJECT}',    'MY-BATCH-001',    'released'),
             -- A row that predates the tenant_id column: organization_id names
             -- its owner and tenant_id is NULL forever. It must reach its own
             -- organization's sweep (and nobody else's), which is why the read
             -- resolves through organization_id rather than OR-tenant_id-IS-NULL.
             (NULL,        ${MINE},   '${MY_PROJECT}',    'MY-LEGACY-002',   'released'),
             (NULL,        ${THEIRS}, '${THEIR_PROJECT}', 'THEIR-LEGACY-003','released');
    INSERT INTO cmc_comparability_assessments (organization_id, project_id, assessment_name, regulatory_risk_level)
      VALUES (${THEIRS}, '${THEIR_PROJECT}', 'THEIR COMPARABILITY', 'high'),
             (${MINE},   '${MY_PROJECT}',    'My comparability',    'low');
  `);
});

afterAll(async () => { await pglite?.close?.(); });

describe('the fixture can actually detect the leak (control)', () => {
  it('the predicate this replaced returns another organization\u2019s rows from the same fixture', async () => {
    // Not a test of current behaviour — a control proving the assertions above
    // are load-bearing rather than vacuously true. This is verbatim the SQL the
    // AnA command handler ran: filtered by project_id alone, with the caller's
    // organization never mentioned.
    const leaked = await pool.query(
      `SELECT material_name as "materialName" FROM quality_specifications WHERE project_id = $1`,
      [THEIR_PROJECT],
    );
    expect(leaked.rows.map((r) => r.materialName)).toContain('THEIR SECRET API');

    // And the same fixture proves the column names the old sweep used do not exist,
    // so on a provisioned database that query raised rather than returning rows.
    await expect(
      pool.query(`SELECT method_name FROM analytical_methods WHERE organization_id = $1`, [MINE]),
    ).rejects.toThrow();
  });
});

describe('readContradictionRegisters — tenant scoping', () => {
  it("returns nothing of another organization's when handed their project id", async () => {
    // The caller supplies the project id, so this is the whole attack: my org,
    // their project.
    const out = await readContradictionRegisters(pool, { organizationId: MINE, projectId: THEIR_PROJECT });
    const blob = JSON.stringify(out);
    for (const secret of THEIR_SECRETS) {
      expect(blob, `leaked "${secret}" to organization ${MINE}`).not.toContain(secret);
    }
  });

  it("returns the caller's own registers — the fix is not 'scope everything to nothing'", async () => {
    const out = await readContradictionRegisters(pool, { organizationId: MINE, projectId: MY_PROJECT });
    expect(out.specifications.map((s) => s.materialName)).toEqual(['My API']);
    expect(out.methods.map((m) => m.methodName)).toEqual(['My HPLC']);
    expect(out.stability.map((s) => s.studyName)).toEqual(['My stability']);
    // The legacy NULL-tenant row reaches its own organization through
    // organization_id. Dropping OR-NULL must not orphan the rows it exposed.
    expect(out.batch.map((b) => b.batchNumber).sort()).toEqual(['MY-BATCH-001', 'MY-LEGACY-002']);
    expect(out.comparability.map((c) => c.assessmentName)).toEqual(['My comparability']);
  });

  it("does not hand a legacy NULL-tenant batch row to another organization", async () => {
    // The row THEIRS owns via organization_id, with tenant_id NULL. Under
    // `OR tenant_id IS NULL` it was visible to everyone; it must now reach only
    // its owner.
    const mine = await readContradictionRegisters(pool, { organizationId: MINE, projectId: THEIR_PROJECT });
    expect(mine.batch.map((b) => b.batchNumber)).toEqual([]);

    const theirs = await readContradictionRegisters(pool, { organizationId: THEIRS, projectId: THEIR_PROJECT });
    expect(theirs.batch.map((b) => b.batchNumber).sort()).toEqual(['THEIR-BATCH-001', 'THEIR-LEGACY-003']);
  });

  it('reads the columns the tables actually have, rather than raising', async () => {
    // The old SQL selected method_name / study_name. Against these real shapes
    // that is an undefined-column error, not an empty result.
    await expect(
      readContradictionRegisters(pool, { organizationId: MINE, projectId: MY_PROJECT }),
    ).resolves.toBeTruthy();
  });

  it('a legacy non-uuid project id yields no project-scoped rows instead of aborting the sweep', async () => {
    // Passing a numeric id to a uuid column raises 22P02 and would fail the
    // whole sweep; the org-wide registers must still answer.
    const out = await readContradictionRegisters(pool, { organizationId: MINE, projectId: '4821' });
    expect(out.specifications).toEqual([]);
    expect(out.batch).toEqual([]);
    expect(out.comparability).toEqual([]);
    expect(out.methods.map((m) => m.methodName)).toEqual(['My HPLC']);
  });
});
