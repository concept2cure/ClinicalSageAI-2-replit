/**
 * The composition boundary at the READERS of a program's Module 3, on a real
 * engine.
 *
 * ── Why a database test ───────────────────────────────────────────────────────
 * The compose path reads the submission spine under a savepoint, and Postgres
 * refuses `SAVEPOINT` outside a transaction block. Two readers handed it the
 * bare pool:
 *
 *   • the build board (getModule3BuildStatus): its 3.2.R pass threw on the
 *     first statement and was skipped, on every call, so the board never listed
 *     the regional section the compile writes and the export gate counts;
 *   • AnA's 2.3 Quality Overall Summary: compose threw, and every draft
 *     answered "could not be read just now".
 *
 * Their unit tests ran against hand-written pools that answer any SQL, a
 * savepoint included, so neither was ever seen to fail. PGlite is Postgres: it
 * refuses exactly as production does.
 *
 * And the board ran the small-molecule composer for any program, so a
 * monoclonal antibody was scored on Q3A impurity inputs and counted "ready to
 * compile" while compile refused it (2026-10-15 launch-boundary re-proof,
 * docs/evidence/D2-API-SCOPE/2026-10-15-reproof/cmc-boundary/).
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • the board lists exactly the 3.2.R section the compile composes;
 *   • the board refuses, typed, a biologic and a program filing an NDA;
 *   • the boundary is judged for a caller with no transaction, and leaves none
 *     open behind it;
 *   • the QOS drafts for a small-molecule IND program, and relays the
 *     boundary's refusal for a biologic.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

/**
 * Queries go to PGlite. PGlite is ONE session, and a pg Pool is not: a bare
 * `pool.query` runs on whichever idle connection is free, in autocommit, never
 * inside the transaction another caller holds on the connection it was lent.
 * So the stand-in pool refuses a savepoint on a bare `query`, exactly as
 * Postgres refuses it there. Without that, a reader that opened a transaction
 * on a lent connection and then handed the POOL to the savepoint reader would
 * pass here (one shared session) and fail in production (found by the review
 * of 2026-10-22).
 */
const h = vi.hoisted(() => {
  const state: { harness: IndPgliteDb | null } = { harness: null };
  const run = (text: string, params?: unknown[]) => state.harness!.pglite.query(text, params as unknown[]) as never;
  const SAVEPOINT = /^\s*(SAVEPOINT|RELEASE\s+SAVEPOINT|ROLLBACK\s+TO\s+SAVEPOINT)\b/i;
  const autocommit = (text: string, params?: unknown[]) =>
    SAVEPOINT.test(text)
      ? (Promise.reject(new Error('SAVEPOINT can only be used in transaction blocks')) as never)
      : run(text, params);
  return { state, pool: { query: autocommit, connect: async () => ({ query: run, release: () => undefined }) } };
});
const pglitePool = h.pool;
let harness: IndPgliteDb;

vi.mock('../../../db', () => ({ getPool: () => h.pool, pool: h.pool, db: {} }));
// The artifact registry is not what this pins; an unaddressable spine skips its reads.
vi.mock('../resolve-cmc-artifact-project', () => ({
  resolveCmcArtifactProject: async () => ({ state: 'unaddressable', artifactProjectId: null, detail: 'not provisioned here' }),
}));

import { getModule3BuildStatus } from '../../module3-convergence-service';
import { assessProgramCompositionScope, composeProjectModule3 } from '../module3-compile';
import { compositionRefusalStatus, isCompositionOutOfScope } from '../composition-scope';
import { draftQualityOverallSummary } from '../../ana/cmc-quality-summary-tool';

const ORG = 43;
let PROGRAM: string;

/** The readers read these; the harness does not provision them. */
const CMC_DDL = `
CREATE TABLE IF NOT EXISTS cmc_source_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id INTEGER NOT NULL, project_id TEXT NOT NULL,
  source_type TEXT NOT NULL, source_key TEXT NOT NULL, source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_hash TEXT, version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cmc_module3_sections (
  id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, project_id TEXT NOT NULL, section_key TEXT NOT NULL,
  stale BOOLEAN NOT NULL DEFAULT false, stale_reason TEXT, approval_state TEXT NOT NULL DEFAULT 'draft',
  compiled_hash TEXT, deterministic_json JSONB, narrative_text TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cmc_contradictions (
  id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, project_id TEXT NOT NULL,
  impacted_sections JSONB NOT NULL DEFAULT '[]'::jsonb, status TEXT NOT NULL DEFAULT 'open', severity TEXT
);
`;

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
  await q(
    `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key, source_payload)
     VALUES ($1, $2, 'drug_product', 'drug_product:1', $3::jsonb)`,
    [ORG, PROGRAM, JSON.stringify({ productName: 'BX-702 tablets', dosageFormDescription: 'Immediate-release tablet' })],
  );
}

