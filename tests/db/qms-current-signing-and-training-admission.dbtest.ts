/** Actual QMS HTTP/signature writes on retained, synthetic native QA records. */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool, type PoolClient } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';

const TAG = `qms-current-${randomUUID().slice(0, 8)}`;
const PASSWORD = 'test-qms-native-admission-fixture';
const REASON = 'Independent review of invented QMS admission QA procedure.';
const originalRbacFlag = process.env.GOVERNANCE_RBAC_ENFORCE;
type Actor = { id: number; token: string; role: string };
type Target = { id: number; type: 'document' | 'change'; target: string };
let owner: Pool;
let orgId: number;
let orgUuid: string;
let app: express.Express;
let author: Actor;
let signer: Actor;
let viewer: Actor;
let secondViewer: Actor;

async function account(key: string, role: string): Promise<Actor> {
  const user = (await owner.query(`INSERT INTO users(email,name,password_hash,status)
    VALUES($1,$2,$3,'active') RETURNING id`,
  [`${TAG}-${key}@example.invalid`, `${TAG} invented ${key}`, await bcrypt.hash(PASSWORD, 4)])).rows[0];
  const id = Number(user.id);
  await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [orgId, id, role]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return { id, role, token: jwt.sign({ type: 'access', id: String(id), userId: String(id),
    organizationId: String(orgId), role }, activeJwtSecret(), { expiresIn: '1h' }) };
}

function http(by: Actor, method: 'get' | 'post', path: string, body?: Record<string, unknown>) {
  return request(app)[method](path).set('Authorization', `Bearer ${by.token}`).send(body);
}

async function runtime<T>(by: Actor, work: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope({ tenantId: String(orgId), orgUuid, role: by.role,
    source: 'request', caller: 'qms-current-native-qa' }, work);
}

async function draft(label: string): Promise<Target> {
  const row = (await owner.query(`INSERT INTO qms_documents
    (organization_id,doc_number,title,doc_type,version,status,author_id,metadata)
    VALUES($1,$2,$3,'sop','1.0','in_review',$4,$5::jsonb) RETURNING id`,
  [orgId, `${TAG}-${label}`, `${TAG} invented controlled procedure`, author.id,
    JSON.stringify({ sections: [{ key: 'procedure', label: 'Procedure', body: 'Keep the original invented QA record and state the correction reason.' }] })])).rows[0];
  return { id: Number(row.id), type: 'document', target: `qms-document:${row.id}` };
}

async function change(label: string): Promise<Target> {
  const row = (await owner.query(`INSERT INTO qms_change_controls
    (organization_id,change_number,title,status,proposed_by,impact_assessment,implementation_plan)
    VALUES($1,$2,$3,'under_assessment',$4,$5,$6) RETURNING id`,
  [orgId, `${TAG}-${label}`, `${TAG} invented controlled change`, author.id,
    'Invented QA change affects only this retained fixture.', 'Retain the original and independently review the proposed change.'])).rows[0];
  return { id: Number(row.id), type: 'change', target: `qms-change:${row.id}` };
}

function signed(target: Target, act: 'approve' | 'retire', by = signer) {
  const path = target.type === 'document' ? 'documents' : 'changes';
  return http(by, 'post', `/api/mdx/qms/${path}/${target.id}/${act}`, { password: PASSWORD, meaning: 'APPROVED', reason: REASON });
}

async function targetState(target: Target) {
  const sql = target.type === 'document'
    ? 'SELECT * FROM qms_documents WHERE id=$1 AND organization_id=$2'
    : 'SELECT * FROM qms_change_controls WHERE id=$1 AND organization_id=$2';
  return (await owner.query(sql, [target.id, orgId])).rows[0];
}

async function retainedCounts(target: Target) {
  const signatures = (await owner.query('SELECT id FROM electronic_signatures WHERE organization_id=$1 AND signed_target=$2', [orgId, target.target])).rows;
  const actions = (await owner.query('SELECT id FROM c2c_ana_actions WHERE org_id=$1 AND target=$2', [orgId, target.target])).rows;
  const audits = (await owner.query('SELECT id FROM audit_logs WHERE tenant_id=$1', [orgId])).rows;
  const receipts = target.type === 'document'
    ? (await owner.query('SELECT id FROM qms_training_records WHERE organization_id=$1 AND document_id=$2', [orgId, target.id])).rows : [];
  return { signatures: signatures.length, actions: actions.length, audits: audits.length, receipts: receipts.length };
}

async function waitForTargetWait(blockerPid: number) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const found = await owner.query(`SELECT pid FROM pg_stat_activity
      WHERE state='active' AND wait_event_type='Lock' AND $1::int=ANY(pg_blocking_pids(pid))
        AND (query LIKE '%qms_documents%' OR query LIKE '%qms_change_controls%')
        AND query LIKE '%FOR UPDATE%'`, [blockerPid]);
    if (found.rows.length === 1) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('The actual QMS request did not wait on its authoritative target lock.');
}

