/**
 * Security contract: the ICH compliance checker and the QbD analyzer must read
 * only the caller's own project data.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Both `gatherInputs` (ich-compliance-checker.ts) and `analyzeQbdFromSources`
 * (qbd-analyzer.ts) receive `orgId` and use it — for `cmc_source_objects` and
 * `cmc_module3_sections`. Their other four reads did not:
 *
 *     FROM quality_specifications  WHERE project_id = $1::text::uuid
 *     FROM analytical_methods      WHERE project_id = $1::text::uuid
 *     FROM drug_substances         WHERE project_id = $1::text::uuid
 *     FROM manufacturing_processes WHERE project_id = $1::text::uuid
 *
 * The project id comes from the caller. `cmc_projects.id` is a shared uuid
 * space across every tenant, so a request naming another sponsor's project id
 * returned that sponsor's specifications, analytical methods, drug substances
 * and manufacturing processes — as an ICH compliance report and a QbD element
 * map, both of which quote the underlying values back (material names,
 * acceptance criteria, CPPs) rather than only counting them.
 *
 * Both modules wrap each read in a `safe`/`safeQuery` helper that records a
 * failure instead of collapsing it to an empty array. That helper is what makes
 * the missing predicate quiet: the leak is a SUCCESSFUL query, so nothing
 * anywhere reported it.
 *
 * Every one of these tables carries `organization_id`, except
 * quality_specifications which carries `tenant_id`.
 *
 * ── Why this test executes SQL ────────────────────────────────────────────────
 * Which rows a predicate returns is decided by the database. This builds the
 * four tables, seeds two organizations against two projects, and drives the
 * real functions.
 *
 * @compliance Tenant isolation of CMC development data (specifications,
 *             methods, substances, processes) feeding ICH/QbD assessments.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;

const h = vi.hoisted(() => ({ pool: null as any }));
vi.mock('../../../db', () => ({ getPool: () => h.pool }));
// Stability comes from the canonical source-object store via its own module,
// which is separately tested; stubbing it keeps a leak attributable to the four
// reads under test.
vi.mock('../stability-source', () => ({
  loadProjectStabilityStudies: async () => ({ available: true, studies: [] }),
}));

// Driven through the public entry point — no test-only export. The report
// quotes the underlying values (material names, method names, findings'
// evidence), which is exactly why a leak here is a disclosure and not just a
// miscount.
import { runIchComplianceCheck } from '../ich-compliance-checker';
import { analyzeQbdFromSources } from '../qbd-analyzer';
import { generateControlStrategy } from '../control-strategy-generator';

const MINE = 1;
const THEIRS = 2;
const MY_PROJECT = '11111111-1111-4111-8111-111111111111';
const THEIR_PROJECT = '22222222-2222-4222-8222-222222222222';

beforeAll(async () => {
  pglite = new PGlite();
  h.pool = {
    query: async (text: string, params?: unknown[]) => {
      const r = await pglite.query(text, params as unknown[]);
      return { rows: r.rows as any[] };
    },
  };

  await pglite.exec(`
    -- tenant_id on quality_specifications; organization_id on the other three.
    CREATE TABLE quality_specifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id int, project_id uuid,
      material_type text, material_name text, test_parameters jsonb,
      acceptance_criteria jsonb, justification text);
    CREATE TABLE analytical_methods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, project_id uuid,
      method_name text, method_type text, purpose text, validation_status text,
      specificity_data jsonb, linearity_data jsonb, accuracy_data jsonb,
      precision_data jsonb, robustness_data jsonb);
    CREATE TABLE drug_substances (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, project_id uuid,
      substance_name text, impurities jsonb, characterization_data jsonb);
    CREATE TABLE manufacturing_processes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, project_id uuid,
      process_name text, process_type text, process_steps jsonb,
      critical_process_parameters jsonb, process_controls jsonb, validation_status text);
    CREATE TABLE cmc_source_objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, project_id uuid,
      source_type text, source_payload jsonb, source_key text);
    CREATE TABLE cmc_module3_sections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, project_id uuid,
      section_key text, approval_state text, stale boolean, narrative_text text);

    -- test_parameters gives the QbD analyzer a CQA to derive, and the method's
    -- its "purpose" is what matchMethodForCqa keys on. Both are needed for a loaded
    -- method to be CITED in the control strategy — a method that loads but
    -- never matches would make the control below vacuous.
    INSERT INTO quality_specifications (tenant_id, project_id, material_type, material_name, test_parameters)
      VALUES (${THEIRS}, '${THEIR_PROJECT}', 'drug_substance', 'THEIR SECRET API', '["assay"]'::jsonb),
             (${MINE},   '${MY_PROJECT}',    'drug_substance', 'My API',           '["assay"]'::jsonb);
    INSERT INTO analytical_methods (organization_id, project_id, method_name, method_type, purpose, validation_status)
      VALUES (${THEIRS}, '${THEIR_PROJECT}', 'THEIR HPLC METHOD', 'chromatographic', 'assay', 'validated'),
             (${MINE},   '${MY_PROJECT}',    'My HPLC',           'chromatographic', 'assay', 'validated');
    INSERT INTO drug_substances (organization_id, project_id, substance_name)
      VALUES (${THEIRS}, '${THEIR_PROJECT}', 'THEIR SUBSTANCE'),
             (${MINE},   '${MY_PROJECT}',    'My substance');
    INSERT INTO manufacturing_processes (organization_id, project_id, process_name, process_type)
      VALUES (${THEIRS}, '${THEIR_PROJECT}', 'THEIR PROCESS', 'synthesis'),
             (${MINE},   '${MY_PROJECT}',    'My process',    'synthesis');
  `);
});

afterAll(async () => {
  await pglite?.close?.();
});

/** Everything the two readers returned, as one searchable blob. */
const blobOf = (o: unknown) => JSON.stringify(o);
const THEIR_VALUES = ['THEIR SECRET API', 'THEIR HPLC METHOD', 'THEIR SUBSTANCE', 'THEIR PROCESS'];

