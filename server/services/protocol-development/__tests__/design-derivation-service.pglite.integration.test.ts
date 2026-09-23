/**
 * Protocol → study design derivation, END-TO-END against in-process PGlite.
 *
 * `design-derivation.test.ts` proves the pure engine's four honesty rules. This
 * proves the half that touches the database, which is where a derivation can do
 * real damage: it reads the live registers, and on apply it writes through
 * `persistStudyDesignTx` onto the real PRM tables.
 *
 * What is proved here:
 *
 *   • tenant scoping on BOTH sides — another org's protocol and another
 *     tenant's design are each NOT_FOUND, with nothing written;
 *   • "nothing is bound" is distinct from "the design is empty" — an unbound
 *     protocol is refused, never derived against an invented blank design;
 *   • an accepted path is applied and survives a re-read of the PRM row;
 *   • the value is recomputed server-side from the live rows, so an accepted
 *     path cannot carry a stale value from the client;
 *   • an unevidenced path cannot clear a design field even when the caller
 *     asks for it by name — the case that would silently destroy data.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import {
  readDerivation,
  applyDerivationTx,
  DerivationError,
} from '../design-derivation-service';
import { STUDY_DESIGN_META_KIND } from '../../study-design/study-design-repository';
import type { StudyDesign } from '../../study-design/study-design-types';

const ORG = 7;
const OTHER = 9;
const SD = 'sd_derivation_test';

const DDL = `
CREATE TABLE protocol_documents (id serial PRIMARY KEY, organization_id int, protocol_kind text, title text, design_type text, phase text, therapeutic_area text, status text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz, study_design_id text, study_design_linked_at timestamptz, study_design_linked_by int);
CREATE TABLE protocol_objectives (id serial PRIMARY KEY, organization_id int, protocol_document_id int, objective_type text, objective text, endpoint text, timepoint text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_eligibility_criteria (id serial PRIMARY KEY, organization_id int, protocol_document_id int, kind text, criterion text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_schedule_visits (id serial PRIMARY KEY, organization_id int, protocol_document_id int, visit_name text, timepoint text, procedures text[], order_index int, deleted_at timestamptz);
CREATE TABLE cdisc_prm_studies (id serial PRIMARY KEY, tenant_id int, study_id varchar(100) UNIQUE, program_id uuid, protocol_id text, protocol_title text, protocol_version text, study_phase varchar(20), study_type text, therapeutic_area text, indication text, primary_objective text, secondary_objectives json, study_design text, blinding_schema text, randomization json, population_description text, planned_subjects int, protocol_status varchar(50), metadata json, created_by text, last_modified_by text, updated_at timestamptz DEFAULT now());
CREATE TABLE cdisc_prm_study_arms (id serial PRIMARY KEY, tenant_id int, study_id varchar(100), arm_code text, arm_name text, arm_description text, arm_type text, planned_subjects int, treatment_description text, dosing json, sequence_number int);
CREATE TABLE cdisc_prm_endpoints (id serial PRIMARY KEY, tenant_id int, study_id varchar(100), endpoint_id text, endpoint_type text, endpoint_name text, endpoint_description text, measurement_type text, analysis_method text, timepoint text, success_criteria text);
`;

const HBA1C_NAME = 'Change from baseline in HbA1c at week 24';

/** A design with the endpoint already present, so objectives are derivable. */
function design(over: Partial<StudyDesign> = {}): StudyDesign {
  return {
    id: SD,
    title: 'BX-204 pivotal trial',
    phase: '3',
    indication: 'Type 2 diabetes',
    objectives: [],
    estimands: [],
    endpoints: [
      { name: HBA1C_NAME, role: 'primary', type: 'continuous', definition: 'Change in HbA1c (%) to week 24' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'Adults with inadequately controlled T2DM',
      analysisPopulations: [],
      eligibility: [{ type: 'inclusion', text: 'Pre-existing criterion that must survive' }],
    },
    arms: [],
    statisticalPlan: { plannedAnalyses: [] },
    ...over,
  };
}

async function seedDesign(tenant: number, d: StudyDesign, studyId = SD): Promise<void> {
  await pool.query(
    `INSERT INTO cdisc_prm_studies (tenant_id, study_id, protocol_title, metadata)
     VALUES ($1,$2,$3,$4)`,
    [tenant, studyId, d.title, JSON.stringify({ kind: STUDY_DESIGN_META_KIND, design: d })],
  );
}

async function seedProtocol(opts: { org?: number; studyDesignId?: string | null } = {}): Promise<number> {
  const org = opts.org ?? ORG;
  const res = await pool.query(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, title, design_type, phase, therapeutic_area, status, study_design_id)
     VALUES ($1,'clinical','A Phase 3 Study of BX-204 in Type 2 Diabetes','interventional','Phase 3','Endocrinology','draft',$2)
     RETURNING id`,
    [org, opts.studyDesignId === undefined ? SD : opts.studyDesignId],
  );
  const id = Number(res.rows[0].id);
  await pool.query(
    `INSERT INTO protocol_objectives (organization_id, protocol_document_id, objective_type, objective, endpoint, timepoint, order_index)
     VALUES ($1,$2,'primary','Demonstrate glycaemic control',$3,'Week 24',0)`,
    [org, id, HBA1C_NAME],
  );
  await pool.query(
    `INSERT INTO protocol_eligibility_criteria (organization_id, protocol_document_id, kind, criterion, order_index)
     VALUES ($1,$2,'inclusion','Adults 18-75 with T2DM',0), ($1,$2,'exclusion','eGFR below 30',1)`,
    [org, id],
  );
  return id;
}

async function storedDesign(studyId = SD): Promise<StudyDesign> {
  const r = await pool.query(`SELECT metadata FROM cdisc_prm_studies WHERE study_id = $1`, [studyId]);
  return (r.rows[0].metadata as { design: StudyDesign }).design;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
});

beforeEach(async () => {
  await pglite.exec(`
    TRUNCATE protocol_documents, protocol_objectives, protocol_eligibility_criteria,
             protocol_schedule_visits, cdisc_prm_studies, cdisc_prm_study_arms, cdisc_prm_endpoints
    RESTART IDENTITY;
  `);
});

describe('derivation service — refusals', () => {
  it('refuses a protocol with no design bound, rather than deriving against a blank one', async () => {
    await seedDesign(ORG, design());
    const id = await seedProtocol({ studyDesignId: null });

    await expect(readDerivation(pool, ORG, id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(readDerivation(pool, ORG, id)).rejects.toBeInstanceOf(DerivationError);
  });

  it('does not read another organization’s protocol', async () => {
    await seedDesign(ORG, design());
    const id = await seedProtocol({ org: OTHER });

    await expect(readDerivation(pool, ORG, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not read a design belonging to another tenant', async () => {
    await seedDesign(OTHER, design());
    const id = await seedProtocol();

    await expect(readDerivation(pool, ORG, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a design row whose metadata carries no design object', async () => {
    await pool.query(
      `INSERT INTO cdisc_prm_studies (tenant_id, study_id, protocol_title, metadata) VALUES ($1,$2,'x',$3)`,
      [ORG, SD, JSON.stringify({ kind: 'something-else' })],
    );
    const id = await seedProtocol();

    await expect(readDerivation(pool, ORG, id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('requires at least one accepted path', async () => {
    await seedDesign(ORG, design());
    const id = await seedProtocol();

    await expect(applyDerivationTx(pool, ORG, id, [], 11)).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
});

describe('derivation service — reading the live registers', () => {
  it('derives eligibility and objectives from the rows as stored', async () => {
    await seedDesign(ORG, design());
    const id = await seedProtocol();

    const { derivation, studyDesignId } = await readDerivation(pool, ORG, id);

    expect(studyDesignId).toBe(SD);
    const eligibility = derivation.conflicts.find((c) => c.path === 'population.eligibility');
    expect(eligibility?.protocolValue).toEqual([
      { type: 'inclusion', text: 'Adults 18-75 with T2DM' },
      { type: 'exclusion', text: 'eGFR below 30' },
    ]);
    const objectives = derivation.proposed.find((p) => p.path === 'objectives');
    expect(objectives?.value).toEqual([
      { level: 'primary', order: 1, text: 'Demonstrate glycaemic control', endpointName: HBA1C_NAME },
    ]);
  });

  it('reports a soft-deleted register row as absent', async () => {
    await seedDesign(ORG, design());
    const id = await seedProtocol();
    await pool.query(`UPDATE protocol_eligibility_criteria SET deleted_at = now() WHERE protocol_document_id = $1`, [id]);

    const { derivation } = await readDerivation(pool, ORG, id);

    expect(derivation.unevidenced.map((u) => u.path)).toContain('population.eligibility');
    expect(derivation.proposed.map((p) => p.path)).not.toContain('population.eligibility');
  });
});

describe('derivation service — applying', () => {
  it('writes an accepted path onto the PRM row and it survives a re-read', async () => {
    await seedDesign(ORG, design());
    const id = await seedProtocol();

    const result = await applyDerivationTx(pool, ORG, id, ['objectives'], 11);

    expect(result.applied).toEqual(['objectives']);
    expect((await storedDesign()).objectives).toEqual([
      { level: 'primary', order: 1, text: 'Demonstrate glycaemic control', endpointName: HBA1C_NAME },
    ]);
    // Re-derived against the design as it now stands.
    expect(result.derivation.unchanged).toContain('objectives');
  });

  it('writes the value the LIVE rows evidence, not one the caller could supply', async () => {
    await seedDesign(ORG, design());
    const id = await seedProtocol();
    await pool.query(
      `UPDATE protocol_objectives SET objective = 'Edited after the diff was displayed' WHERE protocol_document_id = $1`,
      [id],
    );

    await applyDerivationTx(pool, ORG, id, ['objectives'], 11);

    expect((await storedDesign()).objectives[0].text).toBe('Edited after the diff was displayed');
  });

  it('cannot clear a design field via a path the protocol does not evidence', async () => {
    await seedDesign(ORG, design());
    const id = await seedProtocol();
    await pool.query(`DELETE FROM protocol_eligibility_criteria WHERE protocol_document_id = $1`, [id]);

    const result = await applyDerivationTx(pool, ORG, id, ['population.eligibility'], 11);

    expect(result.applied).toEqual([]);
    expect(result.rejected[0].path).toBe('population.eligibility');
    expect((await storedDesign()).population.eligibility).toEqual([
      { type: 'inclusion', text: 'Pre-existing criterion that must survive' },
    ]);
  });

  it('refuses an incomplete proposal and writes nothing for it', async () => {
    // The design does NOT carry the endpoint the objective names, so both
    // `endpoints` and `objectives` are incomplete.
    await seedDesign(ORG, design({ endpoints: [] }));
    const id = await seedProtocol();

    const result = await applyDerivationTx(pool, ORG, id, ['endpoints', 'objectives'], 11);

    expect(result.applied).toEqual([]);
    expect(result.rejected.map((r) => r.path).sort()).toEqual(['endpoints', 'objectives']);
    expect((await storedDesign()).endpoints).toEqual([]);
    expect((await storedDesign()).objectives).toEqual([]);
  });

  it('updates the bound design in place rather than creating a second one', async () => {
    await seedDesign(ORG, design());
    const id = await seedProtocol();

    await applyDerivationTx(pool, ORG, id, ['objectives'], 11);

    const rows = await pool.query(`SELECT study_id FROM cdisc_prm_studies WHERE tenant_id = $1`, [ORG]);
    expect(rows.rows.map((r) => r.study_id)).toEqual([SD]);
  });

  it('does not apply to another tenant’s design', async () => {
    await seedDesign(OTHER, design());
    const id = await seedProtocol();

    await expect(applyDerivationTx(pool, ORG, id, ['objectives'], 11)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await storedDesign()).objectives).toEqual([]);
  });
});
