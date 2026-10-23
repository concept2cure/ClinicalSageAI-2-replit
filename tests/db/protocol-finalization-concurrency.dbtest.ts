/** Native protocol finalization/reservation invariants. New isolated QA records;
 * actual restricted runtime, forced RLS, canonical services and public signing
 * routes. No provider calls or source/signature history rewriting. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../../tests/setup.db';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { setTenantContextTx } from '../../server/services/tenant/governed-tenant-context';
import { recordGovernedAction } from '../../server/routes/c2c/actions';
import {
  createProtocolDocumentTx, updateSectionTx, addObjectiveTx, addEligibilityCriterionTx,
  addVisitTx, finalizeProtocolTx, getCompleteness, updateSynopsisTx,
  updateDocumentHeaderTx, snapshotVersionTx, updateVisitTx, removeVisitTx, removeSoaAssessmentTx, addTeamMemberTx,
  requireProtocolForWriteTx, bindStudyDesignTx, unbindStudyDesignTx,
} from '../../server/services/protocol-development/protocol-development-service';
import { signProtocolAct } from '../../server/services/protocol-development/protocol-signature';
import { BINDING_BASIS, deriveGovernedTargetBinding } from '../../server/services/part11/signature-persistence';
import { addAssessmentTx, setCellTx, clearCellTx } from '../../server/services/protocol-soa/protocol-soa-service';
import { finalizationTarget, readSignatureFacets } from '../../server/services/protocol-development/protocol-signature-manifestation';
import { getProtocolExport } from '../../server/services/protocol-export/protocol-export-service';

const TAG = `protocol-native-concurrency-${process.pid}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
const isolatedId = () => 1_000_000 + Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000;
const PASSWORD = 'Protocol-Native-Evidence-Only-2026!';
const REASON = 'Exercise an isolated native protocol finalization transaction for QA evidence.';
const observations: Record<string, unknown> = { tag: TAG, database: 'configured native test database', cases: {} };
let owner: Pool;
let runtime: Pool;
let app: express.Express;
let orgId: number;
let orgUuid: string;
type Actor = { id: number; email: string; token: string };
const actors = {} as Record<'author' | 'editor', Actor>;

function observe(key: string, value: unknown) {
  (observations.cases as Record<string, unknown>)[key] = value;
  console.info(`[protocol-native-probe:${key}] ${JSON.stringify(value)}`);
}
const scope = <T>(run: () => T): T => runWithTenantScope({ tenantId: String(orgId), orgUuid, role: 'admin', source: 'test', caller: TAG }, run);

async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  return scope(async () => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await setTenantContextTx(client, orgId);
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  });
}

/** Canonical create/write services and real governed action records, not forged history. */
async function finalizableProtocol(label: string): Promise<{ documentId: number; sectionId: number; sectionKey: string; visitId: number }> {
  return transaction(async (client) => {
    const { id: documentId } = await createProtocolDocumentTx(client, orgId, actors.author.id, {
      protocolKind: 'clinical', title: `${TAG} ${label}: synthetic QA protocol`, phase: '1',
    });
    await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'create', target: `protocol-document:${documentId}`, reason: REASON, domain: 'protocol_development', payload: { testFixture: true } });
    const sections = (await client.query('SELECT id,section_key FROM protocol_sections WHERE protocol_document_id=$1 AND organization_id=$2 ORDER BY id', [documentId, orgId])).rows;
    for (const section of sections) {
      await updateSectionTx(client, orgId, Number(section.id), { content: `This native QA ${section.section_key} section is synthetic test content and does not establish scientific evidence.`, status: 'complete' }, actors.author.id);
      await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'update', target: `protocol-section:${section.id}`, reason: REASON, domain: 'protocol_development', payload: { status: 'complete', testFixture: true } });
    }
    const objective = await addObjectiveTx(client, orgId, actors.author.id, documentId, { objective: 'Verify this isolated QA transaction.', endpoint: 'Observed transaction outcome.', timepoint: 'At the native test.' });
    const inclusion = await addEligibilityCriterionTx(client, orgId, actors.author.id, documentId, { kind: 'inclusion', criterion: 'Synthetic QA fixture only.' });
    const exclusion = await addEligibilityCriterionTx(client, orgId, actors.author.id, documentId, { kind: 'exclusion', criterion: 'No real participant or clinical data.' });
    const visit = await addVisitTx(client, orgId, actors.author.id, documentId, { visitName: 'Synthetic QA visit', timepoint: 'Test execution' });
    await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'update', target: `protocol-document:${documentId}`, reason: REASON, domain: 'protocol_development', payload: { objectiveId: objective.id, inclusionId: inclusion.id, exclusionId: exclusion.id, visitId: visit.id, testFixture: true } });
    return { documentId, sectionId: Number(sections[0].id), sectionKey: String(sections[0].section_key), visitId: visit.id };
  });
}

