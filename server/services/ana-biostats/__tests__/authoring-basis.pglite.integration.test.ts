/** Actual authoring SQL and immutable genesis evidence for statistical saves.
 * Independent runtime-role/RLS coverage is in the native database suite. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, AUTHORING_ACCESS_DDL, AUTHOR, ORG, PROGRAM, PROGRAM_B } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { anaBiostatsOrchestrator } from '../orchestrator';
import { documentGenerator } from '../document-generator';
import { saveStatisticalDocumentToAuthoring } from '../statistical-document-save';
import { hashInputs } from '../../stats/computation-provenance';
import { recordComputationRun, SAMPLE_SIZE_METHOD } from '../../stats/computation-runs';
import { studyDesignToStatisticalInput } from '../../biostatistics-bridge/design-adapter';
import { createDocumentFromDraft, parseProvenance, type DocumentProvenance } from '../../authoring/authoring-from-draft';
import type { StudyDesign } from '../../study-design/study-design-types';
import type { CreateContext } from '../../authoring/authoring-documents';
import type { StatisticalInput } from '../types';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool }));
let jdb: JourneyDb;
let ctx: CreateContext;
let studyRef: number;
let failAudit = false;
let revokeAtBegin = false;
const trace: Array<{ sql: string; via: 'pool' | 'client'; inTx: boolean }> = [];
let inTx = false;
const design: StudyDesign = {
  id: 'BIOSTAT-BASIS-1', programId: PROGRAM, title: 'Study planning assumptions', phase: '2', productType: 'drug',
  indication: 'test indication', targetRegions: ['US'],
  estimands: [], population: { targetDescription: 'Planning population', analysisPopulations: [], eligibility: [] },
  objectives: [{ level: 'primary', order: 1, text: 'Assess efficacy', endpointName: 'Change' }],
  endpoints: [{ name: 'Change', role: 'primary', type: 'continuous', definition: 'Change from baseline' }],
  framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
  arms: [{ name: 'Active', interventions: [] }, { name: 'Placebo', interventions: [] }],
  randomization: { ratio: [1, 1], allocationMethod: 'simple', blinding: 'double' },
  statisticalPlan: { alpha: 0.05, power: 0.8, dropoutRate: 0.1, plannedAnalyses: [],
    powerAssumptions: { effectSize: 0.5, variance: 1, evidence: [] } },
};
const adapted = () => studyDesignToStatisticalInput(design).input!;
const basis = () => ({ kind: 'study_design', studyId: design.id, designInputsSha256: hashInputs(adapted()) });

beforeAll(async () => {
  jdb = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL +
    extractTableDdl('migrations/0000_sweet_joseph.sql', ['cdisc_prm_studies']) +
    'CREATE UNIQUE INDEX regulatory_programs_id_org_uq ON regulatory_programs(id,organization_id);' +
    'CREATE UNIQUE INDEX cdisc_prm_studies_id_tenant_uq ON cdisc_prm_studies(id,tenant_id);',
  migrations: [
    'db/migrations/20260725_authoring_document_loop_tables.sql',
    'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
    'db/migrations/20260725_authoring_audit_trail.sql',
    'db/migrations/20260813_audit_tamper_proof_log.sql',
    'db/migrations/20260725_authoring_signatures_and_workflow.sql',
    'db/migrations/20260725_authoring_signature_freeze_binding.sql',
    'db/migrations/20260730_authoring_runtime_ddl.sql',
    'db/migrations/20260730_authoring_comments_router_columns.sql',
    'db/migrations/20260727_authoring_object_permissions.sql',
    'db/migrations/20260803_document_span_lineage.sql',
    'migrations/20260907_span_lineage_accepted_machine_draft.sql',
    'migrations/20260908_span_lineage_machine_draft.sql',
    'migrations/20260728_authoring_comments_threading.sql',
    'migrations/20260727_authoring_document_program_scope.sql',
    'migrations/20260728_authoring_document_governed_binding.sql',
    'migrations/20260814d_document_alias_map.sql',
    'migrations/20260921_audit_logs_chain_seq.sql',
    'migrations/20260921_authoring_document_provenance.sql',
    'db/migrations/20260727_prm_program_link.sql',
    'migrations/20261008f_stats_computation_runs.sql',
  ] });
  const query = (via: 'pool' | 'client') => async (sql: string, params?: unknown[]) => {
    if (via === 'client' && /^BEGIN/.test(sql)) {
      if (revokeAtBegin) { revokeAtBegin = false; await jdb.pool.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, Number(AUTHOR.id)]); }
      inTx = true;
    }
    trace.push({ sql, via, inTx });
    if (failAudit && /INSERT INTO authoring_audit_trail/.test(sql)) { failAudit = false; throw new Error('injected statistical audit failure'); }
    const result = await jdb.pool.query(sql, params);
    if (via === 'client' && /^(COMMIT|ROLLBACK)/.test(sql)) inTx = false;
    return result;
  };
  const pool = { query: query('pool'), connect: async () => ({ query: query('client'), release: () => undefined }) };
  h.pool = pool; h.db = jdb.db;
  ctx = { pool, tenantId: ORG, actor: { id: AUTHOR.id, email: AUTHOR.email }, audit: {
    pool, tenantId: ORG, actorId: AUTHOR.id, actorEmail: AUTHOR.email, actorRole: 'member', ipAddress: '127.0.0.1', userAgent: 'fixture',
  } };
  studyRef = Number((await jdb.pglite.query<{ id: number }>(`INSERT INTO cdisc_prm_studies
    (tenant_id,study_id,protocol_id,protocol_title,protocol_version,program_id,metadata)
    VALUES($1,$2,'BIOSTAT-1','Study planning assumptions','1.0',$3,$4::json) RETURNING id`,
  [ORG, design.id, PROGRAM, JSON.stringify({ kind: 'c2c.studyDesign.v1', design })])).rows[0].id);
}, 120_000);
afterAll(async () => { await jdb?.close(); });
beforeEach(() => { trace.length = 0; failAudit = false; revokeAtBegin = false; });

function document(input: Partial<StatisticalInput> = adapted()) {
  const result = anaBiostatsOrchestrator.quickCompute(input);
  expect(result.validation.valid).toBe(true);
  return documentGenerator.generate('sample_size_rationale', result.validation.normalizedInput, result.computation!, result.judgment!,
    result.domain!, result.regulatory, { projectId: 0, organizationId: ORG, userId: Number(AUTHOR.id) });
}
const save = (over: Record<string, unknown> = {}, generated = document()) =>
  saveStatisticalDocumentToAuthoring(ctx, { programId: PROGRAM, module: 'M5', basis: basis(), expectedMarkdown: generated.content, ...over }, generated);
const counts = async () => (await jdb.pool.query(`SELECT
  (SELECT count(*) FROM authoring_documents)::int AS docs,(SELECT count(*) FROM authoring_sections)::int AS sections,
  (SELECT count(*) FROM doc_revisions)::int AS revisions,(SELECT count(*) FROM authoring_audit_trail)::int AS audits,
  (SELECT count(*) FROM document_span_lineage)::int AS spans`)).rows[0];
const storedRun = (inputs = document().provenance.computationInputs) => recordComputationRun(jdb.pool, {
  organizationId: ORG, programId: PROGRAM, studyRef, method: SAMPLE_SIZE_METHOD,
  inputs, outputs: document(inputs).provenance.computationResults, purpose: 'study-design:planned-sample-size', userId: Number(AUTHOR.id),
});

describe('statistical basis uses the canonical atomic writer', () => {
  it('retains the actual study snapshot and full calculation without inventing a saved run', async () => {
    const result = await save();
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    const origin = result.provenance.statisticalSource!;
    expect(origin).toMatchObject({ organizationId: ORG, programId: PROGRAM, projectId: 42,
      design: { studyId: design.id, studyRef, snapshot: design, calculationInputs: 'matches_design' }, sizingRun: { state: 'none' } });
    expect(origin.computation.inputsSha256).toBe(hashInputs(origin.computation.computationInputs));
    expect(origin.computation.outputsSha256).toBe(hashInputs(origin.computation.computationResults));
    const row = (await jdb.pglite.query<{ provenance: DocumentProvenance | null }>('SELECT provenance FROM authoring_documents WHERE id=$1', [result.document.id])).rows[0];
    expect(row.provenance?.statisticalSource).toEqual(origin);
    const audit = (await jdb.pglite.query<{ metadata: { provenance?: DocumentProvenance | null } | null }>('SELECT metadata FROM authoring_audit_trail WHERE doc_id=$1', [result.document.id])).rows[0];
    expect(audit.metadata?.provenance?.statisticalSource).toEqual(origin);
    const lineage = (await jdb.pglite.query<{ machine_author_id: string | null }>('SELECT machine_author_id FROM document_span_lineage WHERE document_id=$1', [result.sections[0].id])).rows;
    expect(lineage.length).toBeGreaterThan(0);
    expect(lineage.every(row => row.machine_author_id === 'workflow_import')).toBe(true);
    expect(trace.filter(row => /FROM cdisc_prm_studies|FROM stats_computation_runs/.test(row.sql)).every(row => row.via === 'client' && row.inTx)).toBe(true);
  });

  it('keeps edited calculation inputs separate from the design and its verified saved run', async () => {
    const run = await storedRun();
    const result = await save({ basis: { ...basis(), sizingRunId: run.runId } }, document({ ...adapted(), effectSize: 0.7 }));
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.provenance.statisticalSource).toMatchObject({ design: { calculationInputs: 'modified', adaptedInputs: { effectSize: 0.5 } },
      computation: { computationInputs: { effectSize: 0.7 } }, sizingRun: { state: 'recorded', runId: run.runId, inputsMatchCalculation: false, outputsMatchCalculation: false } });
  });

  it('labels worked examples in content, title and provenance and asserts no study or run', async () => {
    const result = await save({ basis: { kind: 'worked_example', label: 'Example assumptions' } });
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.document.title).toContain('worked example');
    expect(result.sections[0].content).toContain('illustrative assumptions');
    expect(result.provenance.statisticalSource).toMatchObject({ design: null, sizingRun: { state: 'not_applicable' } });
    expect(result.provenance).not.toHaveProperty('model');
    expect(result.provenance.governedWrite).toBe('unverified');
  });

  it.each([
    ['another project', () => ({ programId: PROGRAM_B })],
    ['an unknown study', () => ({ basis: { ...basis(), studyId: 'another-study' } })],
    ['a stale design', () => ({ basis: { ...basis(), designInputsSha256: 'a'.repeat(64) } })],
    ['a mismatched run', () => ({ basis: { ...basis(), sizingRunId: 123456789 } })],
    ['an altered preview', () => ({ expectedMarkdown: 'caller-written numbers' })],
  ] as const)('refuses %s before creating any authoring evidence', async (_name, request) => {
    const before = await counts();
    await expect(save(request())).rejects.toMatchObject({ status: 409 });
    expect(await counts()).toEqual(before);
  });

  it('refuses an intact-looking run whose stored output hash does not match its bytes', async () => {
    const input = document().provenance.computationInputs;
    const bad = (await jdb.pglite.query<{ id: number | string | bigint }>(`INSERT INTO stats_computation_runs
      (organization_id,program_id,study_ref,method,engine,engine_version,inputs,inputs_sha256,outputs,outputs_sha256,purpose)
      VALUES($1,$2,$3,$4,'c2c-stats','1.0.0',$5::jsonb,$6,'{}',$7,'study-design:planned-sample-size') RETURNING id`,
    [ORG, PROGRAM, studyRef, SAMPLE_SIZE_METHOD, JSON.stringify(input), hashInputs(input), 'f'.repeat(64)])).rows[0];
    const before = await counts();
    await expect(save({ basis: { ...basis(), sizingRunId: Number(bad.id) } })).rejects.toMatchObject({ code: 'STATISTICAL_RUN_UNVERIFIED' });
    expect(await counts()).toEqual(before);
  });

  it('rolls the document, section, revision and lineage back when the audit insert fails', async () => {
    const before = await counts(); failAudit = true;
    await expect(save({ basis: { kind: 'worked_example', label: 'Audit example' } })).rejects.toThrow();
    expect(await counts()).toEqual(before);
  });

  it('rechecks membership inside the create transaction', async () => {
    const before = await counts(); revokeAtBegin = true;
    try { expect(await save({ basis: { kind: 'worked_example', label: 'Membership example' } })).toMatchObject({ kind: 'refused', status: 403 }); }
    finally { await jdb.pool.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [ORG, Number(AUTHOR.id)]); }
    expect(await counts()).toEqual(before);
  });

  it('public from-draft provenance cannot manufacture statistical source proof', async () => {
    const parsed = parseProvenance({ source: 'import', statisticalSource: { projectId: 42, computation: { execution: 'server_recomputed' } } });
    expect(parsed).toEqual({ ok: true, value: { source: 'import' } });
    const result = await createDocumentFromDraft(ctx, { programId: PROGRAM, title: 'Ordinary import', module: 'M5',
      sections: [{ code: 'notes', title: 'Notes', content: '<p>Imported notes</p>' }],
      provenance: { source: 'import', statisticalSource: { projectId: 42 } } as never });
    expect(result.kind).toBe('created');
    if (result.kind === 'created') expect(result.provenance.statisticalSource).toBeUndefined();
  });
});