/** What the program files: its own type and a submission the spine matches by product name. */
async function filesApplication(applicationType: string) {
  await q(`DELETE FROM submissions WHERE organization_id = $1`, [ORG]);
  await q(`UPDATE regulatory_programs SET program_type = $1 WHERE id = $2`, [applicationType, PROGRAM]);
  await q(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by, product_name)
     VALUES ($1, $2, 'biotech', 'fda', $3, 1, 'BX-702')`,
    [`BX-702 ${applicationType.toUpperCase()}`, applicationType.toLowerCase(), ORG],
  );
}

const SMALL_MOLECULE = {
  name: 'BX-702',
  manufacturingRoute: 'Three-step chemical synthesis; isolated by crystallisation',
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

const refusalOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    if (isCompositionOutOfScope(err)) return err.refusal;
    throw err;
  }
  return null;
};

/** No transaction is left open on the session: a savepoint is refused again. */
const noTransactionOpen = () => expect(q('SAVEPOINT probe')).rejects.toThrow(/transaction blocks/);

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, programSpine: true });
  h.state.harness = harness;
  await harness.pglite.exec(CMC_DDL);
  await q(`INSERT INTO organizations (id, name) VALUES ($1, 'Boundary readers org') ON CONFLICT (id) DO NOTHING`, [ORG]);
  const [p] = await q(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_type, product_name)
     VALUES ($1, 'BX-702 program', 'BX702', 'IND', 'drug', 'BX-702') RETURNING id`,
    [ORG],
  );
  PROGRAM = String(p.id);
}, 60_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await q(`UPDATE regulatory_programs SET product_type = 'drug' WHERE id = $1`, [PROGRAM]);
  await recordSubstance(SMALL_MOLECULE);
  await filesApplication('ind');
});