type ProtocolFixture = Awaited<ReturnType<typeof finalizableProtocol>>;
type SoaFixture = ProtocolFixture & { assessmentId: number; cellId: number };
async function protocolWithSoa(label: string): Promise<SoaFixture> {
  const fixture = await finalizableProtocol(label);
  return transaction(async (client) => {
    const assessment = await addAssessmentTx(client, orgId, actors.author.id, fixture.documentId, { name: 'Native QA vital signs', category: 'vital_signs' });
    const cell = await setCellTx(client, orgId, actors.author.id, { assessmentId: assessment.id, visitId: fixture.visitId, required: true, notes: 'Original QA SoA note.' });
    await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'create', target: `protocol-document:${fixture.documentId}`, reason: REASON, domain: 'protocol_development', payload: { assessmentId: assessment.id, testFixture: true } });
    await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'update', target: `protocol-soa-assessment:${assessment.id}`, reason: REASON, domain: 'protocol_development', payload: { visitId: fixture.visitId, testFixture: true } });
    return { ...fixture, assessmentId: assessment.id, cellId: cell.id };
  });
}

/** Each independent API case has a genuine fresh independent approver. This
 * retains the real ten-attempt per-signer limiter rather than disabling it. */
async function apiFinalize(fixture: ProtocolFixture) {
  const email = `${TAG}-approver-${randomUUID()}@example.invalid`;
  const person = (await owner.query("INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,$3,$4,'active') RETURNING id", [isolatedId(), email, `Native independent approver ${TAG}`, await bcrypt.hash(PASSWORD, 4)])).rows[0];
  await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'admin')", [orgId, person.id]);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  const token = jwt.sign({ type: 'access', userId: Number(person.id), organizationId: String(orgId), role: 'admin' }, activeJwtSecret(), { expiresIn: '10m' });
  return request(app).post(`/api/protocol-development/documents/${fixture.documentId}/finalize`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: REASON, meaning: 'approval', reauth: { password: PASSWORD } });
}

async function governedWriter(fixture: ProtocolFixture, write: (client: PoolClient) => Promise<unknown>) {
  try {
    await transaction(async (client) => {
      await write(client);
      await recordGovernedAction(client, { orgId, userId: actors.editor.id, command: 'update', target: `protocol-document:${fixture.documentId}`, reason: REASON, domain: 'protocol_development', payload: { nativeConcurrentEdit: true, testFixture: true } });
    });
    return { ok: true, code: null };
  } catch (error) { return { ok: false, code: (error as { code?: string }).code ?? 'UNKNOWN' }; }
}

function signedFinalize(documentId: number, before?: (client: PoolClient) => Promise<void>) {
  return scope(() => signProtocolAct({ orgId, userId: actors.author.id, target: `protocol-document:${documentId}`, reason: REASON,
    meaning: 'authorship', allowedMeanings: ['authorship', 'approval', 'responsibility'], reauth: { password: PASSWORD }, ipAddress: null, role: 'admin',
    write: async (client) => {
      if (before) await before(client);
      const result = await finalizeProtocolTx(client, orgId, actors.author.id, documentId);
      return { act: { finalized: true, protocolVersion: result.version, testFixture: true }, body: { documentId, ...result } };
    },
  }));
}

async function retainedState(documentId: number) {
  const document = (await owner.query('SELECT status,version FROM protocol_documents WHERE id=$1 AND organization_id=$2', [documentId, orgId])).rows[0];
  const signatures = (await owner.query('SELECT id,binding_basis,bound_payload_digest,signature_manifest FROM public.electronic_signatures WHERE organization_id=$1 AND signed_target=$2 ORDER BY id', [orgId, `protocol-document:${documentId}`])).rows;
  const versions = (await owner.query('SELECT version,snapshot FROM protocol_versions WHERE protocol_document_id=$1 AND organization_id=$2 ORDER BY id', [documentId, orgId])).rows;
  const actions = (await owner.query("SELECT command,target FROM c2c_ana_actions WHERE org_id=$1 AND (target=$2 OR target IN (SELECT 'protocol-section:' || id FROM protocol_sections WHERE organization_id=$1 AND protocol_document_id=$3)) ORDER BY id", [orgId, `protocol-document:${documentId}`, documentId])).rows;
  const binding = await transaction((client) => deriveGovernedTargetBinding(client, `protocol-document:${documentId}`, orgId));
  return { document, signatures, versions, actions, currentDigest: binding.digest, currentBasis: binding.basis };
}

async function waitForParentWait(holderPid: number, pattern: string, additionalBlockingPid?: number | number[], excludePid?: number): Promise<number> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const waiting = await owner.query(`SELECT pid FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $2
        AND ($1::int=ANY(pg_blocking_pids(pid)) OR pg_blocking_pids(pid) && $3::int[])
        AND pid<>$4::int`, [holderPid, pattern, Array.isArray(additionalBlockingPid) ? additionalBlockingPid : [additionalBlockingPid ?? holderPid], excludePid ?? 0]);
    if (waiting.rows.length) return Number(waiting.rows[0].pid);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The actual protocol request did not reach its expected native parent lock wait.');
}

