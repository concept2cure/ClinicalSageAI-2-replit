/**
 * The composition boundary, through the real compose path on a real schema.
 *
 * ── Why a database test ───────────────────────────────────────────────────────
 * `composition-scope.test.ts` pins the rule. This pins the WIRING: that
 * `composeProjectModule3` — the one path by which a `cmc_module3_sections` row
 * is written — consults the boundary before it composes anything, resolves the
 * application type from the program's real submission spine, and runs its spine
 * read under a savepoint so a failure cannot poison the caller's transaction.
 *
 * The case that matters is the one the staff simulation has been running: a
 * monoclonal antibody (modality `biologic`, route "CHO cell culture", INN
 * `belantezumab`) under a US IND. Before this change it composed a full
 * small-molecule Module 3 — ICH Q3A impurity reasoning and all — and persisted
 * it as the compiler's verdict.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • the simulation's own mAb is refused, and NOTHING is composed;
 *   • the same program with a small-molecule substance composes;
 *   • the same small molecule under an NDA is refused, naming NDA;
 *   • a program with no submission spine composes (it is being set up);
 *   • the refusal is a typed throw, so a caller cannot read it as zero
 *     sections;
 *   • the caller's transaction survives — after a refusal the connection can
 *     still commit work of its own.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import { composeProjectModule3 } from '../module3-compile';
import { isCompositionOutOfScope } from '../composition-scope';

let harness: IndPgliteDb;
const ORG = 31;
let PROGRAM: string;

/** The compose path reads this; the harness does not provision it. */
const CMC_SOURCE_OBJECTS_DDL = `
CREATE TABLE IF NOT EXISTS cmc_source_objects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  project_id      TEXT NOT NULL,
  source_type     TEXT NOT NULL,
  source_key      TEXT NOT NULL,
  source_payload  JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_hash     TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/** A client shaped like the pg PoolClient the compose path takes. */
const client = {
  query: (text: string, params?: unknown[]) => harness.pglite.query(text, params as unknown[]) as never,
};

async function q(text: string, params: unknown[] = []) {
  return (await harness.pglite.query(text, params)).rows as Array<Record<string, unknown>>;
}

async function recordSubstance(payload: Record<string, unknown>) {
  await q(`DELETE FROM cmc_source_objects WHERE project_id = $1`, [PROGRAM]);
  await q(
    `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key, source_payload)
     VALUES ($1, $2, 'drug_substance', 'drug_substance:1', $3::jsonb)`,
    [ORG, PROGRAM, JSON.stringify(payload)],
  );
  // A drug product too, so the core composer has something for §3.2.P.
  await q(
    `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key, source_payload)
     VALUES ($1, $2, 'drug_product', 'drug_product:1', $3::jsonb)`,
    [
      ORG,
      PROGRAM,
      JSON.stringify({ productName: 'BX-701 tablets', dosageFormDescription: 'Immediate-release tablet' }),
    ],
  );
}

/**
 * What the program files.
 *
 * `resolveSubmissionSpine` only ever matches a submission whose
 * `application_type` equals the program's own `program_type`, so the two are
 * set together — and the submission is matched by product name, which is how
 * an unanchored row is claimed (`findProgramSubmission`).
 */
async function filesApplication(applicationType: string, withSubmission = true) {
  await q(`DELETE FROM submissions WHERE organization_id = $1`, [ORG]);
  await q(`UPDATE regulatory_programs SET program_type = $1 WHERE id = $2`, [applicationType, PROGRAM]);
  if (!withSubmission) return;
  await q(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by, product_name)
     VALUES ($1, $2, 'biotech', 'fda', $3, 1, 'BX-701')`,
    [`BX-701 ${applicationType.toUpperCase()}`, applicationType.toLowerCase(), ORG],
  );
}

const SMALL_MOLECULE = {
  name: 'BX-701',
  manufacturingRoute: 'Three-step chemical synthesis from 2-aminopyridine; isolated by crystallisation',
  modality: 'small_molecule',
};

/** Exactly what scripts/dev/cmc-staff-simulation.sh records. */
const SIMULATION_MAB = {
  name: 'belantezumab',
  manufacturingRoute: 'CHO cell culture',
  modality: 'biologic',
  biologicalOrigin: 'CHO cell culture, fed-batch',
  cellLine: 'CHO-K1; MCB lot MCB-2401, WCB lot WCB-2403',
  sourceOrganism: 'Cricetulus griseus (Chinese hamster ovary)',
};

