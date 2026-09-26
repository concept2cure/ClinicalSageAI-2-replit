/**
 * A study design belongs to one project of its organization, and stays there
 * (PF-14, project first).
 *
 * `persistStudyDesignTx` is the one writer of a design: POST
 * /api/study-design/persist, the Biostatistics bridge that writes a sample
 * size into a design, and AnA's protocol→design derivation all go through it.
 * Three defects, one statement:
 *
 *   • `program_id` was taken from the request unchecked, so a design could be
 *     anchored to another organization's project;
 *   • `ON CONFLICT (study_id) DO UPDATE SET program_id = EXCLUDED.program_id`
 *     re-anchored a design on every save — to NULL when a save carried no
 *     project, to a different project when it carried another;
 *   • `study_id` is unique across ALL organizations and the design's id comes
 *     from the request, and the DO UPDATE had no tenant predicate, so a save
 *     naming another organization's study id overwrote that organization's
 *     design.
 *
 * Real DDL on PGlite: the PRM tables as the schema creates them, the program
 * link migration, and the program table.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractTableDdl } from '../../../../tests/golden-journeys/harness';
import { persistStudyDesignTx, StudyDesignPersistRefusal } from '../study-design-repository';
import type { StudyDesign } from '../study-design-types';

const ROOT = join(__dirname, '..', '..', '..', '..');
const ORG_1 = 1;
const ORG_2 = 2;
const P1 = '11111111-1111-4111-8111-111111111111'; // org 1
const P2 = '22222222-2222-4222-8222-222222222222'; // org 1
const P_FOREIGN = '33333333-3333-4333-8333-333333333333'; // org 2

let db: PGlite;
const client = { query: (text: string, params?: unknown[]) => db.query(text, params as unknown[]) };

function design(over: Partial<StudyDesign> = {}): StudyDesign {
  return {
    title: 'A study of Drug X',
    phase: '3',
    indication: 'type 2 diabetes',
    objectives: [{ level: 'primary', order: 1, text: 'Superiority on HbA1c', endpointName: 'HbA1c' }],
    estimands: [],
    endpoints: [{ name: 'HbA1c', role: 'primary', type: 'continuous', definition: 'change at week 24' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults', analysisPopulations: [], eligibility: [] },
    arms: [{ name: 'Drug X', interventions: [] }, { name: 'Placebo', interventions: [] }],
    randomization: { ratio: [1, 1], allocationMethod: 'simple', blinding: 'double' },
    statisticalPlan: { plannedSampleSize: 200, plannedAnalyses: [] },
    ...over,
  } as StudyDesign;
}

async function studyRow(studyId: string) {
  const { rows } = await db.query<{ tenant_id: number; program_id: string | null; protocol_title: string }>(
    `SELECT tenant_id, program_id, protocol_title FROM cdisc_prm_studies WHERE study_id = $1`,
    [studyId],
  );
  return rows[0];
}

async function persist(d: StudyDesign, tenantId = ORG_1) {
  await db.exec('BEGIN');
  try {
    const id = await persistStudyDesignTx(client, d, { tenantId, userId: 7 });
    await db.exec('COMMIT');
    return id;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    INSERT INTO organizations (id, name) VALUES (1, 'acme'), (2, 'other');
  `);
  await db.exec(readFileSync(join(ROOT, 'migrations/20260524_program_workbench_schema.sql'), 'utf8'));
  await db.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['cdisc_prm_studies', 'cdisc_prm_study_arms', 'cdisc_prm_endpoints']));
  await db.exec(readFileSync(join(ROOT, 'db/migrations/20260727_prm_program_link.sql'), 'utf8'));
  for (const [id, org, code] of [[P1, ORG_1, 'P-1'], [P2, ORG_1, 'P-2'], [P_FOREIGN, ORG_2, 'F-1']] as const) {
    await db.query(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, $4, 'ind', 'drug', 'FDA', 'X')`,
      [id, org, `Program ${code}`, code],
    );
  }
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('persistStudyDesignTx — a design belongs to one project of its organization', () => {
  it('refuses another organization’s project, and writes nothing', async () => {
    const err = await persist(design({ id: 'sd_foreign', programId: P_FOREIGN })).catch((e) => e);
    expect(err).toBeInstanceOf(StudyDesignPersistRefusal);
    expect(err.code).toBe('PROJECT_NOT_FOUND');
    expect(await studyRow('sd_foreign')).toBeUndefined();
  });

  it('anchors a design to its own project', async () => {
    await persist(design({ id: 'sd_1', programId: P1 }));
    expect(await studyRow('sd_1')).toMatchObject({ tenant_id: ORG_1, program_id: P1 });
  });

  it('keeps the project when a later save carries none', async () => {
    await persist(design({ id: 'sd_1', title: 'Revised title' }));
    expect(await studyRow('sd_1')).toMatchObject({ program_id: P1, protocol_title: 'Revised title' });
  });

  it('refuses to move a design to another project', async () => {
    const err = await persist(design({ id: 'sd_1', programId: P2, title: 'Moved' })).catch((e) => e);
    expect(err).toBeInstanceOf(StudyDesignPersistRefusal);
    expect(err.code).toBe('PROGRAM_MISMATCH');
    expect(await studyRow('sd_1')).toMatchObject({ program_id: P1, protocol_title: 'Revised title' });
  });

  it('never overwrites another organization’s design that has the same study id', async () => {
    const err = await persist(design({ id: 'sd_1', title: 'Overwritten by org 2' }), ORG_2).catch((e) => e);
    expect(err).toBeInstanceOf(StudyDesignPersistRefusal);
    expect(err.code).toBe('STUDY_ID_TAKEN');
    expect(await studyRow('sd_1')).toMatchObject({ tenant_id: ORG_1, program_id: P1, protocol_title: 'Revised title' });
  });
});