/** Capture actual protected rows/lineage and edit action ids, so a refused write
 * cannot hide a partial child/provenance commit behind its error response. */
async function protectedState(fixture: ProtocolFixture) {
  return (await owner.query(`SELECT
    (SELECT to_jsonb(d) FROM protocol_documents d WHERE d.id=$1 AND d.organization_id=$2) AS document,
    (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) FROM protocol_sections s WHERE s.protocol_document_id=$1 AND s.organization_id=$2) AS sections,
    (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) FROM protocol_soa_cells s WHERE s.protocol_document_id=$1 AND s.organization_id=$2) AS cells,
    (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb) FROM document_span_lineage l WHERE l.organization_id=$2 AND l.document_table='protocol_sections' AND l.document_id IN (SELECT id::text FROM protocol_sections WHERE protocol_document_id=$1 AND organization_id=$2)) AS lineage,
    (SELECT COALESCE(jsonb_agg(a.id ORDER BY a.id),'[]'::jsonb) FROM c2c_ana_actions a WHERE a.org_id=$2 AND a.command='update' AND (a.target=$3 OR a.target IN (SELECT 'protocol-section:' || id FROM protocol_sections WHERE protocol_document_id=$1 AND organization_id=$2))) AS edits`, [fixture.documentId, orgId, `protocol-document:${fixture.documentId}`])).rows[0];
}

async function holdParent(fixture: ProtocolFixture): Promise<{ client: PoolClient; pid: number }> {
  const client = await runtime.connect();
  await client.query('BEGIN'); await setTenantContextTx(client, orgId);
  const pid = Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
  await client.query('SELECT id FROM protocol_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE', [fixture.documentId, orgId]);
  return { client, pid };
}

type ProtectedWriter = { name: string; write: (client: PoolClient, fixture: SoaFixture) => Promise<unknown> };
const parentWriters: ProtectedWriter[] = [
  { name: 'header', write: (client, fixture) => updateDocumentHeaderTx(client, orgId, fixture.documentId, { title: 'Late synthetic QA title.' }) },
  { name: 'synopsis', write: (client, fixture) => updateSynopsisTx(client, orgId, fixture.documentId, 'Late synthetic QA synopsis.', actors.editor.id) },
  { name: 'minor snapshot', write: (client, fixture) => snapshotVersionTx(client, orgId, actors.editor.id, fixture.documentId, 'Late synthetic QA snapshot.') },
  { name: 'objective', write: (client, fixture) => addObjectiveTx(client, orgId, actors.editor.id, fixture.documentId, { objective: 'Late synthetic QA objective.' }) },
  { name: 'eligibility', write: (client, fixture) => addEligibilityCriterionTx(client, orgId, actors.editor.id, fixture.documentId, { kind: 'exclusion', criterion: 'Late synthetic QA criterion.' }) },
  { name: 'visit rename', write: (client, fixture) => updateVisitTx(client, orgId, fixture.documentId, fixture.visitId, { visitName: 'Late renamed native QA visit.' }) },
  { name: 'remove assessment', write: (client, fixture) => removeSoaAssessmentTx(client, orgId, fixture.documentId, fixture.assessmentId) },
  { name: 'visit', write: (client, fixture) => addVisitTx(client, orgId, actors.editor.id, fixture.documentId, { visitName: 'Late synthetic QA visit.' }) },
  { name: 'team', write: (client, fixture) => addTeamMemberTx(client, orgId, actors.editor.id, fixture.documentId, { memberName: 'Late native QA coordinator.', role: 'coordinator' }) },
  { name: 'assessment', write: (client, fixture) => addAssessmentTx(client, orgId, actors.editor.id, fixture.documentId, { name: 'Late native QA assessment.', category: 'exam' }) },
];