async function waitingSign(target: Target, act: 'approve' | 'retire', actor: Actor, duringWait: () => Promise<void>) {
  const blocker = await owner.connect();
  let pending: Promise<request.Response> | undefined;
  try {
    await blocker.query('BEGIN');
    const sql = target.type === 'document'
      ? 'SELECT id FROM qms_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE'
      : 'SELECT id FROM qms_change_controls WHERE id=$1 AND organization_id=$2 FOR UPDATE';
    await blocker.query(sql, [target.id, orgId]);
    const blockerPid = Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    pending = signed(target, act, actor).then(response => response);
    await waitForTargetWait(blockerPid);
    await duringWait();
    await blocker.query('COMMIT');
    return await pending;
  } finally {
    await blocker.query('ROLLBACK').catch(() => undefined);
    blocker.release();
    if (pending) await pending.catch(() => undefined);
  }
}

async function release(label: string) {
  const target = await draft(label);
  const response = await signed(target, 'approve');
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const read = await http(viewer, 'get', `/api/mdx/qms/documents/${target.id}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  expect(read.body.meta.training.eligible).toBe(true);
  return { target, context: read.body.meta.training, signatureId: Number(response.body.meta.signature.id) };
}

function acknowledge(target: Target, context: { documentVersion: string; contentDigest: string }, by = viewer) {
  return http(by, 'post', `/api/mdx/qms/documents/${target.id}/training-ack`, {
    documentVersion: context.documentVersion, contentDigest: context.contentDigest, understood: true, method: 'attestation',
  });
}

async function withdraw(target: Target) {
  const { pool } = await import('../../server/db');
  const { writeMutation, verifyReauth } = await import('../../server/routes/c2c/actions');
  const { checkSigningAuthority } = await import('../../server/services/part11/signing-authority-gate');
  // QMS target resolution is not exposed by the generic HTTP action router;
  // execute the canonical revocation writer, ledger and signature on runtime q.
  await runtime(signer, async () => {
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      expect(await checkSigningAuthority(signer.id, orgId, client)).toBeNull();
      expect((await verifyReauth(signer.id, { password: PASSWORD })).ok).toBe(true);
      await writeMutation('revoke-signature', { target: target.target, reason: REASON,
        payload: {}, reauth: { password: PASSWORD } }, signer.id, orgId, 'api', 'qms', client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  });
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  process.env.GOVERNANCE_RBAC_ENFORCE = 'false';
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = (await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id,uuid", [TAG])).rows[0];
  orgId = Number(org.id); orgUuid = String(org.uuid);
  author = await account('author', 'member'); signer = await account('signer', 'approver');
  viewer = await account('viewer', 'viewer'); secondViewer = await account('second-viewer', 'viewer');
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/mdx', authMiddleware, (await import('../../server/routes/mdx-qms')).default);
}, 120_000);

afterAll(async () => {
  if (originalRbacFlag == null) delete process.env.GOVERNANCE_RBAC_ENFORCE;
  else process.env.GOVERNANCE_RBAC_ENFORCE = originalRbacFlag;
  if (owner && orgId) {
    // Retain every signature, audit, procedure, action and receipt. No trigger
    // disable, privilege grant, historical deletion or table cleanup occurs.
    await owner.query("UPDATE organizations SET status='inactive' WHERE id=$1", [orgId]);
  }
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end(); await owner?.end();
});

describe('QMS current native signing and released training admission', () => {
  it('uses an actual non-owner NOSUPERUSER/NOBYPASSRLS runtime connection under tenant RLS', async () => {
    const { getPool } = await import('../../server/db');
    const row = await runtime(viewer, async () => (await getPool().query(`SELECT current_user AS who,rolsuper,rolbypassrls,
      current_setting('app.rls_enforce') AS enforcement,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_roles CROSS JOIN pg_class c WHERE rolname=current_user AND c.oid='qms_documents'::regclass`)).rows[0]);
    expect(row).toMatchObject({ rolsuper: false, rolbypassrls: false, enforcement: 'on', relrowsecurity: true, relforcerowsecurity: true });
    expect(row.who).not.toBe(row.owner);
  });

  it('binds a genuine independently signed release to a personal receipt and its canonical chained audit', async () => {
    const { target, context, signatureId } = await release('live-release');
    const before = await retainedCounts(target);
    const response = await acknowledge(target, context);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    expect(response.body.data).toMatchObject({ userId: viewer.id, documentId: target.id, contentDigest: context.contentDigest });
    const held = (await owner.query('SELECT * FROM electronic_signatures WHERE id=$1 AND organization_id=$2', [signatureId, orgId])).rows[0];
    expect(held).toMatchObject({ signed_target: target.target, signature_type: 'qms-document-approval', signer_id: signer.id,
      bound_payload_digest: context.contentDigest, is_valid: true });
    const after = await retainedCounts(target);
    expect(after.receipts).toBe(before.receipts + 1); expect(after.audits).toBe(before.audits + 1);
    expect(after.signatures).toBe(before.signatures);
  });

  it('withdraws current training after actual post-release revocation while retaining the old personal receipt and signature history', async () => {
    const { target, context, signatureId } = await release('withdrawn-release');
    expect((await acknowledge(target, context)).status).toBe(201);
    const original = await targetState(target);
    await withdraw(target);
    const withdrawn = (await owner.query('SELECT is_valid,verification_status,superseded_by FROM electronic_signatures WHERE id=$1', [signatureId])).rows[0];
    expect(withdrawn).toMatchObject({ is_valid: false, verification_status: 'revoked' });
    expect(withdrawn.superseded_by).not.toBeNull();
    expect(await targetState(target)).toEqual(original);
    const before = await retainedCounts(target);
    const response = await acknowledge(target, context, secondViewer);
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(await retainedCounts(target)).toEqual(before);
    const read = await http(viewer, 'get', `/api/mdx/qms/documents/${target.id}`);
    expect(read.status).toBe(200); expect(read.body.meta.training.eligible).toBe(false);
    // The viewer is assigned by name (P-49: compliance counts the people assigned); their receipt of the withdrawn release no longer counts.
    await owner.query('INSERT INTO qms_training_assignments (organization_id, document_id, user_id, assigned_by) VALUES ($1, $2, $3, $4)',
      [orgId, target.id, viewer.id, signer.id]);
    const coverage = await http(viewer, 'get', '/api/mdx/qms/training/compliance');
    expect(coverage.status).toBe(200);
    expect(coverage.body.data.find((row: { id: number }) => row.id === target.id)).toMatchObject({ eligible: false, assignment: 'assigned', current: 0, of: 1 });
    expect(before.receipts).toBe(1); expect(before.signatures).toBe(2);
  });

  it.each(['approve', 'retire', 'change'] as const)('refuses %s after actual target wait and signer demotion without domain/audit/signature writes', async kind => {
    const actor = await account(`demoted-${kind}`, 'approver');
    const target = kind === 'change' ? await change('demoted-change') : await draft(`demoted-${kind}`);
    const before = await retainedCounts(target); const original = await targetState(target);
    const response = await waitingSign(target, kind === 'retire' ? 'retire' : 'approve', actor, async () => {
      await owner.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [orgId, actor.id]);
    });
    expect(response.status, JSON.stringify(response.body)).toBe(403);
    expect(await targetState(target)).toEqual(original); expect(await retainedCounts(target)).toEqual(before);
  }, 60_000);

  it('refuses an actor disabled during the actual target wait', async () => {
    const actor = await account('disabled-waiter', 'approver'); const target = await draft('disabled-waiter');
    const before = await retainedCounts(target); const original = await targetState(target);
    const response = await waitingSign(target, 'approve', actor, async () => {
      await owner.query("UPDATE users SET status='inactive' WHERE id=$1", [actor.id]);
    });
    expect(response.status, JSON.stringify(response.body)).toBe(403);
    expect(await targetState(target)).toEqual(original); expect(await retainedCounts(target)).toEqual(before);
  }, 60_000);

  it('allows a genuinely authorized signer through the same actual target wait', async () => {
    const target = await draft('unchanged-waiter'); const before = await retainedCounts(target);
    const response = await waitingSign(target, 'approve', signer, async () => {});
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect((await targetState(target)).status).toBe('effective');
    const after = await retainedCounts(target);
    expect(after.signatures).toBe(before.signatures + 1); expect(after.actions).toBe(before.actions + 1);
    expect(after.audits).toBe(before.audits + 1);
  }, 60_000);

  it('honors an actual strict resource denial added during the target wait', async () => {
    process.env.GOVERNANCE_RBAC_ENFORCE = 'true';
    try {
      const actor = await account('resource-waiter', 'reviewer'); const target = await draft('resource-waiter');
      const before = await retainedCounts(target); const original = await targetState(target);
      const response = await waitingSign(target, 'approve', actor, async () => {
        await owner.query("INSERT INTO c2c_governance_grants(org_id,role,action,resource_type,effect) VALUES($1,'reviewer','sign','qms-document','deny')", [orgId]);
      });
      expect(response.status, JSON.stringify(response.body)).toBe(403);
      expect(await targetState(target)).toEqual(original); expect(await retainedCounts(target)).toEqual(before);
    } finally { process.env.GOVERNANCE_RBAC_ENFORCE = 'false'; }
  }, 60_000);
});
