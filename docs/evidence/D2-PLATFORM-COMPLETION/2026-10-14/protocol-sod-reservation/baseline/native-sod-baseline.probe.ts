/** Native baseline only: fresh isolated synthetic fixture, current actual APIs,
 * JWT/reauth, forced-RLS runtime, observed writer-before-signer parent queue.
 * No production policy/source changes; the independence invariant is expected
 * to fail on the pre-reservation ceremony. Retain every new source/audit/signature. */
import { afterAll, beforeAll, describe, expect, it } from '/workspace/ClinicalSageAI-2-replit/node_modules/vitest/dist/index.js';
import express from '/workspace/ClinicalSageAI-2-replit/node_modules/express/index.js';
import request from '/workspace/ClinicalSageAI-2-replit/node_modules/supertest/index.js';
import bcrypt from '/workspace/ClinicalSageAI-2-replit/node_modules/bcryptjs/index.js';
import jwt from '/workspace/ClinicalSageAI-2-replit/node_modules/jsonwebtoken/index.js';
import { Pool, type PoolClient } from '/workspace/ClinicalSageAI-2-replit/node_modules/pg/lib/index.js';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { databaseUrl } from '/workspace/ClinicalSageAI-2-replit/tests/setup.db';
import { getPool } from '/workspace/ClinicalSageAI-2-replit/server/db/runtime';
import { runWithTenantScope } from '/workspace/ClinicalSageAI-2-replit/server/db/tenantStore';
import { setTenantContextTx } from '/workspace/ClinicalSageAI-2-replit/server/services/tenant/governed-tenant-context';
import { recordGovernedAction } from '/workspace/ClinicalSageAI-2-replit/server/routes/c2c/actions';
import { createProtocolDocumentTx, updateSectionTx, addObjectiveTx, addEligibilityCriterionTx, addVisitTx }
  from '/workspace/ClinicalSageAI-2-replit/server/services/protocol-development/protocol-development-service';
import { deriveGovernedTargetBinding } from '/workspace/ClinicalSageAI-2-replit/server/services/part11/signature-persistence';
import { assertSignerIsNotAuthor, resolveTargetAuthors } from '/workspace/ClinicalSageAI-2-replit/server/services/governance/separation-of-duties';