async function assertFinalizerFirst(fixture: SoaFixture, writer: ProtectedWriter) {
  const holder = await holdParent(fixture);
  let signing: Promise<request.Response> | undefined;
  let writing: ReturnType<typeof governedWriter> | undefined;
  try {
    signing = apiFinalize(fixture);
    const signerPid = await waitForParentWait(holder.pid, '%protocol_documents%FOR UPDATE%');
    writing = governedWriter(fixture, (client) => writer.write(client, fixture));
    const writerPid = await waitForParentWait(holder.pid, '%protocol_%', signerPid, signerPid);
    await holder.client.query('COMMIT');
    const [signed, refused] = await Promise.all([signing, writing]);
    const state = await retainedState(fixture.documentId);
    observe(`finalizer-first-${writer.name}`, { documentId: fixture.documentId, signerPid, writerPid, signedStatus: signed.status, writer: refused, signatures: state.signatures.length, versions: state.versions.length, currentDigestMatches: state.signatures[0]?.bound_payload_digest === state.currentDigest });
    expect(signed.status).toBe(201); expect(refused).toEqual({ ok: false, code: 'INVALID_STATE' });
    expect(state.document).toEqual({ status: 'finalized', version: '1.0' });
    expect(state.versions).toHaveLength(1); expect(state.signatures).toHaveLength(1);
    expect(state.signatures[0].bound_payload_digest).toBe(state.currentDigest);
  } finally {
    await holder.client.query('ROLLBACK').catch(() => undefined); holder.client.release();
    await Promise.allSettled([signing, writing].filter(Boolean));
  }
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('Restricted APP_DATABASE_URL is required; an owner cannot prove runtime behavior.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 4 });
  const expectedDatabase = new URL(process.env.APP_DATABASE_URL).pathname.slice(1);
  expect((await owner.query('SELECT current_database() AS name')).rows[0].name).toBe(expectedDatabase);
  const organization = (await owner.query("INSERT INTO organizations(id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id,uuid", [isolatedId(), TAG])).rows[0];
  orgId = Number(organization.id); orgUuid = String(organization.uuid);
  expect(orgId).not.toBe(2);
  for (const key of ['author', 'editor'] as const) {
    const email = `${TAG}-${key}@example.invalid`;
    const person = (await owner.query("INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,$3,$4,'active') RETURNING id", [isolatedId(), email, `Native protocol ${key} ${TAG}`, await bcrypt.hash(PASSWORD, 4)])).rows[0];
    expect(Number(person.id)).not.toBe(25);
    await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'admin')", [orgId, person.id]);
    actors[key] = { id: Number(person.id), email, token: '' };
  }
  // Mint tokens after the membership timestamps without backdating any record.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  for (const actor of Object.values(actors)) {
    actor.token = jwt.sign({ type: 'access', userId: actor.id, organizationId: String(orgId), role: 'admin' }, activeJwtSecret(), { expiresIn: '10m' });
  }
  const runtimeProof = await scope(() => getPool().query("SELECT current_database() AS database,current_user AS role,rolsuper,rolbypassrls,current_setting('app.rls_enforce') AS enforcement FROM pg_roles WHERE rolname=current_user"));
  expect(runtimeProof.rows[0]).toMatchObject({ database: expectedDatabase, role: decodeURIComponent(new URL(process.env.APP_DATABASE_URL).username), rolsuper: false, rolbypassrls: false, enforcement: 'on' });
  const stores = (await owner.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY(ARRAY['public.protocol_documents'::regclass,'public.protocol_sections'::regclass,'public.protocol_versions'::regclass,'public.electronic_signatures'::regclass,'public.c2c_ana_actions'::regclass]) ORDER BY relname")).rows;
  expect(stores).toHaveLength(5);
  expect(stores.every((store) => store.relrowsecurity && store.relforcerowsecurity)).toBe(true);
  observations.database = expectedDatabase; observations.runtime = runtimeProof.rows[0]; observations.stores = stores; observations.organizationId = orgId;
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/protocol-development', authMiddleware, (await import('../../server/routes/protocol-development')).default);
  app.use('/api/protocol-export', authMiddleware, (await import('../../server/routes/protocol-export')).default);
}, 120_000);

afterAll(async () => {
  console.info(`[protocol-native-concurrency:summary] ${JSON.stringify(observations)}`);
  // Retain all fixture sources, signatures and audit history; close only this
  // process's connections. No shared schema, role or database is torn down.
  await runtime?.end();
  await getPool().end();
  await owner?.end();
});

