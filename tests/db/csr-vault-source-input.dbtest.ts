/** Actual auth/ALS/request client, verified source bytes, canonical frozen
 * input capture and aggregate read on the provisioned native database.
 * All observations, lifecycle states and application identities are synthetic
 * fixtures, not clinical verification or live agency qualification. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db.js';
import { shouldUseSsl } from '../../server/db/ssl.js';
import { sourceFixture } from '../../server/services/csr/__tests__/source-input-fixture.js';
import type { CsrSourceReceipt } from '../../shared/csr-source-input.js';
import { setTenantContextTx } from '../../server/services/tenant/governed-tenant-context.js';
import { lockDocumentDispositionProgram } from '../../server/services/document-data-disposition/program-lock.js';
import { applySessionScope } from '../../server/db/sessionScope.js';
import { guardRunCsrSourcesTx } from '../../server/services/csr/run-source-guard.js';
import type { OrchestratorRun } from '../../server/services/submission-package-orchestrator.js';

const TAG = `audit-csr-source-${Date.now().toString(36)}`;
const PROGRAM = randomUUID(), FOREIGN_PROGRAM = randomUUID();
type Actor = { id: number; org: number; token: string };
type Source = { id: string; sha256: string; version: string; receipt: CsrSourceReceipt };
let owner: Pool, runtime: Pool, app: express.Express, org: number, otherOrg: number, author: Actor, unshared: Actor, viewer: Actor, foreign: Actor;
let approved: Source, draft: Source, foreignSource: Source, checkedIn: Source, withdrawn: Source, kept: Source;
let actualRunId: string, historicalRunId: string, withdrawnRunId: string, keptRunId: string;
let orgUuid: string;
const scopes: Array<{ lazy: boolean; tenant: string; role: string }> = [];

async function actor(name: string, organizationId: number, role: string): Promise<Actor> {
  const { rows } = await owner.query<{ id: number }>("INSERT INTO users(email,name,password_hash,status,mfa_enabled) VALUES($1,$2,'synthetic-unused-hash','active',false) RETURNING id", [`${TAG}-${name}@example.invalid`, `${TAG} ${name}`]);
  const id = rows[0].id;
  await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [organizationId, id, role]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify.js');
  return { id, org: organizationId, token: jwt.sign({ type: 'access', userId: id, organizationId: String(organizationId), role: 'admin' }, activeJwtSecret(), { expiresIn: '15m' }) };
}
async function source(name: string, organizationId: number, programId: string, actorId: number, options: { stage?: string; version?: string; predecessor?: string } = {}): Promise<Source> {
  const { stage = 'approved', version = '1.0', predecessor } = options;
  const { getStorageProvider } = await import('../../server/services/storage/index.js');
  const envelope = sourceFixture(); envelope.studyInfo.title = `${envelope.studyInfo.title}: ${name}`;
  const bytes = Buffer.from(JSON.stringify(envelope));
  const stored = await getStorageProvider().put({ orgId: organizationId, projectId: programId, filename: `${name}.json`, mime: 'application/json', bytes, metadata: { syntheticAuditFixture: TAG } });
  const id = randomUUID();
  const code = predecessor ? (await owner.query<{ document_code: string }>('SELECT document_code FROM vault.documents WHERE id=$1', [predecessor])).rows[0].document_code : `${TAG}-${name}`;
  await owner.query(`INSERT INTO vault.documents(id,program_id,organization_id,document_code,document_title,document_type,version,
    file_name,file_size,mime_type,content_hash,s3_bucket,s3_key,storage_version_id,storage_provider,created_by,supersedes_id)
    VALUES($1,$2,$3,$4,$5,'DATASET',$6,$7,$8,'application/json',$9,$10,$11,$12,$10,$13,$14)`,
  [id, programId, organizationId, code, `${TAG}-${name}`, version, `${name}.json`, bytes.length, stored.sha256, stored.provider, stored.vaultFileId, stored.vaultVersionId, actorId, predecessor ?? null]);
  await owner.query(`INSERT INTO canonical_documents(canonical_id,organization_id,project_id,title,document_type,stage,has_content,content_hash,source_refs,created_by)
    VALUES($1,$2,$3,$4,'DATASET',$5,true,$6,$7::jsonb,$8)`,
  [`${TAG}-${id}`, organizationId, programId, `${TAG}-${name}`, stage, stored.sha256, JSON.stringify({ vault_documents: { nativeId: id } }), actorId]);
  return { id, sha256: stored.sha256, version, receipt: { adapter: 'concept2cure.csr-source.v1', documentId: id, documentTitle: `${TAG}-${name}`, version,
    sha256: stored.sha256, dataCutDate: envelope.dataCutDate, studyId: envelope.studyData.studyId, protocolNumber: envelope.studyData.protocolNumber,
    studyInfo: envelope.studyInfo, clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle' } };
}
async function frozenRun(inputSource: Source): Promise<string> {
  const runId = randomUUID();
  const { orchestratorInputDigest } = await import('../../server/services/submission-orchestrator-inputs.js');
  const { sealSignPayloadDigest } = await import('../../server/services/ectd/sign-payload-seal.js');
  const input = { organizationId: org, programId: PROGRAM, userId: author.id, submissionId: `${TAG}-synthetic`, applicationNumber: 'IND-SYNTHETIC', region: 'US', submissionType: 'IND',
    cmcSources: [], csrInputs: [], clinicalStudyData: [sourceFixture().studyData], clinicalSourceReceipts: [inputSource.receipt], nonclinicalStudies: [] };
  await owner.query(`INSERT INTO submission_orchestrator_runs(run_id,organization_id,submission_id,application_number,region,submission_type,started_at,status,steps)
    VALUES($1,$2,$3,'IND-SYNTHETIC','US','IND',now(),'failed','[]')`, [runId, org, input.submissionId]);
  const digest = orchestratorInputDigest(input);
  await owner.query(`INSERT INTO submission_orchestrator_inputs(run_id,organization_id,program_id,input_snapshot,input_digest,input_seal)
    VALUES($1,$2,$3,$4::jsonb,$5,$6)`, [runId, org, PROGRAM, JSON.stringify(input), digest, sealSignPayloadDigest(digest, org)]);
  return runId;
}
const get = (who: Actor, path: string) => request(app).get(`/api/submission-orchestrator${path}`).set('Authorization', `Bearer ${who.token}`);
const post = (who: Actor, path: string, body: unknown) => request(app).post(`/api/submission-orchestrator${path}`).set('Authorization', `Bearer ${who.token}`).send(body);
const selection = (value: Source) => ({ documentId: value.id, expectedSha256: value.sha256 });
const preview = (who: Actor, value: Source, programId = PROGRAM) => post(who, '/csr/source-preview', { programId, ...selection(value) });
const tables = (who: Actor, runId: string) => get(who, `/runs/${runId}/clinical-tables?programId=${PROGRAM}`);

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must identify the native least-privileged app_service connection.');
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 3, options: '-c app.rls_enforce=on' });
  const identity = await runtime.query<{ username: string; super: boolean; bypass: boolean }>('SELECT current_user AS username,rolsuper AS super,rolbypassrls AS bypass FROM pg_roles WHERE rolname=current_user');
  expect(identity.rows[0]).toEqual({ username: 'app_service', super: false, bypass: false });
  expect((await runtime.query<{ ssl: boolean }>('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl).toBe(shouldUseSsl(process.env.APP_DATABASE_URL));
  const organizations = await owner.query<{ id: number }>("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active'),($2,$2,'active') RETURNING id", [TAG, `${TAG}-foreign`]);
  [org, otherOrg] = organizations.rows.map(row => row.id);
  orgUuid = (await owner.query<{ uuid: string }>('SELECT uuid::text FROM organizations WHERE id=$1', [org])).rows[0].uuid;
  author = await actor('author', org, 'admin'); unshared = await actor('unshared', org, 'member'); viewer = await actor('viewer', org, 'viewer'); foreign = await actor('foreign', otherOrg, 'admin');
  for (const [organizationId, programId, user] of [[org, PROGRAM, author], [otherOrg, FOREIGN_PROGRAM, foreign]] as const) {
    const workspace = await owner.query<{ id: number }>('INSERT INTO client_workspaces(organization_id,name,slug) VALUES($1,$2,$2) RETURNING id', [organizationId, TAG]);
    await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status,application_number)
      VALUES($1,$2,$3::text,$3::text,'IND','small_molecule','FDA',$3::text,$4,'active','IND-SYNTHETIC')`, [programId, organizationId, `${TAG}-${organizationId}`, user.id]);
    const project = await owner.query<{ id: number }>(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
      VALUES($1,$2,$3,'program','active',$4,$4,$5,$6::json) RETURNING id`, [organizationId, workspace.rows[0].id, TAG, user.id, programId, JSON.stringify({ projectSharing: { visibility: 'private', members: [] } })]);
    await owner.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'private')", [organizationId, project.rows[0].id]);
    if (organizationId === org) await owner.query("INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'use','active')", [org, project.rows[0].id, viewer.id]);
  }
  const submission = await owner.query<{ id: number }>(`INSERT INTO submissions(title,product_name,application_type,client_type,primary_region,organization_id,created_by,program_id)
    VALUES($1,$1,'IND','pharma','FDA',$2,$3,$4) RETURNING id`, [TAG, org, author.id, PROGRAM]);
  await owner.query("INSERT INTO ectd_sequences(submission_id,region,sequence_number,organization_id,created_by) VALUES($1,'FDA','0000',$2,$3)", [submission.rows[0].id, org, author.id]);
  approved = await source('approved', org, PROGRAM, author.id);
  draft = await source('draft', org, PROGRAM, author.id, { stage: 'draft' });
  checkedIn = await source('old-version', org, PROGRAM, author.id);
  withdrawn = await source('withdrawn', org, PROGRAM, author.id);
  kept = await source('kept', org, PROGRAM, author.id);
  foreignSource = await source('foreign', otherOrg, FOREIGN_PROGRAM, foreign.id);
  historicalRunId = await frozenRun(checkedIn); withdrawnRunId = await frozenRun(withdrawn); keptRunId = await frozenRun(kept);
  const { authMiddleware } = await import('../../server/auth.js');
  const { getTenantScope } = await import('../../server/db/tenantStore.js');
  const { LazyRequestDbClient } = await import('../../server/middleware/lazyRequestDbClient.js');
  const router = (await import('../../server/routes/submission-orchestrator.js')).default;
  app = express(); app.use(express.json());
  app.use('/api/submission-orchestrator', authMiddleware, (req, _res, next) => {
    scopes.push({ lazy: (req as express.Request & { dbClient?: unknown }).dbClient instanceof LazyRequestDbClient, tenant: getTenantScope()?.tenantId ?? '', role: String(req.user?.role) });
    if (req.get('x-csr-native-audit-fault') === 'after-preview') {
      const pinned = (req as express.Request & { dbClient?: { query: Pool['query'] } }).dbClient;
      if (!pinned) throw new Error('Audit fault fixture requires the actual request client');
      const original = pinned.query.bind(pinned);
      pinned.query = (async (...args: unknown[]) => {
        const input = args[0] as string | { text?: string }; const text = typeof input === 'string' ? input : input.text ?? '';
        if (/INSERT INTO audit_logs/.test(text)) throw Object.assign(new Error('Synthetic preview audit write refusal'), { code: '42501' });
        return (original as (...values: unknown[]) => Promise<unknown>)(...args);
      }) as Pool['query'];
    }
    next();
  }, router);
}, 120_000);

afterAll(async () => {
  // Retain uniquely named synthetic source/run/audit evidence. No immutable
  // row, signature, policy or trigger is deleted/disabled for cleanup.
  const { getPool } = await import('../../server/db/runtime.js');
  await getPool().end(); await runtime?.end(); await owner?.end();
});

function registerCsrSourceAdmissionCases1() {
  it('uses actual auth tenant binding and verified original bytes for aggregate preview', async () => {
    const candidates = await get(author, `/csr/sources?programId=${PROGRAM}`);
    expect(candidates.status).toBe(200); expect(candidates.body.sources.some((item: { documentId: string }) => item.documentId === approved.id)).toBe(true);
    expect(candidates.body.sources.some((item: { documentId: string }) => item.documentId === foreignSource.id)).toBe(false);
    const result = await preview(author, approved);
    expect(result.status).toBe(200); expect(result.body.source).toMatchObject({ documentId: approved.id, sha256: approved.sha256, sourceApproval: 'canonical-lifecycle', clinicalVerification: 'not-established' });
    expect(result.body.tables.aeOverallSummary.rows[0][1]).toBe('1 (50.0%)');
    expect(result.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    expect(JSON.stringify(result.body)).not.toContain('synthetic-a');
    expect(scopes.every(item => item.lazy && item.tenant === String(org))).toBe(true);
  });
  it('freezes the actual selected observations and receipt through the shipped run endpoint', async () => {
    const result = await post(author, '/runs/for-program', { programId: PROGRAM, clinicalSource: selection(approved) });
    expect(result.status, JSON.stringify(result.body)).toBe(200); actualRunId = result.body.runId;
    expect(actualRunId).toMatch(/^[a-f0-9-]{36}$/);
    const retained = await owner.query<{ input_snapshot: Record<string, unknown> }>('SELECT input_snapshot FROM submission_orchestrator_inputs WHERE run_id=$1 AND organization_id=$2', [actualRunId, org]);
    expect(retained.rows[0].input_snapshot.clinicalStudyData).toEqual([sourceFixture().studyData]);
    expect(retained.rows[0].input_snapshot.clinicalSourceReceipts).toEqual([approved.receipt]);
    const read = await tables(author, actualRunId);
    expect(read.status, JSON.stringify(read.body)).toBe(200); expect(read.body.studies[0].source.sha256).toBe(approved.sha256);
    expect(read.body.studies[0].tables.demographics.rows[1][1]).toBe('35.0 (7.1)');
    expect(JSON.stringify(read.body)).not.toContain('synthetic-a');
    expect(JSON.stringify(read.body)).not.toContain('participants');
    // The source file is supporting data. Neither this proof nor this run
    // supplies an approved Module 3 or qualifies a package for transmission.
    expect(result.body.inputGaps.join(' ')).toContain('Clinical verification');
  }, 120_000);
  it('reports a completed preview with failed audit truthfully, then recovers on an actual retry', async () => {
    const failedAudit = await preview(author, approved).set('x-csr-native-audit-fault', 'after-preview');
    expect(failedAudit.status).toBe(200);
    expect(failedAudit.body.meta.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(failedAudit.body.tables.aeOverallSummary.rows[0][1]).toBe('1 (50.0%)');
    expect(JSON.stringify(failedAudit.body)).not.toContain('Synthetic preview audit write refusal');
    const retry = await preview(author, approved);
    expect(retry.status).toBe(200); expect(retry.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    expect(retry.body.source.sha256).toBe(approved.sha256);
  });
  it('permits an authorized read-only share and refuses private/foreign source probes and writes', async () => {
    expect((await preview(viewer, approved)).status).toBe(200);
    expect((await preview(unshared, approved)).status).toBe(403);
    expect((await preview(foreign, approved)).status).toBe(404);
    expect((await preview(author, foreignSource)).status).toBe(404);
    expect((await tables(unshared, actualRunId)).status).toBe(403);
    expect((await post(viewer, '/runs/for-program', { programId: PROGRAM, clinicalSource: selection(approved) })).status).toBe(403);
  });
  it('allows an honest draft preview but refuses its inclusion before any run record is created', async () => {
    expect((await preview(author, draft)).body).toMatchObject({ approved: false, source: { sourceApproval: 'not-approved' } });
    const before = await owner.query<{ n: string }>('SELECT count(*)::text AS n FROM submission_orchestrator_runs WHERE organization_id=$1', [org]);
    const result = await post(author, '/runs/for-program', { programId: PROGRAM, clinicalSource: selection(draft) });
    expect(result.status).toBe(409); expect(result.body.error).toBe('CSR_SOURCE_APPROVAL_REQUIRED');
    expect((await owner.query<{ n: string }>('SELECT count(*)::text AS n FROM submission_orchestrator_runs WHERE organization_id=$1', [org])).rows[0].n).toBe(before.rows[0].n);
  });
}

function registerCsrSourceAdmissionCases2() {
  it('serializes check-in and withdrawal writers against the source guard until commit, then refuses the old version', async () => {
    const reader = await runtime.connect(); const checkIn = await owner.connect(); const withdrawal = await owner.connect();
    try {
      await applySessionScope(reader, { tenantId: String(org), orgUuid, role: 'admin' });
      await reader.query('BEGIN'); await setTenantContextTx(reader, org);
      const retainedRun: OrchestratorRun = { runId: historicalRunId, organizationId: org, submissionId: `${TAG}-synthetic`,
        applicationNumber: 'IND-SYNTHETIC', region: 'US', submissionType: 'IND', startedAt: new Date().toISOString(), status: 'awaiting-signature', steps: [] };
      await guardRunCsrSourcesTx(reader, retainedRun, author.id);
      await withdrawal.query('BEGIN');
      const blocked = await withdrawal.query<{ acquired: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext('document_data_dispositions'),hashtext($1)) AS acquired", [`${org}:${PROGRAM}`]);
      expect(blocked.rows[0].acquired).toBe(false);
      await withdrawal.query('ROLLBACK');
      await checkIn.query('BEGIN'); await checkIn.query("SET LOCAL lock_timeout='150ms'");
      await expect(checkIn.query('SELECT id FROM vault.documents WHERE id=$1 FOR UPDATE', [checkedIn.id])).rejects.toMatchObject({ code: '55P03' });
      await checkIn.query('ROLLBACK');
      await reader.query('COMMIT');
      await withdrawal.query('BEGIN'); await lockDocumentDispositionProgram(withdrawal, org, PROGRAM); await withdrawal.query('ROLLBACK');
      await source('new-version', org, PROGRAM, author.id, { version: '2.0', predecessor: checkedIn.id });
      const stale = await preview(author, checkedIn); expect(stale.status).toBe(409); expect(stale.body.error).toBe('CSR_SOURCE_SUPERSEDED');
      const historical = await tables(author, historicalRunId);
      expect(historical.status).toBe(200); expect(historical.body.historical).toBe(true);
      await reader.query('BEGIN'); await setTenantContextTx(reader, org);
      await expect(guardRunCsrSourcesTx(reader, retainedRun, author.id)).rejects.toMatchObject({ code: 'CSR_SOURCE_CHANGED' });
      await reader.query('ROLLBACK');
    } finally {
      for (const client of [reader, checkIn, withdrawal]) { await client.query('ROLLBACK').catch(() => undefined); client.release(); }
    }
  });
  it('honors explicit remove_data while keeping authorized historical data after keep_data', async () => {
    const { writeChainedAuditRow } = await import('../../server/services/auditService.js');
    for (const [item, choice] of [[withdrawn, 'remove_data'], [kept, 'keep_data']] as const) {
      const client = await owner.connect(); const dispositionId = randomUUID();
      try {
        await client.query('BEGIN'); await lockDocumentDispositionProgram(client, org, PROGRAM);
        await writeChainedAuditRow(client, { tenantId: org, userId: author.id, action: 'document_data.disposition', resourceType: 'document_data_dispositions', resourceId: dispositionId,
          details: { syntheticFixture: TAG, programId: PROGRAM, choice, sourceSha256: item.sha256, physicalErasure: false } });
        const audit = (await client.query<{ id: string; sha256_chain: string }>('SELECT id::text,sha256_chain FROM audit_logs WHERE tenant_id=$1 AND target=$2 ORDER BY chain_seq DESC LIMIT 1', [org, `document_data_dispositions:${dispositionId}`])).rows[0];
        await client.query(`INSERT INTO document_data_dispositions(id,organization_id,program_id,vault_document_id,choice,reason,actor_id,source_sha256,preview_hash,linked_ids,impact_snapshot,audit_receipt)
          VALUES($1,$2,$3,$4,$5,'Synthetic local source disposition fixture',$6,$7,$7,$8::jsonb,$9::jsonb,$10::jsonb)`, [dispositionId, org, PROGRAM, item.id, choice, author.id, item.sha256,
          JSON.stringify({ capturedSourceIds: [], vaultDocumentIds: [item.id], artifactIds: [], uploadIds: [] }), JSON.stringify({ syntheticFixture: TAG }), JSON.stringify({ id: audit.id, sha256Chain: audit.sha256_chain })]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    }
    const removed = await tables(author, withdrawnRunId);
    expect(removed.status).toBe(409); expect(removed.body.error).toBe('CSR_SOURCE_DATA_UNAVAILABLE');
    const keptRead = await tables(author, keptRunId);
    expect(keptRead.status, JSON.stringify(keptRead.body)).toBe(200);
    expect(keptRead.body.studies[0].source.documentId).toBe(kept.id);
    expect((await preview(author, kept)).status).toBe(404); // original file removed, retained data remains authorized
    expect((await preview(author, withdrawn)).status).toBe(404);
    expect((await owner.query('SELECT run_id FROM submission_orchestrator_inputs WHERE run_id=$1', [withdrawnRunId])).rows).toHaveLength(1);
  });
}

describe('native canonical clinical supporting source integration', () => {
  registerCsrSourceAdmissionCases1();
  registerCsrSourceAdmissionCases2();
});