const TAG = `protocol-sod-native-${process.pid}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
const isolatedId = () => 1_000_000 + Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000;
const PASSWORD = process.env.PROTOCOL_SOD_QA_PASSWORD;
if (!PASSWORD) throw new Error('Provide the private synthetic QA fixture credential.');
const REASON = 'Exercise one isolated synthetic protocol signing independence race; not clinical qualification.';
const report: Record<string, any> = { tag: TAG, scope: 'Native pre-fix baseline; genuine isolated synthetic protocol/audit/signature only', maxSignatureRequestsInProbe: 1, signatureRequestsStarted: 0, preserved: {}, cases: {} };
let owner: Pool; let runtime: Pool; let app: express.Express;
let orgId: number; let orgUuid: string;
const actors = {} as Record<'author' | 'approver', { id: number; token: string }>;
const scope = <T>(run: () => T): T => runWithTenantScope({ tenantId: String(orgId), orgUuid, role: 'admin', source: 'test', caller: TAG }, run);

async function tx<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  return scope(async () => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN'); await setTenantContextTx(client, orgId);
      const value = await run(client); await client.query('COMMIT'); return value;
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  });
}

async function preservationHash(): Promise<string> {
  const preserved = (await owner.query(`SELECT jsonb_build_object(
    'protocol',(SELECT to_jsonb(d) FROM protocol_documents d WHERE d.organization_id=18 AND d.id=9),
    'sections',(SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) FROM protocol_sections s WHERE s.organization_id=18 AND s.protocol_document_id=9),
    'versions',(SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]'::jsonb) FROM protocol_versions v WHERE v.organization_id=18 AND v.protocol_document_id=9),
    'signature',(SELECT to_jsonb(s) FROM electronic_signatures s WHERE s.organization_id=18 AND s.id=12),
    'user25',(SELECT to_jsonb(u) FROM users u WHERE u.id=25),
    'membership',(SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.user_id),'[]'::jsonb) FROM organization_users m WHERE m.organization_id=2 AND m.user_id=25)
  )::text AS value`)).rows[0].value;
  return createHash('sha256').update(preserved).digest('hex');
}

async function finalizableProtocol(): Promise<{ documentId: number; sectionId: number }> {
  return tx(async client => {
    const { id: documentId } = await createProtocolDocumentTx(client, orgId, actors.author.id, { protocolKind: 'clinical', title: `${TAG}: isolated synthetic SoD baseline`, phase: '1' });
    await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'create', target: `protocol-document:${documentId}`, reason: REASON, domain: 'protocol_development', payload: { testFixture: true } });
    const sections = (await client.query('SELECT id,section_key FROM protocol_sections WHERE protocol_document_id=$1 AND organization_id=$2 ORDER BY id', [documentId, orgId])).rows;
    for (const section of sections) {
      await updateSectionTx(client, orgId, Number(section.id), { content: `Synthetic QA ${section.section_key}; no scientific evidence or regulatory approval.`, status: 'complete' }, actors.author.id);
      await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'update', target: `protocol-section:${section.id}`, reason: REASON, domain: 'protocol_development', payload: { status: 'complete', testFixture: true } });
    }
    const objective = await addObjectiveTx(client, orgId, actors.author.id, documentId, { objective: 'Observe isolated signing independence.', endpoint: 'Observed native queue and signature outcome.', timepoint: 'At test execution' });
    const inclusion = await addEligibilityCriterionTx(client, orgId, actors.author.id, documentId, { kind: 'inclusion', criterion: 'Synthetic QA fixture only.' });
    const exclusion = await addEligibilityCriterionTx(client, orgId, actors.author.id, documentId, { kind: 'exclusion', criterion: 'No real clinical participant or clinical data.' });
    const visit = await addVisitTx(client, orgId, actors.author.id, documentId, { visitName: 'Synthetic QA visit', timepoint: 'Test execution' });
    await recordGovernedAction(client, { orgId, userId: actors.author.id, command: 'update', target: `protocol-document:${documentId}`, reason: REASON, domain: 'protocol_development', payload: { objectiveId: objective.id, inclusionId: inclusion.id, exclusionId: exclusion.id, visitId: visit.id, testFixture: true } });
    return { documentId, sectionId: Number(sections[0].id) };
  });
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

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('A real restricted APP_DATABASE_URL is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 4 });
  const dbName = new URL(process.env.APP_DATABASE_URL).pathname.slice(1);
  expect((await owner.query('SELECT current_database() AS name')).rows[0].name).toBe(dbName);
  report.preserved.before = await preservationHash();
  const organization = (await owner.query("INSERT INTO organizations(id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id,uuid", [isolatedId(), TAG])).rows[0];
  orgId = Number(organization.id); orgUuid = String(organization.uuid);
  expect([2, 18]).not.toContain(orgId);
  for (const key of ['author', 'approver'] as const) {
    const user = (await owner.query("INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,$3,$4,'active') RETURNING id", [isolatedId(), `${TAG}-${key}@example.invalid`, `Native isolated ${key} ${TAG}`, await bcrypt.hash(PASSWORD, 4)])).rows[0];
    expect(Number(user.id)).not.toBe(25);
    await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'admin')", [orgId, user.id]);
    actors[key] = { id: Number(user.id), token: '' };
  }
  await new Promise(resolve => setTimeout(resolve, 1100));
  const { activeJwtSecret } = await import('/workspace/ClinicalSageAI-2-replit/server/utils/jwtVerify');
  for (const actor of Object.values(actors)) actor.token = jwt.sign({ type: 'access', userId: actor.id, organizationId: String(orgId), role: 'admin' }, activeJwtSecret(), { expiresIn: '10m' });
  report.runtime = (await scope(() => getPool().query("SELECT current_database() AS database,current_user AS role,rolsuper,rolbypassrls,current_setting('app.rls_enforce') AS enforcement FROM pg_roles WHERE rolname=current_user"))).rows[0];
  expect(report.runtime).toMatchObject({ database: dbName, role: decodeURIComponent(new URL(process.env.APP_DATABASE_URL).username), rolsuper: false, rolbypassrls: false, enforcement: 'on' });
  report.stores = (await owner.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY(ARRAY['public.protocol_documents'::regclass,'public.protocol_sections'::regclass,'public.protocol_versions'::regclass,'public.electronic_signatures'::regclass,'public.c2c_ana_actions'::regclass]) ORDER BY relname")).rows;
  expect(report.stores).toHaveLength(5); expect(report.stores.every((row: any) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  report.organizationId = orgId; report.actorIds = { author: actors.author.id, approver: actors.approver.id };
  const { authMiddleware } = await import('/workspace/ClinicalSageAI-2-replit/server/auth');
  app = express(); app.use(express.json());
  app.use('/api/protocol-development', authMiddleware, (await import('/workspace/ClinicalSageAI-2-replit/server/routes/protocol-development')).default);
}, 120_000);

afterAll(async () => {
  if (owner) {
    report.preserved.after = await preservationHash();
    report.preserved.unchanged = report.preserved.before === report.preserved.after;
    expect(report.preserved.unchanged).toBe(true);
  }
  writeFileSync('/tmp/protocol-sod-baseline-observations.json', JSON.stringify(report, null, 2) + '\n');
  console.info('[protocol-sod-baseline:summary] ' + JSON.stringify(report));
  await runtime?.end(); await getPool().end(); await owner?.end();
});

describe('actual approval independence after an observed same-signer governed edit', () => {
  it('refuses approval after the queued signer becomes a recorded author before finalization obtains its parent', async () => {
    const fixture = await finalizableProtocol();
    const target = `protocol-document:${fixture.documentId}`;
    const holder = await runtime.connect();
    let writing: Promise<request.Response> | undefined; let signing: Promise<request.Response> | undefined;
    try {
      const before = await tx(client => resolveTargetAuthors(target, orgId, client));
      expect(before.authors).toContain(actors.author.id); expect(before.authors).not.toContain(actors.approver.id);
      await tx(client => assertSignerIsNotAuthor(target, orgId, actors.approver.id, { command: 'sign', meaning: 'approval', client }));
      await holder.query('BEGIN'); await setTenantContextTx(holder, orgId);
      const holderPid = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await holder.query('SELECT id FROM protocol_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE', [fixture.documentId, orgId]);
      const content = 'This genuine governed prose edit is authored by the pending approval signer. Synthetic QA only; no clinical claim.';
      writing = request(app).patch(`/api/protocol-development/sections/${fixture.sectionId}`).set('Authorization', `Bearer ${actors.approver.token}`).send({ reason: REASON, content, status: 'complete' }).then(response => response);
      const writerWait = await waitForLock(holderPid);
      report.signatureRequestsStarted += 1;
      signing = request(app).post(`/api/protocol-development/documents/${fixture.documentId}/finalize`).set('Authorization', `Bearer ${actors.approver.token}`).send({ reason: REASON, meaning: 'approval', reauth: { password: PASSWORD } }).then(response => response);
      const signerWait = await waitForLock(holderPid, Number(writerWait.pid), Number(writerWait.pid));
      expect(Number(signerWait.pid)).not.toBe(Number(writerWait.pid));
      expect(signerWait.blocking_pids).toContain(Number(writerWait.pid));
      const stillBefore = await tx(client => resolveTargetAuthors(target, orgId, client));
      expect(stillBefore.authors).not.toContain(actors.approver.id);
      await holder.query('COMMIT');
      const [edited, signed] = await Promise.all([writing, signing]);
      const after = await tx(client => resolveTargetAuthors(target, orgId, client));
      const binding = await tx(client => deriveGovernedTargetBinding(client, target, orgId));
      const document = (await owner.query('SELECT status,version FROM protocol_documents WHERE id=$1 AND organization_id=$2', [fixture.documentId, orgId])).rows[0];
      const section = (await owner.query('SELECT content,status FROM protocol_sections WHERE id=$1 AND organization_id=$2', [fixture.sectionId, orgId])).rows[0];
      const actions = (await owner.query('SELECT id,command,target,proposed_by,proposed_at,payload FROM c2c_ana_actions WHERE org_id=$1 AND (target=$2 OR target=$3) ORDER BY id', [orgId, target, `protocol-section:${fixture.sectionId}`])).rows;
      const signatures = (await owner.query('SELECT id,signer_id,signature_meaning AS meaning,binding_basis,bound_payload_digest,authentication_method,signature_manifest FROM electronic_signatures WHERE organization_id=$1 AND signed_target=$2 ORDER BY id', [orgId, target])).rows;
      const versions = (await owner.query('SELECT version,snapshot FROM protocol_versions WHERE organization_id=$1 AND protocol_document_id=$2 ORDER BY id', [orgId, fixture.documentId])).rows;
      const lineage = (await owner.query("SELECT count(*)::int AS rows FROM document_span_lineage WHERE organization_id=$1 AND document_table='protocol_sections' AND document_id=$2", [orgId, String(fixture.sectionId)])).rows[0];
      const signerEdit = actions.find(row => row.command === 'update' && row.target === `protocol-section:${fixture.sectionId}` && Number(row.proposed_by) === actors.approver.id);
      let currentIndependenceRefusal: string | null = null;
      try { await tx(client => assertSignerIsNotAuthor(target, orgId, actors.approver.id, { command: 'sign', meaning: 'approval', client })); }
      catch (error) { currentIndependenceRefusal = String((error as { code?: string }).code ?? 'UNKNOWN'); }
      const observed = { ...fixture, holderPid, writerWait, signerWait, authorsBefore: before, authorsBeforeRelease: stillBefore,
        writerStatus: edited.status, signerStatus: signed.status, signerErrorCode: signed.body?.error?.code ?? null,
        authorsAfter: after, currentIndependenceRefusal, document, changedProseRetained: section.content === content,
        sectionStatus: section.status, signerEditAction: signerEdit, lineageRows: lineage.rows,
        signatures: signatures.map(row => ({ id: row.id, signerId: row.signer_id, meaning: row.meaning, basis: row.binding_basis,
          authenticationMethod: row.authentication_method, digestMatchesCurrent: row.bound_payload_digest === binding.digest })),
        versionCount: versions.length, signActionIds: actions.filter(row => row.command === 'sign').map(row => row.id) };
      report.cases.writerFirstSignerSecond = observed;
      console.info('[protocol-sod-baseline:observed] ' + JSON.stringify(observed));
      expect(edited.status).toBe(201); expect(section.content).toBe(content); expect(section.status).toBe('complete');
      expect(signerEdit).toBeTruthy(); expect(after.authors).toContain(actors.approver.id);
      expect(currentIndependenceRefusal).toBe('SEPARATION_OF_DUTIES');
      // The intended invariant, red on the current unreserved SoD check.
      expect(signed.status, 'An approval signer who became an author before parent reservation must be refused.').toBe(403);
      expect(signed.body?.error?.code).toBe('SEPARATION_OF_DUTIES');
      expect(signatures).toHaveLength(0); expect(versions).toHaveLength(0);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined); holder.release();
      await Promise.allSettled([writing, signing].filter(Boolean));
    }
  }, 60_000);
});
