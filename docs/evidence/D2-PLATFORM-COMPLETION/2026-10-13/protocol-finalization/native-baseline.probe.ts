/** Evidence-only native baseline. Not included by canonical test configurations.
 * The safe invariants below intentionally go red on the unmodified protocol
 * finalizer. Fixtures are new QA records; no existing source/signature is edited. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../../../../../tests/setup.db';
import { getPool } from '../../../../../server/db/runtime';
import { runWithTenantScope } from '../../../../../server/db/tenantStore';
import { setTenantContextTx } from '../../../../../server/services/tenant/governed-tenant-context';
import { recordGovernedAction } from '../../../../../server/routes/c2c/actions';
import {
  createProtocolDocumentTx, updateSectionTx, addObjectiveTx, addEligibilityCriterionTx,
  addVisitTx, finalizeProtocolTx, getCompleteness,
} from '../../../../../server/services/protocol-development/protocol-development-service';
import { signProtocolAct } from '../../../../../server/services/protocol-development/protocol-signature';
import { BINDING_BASIS, deriveGovernedTargetBinding } from '../../../../../server/services/part11/signature-persistence';

const TAG = `protocol-native-probe-${process.pid}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
const PASSWORD = 'Protocol-Native-Evidence-Only-2026!';
const REASON = 'Exercise an isolated native protocol finalization transaction for QA evidence.';
const observations: Record<string, unknown> = { tag: TAG, database: 'platform_ci_native_recheck_20261013', cases: {} };
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
async function finalizableProtocol(label: string): Promise<{ documentId: number; sectionId: number; sectionKey: string }> {
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
    return { documentId, sectionId: Number(sections[0].id), sectionKey: String(sections[0].section_key) };
  });
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

async function waitForParentWait(holderPid: number, pattern: string, additionalBlockingPid?: number): Promise<number> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const waiting = await owner.query(`SELECT pid FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $2
        AND ($1::int=ANY(pg_blocking_pids(pid)) OR $3::int=ANY(pg_blocking_pids(pid)))`, [holderPid, pattern, additionalBlockingPid ?? holderPid]);
    if (waiting.rows.length) return Number(waiting.rows[0].pid);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The actual protocol request did not reach its expected native parent lock wait.');
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('Restricted APP_DATABASE_URL is required; an owner cannot prove runtime behavior.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 4 });
  expect((await owner.query('SELECT current_database() AS name')).rows[0].name).toBe('platform_ci_native_recheck_20261013');
  const organization = (await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id,uuid", [TAG])).rows[0];
  orgId = Number(organization.id); orgUuid = String(organization.uuid);
  expect(orgId).not.toBe(2);
  for (const key of ['author', 'editor'] as const) {
    const email = `${TAG}-${key}@example.invalid`;
    const person = (await owner.query("INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,$3,'active') RETURNING id", [email, `Native protocol ${key} ${TAG}`, await bcrypt.hash(PASSWORD, 4)])).rows[0];
    expect(Number(person.id)).not.toBe(25);
    await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'admin')", [orgId, person.id]);
    actors[key] = { id: Number(person.id), email, token: '' };
  }
  // Mint tokens after the membership timestamps without backdating any record.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const { activeJwtSecret } = await import('../../../../../server/utils/jwtVerify');
  for (const actor of Object.values(actors)) {
    actor.token = jwt.sign({ type: 'access', userId: actor.id, organizationId: String(orgId), role: 'admin' }, activeJwtSecret(), { expiresIn: '10m' });
  }
  const runtimeProof = await scope(() => getPool().query("SELECT current_database() AS database,current_user AS role,rolsuper,rolbypassrls,current_setting('app.rls_enforce') AS enforcement FROM pg_roles WHERE rolname=current_user"));
  expect(runtimeProof.rows[0]).toMatchObject({ database: 'platform_ci_native_recheck_20261013', role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on' });
  const stores = (await owner.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY(ARRAY['public.protocol_documents'::regclass,'public.protocol_sections'::regclass,'public.protocol_versions'::regclass,'public.electronic_signatures'::regclass,'public.c2c_ana_actions'::regclass]) ORDER BY relname")).rows;
  expect(stores).toHaveLength(5);
  expect(stores.every((store) => store.relrowsecurity && store.relforcerowsecurity)).toBe(true);
  observations.runtime = runtimeProof.rows[0]; observations.stores = stores; observations.organizationId = orgId;
  const { authMiddleware } = await import('../../../../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/protocol-development', authMiddleware, (await import('../../../../../server/routes/protocol-development')).default);
}, 120_000);

afterAll(async () => {
  writeFileSync(new URL('./native-observations.json', import.meta.url), JSON.stringify(observations, null, 2) + '\n');
  // Retain all fixture sources, signatures and audit history; close only this
  // process's connections. No shared schema, role or database is torn down.
  await runtime?.end();
  await getPool().end();
  await owner?.end();
});

describe('original protocol finalization — native baseline', () => {
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
      const finalizerPid = await waitForParentWait(holderPid, '%SELECT protocol_kind, status, version FROM protocol_documents%FOR UPDATE%');
      const newContent = 'A queued native QA edit changes the protocol narrative after the old editable-state check. This is isolated synthetic content.';
      editRequest = request(app).patch(`/api/protocol-development/sections/${fixture.sectionId}`).set('Authorization', `Bearer ${actors.editor.token}`).send({ reason: REASON, content: newContent, status: 'complete' }).then((response) => response);
      const writerPid = await waitForParentWait(holderPid, '%UPDATE protocol_documents SET status = CASE%', finalizerPid);
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