/** Compose inside a transaction, as every real caller does. */
async function composeInTransaction() {
  await q('BEGIN');
  try {
    return await composeProjectModule3(client as never, ORG, PROGRAM);
  } finally {
    await q('ROLLBACK').catch(() => undefined);
  }
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, programSpine: true });
  await harness.pglite.exec(CMC_SOURCE_OBJECTS_DDL);
  await q(`INSERT INTO organizations (id, name) VALUES ($1, 'Composition scope org')
           ON CONFLICT (id) DO NOTHING`, [ORG]);
  const [p] = await q(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_type, product_name)
     VALUES ($1, 'BX-701 program', 'BX701', 'IND', 'drug', 'BX-701') RETURNING id`,
    [ORG],
  );
  PROGRAM = String(p.id);
}, 60_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await filesApplication('IND');
  await recordSubstance(SMALL_MOLECULE);
});

describe('the compose path consults the boundary before it composes', () => {
  it('refuses a program the person recorded as a biologic, whatever its substance says', async () => {
    /* The product class is the sponsor's own statement (P-21), asked before
       the substance record — so a program recorded as a biologic is refused
       even while its substance register says small molecule. */
    await q(`UPDATE regulatory_programs SET product_type = 'biologic' WHERE id = $1`, [PROGRAM]);
    try {
      const err = await composeInTransaction().then((ok) => ({ composed: ok.sections.length }), (e) => e);
      expect(isCompositionOutOfScope(err), JSON.stringify(err)).toBe(true);
      expect((err as { refusal: { code: string } }).refusal.code).toBe('CMC_PRODUCT_CLASS_OUT_OF_SCOPE');
    } finally {
      await q(`UPDATE regulatory_programs SET product_type = 'drug' WHERE id = $1`, [PROGRAM]);
    }
  });

  it('composes a small molecule for a US IND', async () => {
    const { sources, sections } = await composeInTransaction();
    expect(sources.length).toBeGreaterThan(0);
    expect(sections.length, 'a small-molecule US IND composed nothing').toBeGreaterThan(0);
  });

  it('refuses the simulation’s monoclonal antibody, and composes nothing', async () => {
    await recordSubstance(SIMULATION_MAB);

    const err = await composeInTransaction().then(
      (ok) => ({ composed: ok.sections.length }),
      (e) => e,
    );

    expect(isCompositionOutOfScope(err), `a mAb composed ${JSON.stringify(err)}`).toBe(true);
    expect((err as { refusal: { code: string } }).refusal.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
    expect((err as Error).message).toMatch(/Q6B/);
  });

  it('refuses the same small molecule when the program files an NDA', async () => {
    await filesApplication('NDA');

    const err = await composeInTransaction().then((ok) => ({ composed: ok.sections.length }), (e) => e);

    expect(isCompositionOutOfScope(err), JSON.stringify(err)).toBe(true);
    expect((err as { refusal: { code: string } }).refusal.code).toBe('CMC_APPLICATION_OUT_OF_SCOPE');
    expect((err as Error).message).toContain('NDA');
  });

  it('refuses an NDA program that has no submission row yet', async () => {
    /* The spine resolves null for a program with no `submissions` row, so a
       boundary that read "no spine" as "nothing contradicts a US IND" let
       exactly this compose. */
    await filesApplication('NDA', false);

    const err = await composeInTransaction().then((ok) => ({ composed: ok.sections.length }), (e) => e);

    expect(isCompositionOutOfScope(err), JSON.stringify(err)).toBe(true);
    expect((err as { refusal: { code: string } }).refusal.code).toBe('CMC_APPLICATION_OUT_OF_SCOPE');
  });

  it('composes for an IND program that has no submission row yet', async () => {
    await filesApplication('IND', false);
    const { sections } = await composeInTransaction();
    expect(sections.length).toBeGreaterThan(0);
  });

  it('refuses a program whose substance records no route and no biological origin', async () => {
    await recordSubstance({ name: 'BX-701' });

    const err = await composeInTransaction().then((ok) => ({ composed: ok.sections.length }), (e) => e);

    expect(isCompositionOutOfScope(err), JSON.stringify(err)).toBe(true);
    expect((err as { refusal: { code: string } }).refusal.code).toBe('CMC_MODALITY_NOT_ESTABLISHED');
  });

  it('leaves the caller’s transaction usable after a refusal', async () => {
    await recordSubstance(SIMULATION_MAB);
    await q('BEGIN');
    await composeProjectModule3(client as never, ORG, PROGRAM).catch(() => undefined);
    /* The spine read runs under a savepoint; a refusal is a throw, not an
       aborted statement. So the transaction is still live and can commit. */
    await q(
      `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key)
       VALUES ($1, $2, 'specification', 'spec:after-refusal')`,
      [ORG, PROGRAM],
    );
    await q('COMMIT');
    const rows = await q(`SELECT 1 FROM cmc_source_objects WHERE source_key = 'spec:after-refusal'`);
    expect(rows.length).toBe(1);
  });
});
