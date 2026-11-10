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
const retainedLearningOrganizations: number[] = [];
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

async function account(key: string, role: string, tenantId = orgId): Promise<Actor> {
  const user = (await owner.query(`INSERT INTO users(email,name,password_hash,status)
    VALUES($1,$2,$3,'active') RETURNING id`,
  [`${TAG}-${key}@example.invalid`, `${TAG} invented ${key}`, await bcrypt.hash(PASSWORD, 4)])).rows[0];
  const id = Number(user.id);
  await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [tenantId, id, role]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return { id, role, token: jwt.sign({ type: 'access', id: String(id), userId: String(id),
    organizationId: String(tenantId), role }, activeJwtSecret(), { expiresIn: '1h' }) };
}

function http(by: Actor, method: 'get' | 'post' | 'patch', path: string, body?: Record<string, unknown>) {
  return request(app)[method](path).set('Authorization', `Bearer ${by.token}`).send(body);
}

async function runtime<T>(by: Actor, work: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope({ tenantId: String(orgId), orgUuid, role: by.role, accountId: by.id,
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

/** The content digest of a change as its approver reads it in the register (GET /api/mdx/qms/changes): an approval
 *  signs only that content (2026-11-10). */
async function readDigest(changeId: number, by = signer): Promise<string> {
  const listed = await http(by, 'get', '/api/mdx/qms/changes', undefined);
  return (listed.body.data as { id: number; content_digest: string }[]).find((c) => Number(c.id) === changeId)!.content_digest;
}

async function signed(target: Target, act: 'approve' | 'retire', by = signer) {
  const path = target.type === 'document' ? 'documents' : 'changes';
  const read = target.type === 'change' ? { expectedContentDigest: await readDigest(target.id, by) } : {};
  return http(by, 'post', `/api/mdx/qms/${path}/${target.id}/${act}`, { password: PASSWORD,
    meaning: act === 'retire' ? 'retirement' : 'APPROVED', reason: REASON, ...read });
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
    await owner.query("UPDATE organizations SET status='inactive' WHERE id=ANY($1::int[])", [[orgId, ...retainedLearningOrganizations]]);
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

const bins = { classKey: 'source_identity_check', agency: 'fda', documentType: 'section' } as const;
type Donor = { id: number; uuid: string; actor: Actor; source: string; canary: string };
type Candidate = Awaited<ReturnType<typeof import('../../server/services/qms/controlled-document-service').prepareReviewedLearningCandidate>>;
const donors: Donor[] = [];
let curator: Actor;
let independent: Actor;
let programId: string;
let released: Candidate;
let altered: Candidate;
let installed: Awaited<ReturnType<typeof import('../../server/services/account-skill-bundles').installReviewedLearningSkill>>;
let alteredInstall: typeof installed;

async function donorRuntime<T>(donor: Donor, work: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope({ tenantId: String(donor.id), orgUuid: donor.uuid, accountId: donor.actor.id,
    role: donor.actor.role, source: 'request', caller: 'aggregate-learning-native-qa' }, work);
}

async function sourceCorrection(donor: Donor) {
  const { getPool } = await import('../../server/db');
  const { recordAuditedHumanCorrection } = await import('../../server/services/intelligence/ana-failure-learning');
  return donorRuntime(donor, async () => {
    const q = await getPool().connect();
    try {
      await q.query('BEGIN');
      const source = await recordAuditedHumanCorrection({ organizationId: donor.id, userId: donor.actor.id,
        ...bins, intent: 'Native synthetic source identity correction', outcome: 'edited', correctionText: donor.canary }, q);
      await q.query('COMMIT'); return source.sourceAuditEventId;
    } catch (error) { await q.query('ROLLBACK'); throw error; }
    finally { q.release(); }
  });
}

async function prepare(by = curator) {
  const { getPool } = await import('../../server/db');
  const { prepareReviewedLearningCandidate } = await import('../../server/services/qms/controlled-document-service');
  const pool = getPool();
  return runtime(by, () => prepareReviewedLearningCandidate({ pool, tenantId: orgId, actor: { id: String(by.id), email: null },
    audit: { pool, tenantId: orgId, actorId: String(by.id), actorEmail: 'unknown', actorRole: by.role,
      ipAddress: 'native-qa', userAgent: 'retained aggregate QA' } }, { ...bins, programId, reasonForChange: REASON }));
}

async function approveCandidate(candidate: Candidate) {
  const sent = await http(curator, 'patch', `/api/mdx/qms/documents/${candidate.documentId}`, { status: 'in_review', reason: REASON,
    route: { reviewers: [], approvers: [independent.id], order: 'parallel', approvalDueDate: '2099-01-01' } });
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  const doc = await signed({ id: candidate.documentId, type: 'document', target: `qms-document:${candidate.documentId}` }, 'approve', independent);
  expect(doc.status, JSON.stringify(doc.body)).toBe(200);
  const moved = await http(curator, 'post', `/api/mdx/qms/changes/${candidate.changeId}/transition`, { to: 'under_assessment', reason: REASON });
  expect(moved.status, JSON.stringify(moved.body)).toBe(200);
  return http(independent, 'post', `/api/mdx/qms/changes/${candidate.changeId}/approve`, { password: PASSWORD,
    meaning: 'APPROVED', reason: REASON, expectedContentDigest: await readDigest(candidate.changeId, independent),
    learningReview: { expectedArtifactSha256: candidate.artifactSha256, invariantAccepted: true } });
}

async function setupLearningFixture() {
  curator = await account('learning-curator', 'admin'); independent = await account('learning-independent', 'approver');
  for (const actor of [curator, independent]) await owner.query(`INSERT INTO platform_role_grants(user_id,role,granted_by,reason)
    VALUES($1,'platform_admin','native-qa',$2)`, [actor.id, REASON]);
  programId = randomUUID();
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
    VALUES($1,$2,$3,$4,'IND','drug','FDA','Invented aggregate QA product',$5,'active')`, [programId, orgId, `${TAG} learning`, `L-${TAG}`, curator.id]);
  const { seedNativeCatalogProject } = await import('./catalog-native-fixture');
  await seedNativeCatalogProject(owner, { organizationId: orgId, userId: curator.id, programId, namespace: `${TAG}-learning` });
  for (let n = 0; n < 3; n++) {
    const org = (await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id,uuid", [`${TAG}-donor-${n}`])).rows[0];
    retainedLearningOrganizations.push(Number(org.id));
    donors.push({ id: Number(org.id), uuid: String(org.uuid), actor: await account(`donor-${n}`, 'admin', Number(org.id)),
      source: '', canary: `${TAG}-PRIVATE_SOURCE_${n}: invented confidential client fact that must never become generic guidance.` });
  }
}

async function readInstalledLearning() {
  const { getPool } = await import('../../server/db');
  const { listOrgSkills, loadMandatorySkillGates } = await import('../../server/services/account-skill-bundles');
  return runtime(curator, async () => ({ skills: await listOrgSkills(getPool(), orgId),
    gates: await loadMandatorySkillGates(getPool(), orgId, null, curator.id) }));
}

function registerInstalledLearningProof() {
  it('installs the exact public receipt, loads it on a real next-task selection, and refuses duplicate or mutated content', async () => {
    const { getPool } = await import('../../server/db');
    const { installReviewedLearningSkill, updateOrgSkill } = await import('../../server/services/account-skill-bundles');
    const { loadReviewedLearningLibraryArtifact } = await import('../../server/services/qms/controlled-document-service');
    const actor = { userId: curator.id }, pool = getPool();
    const install = (candidate: Candidate, expectedArtifactSha256 = candidate.artifactSha256) => runtime(curator,
      () => installReviewedLearningSkill(pool, orgId, actor, { libraryVersionId: candidate.artifact.libraryVersionId, expectedArtifactSha256, reasonForChange: REASON }));
    await expect(install(released, '0'.repeat(64))).rejects.toMatchObject({ status: 409 });
    installed = await install(released); alteredInstall = await install(altered);
    await expect(install(released)).rejects.toMatchObject({ status: 409 });
    const library = await loadReviewedLearningLibraryArtifact(released.artifact.libraryVersionId);
    expect(installed.libraryReceipt).toEqual(library.receipt); expect(installed.instructions).toBe(library.instructions);
    expect((await readInstalledLearning()).skills.map(row => row.id)).toContain(installed.id);
    const { selectTurnSkills, renderSkillsBlock } = await import('../../server/services/ana/skills/turn-skills');
    const { orgSkillKey } = await import('../../shared/ana/skills');
    const selection = await runtime(curator, () => selectTurnSkills(pool, { organizationId: orgId, documentType: 'section',
      message: 'Review this synthetic section.', invokedKeys: [orgSkillKey(installed.bundleId)] }));
    const prompt = renderSkillsBlock(selection); expect(prompt).toContain(library.instructions);
    for (const donor of donors) expect(prompt).not.toContain(donor.canary);
    await expect(runtime(curator, () => updateOrgSkill(pool, orgId, installed.id, { ...installed, status: 'active',
      instructions: `${installed.instructions}x` }, { actor, reason: REASON }))).rejects.toMatchObject({ status: 409 });
  });
}

function registerCurrentLearningConsentProof() {
  it('rechecks the actual signing curator and current tenant consent/quorum on every future library read', async () => {
    const { getPool } = await import('../../server/db');
    const { loadReviewedLearningLibraryArtifact } = await import('../../server/services/qms/controlled-document-service');
    const { readLearningCohort } = await import('../../server/services/qms/changeControl.service');
    const { writeLearningContributionPolicy } = await import('../../server/services/tenant/tenant-settings-writer');
    await owner.query("UPDATE platform_role_grants SET revoked_at=now(),revoked_by='native-qa' WHERE user_id=$1 AND revoked_at IS NULL", [independent.id]);
    await expect(loadReviewedLearningLibraryArtifact(released.artifact.libraryVersionId)).rejects.toMatchObject({ status: 403 });
    await expect(readInstalledLearning()).rejects.toMatchObject({ status: 403 });
    await owner.query("INSERT INTO platform_role_grants(user_id,role,granted_by,reason) VALUES($1,'super_admin','native-qa',$2)", [independent.id, REASON]);
    await expect(loadReviewedLearningLibraryArtifact(released.artifact.libraryVersionId)).resolves.toHaveProperty('receipt');
    const donor = donors[0];
    await donorRuntime(donor, () => writeLearningContributionPolicy(getPool(), donor.id, donor.actor.id,
      { enabled: false, expectedVersion: 1, reasonForChange: REASON }));
    await expect(readLearningCohort(bins)).rejects.toMatchObject({ status: 409 });
    await expect(loadReviewedLearningLibraryArtifact(released.artifact.libraryVersionId)).rejects.toMatchObject({ status: 409 });
    await expect(readInstalledLearning()).rejects.toMatchObject({ status: 409 });
    await donorRuntime(donor, () => writeLearningContributionPolicy(getPool(), donor.id, donor.actor.id,
      { enabled: true, expectedVersion: 2, reasonForChange: REASON }));
    await expect(readLearningCohort(bins)).rejects.toMatchObject({ status: 409 });
    // An unaudited settings rollback cannot reactivate the original contributions.
    await owner.query(`UPDATE organizations SET settings=jsonb_set(settings::jsonb,'{learningContributionPolicy}',
      '{"enabled":true,"version":1}'::jsonb) WHERE id=$1`, [donor.id]);
    await expect(readLearningCohort(bins)).rejects.toMatchObject({ status: 409 });
    await expect(readInstalledLearning()).rejects.toMatchObject({ status: 409 });
    const held = (await owner.query("SELECT id FROM audit_logs WHERE tenant_id=$1 AND action='ana_pattern.contributed'", [donor.id])).rows;
    expect(held).toHaveLength(1); // Old consent and evidence remain retained; re-enabling does not revive them.
  });
}

describe('consented aggregate learning through actual controlled releases', () => {
  beforeAll(setupLearningFixture);

  it('requires explicit current opt-in and three distinct tenants, deduplicates actual correction receipts, and exports only coarse counts', async () => {
    const { getPool } = await import('../../server/db');
    const { writeLearningContributionPolicy, writeLearningPatternContribution } = await import('../../server/services/tenant/tenant-settings-writer');
    const { readLearningCohort } = await import('../../server/services/qms/changeControl.service');
    for (const donor of donors) {
      donor.source = await sourceCorrection(donor);
      const contribute = () => donorRuntime(donor, () => writeLearningPatternContribution(getPool(), donor.id, donor.actor.id,
        { classKey: bins.classKey, sourceAuditEventId: donor.source, reasonForChange: REASON }));
      await expect(contribute()).rejects.toMatchObject({ status: 403 });
      await donorRuntime(donor, () => writeLearningContributionPolicy(getPool(), donor.id, donor.actor.id,
        { enabled: true, expectedVersion: 0, reasonForChange: REASON }));
      expect(await contribute()).toMatchObject({ recorded: true, count: 1, policyVersion: 1 });
      expect(await contribute()).toMatchObject({ recorded: false, count: 0 });
      if (donor !== donors[2]) await expect(readLearningCohort(bins)).rejects.toMatchObject({ status: 409 });
    }
    expect(await readLearningCohort(bins)).toEqual({ tenantCount: 3, eventCount: 3, cohortMinimum: 3 });
  });

  it('refuses an organization administrator without a current persisted curator grant and leaves an unsigned candidate unusable', async () => {
    const ordinary = await account('ordinary-learning-admin', 'admin');
    await expect(prepare(ordinary)).rejects.toMatchObject({ status: 403 });
    released = await prepare();
    const { loadReviewedLearningLibraryArtifact } = await import('../../server/services/qms/controlled-document-service');
    await expect(loadReviewedLearningLibraryArtifact(released.artifact.libraryVersionId)).rejects.toMatchObject({ status: 403 });
    const doc = await targetState({ id: released.documentId, type: 'document', target: '' });
    expect(doc.status).toBe('draft');
    expect((await owner.query('SELECT id FROM qms_document_versions WHERE document_id=$1 AND organization_id=$2', [released.documentId, orgId])).rows).toHaveLength(0);
  });

  it('requires the exact artifact hash and explicit invariant on the actual independent change signature', async () => {
    const target: Target = { id: released.changeId, type: 'change', target: `qms-change:${released.changeId}` };
    expect((await http(curator, 'post', `/api/mdx/qms/changes/${target.id}/transition`, { to: 'under_assessment', reason: REASON })).status).toBe(200);
    const before = await retainedCounts(target);
    const body = { password: PASSWORD, meaning: 'APPROVED', reason: REASON, expectedContentDigest: await readDigest(target.id, independent) };
    for (const learningReview of [undefined, { expectedArtifactSha256: `${released.artifactSha256[0] === 'a' ? 'b' : 'a'}${released.artifactSha256.slice(1)}`, invariantAccepted: true }]) {
      const response = await http(independent, 'post', `/api/mdx/qms/changes/${target.id}/approve`, { ...body, ...(learningReview ? { learningReview } : {}) });
      expect(response.status, JSON.stringify(response.body)).toBe(409);
      expect(await retainedCounts(target)).toEqual(before);
    }
    const noInvariant = await http(independent, 'post', `/api/mdx/qms/changes/${target.id}/approve`, { ...body,
      learningReview: { expectedArtifactSha256: released.artifactSha256, invariantAccepted: false } });
    expect(noInvariant.status).toBe(400); expect(await retainedCounts(target)).toEqual(before);
  });

  it('creates real immutable document versions and two independent signatures before releasing public content without tenant sources', async () => {
    // This earlier transition was genuine; create a fresh candidate for the complete lifecycle.
    released = await prepare();
    const approved = await approveCandidate(released);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const { loadReviewedLearningLibraryArtifact } = await import('../../server/services/qms/controlled-document-service');
    const publicArtifact = await loadReviewedLearningLibraryArtifact(released.artifact.libraryVersionId);
    expect(publicArtifact.receipt).toMatchObject({ schemaVersion: 1, artifactSha256: released.artifactSha256 });
    expect(publicArtifact.receipt.signatureHash).toMatch(/^[a-f0-9]{64}$/);
    const version = (await owner.query("SELECT * FROM qms_document_versions WHERE document_id=$1 AND organization_id=$2 AND record_kind='signed'", [released.documentId, orgId])).rows;
    expect(version).toHaveLength(1); expect(Number(version[0].signature_id)).toBeGreaterThan(0);
    expect(version[0].sections).toHaveLength(1); expect(version[0].sections[0].code).toBe('learning-guidance');
    const changeSignature = (await owner.query("SELECT * FROM electronic_signatures WHERE organization_id=$1 AND signed_target=$2 AND signature_type='qms-change-approval'", [orgId, `qms-change:${released.changeId}`])).rows;
    expect(changeSignature).toHaveLength(1);
    expect(changeSignature[0].signature_manifest.learningReview).toMatchObject({ artifactSha256: released.artifactSha256, invariantAccepted: true });
    for (const donor of donors) for (const privateValue of [donor.canary, donor.source, donor.uuid]) expect(JSON.stringify(publicArtifact)).not.toContain(privateValue);
    altered = await prepare(); expect((await approveCandidate(altered)).status).toBe(200);
    await expect(loadReviewedLearningLibraryArtifact(altered.artifact.libraryVersionId)).resolves.toHaveProperty('receipt');
  });

  registerInstalledLearningProof();

  it('holds future reuse after a one-byte signed change mutation without changing retained document versions or signatures', async () => {
    const { loadReviewedLearningLibraryArtifact } = await import('../../server/services/qms/controlled-document-service');
    const before = await retainedCounts({ id: altered.changeId, type: 'change', target: `qms-change:${altered.changeId}` });
    await owner.query("UPDATE qms_change_controls SET impact_assessment=impact_assessment||'x' WHERE id=$1 AND organization_id=$2", [altered.changeId, orgId]);
    await expect(loadReviewedLearningLibraryArtifact(altered.artifact.libraryVersionId)).rejects.toMatchObject({ status: 403 });
    expect(await retainedCounts({ id: altered.changeId, type: 'change', target: `qms-change:${altered.changeId}` })).toEqual(before);
    expect((await owner.query('SELECT id FROM qms_document_versions WHERE document_id=$1 AND organization_id=$2', [altered.documentId, orgId])).rows).toHaveLength(1);
    await expect(readInstalledLearning()).rejects.toMatchObject({ status: 403 });
    const { getPool } = await import('../../server/db');
    const { updateOrgSkill } = await import('../../server/services/account-skill-bundles');
    await runtime(curator, () => updateOrgSkill(getPool(), orgId, alteredInstall.id, { ...alteredInstall, status: 'archived' },
      { actor: { userId: curator.id }, reason: REASON }));
    expect((await readInstalledLearning()).skills.map(row => row.id)).not.toContain(alteredInstall.id);
  });

  registerCurrentLearningConsentProof();
});
