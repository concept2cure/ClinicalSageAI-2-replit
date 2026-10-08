/**
 * A computed sample size names the stored, reproducible run that produced it
 * (D2, Data Room catalog S5b, 2026-10-08;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * Before: applySampleSizeToDesign wrote the engine's N onto the design with a
 * label and an inputs hash, and kept the inputs nowhere, so no record could
 * reproduce the figure the protocol and SAP state. Now, on real PostgreSQL
 * behind the tenant scope, as the runtime role:
 *   - the apply stores the run (inputs, outputs, their hashes, engine) in its
 *     own transaction, keyed to this organization's design and project;
 *   - the design's evidence, the governed-action payload and the SAP name it;
 *   - the stored inputs recompute to the stored outputs, and a tampered
 *     output is caught;
 *   - the database refuses a run naming another organization's design.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import type { StudyDesign } from '../../server/services/study-design/study-design-types';

const PREFIX = 'dbtest-stats-run';
const RUN = Date.now().toString(36);

let owner: Pool;
let orgId: number;
let orgUuid: string;
let otherOrgId: number;
let userId: number;
let programId: string;
const studyId = `${PREFIX}-${RUN}`;

/** A complete, sizable design (the adapter tests' fixture), in this project. */
function design(): StudyDesign {
  return {
    id: studyId,
    programId,
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    targetRegions: ['US'],
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [{
      endpointName: 'HbA1c change', treatmentCondition: 'Drug X 10 mg daily versus placebo',
      population: 'all randomized patients (ITT)', variable: 'change from baseline in HbA1c at week 24',
      summaryMeasure: 'difference in means', strategy: 'treatment_policy',
      intercurrentEvents: [{ name: 'rescue medication', strategy: 'treatment_policy', justification: 'reflects the treatment-policy estimand' }],
    }],
    endpoints: [{ name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24', timepoint: 'week 24' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes inadequately controlled on metformin',
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized patients', isPrimaryAnalysisSet: true }],
      eligibility: [{ type: 'inclusion', text: 'HbA1c 7.0-10.0% at screening' }],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: {
      alpha: 0.05, oneSided: false, power: 0.9, dropoutRate: 0.2,
      plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM', estimandEndpointName: 'HbA1c change' }],
      multiplicity: { method: 'holm' }, missingDataStrategy: 'multiple imputation under missing-at-random',
      sensitivityAnalysesSpecified: true,
      powerAssumptions: { effectSize: 0.4, variance: 0.25, evidence: [{ kind: 'prior_data', source: 'Phase 2 NCT01234567' }] },
    },
    safety: { aeDefinitions: 'MedDRA coding', dmcCharter: { present: true, meetingCadence: 'quarterly' } },
  } as unknown as StudyDesign;
}

async function scoped<T>(fn: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope({ tenantId: String(orgId), orgUuid, role: 'admin', source: 'request', caller: 'stats-computation-run.dbtest' }, fn);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PREFIX} org`, `${PREFIX}-org`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);
  const other = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PREFIX} other`, `${PREFIX}-other`],
  );
  otherOrgId = Number(other.rows[0].id);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'Stat', 'x') ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PREFIX}@dbtest.local`],
  );
  userId = Number(user.rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`, [orgId, userId]);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Drug X') RETURNING id`,
    [`${PREFIX} program ${RUN}`, `STATRUN-${RUN}`.toUpperCase(), orgId],
  );
  programId = String(prog.rows[0].id);
  const { pool } = await import('../../server/db');
  const { persistStudyDesignTx } = await import('../../server/services/study-design/study-design-repository');
  await scoped(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await persistStudyDesignTx(client as never, design(), { tenantId: orgId, userId });
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });
}, 60_000);

afterAll(async () => {
  await owner?.end().catch(() => {});
});