describe('the build board (getModule3BuildStatus)', () => {
  it('a bare SAVEPOINT is refused here, as in production: this engine is the one that matters', async () => {
    await noTransactionOpen();
  });

  it('lists exactly the 3.2.R section the compile composes for a US IND', async () => {
    const client = await pglitePool.connect();
    await client.query('BEGIN');
    let composedRegional: string[];
    try {
      const { sections } = await composeProjectModule3(client as never, ORG, PROGRAM);
      composedRegional = sections.map((s) => s.sectionKey).filter((k) => k.startsWith('3.2.R'));
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    expect(composedRegional.length).toBeGreaterThan(0);

    const { sections } = await getModule3BuildStatus(ORG, PROGRAM);
    expect(sections.map((s) => s.sectionKey).filter((k) => k.startsWith('3.2.R'))).toEqual(composedRegional);
    await noTransactionOpen();
  });

  it('refuses a monoclonal antibody, typed, and scores nothing', async () => {
    await recordSubstance(SIMULATION_MAB);
    const refusal = await refusalOf(getModule3BuildStatus(ORG, PROGRAM));
    expect(refusal?.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
    await noTransactionOpen();
  });

  it('refuses a small molecule whose program files an NDA', async () => {
    await filesApplication('nda');
    const refusal = await refusalOf(getModule3BuildStatus(ORG, PROGRAM));
    expect(refusal?.code).toBe('CMC_APPLICATION_OUT_OF_SCOPE');
  });

  it('judges the NEWEST drug substance, as compose does, whatever order the rows are stored in', async () => {
    /* The older record names the substance only, so on its own its modality
       is not established; the newer one records the synthesis. Compose reads
       newest first and admits the program. The board read in storage order and
       judged the older one (found by the review of 2026-10-22). */
    await q(`DELETE FROM cmc_source_objects WHERE project_id = $1`, [PROGRAM]);
    await q(
      `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key, source_payload, updated_at)
       VALUES ($1, $2, 'drug_substance', 'drug_substance:1', $3::jsonb, '2026-01-01T00:00:00Z'),
              ($1, $2, 'drug_substance', 'drug_substance:2', $4::jsonb, '2026-06-01T00:00:00Z')`,
      [ORG, PROGRAM, JSON.stringify({ name: 'BX-702' }), JSON.stringify(SMALL_MOLECULE)],
    );
    expect(await refusalOf(getModule3BuildStatus(ORG, PROGRAM))).toBeNull();
  });

  it.each([
    ['the older substance is a biologic, the newer a small molecule', SIMULATION_MAB, SMALL_MOLECULE],
    ['the older substance is a small molecule, the newer a biologic', SMALL_MOLECULE, SIMULATION_MAB],
  ])('reaches compose’s verdict when %s', async (_case, older, newer) => {
    await q(`DELETE FROM cmc_source_objects WHERE project_id = $1`, [PROGRAM]);
    await q(
      `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key, source_payload, updated_at)
       VALUES ($1, $2, 'drug_substance', 'drug_substance:1', $3::jsonb, '2026-01-01T00:00:00Z'),
              ($1, $2, 'drug_substance', 'drug_substance:2', $4::jsonb, '2026-06-01T00:00:00Z')`,
      [ORG, PROGRAM, JSON.stringify(older), JSON.stringify(newer)],
    );
    const client = await pglitePool.connect();
    await client.query('BEGIN');
    let composeVerdict: string | null;
    try {
      composeVerdict = (await refusalOf(composeProjectModule3(client as never, ORG, PROGRAM)))?.code ?? null;
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    const boardVerdict = (await refusalOf(getModule3BuildStatus(ORG, PROGRAM)))?.code ?? null;
    expect(boardVerdict).toBe(composeVerdict);
  });

  it('gives a program with no CMC records yet its empty board, not a refusal', async () => {
    await q(`DELETE FROM cmc_source_objects WHERE project_id = $1`, [PROGRAM]);
    const { sections } = await getModule3BuildStatus(ORG, PROGRAM);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((s) => s.sourceObjectCount === 0)).toBe(true);
  });

  it('still refuses a program with no records whose declared class is outside the boundary', async () => {
    await q(`DELETE FROM cmc_source_objects WHERE project_id = $1`, [PROGRAM]);
    await q(`UPDATE regulatory_programs SET product_type = 'biologic' WHERE id = $1`, [PROGRAM]);
    const refusal = await refusalOf(getModule3BuildStatus(ORG, PROGRAM));
    expect(refusal?.code).toBe('CMC_PRODUCT_CLASS_OUT_OF_SCOPE');
  });
});

describe('a legacy numeric project, which is not a program', () => {
  it('is refused as not a program — a settled answer, never a failed read or a driver error', async () => {
    const refusal = await assessProgramCompositionScope(ORG, '42');
    expect(refusal?.code).toBe('CMC_PROGRAM_NOT_RECORDED');
    expect(compositionRefusalStatus(refusal!)).toBe(409);
    expect(refusal?.message).not.toMatch(/uuid|invalid input syntax/i);
    const board = await refusalOf(getModule3BuildStatus(ORG, '42'));
    expect(board?.code).toBe('CMC_PROGRAM_NOT_RECORDED');
    await noTransactionOpen();
  });
});

describe('assessProgramCompositionScope — the boundary for a caller holding no transaction', () => {
  it('admits a small-molecule IND program, refuses a biologic, and leaves no transaction open', async () => {
    expect(await assessProgramCompositionScope(ORG, PROGRAM)).toBeNull();
    await noTransactionOpen();
    await recordSubstance(SIMULATION_MAB);
    expect((await assessProgramCompositionScope(ORG, PROGRAM))?.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
    await noTransactionOpen();
  });
});

describe('AnA’s 2.3 Quality Overall Summary', () => {
  const ctx = () => ({ organizationId: ORG, projectRef: PROGRAM }) as never;

  it('drafts for a small-molecule IND program on a real engine', async () => {
    const out = JSON.parse(await draftQualityOverallSummary(async () => pglitePool as never, {}, ctx()));
    expect(out.error).toBeUndefined();
    expect(out.drafted).toBe(true);
    expect(out.sectionKey).toBe('2.3');
    await noTransactionOpen();
  });

  it('relays the boundary’s refusal for a biologic, in its own words', async () => {
    await recordSubstance(SIMULATION_MAB);
    const out = JSON.parse(await draftQualityOverallSummary(async () => pglitePool as never, {}, ctx()));
    expect(out.drafted).toBeUndefined();
    expect(out.error).toMatch(/biolog/i);
    await noTransactionOpen();
  });
});
