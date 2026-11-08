/** The statistical handoff uses the restricted runtime role, forced RLS,
 * canonical creator, immutable revision/lineage and real chained audit. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { nativeCatalogRunId, seedNativeCatalogProject, withNativeCatalogClient, type NativeCatalogActor } from './catalog-native-fixture';
import { assertVaultFixtureDatabase, closeVaultFixtureRuntime } from './vault-current-access-fixture';
import { getPool } from '../../server/db';
import { saveStatisticalDocumentToAuthoring } from '../../server/services/ana-biostats/workflow-integrator';
import { anaBiostatsOrchestrator } from '../../server/services/ana-biostats/orchestrator';
import { documentGenerator } from '../../server/services/ana-biostats/document-generator';
import { studyDesignToStatisticalInput } from '../../server/services/biostatistics-bridge/design-adapter';
import { hashInputs } from '../../server/services/stats/computation-provenance';
import { recordComputationRun, SAMPLE_SIZE_METHOD } from '../../server/services/stats/computation-runs';
import type { StudyDesign } from '../../server/services/study-design/study-design-types';
import type { StatisticalInput } from '../../server/services/ana-biostats/types';

const PREFIX = `biostat-authoring-${nativeCatalogRunId()}`;
let owner: Pool;
let actor: NativeCatalogActor;
let outsider: NativeCatalogActor;
let programId: string;
let otherProgramId: string;
let projectId: number;
let studyRef: number;
let design: StudyDesign;
const sourceInput = () => studyDesignToStatisticalInput(design).input!;
const sourceBasis = () => ({ kind: 'study_design', studyId: design.id, designInputsSha256: hashInputs(sourceInput()) });

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  await assertVaultFixtureDatabase(owner);
  const org = (await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$2,'active') RETURNING id,uuid", [PREFIX, PREFIX])).rows[0];
  const user = async (name: string): Promise<NativeCatalogActor> => {
    const row = (await owner.query(`INSERT INTO users(email,name,password_hash,status)
      VALUES($1,$2,'fixture-only-no-login','active') RETURNING id`, [`${PREFIX}-${name}@example.invalid`, `${PREFIX} ${name}`])).rows[0];
    await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [org.id, row.id]);
    return { organizationId: Number(org.id), organizationUuid: String(org.uuid), userId: Number(row.id), role: 'member', caller: 'tests/db/biostat-authoring-basis.dbtest.ts' };
  };
  actor = await user('author'); outsider = await user('unshared');
  const program = async (name: string) => {
    const row = (await owner.query(`INSERT INTO regulatory_programs(organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
      VALUES($1,$2,$3,'IND','drug','FDA','Statistical planning fixture',$4) RETURNING id`, [org.id, `${PREFIX} ${name}`, `${PREFIX}-${name}`, actor.userId])).rows[0];
    const anchor = await seedNativeCatalogProject(owner, { organizationId: actor.organizationId, userId: actor.userId, programId: String(row.id), namespace: `${PREFIX}-${name}` });
    await owner.query(`INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'private')
      ON CONFLICT(project_id) DO UPDATE SET visibility='private'`, [org.id, anchor.projectId]);
    return { id: String(row.id), projectId: anchor.projectId };
  };
  const first = await program('study'); programId = first.id; projectId = first.projectId;
  otherProgramId = (await program('other')).id;
  design = { id: `${PREFIX}-design`, programId, title: 'Native statistical planning study', phase: '2', productType: 'drug',
    indication: 'test indication', targetRegions: ['US'],
    estimands: [], population: { targetDescription: 'Planning population', analysisPopulations: [], eligibility: [] },
    objectives: [{ level: 'primary', order: 1, text: 'Assess efficacy', endpointName: 'Change' }],
    endpoints: [{ name: 'Change', role: 'primary', type: 'continuous', definition: 'Change from baseline' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    arms: [{ name: 'Active', interventions: [] }, { name: 'Placebo', interventions: [] }], randomization: { ratio: [1, 1], allocationMethod: 'simple', blinding: 'double' },
    statisticalPlan: { alpha: 0.05, power: 0.8, dropoutRate: 0.1, plannedAnalyses: [], powerAssumptions: { effectSize: 0.5, variance: 1, evidence: [] } } };
  studyRef = Number((await owner.query(`INSERT INTO cdisc_prm_studies(tenant_id,study_id,protocol_id,protocol_title,protocol_version,program_id,metadata)
    VALUES($1,$2,$3,'Native statistical planning study','1.0',$4,$5::json) RETURNING id`,
  [org.id, design.id, `${PREFIX}-protocol`, programId, JSON.stringify({ kind: 'c2c.studyDesign.v1', design })])).rows[0].id);
  await withNativeCatalogClient(actor, async () => undefined);
}, 60_000);
afterAll(async () => { await owner?.end(); await closeVaultFixtureRuntime(); });

function document(input: Partial<StatisticalInput> = sourceInput()) {
  const result = anaBiostatsOrchestrator.quickCompute(input);
  expect(result.validation.valid).toBe(true);
  return documentGenerator.generate('sample_size_rationale', result.validation.normalizedInput, result.computation!, result.judgment!,
    result.domain!, result.regulatory, { projectId: 0, organizationId: actor.organizationId, userId: actor.userId });
}
const save = (over: Record<string, unknown> = {}, generated = document(), by = actor) => withNativeCatalogClient(by, async () => {
  const pool = getPool(), actorId = String(by.userId);
  return saveStatisticalDocumentToAuthoring({ pool, tenantId: by.organizationId, actor: { id: actorId, email: null },
    audit: { pool, tenantId: by.organizationId, actorId, actorEmail: 'unknown', actorRole: by.role, ipAddress: '127.0.0.1', userAgent: PREFIX } },
  { programId, module: 'M5', basis: sourceBasis(), expectedMarkdown: generated.content, ...over }, generated);
});
const count = async () => Number((await owner.query('SELECT count(*)::int AS n FROM authoring_documents WHERE tenant_id=$1', [actor.organizationId])).rows[0].n);

describe('native statistical basis retained by the canonical editor', () => {
  it('writes actual project/study/input basis with one section, revision and chained CREATE audit', async () => {
    const result = await save(); expect(result.kind).toBe('created'); if (result.kind !== 'created') return;
    const origin = result.provenance.statisticalSource!;
    expect(origin).toMatchObject({ organizationId: actor.organizationId, programId, projectId,
      design: { studyId: design.id, studyRef, calculationInputs: 'matches_design' }, sizingRun: { state: 'none' } });
    const evidence = (await owner.query(`SELECT d.provenance,
      (SELECT count(*)::int FROM authoring_sections s WHERE s.doc_id=d.id) AS sections,
      (SELECT count(*)::int FROM doc_revisions r JOIN authoring_sections s ON r.section_id=s.id WHERE s.doc_id=d.id) AS revisions,
      (SELECT count(*)::int FROM audit_logs a WHERE a.tenant_id=d.tenant_id AND a.new_values->>'docId'=d.id::text
        AND a.action='authoring.section.CREATE' AND a.sha256_chain ~ '^[0-9a-f]{64}$' AND a.hmac_seal IS NOT NULL) AS audits
      FROM authoring_documents d WHERE d.id=$1 AND d.tenant_id=$2`, [result.document.id, actor.organizationId])).rows[0];
    expect(evidence.provenance.statisticalSource).toEqual(origin);
    expect(evidence.sections).toBe(1); expect(evidence.revisions).toBe(1); expect(evidence.audits).toBe(1);
    const trail = (await owner.query('SELECT metadata FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2',
      [result.document.id, actor.organizationId])).rows;
    expect(trail).toHaveLength(1); expect(trail[0].metadata.provenance.statisticalSource).toEqual(origin);
    const lineage = (await owner.query('SELECT machine_author_id FROM document_span_lineage WHERE organization_id=$1 AND document_id=$2',
      [actor.organizationId, result.sections[0].id])).rows;
    expect(lineage.length).toBeGreaterThan(0); expect(lineage.every(row => row.machine_author_id === 'workflow_import')).toBe(true);
  });

  it('retains a verified saved run as distinct context when workbench inputs changed', async () => {
    const original = document();
    const run = await recordComputationRun(owner, { organizationId: actor.organizationId, programId, studyRef, method: SAMPLE_SIZE_METHOD,
      inputs: original.provenance.computationInputs, outputs: original.provenance.computationResults, purpose: 'study-design:planned-sample-size', userId: actor.userId });
    const result = await save({ basis: { ...sourceBasis(), sizingRunId: run.runId } }, document({ ...sourceInput(), effectSize: 0.7 }));
    expect(result.kind).toBe('created'); if (result.kind !== 'created') return;
    expect(result.provenance.statisticalSource).toMatchObject({ design: { calculationInputs: 'modified' },
      sizingRun: { state: 'recorded', runId: run.runId, inputsMatchCalculation: false, outputsMatchCalculation: false } });
  });

  it('refuses a named study from another project without creating a document', async () => {
    const before = await count();
    await expect(save({ programId: otherProgramId })).rejects.toMatchObject({ code: 'STATISTICAL_STUDY_UNVERIFIED' });
    expect(await count()).toBe(before);
  });

  it('does not expose a private study to an active unshared organization member', async () => {
    const before = await count();
    expect(await save({}, document(), outsider)).toMatchObject({ kind: 'refused', status: 403 });
    expect(await count()).toBe(before);
  });

  it('records illustrative examples without a study or saved-run claim', async () => {
    const result = await save({ basis: { kind: 'worked_example', label: 'Power illustration' } });
    expect(result.kind).toBe('created'); if (result.kind !== 'created') return;
    expect(result.document.title).toContain('worked example'); expect(result.sections[0].content).toContain('illustrative assumptions');
    expect(result.provenance.statisticalSource).toMatchObject({ design: null, sizingRun: { state: 'not_applicable' } });
    expect(result.provenance.governedWrite).toBe('unverified');
  });
});