describe('applying a computed sample size stores the run that produced it', () => {
  let runId: number;

  it('stores the run in the apply, keyed to this design and project', async () => {
    const { applySampleSizeToDesign } = await import('../../server/services/biostatistics-bridge/bridge-service');
    const out = await scoped(() => applySampleSizeToDesign({ organizationId: orgId, userId, studyId, reason: 'Sizing for the protocol synopsis.' }));
    runId = out.computationRunId;
    expect(runId).toBeGreaterThan(0);
    const { rows: [run] } = await owner.query('SELECT * FROM stats_computation_runs WHERE id = $1', [runId]);
    const { rows: [study] } = await owner.query('SELECT id FROM cdisc_prm_studies WHERE study_id = $1', [studyId]);
    expect(run).toMatchObject({
      organization_id: orgId, program_id: programId, study_ref: Number(study.id), method: 'ana-biostats:compute',
      engine: 'c2c-stats', purpose: 'study-design:planned-sample-size', created_by: userId,
    });
    expect(run.inputs_sha256).toMatch(/^[0-9a-f]{64}$/);
    // The figure the design records is the one the run computed.
    expect(run.outputs.adjustedTotal ?? run.outputs.sampleSize.total).toBe(out.plannedSampleSize);
  }, 60_000);

  it('the design, the governed action and the SAP name the run', async () => {
    const { rows: [s] } = await owner.query(`SELECT metadata->'design'->'statisticalPlan'->'powerAssumptions'->'evidence' AS ev FROM cdisc_prm_studies WHERE study_id = $1`, [studyId]);
    const stamp = (s.ev as Array<{ source: string; ref?: string }>).find(e => e.source.includes('stored run'));
    expect(stamp?.source).toContain(`stored run #${runId}`);
    const { rows: [run] } = await owner.query('SELECT inputs_sha256 FROM stats_computation_runs WHERE id = $1', [runId]);
    expect(stamp?.ref).toBe(`sha256:${run.inputs_sha256}`);
    const { rows: [gov] } = await owner.query(
      `SELECT payload FROM c2c_ana_actions WHERE target = $1 AND command = 'apply-sample-size' ORDER BY proposed_at DESC LIMIT 1`,
      [`study-design:${studyId}`],
    );
    expect(gov.payload).toMatchObject({ computationRunId: runId, inputsSha256: run.inputs_sha256 });
    const { loadStudyDesign } = await import('../../server/services/study-design/study-design-repository');
    const { projectSap } = await import('../../server/services/study-design/sap-projection');
    const loaded = await scoped(() => loadStudyDesign(studyId, orgId));
    expect(JSON.stringify(projectSap(loaded!.design))).toContain(`stored run #${runId} (inputs sha256:${run.inputs_sha256.slice(0, 12)}…)`);
  });

  it('the stored inputs recompute to the stored outputs', async () => {
    const { reproduceComputationRun } = await import('../../server/services/stats/computation-runs');
    const out = await scoped(() => reproduceComputationRun(owner, orgId, runId));
    expect(out).toMatchObject({ found: true, inputsIntact: true, outputsIntact: true, reproduced: true, engineVersionMatches: true });
  });

  it('a changed output is caught, not trusted', async () => {
    const { rows: [orig] } = await owner.query('SELECT outputs FROM stats_computation_runs WHERE id = $1', [runId]);
    await owner.query(`UPDATE stats_computation_runs SET outputs = jsonb_set(outputs, '{power}', '0.5') WHERE id = $1`, [runId]);
    try {
      const { reproduceComputationRun } = await import('../../server/services/stats/computation-runs');
      expect(await reproduceComputationRun(owner, orgId, runId)).toMatchObject({ found: true, inputsIntact: true, outputsIntact: false });
    } finally {
      await owner.query('UPDATE stats_computation_runs SET outputs = $2 WHERE id = $1', [runId, orig.outputs]);
    }
  });

  it("another organization's run is not found", async () => {
    const { reproduceComputationRun } = await import('../../server/services/stats/computation-runs');
    expect(await reproduceComputationRun(owner, otherOrgId, runId)).toEqual({ found: false });
  });

  it("the database refuses a run naming another organization's design", async () => {
    const { rows: [study] } = await owner.query('SELECT id FROM cdisc_prm_studies WHERE study_id = $1', [studyId]);
    const err = await owner.query(
      `INSERT INTO stats_computation_runs (organization_id, study_ref, method, engine, engine_version, inputs, inputs_sha256, outputs, outputs_sha256, purpose)
       VALUES ($1, $2, 'm', 'e', '1', '{}', $3, '{}', $3, 'forged')`,
      [otherOrgId, study.id, 'a'.repeat(64)],
    ).then(() => 'ok', (e: { code?: string }) => e.code);
    expect(err).toBe('23503');
  });
});
