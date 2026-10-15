/** Prepared native current-authority regression. Real authenticated protocol APIs,
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
import { checkSigningAuthority } from '../../server/services/part11/signing-authority-gate';
import { isSigningAuthorized, signingAuthorityRoles } from '../../server/services/part11/signing-authority';

const TAG = `protocol-authority-native-${process.pid}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
const isolatedId = () => 1_000_000 + Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000;
// Generated only for this file's fresh QA accounts; never logged or retained.
const PASSWORD = randomUUID();
const REASON = 'Exercise post-parent current signing authority with isolated synthetic QA content.';
const cases: Record<string, unknown> = {};
const report: Record<string, unknown> = { tag: TAG, cases, signatureRequestsStarted: 0, scope: 'Actual native protocol APIs; synthetic QA only' };
let owner: Pool;
let runtime: Pool;
let app: express.Express;
let orgId: number;
let orgUuid: string;
type ActorKey = 'author' | 'independent';
const actors = {} as Record<ActorKey, { id: number; token: string }>;
const attempts = { author: 0, independent: 0 };
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
  console.info(`[protocol-authority-after-parent:${name}] ${JSON.stringify(value)}`);
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
  for (const key of ['author', 'independent'] as const) {
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
    if (process.env.PROTOCOL_AUTHORITY_OBSERVATIONS) writeFileSync(process.env.PROTOCOL_AUTHORITY_OBSERVATIONS, JSON.stringify(report, null, 2) + '\n');
    console.info('[protocol-authority-after-parent:summary] ' + JSON.stringify(report));
    expect(Object.values(attempts).every(count => count <= 1)).toBe(true);
  } finally {
    await runtime?.end();
    await getPool().end();
    await owner?.end();
  }
});

/** Existing membership policy only; authority is not inferred from JWT role. */
async function membership() {
  return (await owner.query(`SELECT ou.organization_id,ou.user_id,ou.role,u.status AS user_status
    FROM organization_users ou JOIN users u ON u.id=ou.user_id
    WHERE ou.organization_id=$1 AND ou.user_id=$2`, [orgId, actors.independent.id])).rows[0];
}

/** All relevant fresh protocol history, excluding the deliberate membership
 * role change. Canonical jsonb text gives stable full-row preservation bytes. */
async function fullDocumentDigest(fixture: Fixture) {
  const text = (await owner.query(`SELECT jsonb_build_object(
    'protocol',(SELECT to_jsonb(d) FROM protocol_documents d WHERE d.id=$1 AND d.organization_id=$2),
    'sections',(SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) FROM protocol_sections s WHERE s.protocol_document_id=$1 AND s.organization_id=$2),
    'versions',(SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]'::jsonb) FROM protocol_versions v WHERE v.protocol_document_id=$1 AND v.organization_id=$2),
    'signatures',(SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) FROM electronic_signatures s WHERE s.organization_id=$2 AND s.signed_target=$3),
    'lineage',(SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb) FROM document_span_lineage l WHERE l.organization_id=$2 AND l.document_table='protocol_sections' AND l.document_id IN (SELECT id::text FROM protocol_sections WHERE organization_id=$2 AND protocol_document_id=$1)),
    'actions',(SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM c2c_ana_actions a WHERE a.org_id=$2),
    'audit',(SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM audit_logs a WHERE a.tenant_id=$2)
    )::text AS state`, [fixture.documentId, orgId, `protocol-document:${fixture.documentId}`])).rows[0].state;
  return digest(text);
}

type ProtocolState = Awaited<ReturnType<typeof state>>;
function assertWrongSuccessIsGenuine(fixture: Fixture, after: ProtocolState, signed: request.Response, binding: Awaited<ReturnType<typeof deriveGovernedTargetBinding>>) {
  const signature = after.signatures[0];
  expect(after.signatures).toHaveLength(1);
  expect(after.versions).toHaveLength(1);
  expect(after.document).toMatchObject({ status: 'finalized', version: '1.0', finalized_by: actors.independent.id });
  expect(signature).toMatchObject({ id: signed.body.signatureId, signer_id: actors.independent.id, meaning: 'approval', authentication_method: 'password', second_factor_verified: false, binding_basis: BINDING_BASIS.PROTOCOL_DOCUMENT_CONTENT });
  expect(signature.bound_payload_digest).toBe(binding.digest);
  expect(signature.signature_hash).toBe(manifestSignatureHash(signature.signature_manifest));
  expect(signature.signature_manifest).toMatchObject({ organizationId: orgId, target: `protocol-document:${fixture.documentId}`, signerId: actors.independent.id, meaning: 'approval', actionId: signed.body.actionId, auditId: signed.body.auditId });
  expect(after.actions.find(row => row.id === signed.body.actionId)).toMatchObject({ command: 'sign', target: `protocol-document:${fixture.documentId}`, state: 'executed', audit_row_id: signed.body.auditId });
  expect(after.audits.find(row => row.id === signed.body.auditId)).toMatchObject({ action: 'c2c.work.sign', target: `protocol-document:${fixture.documentId}`, ana_action_id: signed.body.actionId });
}