describe('protocol finalization through the actual native runtime', () => {
  it('control: a clean canonical protocol finalizes with a matching real content signature', async () => {
    const fixture = await finalizableProtocol('clean control');
    const gate = await scope(() => getCompleteness(orgId, fixture.documentId));
    expect(gate.readyToFinalize).toBe(true);
    const signed = await signedFinalize(fixture.documentId);
    const state = await retainedState(fixture.documentId);
    observe('clean-control', { documentId: fixture.documentId, signatureId: signed.signatureId, status: state.document.status, version: state.document.version, signatures: state.signatures.length, versions: state.versions.length, bindingBasis: state.currentBasis, digestMatches: state.signatures[0]?.bound_payload_digest === state.currentDigest });
    expect(state.document).toEqual({ status: 'finalized', version: '1.0' });
    expect(state.signatures).toHaveLength(1); expect(state.versions).toHaveLength(1);
    expect(state.currentBasis).toBe(BINDING_BASIS.PROTOCOL_DOCUMENT_CONTENT);
    expect(state.signatures[0].bound_payload_digest).toBe(state.currentDigest);
  });

  it('refuses a required section made draft on the signing client instead of checking the pool old state', async () => {
    const fixture = await finalizableProtocol('same-client structural regression');
    let signingPid = 0; let independentPoolPid = 0;
    let release: Record<string, unknown> | null = null; let refusalCode: string | null = null;
    try {
      release = await signedFinalize(fixture.documentId, async (client) => {
        signingPid = Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
        independentPoolPid = Number((await getPool().query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
        await updateSectionTx(client, orgId, fixture.sectionId, { status: 'draft' }, actors.author.id);
        await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'update', target: `protocol-section:${fixture.sectionId}`, reason: REASON, domain: 'protocol_development', payload: { status: 'draft', testFixture: true } });
      });
    } catch (error) { refusalCode = String((error as { code?: string }).code ?? 'UNKNOWN'); }
    const gateAfter = await scope(() => getCompleteness(orgId, fixture.documentId));
    const state = await retainedState(fixture.documentId);
    const finalSnapshot = state.versions[0] ? JSON.parse(state.versions[0].snapshot) : null;
    observe('same-client-structural-regression', { documentId: fixture.documentId, sectionId: fixture.sectionId, sectionKey: fixture.sectionKey, signingPid, independentPoolPid, refusalCode, finalized: release?.finalized ?? false, status: state.document.status, returnedCompleteness: release?.completeness ?? null, currentReadyToFinalize: gateAfter.readyToFinalize, snapshotSectionStatus: finalSnapshot?.sections.find((section: { section_key: string }) => section.section_key === fixture.sectionKey)?.status ?? null, signatures: state.signatures.length, versions: state.versions.length });
    expect(signingPid).not.toBe(independentPoolPid);
    expect(refusalCode, 'An incomplete same-client input must stop finalization before release effects.').toBe('INVALID_STATE');
    expect(state.signatures).toHaveLength(0); expect(state.versions).toHaveLength(0);
  });

  it('refuses a content writer queued behind finalization and preserves the signed digest', async () => {
    const fixture = await finalizableProtocol('finalizer-first queued content');
    const blocker = await runtime.connect();
    let finalizeRequest: Promise<request.Response> | undefined;
    let editRequest: Promise<request.Response> | undefined;
    let held = false;
    try {
      await blocker.query('BEGIN'); held = true; await setTenantContextTx(blocker, orgId);
      const holderPid = Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await blocker.query('SELECT id FROM protocol_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE', [fixture.documentId, orgId]);
      finalizeRequest = request(app).post(`/api/protocol-development/documents/${fixture.documentId}/finalize`).set('Authorization', `Bearer ${actors.author.token}`).send({ reason: REASON, meaning: 'authorship', reauth: { password: PASSWORD } }).then((response) => response);
      const finalizerPid = await waitForParentWait(holderPid, '%SELECT protocol_kind, status, version%FROM protocol_documents%FOR UPDATE%');
      const newContent = 'A queued native QA edit changes the protocol narrative after the old editable-state check. This is isolated synthetic content.';
      editRequest = request(app).patch(`/api/protocol-development/sections/${fixture.sectionId}`).set('Authorization', `Bearer ${actors.editor.token}`).send({ reason: REASON, content: newContent, status: 'complete' }).then((response) => response);
      const writerPid = await waitForParentWait(holderPid, '%protocol_documents%', finalizerPid, finalizerPid);
      await blocker.query('COMMIT'); held = false;
      const finalized = await finalizeRequest; const edited = await editRequest;
      const state = await retainedState(fixture.documentId);
      const live = (await owner.query('SELECT content FROM protocol_sections WHERE id=$1 AND organization_id=$2', [fixture.sectionId, orgId])).rows[0];
      const signedDigest = state.signatures[0]?.bound_payload_digest ?? null;
      observe('finalizer-first-content-writer', { documentId: fixture.documentId, sectionId: fixture.sectionId, holderPid, finalizerPid, writerPid, finalizedStatus: finalized.status, finalizedError: finalized.body?.error?.code ?? null, writerStatus: edited.status, writerError: edited.body?.error?.code ?? null, status: state.document.status, signatures: state.signatures.length, versions: state.versions.length, queuedContentCommitted: live.content === newContent, signedDigest, currentDigest: state.currentDigest, digestMatches: signedDigest === state.currentDigest });
      expect(finalized.status).toBe(201);
      expect(edited.status, 'An edit checked before but committed after finalization must be refused.').toBe(409);
      expect(live.content).not.toBe(newContent);
      expect(state.signatures).toHaveLength(1);
      expect(signedDigest).toBe(state.currentDigest);
    } finally {
      if (held) await blocker.query('ROLLBACK').catch(() => undefined);
      blocker.release();
      await Promise.allSettled([finalizeRequest, editRequest].filter((pending): pending is Promise<request.Response> => Boolean(pending)));
    }
  });
});