describe('the fixture can actually detect the leak (control)', () => {
  it('the predicate these replaced returns another organization’s rows from the same fixture', async () => {
    // Not a test of current behaviour — a control proving the assertions below
    // are load-bearing. This is verbatim the SQL both modules ran.
    const leaked = await h.pool.query(
      `SELECT material_name FROM quality_specifications WHERE project_id = $1::text::uuid`,
      [THEIR_PROJECT],
    );
    expect(leaked.rows.map((r: any) => r.material_name)).toContain('THEIR SECRET API');
  });
});

describe('runIchComplianceCheck — ICH compliance checker', () => {
  it("returns nothing of another organization's when handed their project id", async () => {
    const out = await runIchComplianceCheck(MINE, THEIR_PROJECT);
    for (const v of THEIR_VALUES) {
      expect(blobOf(out), `${v} leaked into the ICH compliance inputs`).not.toContain(v);
    }
  });

  it("still evaluates the caller's own project — the fix is not 'scope everything to nothing'", async () => {
    const own = await runIchComplianceCheck(MINE, MY_PROJECT);
    const foreign = await runIchComplianceCheck(MINE, THEIR_PROJECT);
    // The caller's own project has four registers populated; the foreign one is
    // now invisible to them. If the repair had scoped everything to nothing,
    // these two would be identical.
    expect(own.counts, "the caller's own inputs were dropped too").not.toEqual(foreign.counts);
    // And nothing failed to read: a leak fixed by breaking the query is not a fix.
    expect(own.unevaluatedInputs).toEqual([]);
  });
});

describe('analyzeQbdFromSources — QbD analyzer', () => {
  // The QbD result reports COUNTS per input rather than quoting the values, so
  // the disclosure here is quantitative: how many specifications, methods,
  // substances and processes another sponsor has recorded against a project.
  // The assertion is on `inputs` for that reason — a blob search would pass
  // vacuously and prove nothing.
  it("counts none of another organization's records when handed their project id", async () => {
    const out = await analyzeQbdFromSources(MINE, THEIR_PROJECT);
    expect(out.inputs.specificationCount, "another sponsor's specifications were counted").toBe(0);
    expect(out.inputs.methodCount, "another sponsor's analytical methods were counted").toBe(0);
    expect(out.inputs.drugSubstanceCount, "another sponsor's drug substances were counted").toBe(0);
    expect(out.inputs.processCount, "another sponsor's manufacturing processes were counted").toBe(0);
    // A zero reached by a BROKEN read is not isolation. Every read must have run.
    expect(out.unevaluatedInputs, 'a read failed, so the zeros above prove nothing').toEqual([]);
  });

  it("still counts the caller's own records — the fix is not 'scope everything to nothing'", async () => {
    const out = await analyzeQbdFromSources(MINE, MY_PROJECT);
    expect(out.inputs.specificationCount).toBe(1);
    expect(out.inputs.methodCount).toBe(1);
    expect(out.inputs.drugSubstanceCount).toBe(1);
    expect(out.inputs.processCount).toBe(1);
    expect(out.unevaluatedInputs).toEqual([]);
  });
});

/**
 * `loadMethods(orgId, projectId)` in control-strategy-generator ACCEPTED orgId
 * and then filtered on project_id alone. A control strategy names the
 * analytical method that controls each CQA, so another sponsor's method names,
 * purposes and ICH Q2 validation status were matched to this project's CQAs and
 * written into its 3.2.P.5 / control-strategy document — the one a reviewer
 * reads as this product's testing plan.
 */
describe('generateControlStrategy — the methods it cites are the caller’s own', () => {
  it("cites no method belonging to another organization", async () => {
    const doc = await generateControlStrategy(MINE, THEIR_PROJECT);
    expect(
      blobOf(doc),
      "another sponsor's analytical method was cited in this project's control strategy",
    ).not.toContain('THEIR HPLC METHOD');
  });

  it("still cites the caller's own method — the fix is not 'scope everything to nothing'", async () => {
    // A positive control: loadMethods must still find the project's real
    // methods, or the negative assertion above would pass over an empty read.
    const theirOwn = await generateControlStrategy(THEIRS, THEIR_PROJECT);
    expect(
      blobOf(theirOwn),
      "the owning organization lost its own analytical method",
    ).toContain('THEIR HPLC METHOD');
  });
});
