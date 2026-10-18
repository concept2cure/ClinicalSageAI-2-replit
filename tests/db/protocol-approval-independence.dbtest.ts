/** Native approval-independence regression. Real authenticated protocol APIs,
 * password reauthentication, restricted runtime and forced RLS. Fresh synthetic
 * records are retained with their real audit/lineage; no provider calls. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool, type PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { databaseUrl } from '../../tests/setup.db';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { setTenantContextTx } from '../../server/services/tenant/governed-tenant-context';
import { recordGovernedAction } from '../../server/routes/c2c/actions';
import {
  createProtocolDocumentTx, updateSectionTx, addObjectiveTx,
  addEligibilityCriterionTx, addVisitTx, getCompleteness,
} from '../../server/services/protocol-development/protocol-development-service';
import { BINDING_BASIS, deriveGovernedTargetBinding, manifestSignatureHash } from '../../server/services/part11/signature-persistence';
import { assertSignerIsNotAuthor, resolveTargetAuthors } from '../../server/services/governance/separation-of-duties';
import { assertLineageCoversContent } from '../../server/services/clinical-regulatory-evidence/span-lineage.service';

const TAG = `protocol-sod-native-${process.pid}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
const isolatedId = () => 1_000_000 + Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000;
// Generated only for this file's fresh QA accounts; never logged or retained.
const PASSWORD = randomUUID();
const REASON = 'Exercise native protocol signing independence with isolated synthetic QA content.';
const cases: Record<string, unknown> = {};
const report: Record<string, unknown> = { tag: TAG, cases, signatureRequestsStarted: 0, scope: 'Actual native protocol APIs; synthetic QA only' };
let owner: Pool;
let runtime: Pool;
let app: express.Express;
let orgId: number;
let orgUuid: string;
type ActorKey = 'author' | 'writer' | 'independent';
const actors = {} as Record<ActorKey, { id: number; token: string }>;
const attempts = { author: 0, writer: 0, independent: 0 };
const scope = <T>(run: () => T): T => runWithTenantScope({ tenantId: String(orgId), orgUuid, role: 'admin', source: 'test', caller: TAG }, run);
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

async function tx<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  return scope(async () => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await setTenantContextTx(client, orgId);
      const value = await run(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  });
}

async function finalizableProtocol(label: string): Promise<{ documentId: number; sectionId: number }> {
  return tx(async client => {
    const { id: documentId } = await createProtocolDocumentTx(client, orgId, actors.author.id, {
      protocolKind: 'clinical', title: `${TAG} ${label}: synthetic QA protocol`, phase: '1',
    });
    await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'create', target: `protocol-document:${documentId}`, reason: REASON, domain: 'protocol_development', payload: { testFixture: true } });
    const sections = (await client.query('SELECT id,section_key FROM protocol_sections WHERE protocol_document_id=$1 AND organization_id=$2 ORDER BY id', [documentId, orgId])).rows;
    for (const section of sections) {
      await updateSectionTx(client, orgId, Number(section.id), { content: `Synthetic QA ${section.section_key}; no scientific evidence or regulatory approval.`, status: 'complete' }, actors.author.id);
      await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'update', target: `protocol-section:${section.id}`, reason: REASON, domain: 'protocol_development', payload: { status: 'complete', testFixture: true } });
    }
    const objective = await addObjectiveTx(client, orgId, actors.author.id, documentId, { objective: 'Observe native signing independence.', endpoint: 'Observed queue and signature outcome.', timepoint: 'At the native test' });
    const inclusion = await addEligibilityCriterionTx(client, orgId, actors.author.id, documentId, { kind: 'inclusion', criterion: 'Synthetic QA fixture only.' });
    const exclusion = await addEligibilityCriterionTx(client, orgId, actors.author.id, documentId, { kind: 'exclusion', criterion: 'No real participant or clinical data.' });
    const visit = await addVisitTx(client, orgId, actors.author.id, documentId, { visitName: 'Synthetic QA visit', timepoint: 'Test execution' });
    await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'update', target: `protocol-document:${documentId}`, reason: REASON, domain: 'protocol_development', payload: { objectiveId: objective.id, inclusionId: inclusion.id, exclusionId: exclusion.id, visitId: visit.id, testFixture: true } });
    return { documentId, sectionId: Number(sections[0].id) };
  });
}
type Fixture = Awaited<ReturnType<typeof finalizableProtocol>>;

function finalize(fixture: Fixture, actor: ActorKey, meaning: 'approval' | 'authorship'): Promise<request.Response> {
  attempts[actor] += 1;
  report.signatureRequestsStarted = Number(report.signatureRequestsStarted) + 1;
  return request(app).post(`/api/protocol-development/documents/${fixture.documentId}/finalize`)
    .set('Authorization', `Bearer ${actors[actor].token}`)
    .send({ reason: REASON, meaning, reauth: { password: PASSWORD } }).then(response => response);
}

async function waitForLock(holderPid: number, excludePid = 0, previousWaiterPid = 0) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const rows = (await owner.query(`SELECT pid,query,wait_event,pg_blocking_pids(pid) AS blocking_pids FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%protocol_documents%FOR UPDATE%'
        AND ($1::int=ANY(pg_blocking_pids(pid)) OR $3::int=ANY(pg_blocking_pids(pid))) AND pid<>$2::int`, [holderPid, excludePid, previousWaiterPid])).rows;
    if (rows.length === 1) return rows[0];
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('No unique actual parent-lock waiter reached the expected bounded native barrier.');
}

type LineageRow = { id: string; char_start: number; char_end: number; span_text_sha256: string; provenance_kind: string; asserted_by: string | null; created_by: string | null; machine_author_id: string | null; signature_id: string | null; asserted_at: Date | null; deleted_at: Date | null };
async function state(fixture: Fixture) {
  const target = `protocol-document:${fixture.documentId}`;
  const document = (await owner.query('SELECT status,version,finalized_by,finalized_at FROM protocol_documents WHERE id=$1 AND organization_id=$2', [fixture.documentId, orgId])).rows[0];
  const section = (await owner.query('SELECT content,status,created_by,updated_at FROM protocol_sections WHERE id=$1 AND organization_id=$2', [fixture.sectionId, orgId])).rows[0];
  const sections = (await owner.query('SELECT section_key,title,content,status,order_index FROM protocol_sections WHERE protocol_document_id=$1 AND organization_id=$2 AND deleted_at IS NULL ORDER BY order_index,section_key,id', [fixture.documentId, orgId])).rows;
  const targets = (await owner.query("SELECT 'protocol-section:' || id AS target FROM protocol_sections WHERE protocol_document_id=$1 AND organization_id=$2", [fixture.documentId, orgId])).rows.map(row => row.target);
  const actions = (await owner.query('SELECT id,command,target,domain,proposed_by,decided_by,decision_reason,audit_row_id,payload,state FROM c2c_ana_actions WHERE org_id=$1 AND (target=$2 OR target=ANY($3::text[])) ORDER BY id', [orgId, target, targets])).rows;
  const audits = (await owner.query('SELECT id,tenant_id,action,actor_id,user_id,target,reason,ana_action_id,payload_hash,sha256_chain,hmac_seal FROM audit_logs WHERE tenant_id=$1 AND (target=$2 OR target=ANY($3::text[])) ORDER BY id', [orgId, target, targets])).rows;
  const signatures = (await owner.query('SELECT id,signer_id,signature_meaning AS meaning,binding_basis,bound_payload_digest,authentication_method,second_factor_verified,signature_manifest,signature_hash FROM electronic_signatures WHERE organization_id=$1 AND signed_target=$2 ORDER BY id', [orgId, target])).rows;
  const versions = (await owner.query('SELECT id,version,created_by,change_summary,snapshot FROM protocol_versions WHERE organization_id=$1 AND protocol_document_id=$2 ORDER BY id', [orgId, fixture.documentId])).rows;
  const lineage = (await owner.query<LineageRow>("SELECT id,char_start,char_end,span_text_sha256,provenance_kind,asserted_by,created_by,machine_author_id,signature_id,asserted_at,deleted_at FROM document_span_lineage WHERE organization_id=$1 AND document_table='protocol_sections' AND document_id=$2 ORDER BY id", [orgId, String(fixture.sectionId)])).rows;
  return { document, section, sections, actions, audits, signatures, versions, lineage };
}

function observe(name: string, value: unknown) {
  cases[name] = value;
  console.info(`[protocol-approval-independence:${name}] ${JSON.stringify(value)}`);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('A real restricted APP_DATABASE_URL is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 4 });
  const dbName = new URL(process.env.APP_DATABASE_URL).pathname.slice(1);
  expect((await owner.query('SELECT current_database() AS name')).rows[0].name).toBe(dbName);
  const organization = (await owner.query("INSERT INTO organizations(id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id,uuid", [isolatedId(), TAG])).rows[0];
  orgId = Number(organization.id);
  orgUuid = String(organization.uuid);
  expect([2, 18, 1538506]).not.toContain(orgId);
  for (const key of ['author', 'writer', 'independent'] as const) {
    const user = (await owner.query("INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,$3,$4,'active') RETURNING id", [isolatedId(), `${TAG}-${key}@example.invalid`, `Native isolated ${key} ${TAG}`, await bcrypt.hash(PASSWORD, 4)])).rows[0];
    expect([25, 1770269, 1342039]).not.toContain(Number(user.id));
    await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'admin')", [orgId, user.id]);
    actors[key] = { id: Number(user.id), token: '' };
  }
  // Membership timestamps are real; mint access tokens afterwards.
  await new Promise(resolve => setTimeout(resolve, 1100));
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  for (const actor of Object.values(actors)) actor.token = jwt.sign({ type: 'access', userId: actor.id, organizationId: String(orgId), role: 'admin' }, activeJwtSecret(), { expiresIn: '10m' });
  const runtimeProof = (await scope(() => getPool().query("SELECT current_database() AS database,current_user AS role,rolsuper,rolbypassrls,current_setting('app.rls_enforce') AS enforcement FROM pg_roles WHERE rolname=current_user"))).rows[0];
  expect(runtimeProof).toMatchObject({ database: dbName, role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on' });
  const stores = (await owner.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY(ARRAY['public.protocol_documents'::regclass,'public.protocol_sections'::regclass,'public.protocol_versions'::regclass,'public.electronic_signatures'::regclass,'public.c2c_ana_actions'::regclass,'public.audit_logs'::regclass,'public.document_span_lineage'::regclass]) ORDER BY relname")).rows;
  expect(stores).toHaveLength(7);
  expect(stores.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  Object.assign(report, { database: dbName, runtime: runtimeProof, stores, organizationId: orgId, actorIds: Object.fromEntries(Object.entries(actors).map(([key, actor]) => [key, actor.id])) });
  const { authMiddleware } = await import('../../server/auth');
  app = express();
  app.use(express.json());
  app.use('/api/protocol-development', authMiddleware, (await import('../../server/routes/protocol-development')).default);
}, 120_000);

afterAll(async () => {
  try {
    report.signerAttempts = attempts;
    // Keep the real ten-attempt signing limiter. Only fresh actors sign here.
    if (process.env.PROTOCOL_SOD_OBSERVATIONS) writeFileSync(process.env.PROTOCOL_SOD_OBSERVATIONS, JSON.stringify(report, null, 2) + '\n');
    console.info('[protocol-approval-independence:summary] ' + JSON.stringify(report));
    expect(Object.values(attempts).every(count => count <= 1)).toBe(true);
  } finally {
    await runtime?.end();
    await getPool().end();
    await owner?.end();
  }
});

type WriterRaceState = {
  fixture: Fixture;
  before: Awaited<ReturnType<typeof state>>;
  after: Awaited<ReturnType<typeof state>>;
  target: string;
  content: string;
  edited: request.Response;
  signed: request.Response;
  authorsAfter: Awaited<ReturnType<typeof resolveTargetAuthors>>;
};
type WriterRaceBarrier = {
  holderPid: number;
  writerWait: Awaited<ReturnType<typeof waitForLock>>;
  signerWait: Awaited<ReturnType<typeof waitForLock>>;
  authorsBefore: Awaited<ReturnType<typeof resolveTargetAuthors>>;
  authorsBeforeRelease: Awaited<ReturnType<typeof resolveTargetAuthors>>;
};

function writerRaceFacts({ after, edited, content }: WriterRaceState) {
  const edit = after.actions.find(row => row.id === edited.body.actionId);
  const editAudit = after.audits.find(row => row.id === edited.body.auditId);
  const liveAuthorship = after.lineage.filter(row => row.deleted_at == null && row.provenance_kind === 'author_assertion');
  const liveWriterAuthorship = liveAuthorship.filter(row => Number(row.asserted_by) === actors.writer.id);
  const liveHashesMatch = liveAuthorship.every(row => digest(content.slice(Number(row.char_start), Number(row.char_end))) === row.span_text_sha256);
  const signActions = after.actions.filter(row => row.command === 'sign');
  const signAudits = after.audits.filter(row => row.action === 'c2c.work.sign');
  return { edit, editAudit, liveAuthorship, liveWriterAuthorship, liveHashesMatch, signActions, signAudits };
}

function observeWriterRace(result: WriterRaceState, barrier: WriterRaceBarrier, facts: ReturnType<typeof writerRaceFacts>) {
  const { fixture, after, content, edited, signed, authorsAfter } = result;
  const { holderPid, writerWait, signerWait, authorsBefore, authorsBeforeRelease } = barrier;
  const { edit, editAudit, liveWriterAuthorship, liveHashesMatch, signActions, signAudits } = facts;
  observe('writerFirstSignerSecond', { ...fixture, holderPid, writerWait, signerWait, authorsBefore, authorsBeforeRelease, authorsAfter,
    writerStatus: edited.status, signerStatus: signed.status, signerErrorCode: signed.body?.error?.code ?? null,
    document: after.document, changedProseRetained: after.section.content === content, editActionId: edit?.id, editAuditId: editAudit?.id,
    lineageRows: after.lineage.length, liveWriterAuthorshipRows: liveWriterAuthorship.length, liveHashesMatch,
    signatureCount: after.signatures.length, versionCount: after.versions.length, signActionCount: signActions.length, signAuditCount: signAudits.length });
}

function assertRealEditAction(result: WriterRaceState, facts: ReturnType<typeof writerRaceFacts>) {
  const { fixture, edited } = result;
  const { edit, editAudit } = facts;
  expect(edit).toMatchObject({ command: 'update', target: `protocol-section:${fixture.sectionId}`, domain: 'protocol_development', decision_reason: REASON, state: 'executed', payload: { status: 'complete' } });
  expect(Number(edit?.proposed_by)).toBe(actors.writer.id);
  expect(Number(edit?.decided_by)).toBe(actors.writer.id);
  expect(edit?.audit_row_id).toBe(editAudit?.id);
  expect(editAudit?.ana_action_id).toBe(edit?.id);
  expect(editAudit).toMatchObject({ action: 'c2c.work.update', tenant_id: orgId, reason: REASON, target: `protocol-section:${fixture.sectionId}` });
  expect(Number(editAudit?.actor_id)).toBe(actors.writer.id);
  expect(Number(editAudit?.user_id)).toBe(actors.writer.id);
  expect(editAudit?.sha256_chain).toBe(edited.body.sha256Chain);
  expect(editAudit?.payload_hash).toMatch(/^[a-f0-9]{64}$/);
}

async function assertWriterRace(result: WriterRaceState, facts: ReturnType<typeof writerRaceFacts>) {
  const { fixture, before, after, target, content, edited, signed, authorsAfter } = result;
  const { liveAuthorship, liveWriterAuthorship, liveHashesMatch, signActions, signAudits } = facts;
  expect(edited.status).toBe(201);
  expect(edited.body).toMatchObject({ id: fixture.sectionId, status: 'complete' });
  expect(after.section).toMatchObject({ content, status: 'complete', created_by: actors.author.id });
  expect(new Date(after.section.updated_at).toISOString()).toBe(new Date(edited.body.updatedAt).toISOString());
  // The same real barrier is red201 before reservation and green403 after.
  expect(signed.status, 'A pending approver who becomes an author before parent reservation must be refused.').toBe(403);
  expect(signed.body?.error?.code).toBe('SEPARATION_OF_DUTIES');
  assertRealEditAction(result, facts);
  expect([...authorsAfter.authors].sort((a, b) => a - b)).toEqual([actors.author.id, actors.writer.id].sort((a, b) => a - b));
  await expect(tx(client => assertSignerIsNotAuthor(target, orgId, actors.writer.id, { command: 'sign', meaning: 'approval', client }))).rejects.toMatchObject({ code: 'SEPARATION_OF_DUTIES' });
  expect(liveWriterAuthorship.length).toBeGreaterThan(0);
  expect(liveAuthorship.every(row => Number(row.asserted_by) === actors.writer.id)).toBe(true);
  expect(liveAuthorship.every(row => Number(row.created_by) === actors.writer.id && row.machine_author_id == null && row.signature_id == null && row.asserted_at != null)).toBe(true);
  expect(liveHashesMatch).toBe(true);
  expect(liveAuthorship.every(row => Number(row.char_start) >= 0 && Number(row.char_start) < Number(row.char_end) && Number(row.char_end) <= content.length)).toBe(true);
  await tx(client => assertLineageCoversContent(orgId, { documentTable: 'protocol_sections', documentId: String(fixture.sectionId) }, content, client));
  expect((await scope(() => getCompleteness(orgId, fixture.documentId))).readyToFinalize).toBe(true);
  expect(after.lineage.map(row => row.id)).toEqual(expect.arrayContaining(before.lineage.map(row => row.id)));
  for (const prior of before.lineage.filter(row => row.provenance_kind === 'author_assertion')) {
    expect(after.lineage.find(row => row.id === prior.id)).toMatchObject({ char_start: prior.char_start, char_end: prior.char_end, span_text_sha256: prior.span_text_sha256, provenance_kind: prior.provenance_kind, asserted_by: prior.asserted_by, created_by: prior.created_by });
    expect(after.lineage.find(row => row.id === prior.id)?.deleted_at).toBeTruthy();
  }
  expect(after.actions).toHaveLength(before.actions.length + 1);
  expect(after.audits).toHaveLength(before.audits.length + 1);
  for (const action of before.actions) expect(after.actions.find(row => row.id === action.id)).toEqual(action);
  for (const audit of before.audits) expect(after.audits.find(row => row.id === audit.id)).toEqual(audit);
  expect(signed.body).not.toHaveProperty('signatureId');
  expect(signed.body).not.toHaveProperty('actionId');
  expect(signed.body).not.toHaveProperty('auditId');
  expect(after.document).toEqual(before.document);
  expect(after.document).toMatchObject({ status: 'in_development', version: '0.1', finalized_by: null, finalized_at: null });
  expect(after.signatures).toHaveLength(0);
  expect(after.versions).toHaveLength(0);
  expect(signActions).toHaveLength(0);
  expect(signAudits).toHaveLength(0);
}

async function refusesQueuedAuthorApproval() {
  const fixture = await finalizableProtocol('writer-first/signer-second');
  const target = `protocol-document:${fixture.documentId}`;
  const before = await state(fixture);
  expect(before.document).toMatchObject({ status: 'in_development', version: '0.1', finalized_by: null, finalized_at: null });
  expect(before.signatures).toHaveLength(0);
  expect(before.versions).toHaveLength(0);
  expect((await scope(() => getCompleteness(orgId, fixture.documentId))).readyToFinalize).toBe(true);
  const authorsBefore = await tx(client => resolveTargetAuthors(target, orgId, client));
  expect(authorsBefore).toMatchObject({ modelled: true, authors: [actors.author.id] });
  await tx(client => assertSignerIsNotAuthor(target, orgId, actors.writer.id, { command: 'sign', meaning: 'approval', client }));
  const holder = await runtime.connect();
  let writing: Promise<request.Response> | undefined;
  let signing: Promise<request.Response> | undefined;
  try {
    await holder.query('BEGIN');
    await setTenantContextTx(holder, orgId);
    const holderPid = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await holder.query('SELECT id FROM protocol_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE', [fixture.documentId, orgId]);
    const content = 'This genuine governed prose edit is authored by the pending approval signer. Synthetic QA only; no clinical claim.';
    writing = request(app).patch(`/api/protocol-development/sections/${fixture.sectionId}`)
      .set('Authorization', `Bearer ${actors.writer.token}`)
      .send({ reason: REASON, content, status: 'complete' }).then(response => response);
    const writerWait = await waitForLock(holderPid);
    signing = finalize(fixture, 'writer', 'approval');
    const signerWait = await waitForLock(holderPid, Number(writerWait.pid), Number(writerWait.pid));
    expect(Number(signerWait.pid)).not.toBe(Number(writerWait.pid));
    expect(signerWait.blocking_pids).toContain(Number(writerWait.pid));
    const authorsBeforeRelease = await tx(client => resolveTargetAuthors(target, orgId, client));
    expect(authorsBeforeRelease).toMatchObject({ modelled: true, authors: [actors.author.id] });
    await holder.query('COMMIT');
    const [edited, signed] = await Promise.all([writing, signing]);
    const after = await state(fixture);
    const authorsAfter = await tx(client => resolveTargetAuthors(target, orgId, client));
    const result = { fixture, before, after, target, content, edited, signed, authorsAfter };
    const facts = writerRaceFacts(result);
    observeWriterRace(result, { holderPid, writerWait, signerWait, authorsBefore, authorsBeforeRelease }, facts);
    await assertWriterRace(result, facts);
  } finally {
    await holder.query('ROLLBACK').catch(() => undefined);
    holder.release();
    await Promise.allSettled([writing, signing].filter(Boolean));
  }
}

async function allowsIndependentApproval() {
  const fixture = await finalizableProtocol('independent approval control');
  const target = `protocol-document:${fixture.documentId}`;
  const authors = await tx(client => resolveTargetAuthors(target, orgId, client));
  expect(authors).toMatchObject({ modelled: true, authors: [actors.author.id] });
  const signed = await finalize(fixture, 'independent', 'approval');
  const after = await state(fixture);
  const binding = await tx(client => deriveGovernedTargetBinding(client, target, orgId));
  const authorsAfter = await tx(client => resolveTargetAuthors(target, orgId, client));
  observe('independentApproval', { ...fixture, signerStatus: signed.status, authors, document: after.document,
    signatureCount: after.signatures.length, versionCount: after.versions.length, signatureId: after.signatures[0]?.id,
    signatureMeaning: after.signatures[0]?.meaning, authenticationMethod: after.signatures[0]?.authentication_method,
    bindingBasis: binding.basis, digestMatchesCurrent: after.signatures[0]?.bound_payload_digest === binding.digest });
  expect(signed.status).toBe(201);
  expect(after.document).toMatchObject({ status: 'finalized', version: '1.0', finalized_by: actors.independent.id });
  expect(after.document.finalized_at).toBeTruthy();
  expect(after.versions).toHaveLength(1);
  expect(after.versions[0]).toMatchObject({ version: '1.0', created_by: actors.independent.id, change_summary: 'Finalized' });
  expect(typeof after.versions[0].snapshot).toBe('string');
  expect(JSON.parse(after.versions[0].snapshot)).toEqual({ version: '1.0', sections: after.sections });
  expect(after.signatures).toHaveLength(1);
  expect(after.signatures[0]).toMatchObject({ signer_id: actors.independent.id, meaning: 'approval', authentication_method: 'password', binding_basis: BINDING_BASIS.PROTOCOL_DOCUMENT_CONTENT });
  expect(after.signatures[0].bound_payload_digest).toBe(binding.digest);
  expect(authorsAfter.authors).toEqual(authors.authors);
  expect(after.signatures[0].id).toBe(signed.body.signatureId);
  expect(after.signatures[0].second_factor_verified).toBe(false);
  expect(after.signatures[0].signature_manifest).toMatchObject({ signerId: actors.independent.id, target, organizationId: orgId, meaning: 'approval', reason: REASON, actionId: signed.body.actionId, auditId: signed.body.auditId, bindingBasis: binding.basis, boundPayloadDigest: binding.digest, act: { finalized: true, protocolVersion: '1.0' } });
  expect(after.signatures[0].signature_hash).toBe(manifestSignatureHash(after.signatures[0].signature_manifest));
  expect(after.actions.find(row => row.id === signed.body.actionId)?.audit_row_id).toBe(signed.body.auditId);
  expect(after.audits.find(row => row.id === signed.body.auditId)?.ana_action_id).toBe(signed.body.actionId);
  expect(after.actions.find(row => row.id === signed.body.actionId)).toMatchObject({ command: 'sign', domain: 'protocol_development', target, state: 'executed', decision_reason: REASON });
  expect(Number(after.actions.find(row => row.id === signed.body.actionId)?.proposed_by)).toBe(actors.independent.id);
  expect(after.audits.find(row => row.id === signed.body.auditId)).toMatchObject({ action: 'c2c.work.sign', target, reason: REASON, tenant_id: orgId, sha256_chain: signed.body.sha256Chain });
  expect(Number(after.audits.find(row => row.id === signed.body.auditId)?.actor_id)).toBe(actors.independent.id);
  expect(after.actions.filter(row => row.command === 'sign')).toHaveLength(1);
  expect(after.audits.filter(row => row.action === 'c2c.work.sign')).toHaveLength(1);
}

async function allowsAuthorAuthorship() {
  const fixture = await finalizableProtocol('author authorship control');
  const target = `protocol-document:${fixture.documentId}`;
  const authors = await tx(client => resolveTargetAuthors(target, orgId, client));
  expect(authors).toMatchObject({ modelled: true, authors: [actors.author.id] });
  const signed = await finalize(fixture, 'author', 'authorship');
  const after = await state(fixture);
  const binding = await tx(client => deriveGovernedTargetBinding(client, target, orgId));
  const authorsAfter = await tx(client => resolveTargetAuthors(target, orgId, client));
  observe('authorAuthorship', { ...fixture, signerStatus: signed.status, authors, document: after.document,
    signatureCount: after.signatures.length, versionCount: after.versions.length, signatureId: after.signatures[0]?.id,
    signatureMeaning: after.signatures[0]?.meaning, authenticationMethod: after.signatures[0]?.authentication_method,
    bindingBasis: binding.basis, digestMatchesCurrent: after.signatures[0]?.bound_payload_digest === binding.digest });
  expect(signed.status).toBe(201);
  expect(after.document).toMatchObject({ status: 'finalized', version: '1.0', finalized_by: actors.author.id });
  expect(after.document.finalized_at).toBeTruthy();
  expect(after.versions).toHaveLength(1);
  expect(after.versions[0]).toMatchObject({ version: '1.0', created_by: actors.author.id, change_summary: 'Finalized' });
  expect(typeof after.versions[0].snapshot).toBe('string');
  expect(JSON.parse(after.versions[0].snapshot)).toEqual({ version: '1.0', sections: after.sections });
  expect(after.signatures).toHaveLength(1);
  expect(after.signatures[0]).toMatchObject({ signer_id: actors.author.id, meaning: 'authorship', authentication_method: 'password', binding_basis: BINDING_BASIS.PROTOCOL_DOCUMENT_CONTENT });
  expect(after.signatures[0].bound_payload_digest).toBe(binding.digest);
  expect(authorsAfter.authors).toEqual(authors.authors);
  expect(after.signatures[0].id).toBe(signed.body.signatureId);
  expect(after.signatures[0].second_factor_verified).toBe(false);
  expect(after.signatures[0].signature_manifest).toMatchObject({ signerId: actors.author.id, target, organizationId: orgId, meaning: 'authorship', reason: REASON, actionId: signed.body.actionId, auditId: signed.body.auditId, bindingBasis: binding.basis, boundPayloadDigest: binding.digest, act: { finalized: true, protocolVersion: '1.0' } });
  expect(after.signatures[0].signature_hash).toBe(manifestSignatureHash(after.signatures[0].signature_manifest));
  expect(after.actions.find(row => row.id === signed.body.actionId)?.audit_row_id).toBe(signed.body.auditId);
  expect(after.audits.find(row => row.id === signed.body.auditId)?.ana_action_id).toBe(signed.body.actionId);
  expect(after.actions.find(row => row.id === signed.body.actionId)).toMatchObject({ command: 'sign', domain: 'protocol_development', target, state: 'executed', decision_reason: REASON });
  expect(Number(after.actions.find(row => row.id === signed.body.actionId)?.proposed_by)).toBe(actors.author.id);
  expect(after.audits.find(row => row.id === signed.body.auditId)).toMatchObject({ action: 'c2c.work.sign', target, reason: REASON, tenant_id: orgId, sha256_chain: signed.body.sha256Chain });
  expect(Number(after.audits.find(row => row.id === signed.body.auditId)?.actor_id)).toBe(actors.author.id);
  expect(after.actions.filter(row => row.command === 'sign')).toHaveLength(1);
  expect(after.audits.filter(row => row.action === 'c2c.work.sign')).toHaveLength(1);
}

describe('native protocol approval independence', () => {
  it('refuses a queued approval signer who commits a real governed edit before reserving the parent', refusesQueuedAuthorApproval, 60_000);
  it('allows an independent approver with a genuine matching content signature', allowsIndependentApproval);
  it('allows the actual author to finalize with authorship meaning and a matching content signature', allowsAuthorAuthorship);
});