describe('all protected original-protocol writes reserve the finalized parent', () => {
  it.each(parentWriters)('refuses $name queued after the actual finalizer without changing its content/version', async (writer) => {
    await assertFinalizerFirst(await protocolWithSoa(writer.name), writer);
  });

  it('uses same-client newly completed statuses rather than the old committed pool status', async () => {
    const fixture = await finalizableProtocol('same-client newly complete');
    await governedWriter(fixture, (client) => updateSectionTx(client, orgId, fixture.sectionId, { status: 'draft' }, actors.editor.id));
    expect((await scope(() => getCompleteness(orgId, fixture.documentId))).readyToFinalize).toBe(false);
    const result = await signedFinalize(fixture.documentId, async (client) => {
      await updateSectionTx(client, orgId, fixture.sectionId, { status: 'complete' }, actors.author.id);
      await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'update', target: `protocol-section:${fixture.sectionId}`, reason: REASON, domain: 'protocol_development', payload: { status: 'complete', testFixture: true } });
    });
    expect(result.finalized).toBe(true);
    const state = await retainedState(fixture.documentId);
    expect(state.signatures).toHaveLength(1); expect(state.signatures[0].bound_payload_digest).toBe(state.currentDigest);
  });

  it('refuses binding or unbinding a design queued behind finalization', async () => {
    const studyId = `${TAG}-design-${randomUUID()}`;
    await owner.query("INSERT INTO cdisc_prm_studies(tenant_id,study_id,protocol_id,protocol_title,protocol_version) VALUES($1,$2,$2,'Native synthetic QA design','0.1')", [orgId, studyId]);
    for (const operation of ['bind', 'unbind'] as const) {
      const fixture = await protocolWithSoa(`design-${operation}`);
      if (operation === 'unbind') await governedWriter(fixture, (client) => bindStudyDesignTx(client, orgId, fixture.documentId, studyId, actors.author.id));
      await assertFinalizerFirst(fixture, { name: `design-${operation}`, write: (client, current) => operation === 'bind' ? bindStudyDesignTx(client, orgId, current.documentId, studyId, actors.editor.id) : unbindStudyDesignTx(client, orgId, current.documentId) });
    }
  });

  it('keeps supplemental signedContent:false checks available after finalization', async () => {
    const fixture = await finalizableProtocol('supplemental register control');
    await signedFinalize(fixture.documentId);
    await expect(transaction((client) => requireProtocolForWriteTx(client, orgId, fixture.documentId, { signedContent: false }))).resolves.toBeUndefined();
    await expect(transaction((client) => requireProtocolForWriteTx(client, orgId, fixture.documentId, { signedContent: true }))).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const state = await retainedState(fixture.documentId);
    expect(state.signatures[0].bound_payload_digest).toBe(state.currentDigest);
  });
});