async function refusesDemotedSignerAfterParentWait() {
  expect(isSigningAuthorized('admin')).toBe(true);
  expect(isSigningAuthorized('member')).toBe(false);
  report.signingPolicyRoles = signingAuthorityRoles();
  const fixture = await finalizableProtocol('signer role demoted while waiting');
  const target = `protocol-document:${fixture.documentId}`;
  const before = await state(fixture);
  const beforeDigest = await fullDocumentDigest(fixture);
  const roleBefore = await membership();
  expect(roleBefore).toMatchObject({ organization_id: orgId, user_id: actors.independent.id, role: 'admin', user_status: 'active' });
  expect(await scope(() => checkSigningAuthority(actors.independent.id, orgId))).toBeNull();
  await tx(client => assertSignerIsNotAuthor(target, orgId, actors.independent.id, { command: 'sign', meaning: 'approval', client }));
  expect((await scope(() => getCompleteness(orgId, fixture.documentId))).readyToFinalize).toBe(true);
  const holder = await runtime.connect();
  let signing: Promise<request.Response> | undefined;
  try {
    await holder.query('BEGIN');
    await setTenantContextTx(holder, orgId);
    const holderPid = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await holder.query('SELECT id FROM protocol_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE', [fixture.documentId, orgId]);
    signing = finalize(fixture, 'independent', 'approval');
    const signerWait = await waitForLock(holderPid);
    // The real route can reach this lock only after its precredential authority
    // check and genuine password reauthentication; no gate is intercepted.
    expect(signerWait.blocking_pids).toContain(holderPid);
    expect(await fullDocumentDigest(fixture)).toBe(beforeDigest);
    const demoted = await owner.query(`UPDATE organization_users SET role=$3
      WHERE organization_id=$1 AND user_id=$2 AND role=$4 RETURNING organization_id,user_id,role`, [orgId, actors.independent.id, 'member', 'admin']);
    expect(demoted.rowCount).toBe(1);
    const roleAfter = await membership();
    const freshAuthority = await scope(() => checkSigningAuthority(actors.independent.id, orgId));
    expect(roleAfter).toMatchObject({ organization_id: orgId, user_id: actors.independent.id, role: 'member', user_status: 'active' });
    expect(freshAuthority).toMatchObject({ status: 403, code: 'ESIGNATURE_NO_AUTHORITY' });
    expect(await fullDocumentDigest(fixture)).toBe(beforeDigest);
    await holder.query('COMMIT');
    const signed = await signing;
    const after = await state(fixture);
    const afterDigest = await fullDocumentDigest(fixture);
    const binding = await tx(client => deriveGovernedTargetBinding(client, target, orgId));
    const authorsAfter = await tx(client => resolveTargetAuthors(target, orgId, client));
    observe('roleDemotedAfterPreflight', { ...fixture, holderPid, signerWait, roleBefore, roleAfter, freshAuthority,
      signerStatus: signed.status, signerErrorCode: signed.body?.error?.code ?? null, document: after.document,
      signatureCount: after.signatures.length, versionCount: after.versions.length,
      signatureId: after.signatures[0]?.id ?? null, digestMatchesCurrent: after.signatures[0]?.bound_payload_digest === binding.digest,
      signActionCount: after.actions.filter(row => row.command === 'sign').length,
      signAuditCount: after.audits.filter(row => row.action === 'c2c.work.sign').length,
      beforeDocumentStateDigest: beforeDigest, afterDocumentStateDigest: afterDigest, authorsAfter });
    if (signed.status === 201) assertWrongSuccessIsGenuine(fixture, after, signed, binding);
    // This is intentionally red on the pre-repair code, not an expected-201
    // test that could hide the gap. Preserve its genuine failure and history.
    expect(signed.status, 'A signer demoted before parent reservation must be refused by current canonical signing policy.').toBe(403);
    expect(signed.body?.error?.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(afterDigest).toBe(beforeDigest);
    expect(after.document).toEqual(before.document);
    expect(after.signatures).toHaveLength(0);
    expect(after.versions).toHaveLength(0);
    expect(after.actions).toEqual(before.actions);
    expect(after.audits).toEqual(before.audits);
    expect(after.lineage).toEqual(before.lineage);
    expect(after.sections).toEqual(before.sections);
    expect(signed.body).not.toHaveProperty('signatureId');
  } finally {
    await holder.query('ROLLBACK').catch(() => undefined);
    holder.release();
    await Promise.allSettled([signing].filter(Boolean));
  }
}

describe('native current signing role after parent reservation', () => {
  it('refuses a signer demoted after preflight while waiting for the actual protocol parent', refusesDemotedSignerAfterParentWait, 60_000);
});