describe('mutable SoA rows and protocol visits cannot commit behind a finalization', () => {
  it.each(['set cell', 'clear cell', 'remove visit'] as const)('reserves parent before %s reaches a held child row', async (operation) => {
    const fixture = await protocolWithSoa(operation);
    const holder = await holdParent(fixture);
    const child = await runtime.connect();
    let signing: Promise<request.Response> | undefined;
    let writing: ReturnType<typeof governedWriter> | undefined;
    try {
      await child.query('BEGIN'); await setTenantContextTx(child, orgId);
      const childPid = Number((await child.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      if (operation === 'remove visit') await child.query('SELECT id FROM protocol_schedule_visits WHERE id=$1 AND organization_id=$2 FOR UPDATE', [fixture.visitId, orgId]);
      else await child.query('SELECT id FROM protocol_soa_cells WHERE id=$1 AND organization_id=$2 FOR UPDATE', [fixture.cellId, orgId]);
      signing = apiFinalize(fixture);
      const signerPid = await waitForParentWait(holder.pid, '%protocol_documents%FOR UPDATE%');
      writing = governedWriter(fixture, (client) => operation === 'set cell' ? setCellTx(client, orgId, actors.editor.id, { assessmentId: fixture.assessmentId, visitId: fixture.visitId, notes: 'Late native QA SoA note.' }) : operation === 'clear cell' ? clearCellTx(client, orgId, fixture.assessmentId, fixture.visitId) : removeVisitTx(client, orgId, fixture.documentId, fixture.visitId));
      const writerPid = await waitForParentWait(holder.pid, '%protocol_%', [childPid, signerPid], signerPid);
      await holder.client.query('COMMIT');
      const signed = await signing;
      const frozen = await protectedState(fixture);
      await child.query('COMMIT');
      const refused = await writing;
      const state = await retainedState(fixture.documentId);
      observe(`mutable-${operation}`, { signerPid, writerPid, signedStatus: signed.status, writer: refused, currentDigestMatches: state.signatures[0]?.bound_payload_digest === state.currentDigest });
      expect(signed.status).toBe(201); expect(refused).toEqual({ ok: false, code: 'INVALID_STATE' });
      expect(await protectedState(fixture)).toEqual(frozen);
      expect(state.signatures[0].bound_payload_digest).toBe(state.currentDigest);
    } finally {
      await holder.client.query('ROLLBACK').catch(() => undefined); holder.client.release();
      await child.query('ROLLBACK').catch(() => undefined); child.release();
      await Promise.allSettled([signing, writing].filter(Boolean));
    }
  });
});

describe('writer-first and stale snapshot finalization ordering', () => {
  it('signs the committed SoA content of an actual writer queued first', async () => {
    const fixture = await protocolWithSoa('writer first');
    const holder = await holdParent(fixture);
    let writing: ReturnType<typeof governedWriter> | undefined;
    let signing: Promise<request.Response> | undefined;
    try {
      writing = governedWriter(fixture, (client) => setCellTx(client, orgId, actors.editor.id, { assessmentId: fixture.assessmentId, visitId: fixture.visitId, notes: 'Committed first native QA SoA note.' }));
      const writerPid = await waitForParentWait(holder.pid, '%protocol_documents%FOR UPDATE%');
      signing = apiFinalize(fixture);
      await waitForParentWait(holder.pid, '%protocol_documents%FOR UPDATE%', writerPid, writerPid);
      await holder.client.query('COMMIT');
      const [written, signed] = await Promise.all([writing, signing]);
      expect(written.ok).toBe(true); expect(signed.status).toBe(201);
      const state = await retainedState(fixture.documentId);
      expect((await owner.query('SELECT notes FROM protocol_soa_cells WHERE id=$1 AND organization_id=$2', [fixture.cellId, orgId])).rows[0].notes).toBe('Committed first native QA SoA note.');
      expect(state.signatures[0].bound_payload_digest).toBe(state.currentDigest);
    } finally {
      await holder.client.query('ROLLBACK').catch(() => undefined); holder.client.release();
      await Promise.allSettled([writing, signing].filter(Boolean));
    }
  });

  it('refuses a stale repeatable-read finalizer queued behind the real SoA writer parent update', async () => {
    const fixture = await protocolWithSoa('repeatable-read stale census');
    const reader = await runtime.connect(); const writer = await runtime.connect();
    let finalizing: Promise<{ ok: boolean; code: string | null; message: string }> | undefined;
    try {
      await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ'); await setTenantContextTx(reader, orgId);
      await reader.query('SELECT status FROM protocol_documents WHERE id=$1 AND organization_id=$2', [fixture.documentId, orgId]);
      await writer.query('BEGIN'); await setTenantContextTx(writer, orgId);
      const writerPid = Number((await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await scope(() => setCellTx(writer, orgId, actors.editor.id, { assessmentId: fixture.assessmentId, visitId: fixture.visitId, notes: 'Current committed native QA SoA note.' }));
      finalizing = scope(() => finalizeProtocolTx(reader, orgId, actors.author.id, fixture.documentId)).then(
        () => ({ ok: true, code: null, message: '' }),
        (error: unknown) => ({ ok: false, code: (error as { code?: string }).code ?? 'UNKNOWN', message: error instanceof Error ? error.message : '' }),
      );
      await waitForParentWait(writerPid, '%protocol_documents%FOR UPDATE%');
      await writer.query('COMMIT');
      expect(await finalizing).toMatchObject({ ok: false, code: 'INVALID_STATE', message: expect.stringContaining('Reload and retry') });
      await reader.query('ROLLBACK');
      const state = await retainedState(fixture.documentId);
      expect(state.signatures).toHaveLength(0); expect(state.versions).toHaveLength(0);
      expect(state.document.status).not.toBe('finalized');
    } finally {
      await writer.query('ROLLBACK').catch(() => undefined); writer.release();
      await reader.query('ROLLBACK').catch(() => undefined); reader.release();
      await Promise.allSettled([finalizing].filter(Boolean));
    }
  });
});


describe('current-content signature binding and controlled export', () => {
  async function preservedHistory(documentId: number) {
    const target = finalizationTarget(documentId);
    return (await owner.query(`SELECT
      (SELECT to_jsonb(d) FROM protocol_documents d WHERE d.id=$1 AND d.organization_id=$2) AS document,
      (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) FROM protocol_sections s WHERE s.protocol_document_id=$1 AND s.organization_id=$2) AS source,
      (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]'::jsonb) FROM protocol_versions v WHERE v.protocol_document_id=$1 AND v.organization_id=$2) AS versions,
      (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) FROM electronic_signatures s WHERE s.signed_target=$3 AND s.organization_id=$2) AS signatures,
      (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM c2c_ana_actions a WHERE a.org_id=$2 AND (a.target=$3 OR a.target IN (SELECT 'protocol-section:'||id FROM protocol_sections WHERE protocol_document_id=$1 AND organization_id=$2))) AS actions,
      (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM audit_logs a WHERE a.tenant_id=$2) AS chain`, [documentId, orgId, target])).rows[0];
  }

  it('exports genuine clean finalized current content while preserving all retained rows', async () => {
    const fixture = await finalizableProtocol('clean current binding export');
    await signedFinalize(fixture.documentId);
    const before = await preservedHistory(fixture.documentId);
    const output = await scope(() => getProtocolExport(orgId, fixture.documentId));
    expect(output.document.finalization.state).toBe('signed');
    expect(output.markdown).toContain('**Status:** Finalized');
    expect(output.markdown).toContain('## Electronic signature');
    const response = await request(app).get(`/api/protocol-export/${fixture.documentId}`).set('Authorization', `Bearer ${actors.author.token}`);
    expect(response.status).toBe(200); expect(response.body.document.finalization.state).toBe('signed');
    expect(await preservedHistory(fixture.documentId)).toEqual(before);
  });

  it('holds a legacy digest drift export without rewriting the genuine signature or history', async () => {
    const fixture = await finalizableProtocol('retained historical signature drift');
    await signedFinalize(fixture.documentId);
    // Controlled out-of-band source corruption is a guard fixture, not a new
    // reproduction of the application writer race. The original evidence
    // probe already retained that actual pre-repair native race and signature.
    await owner.query('UPDATE protocol_sections SET content=$3 WHERE id=$1 AND organization_id=$2', [fixture.sectionId, orgId, 'An out-of-band synthetic QA content change after signing.']);
    const before = await preservedHistory(fixture.documentId);
    const signatureOf = await scope(() => readSignatureFacets(orgId, [finalizationTarget(fixture.documentId)]));
    expect(signatureOf(finalizationTarget(fixture.documentId))).toMatchObject({ state: 'changed', historicalIntegrity: 'verified' });
    await expect(scope(() => getProtocolExport(orgId, fixture.documentId))).rejects.toMatchObject({ code: 'SIGNATURE_CONTENT_CHANGED' });
    const response = await request(app).get(`/api/protocol-export/${fixture.documentId}`).set('Authorization', `Bearer ${actors.author.token}`);
    expect(response.status).toBe(409); expect(response.body.error.code).toBe('SIGNATURE_CONTENT_CHANGED');
    expect(response.body).not.toHaveProperty('markdown');
    const state = await retainedState(fixture.documentId);
    expect(state.document).toEqual({ status: 'finalized', version: '1.0' });
    expect(state.signatures).toHaveLength(1);
    expect(state.signatures[0].bound_payload_digest).not.toBe(state.currentDigest);
    expect(await preservedHistory(fixture.documentId)).toEqual(before);
  });

  it('holds export as unverified when canonical binding reads fail on the actual restricted snapshot', async () => {
    const fixture = await finalizableProtocol('verification delivery unavailable');
    await signedFinalize(fixture.documentId);
    const before = await preservedHistory(fixture.documentId);
    const client = await runtime.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await setTenantContextTx(client, orgId);
      const executor = { query: async (sql: string, params?: unknown[]) => {
        // Bounded transport failure, not a forged database verdict. Every
        // other read still reaches the native restricted client and real rows.
        if (sql.includes('SELECT id, protocol_kind, protocol_number, title, design_type')) throw new Error('Native QA injected binding-read delivery failure.');
        return client.query(sql, params);
      } };
      const signatureOf = await scope(() => readSignatureFacets(orgId, [finalizationTarget(fixture.documentId)], executor));
      expect(signatureOf(finalizationTarget(fixture.documentId))).toMatchObject({ state: 'unverified', historicalIntegrity: 'verified' });
      await expect(scope(() => getProtocolExport(orgId, fixture.documentId, { executor }))).rejects.toMatchObject({ code: 'SIGNATURE_VERIFICATION_UNAVAILABLE' });
      await client.query('COMMIT');
    } finally { await client.query('ROLLBACK').catch(() => undefined); client.release(); }
    expect(await preservedHistory(fixture.documentId)).toEqual(before);
  });

  it('does not upgrade an explicit read-committed executor into a verified current-content claim', async () => {
    const fixture = await finalizableProtocol('uncoordinated explicit executor');
    await signedFinalize(fixture.documentId);
    const client = await runtime.connect();
    try {
      await client.query('BEGIN READ ONLY'); await setTenantContextTx(client, orgId);
      const signatureOf = await scope(() => readSignatureFacets(orgId, [finalizationTarget(fixture.documentId)], client));
      expect(signatureOf(finalizationTarget(fixture.documentId))).toMatchObject({ state: 'unverified' });
      await expect(scope(() => getProtocolExport(orgId, fixture.documentId, { executor: client }))).rejects.toMatchObject({ code: 'SIGNATURE_VERIFICATION_UNAVAILABLE' });
      await client.query('COMMIT');
    } finally { await client.query('ROLLBACK').catch(() => undefined); client.release(); }
  });
});
