/** Actual provisioned PostgreSQL, non-superuser/FORCE RLS, real HTTP protocol
 * consumers and canonical signature helpers. Fixture data is synthetic. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool, type PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { databaseUrl } from '../setup.db';
import { applySessionScope, clearSessionScope } from '../../server/db/sessionScope';
import { buildRlsStartupOptions } from '../../server/db/rlsEnforcement';

const ORG = 93580;
const FOREIGN_ORG = 93581;
const PROGRAM = '11111111-2222-4333-8444-000000093580';
const FOREIGN_PROGRAM = '11111111-2222-4333-8444-000000093581';
const PASSWORD = 'Synthetic-Protocol-Rls-2026!';
const REASON = 'Synthetic audit proof of pinned protocol connection';
const BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const SECRET = Buffer.from('12345678901234567890');
let owner: Pool;
let runtime: Pool;
let app: express.Express;
let userId: number;
let foreignUserId: number;
let docId: number;
let foreignId: number;
let token: string;

function totp() {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = crypto.createHmac('sha1', SECRET).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
function encryptedSecret() {
  const key = crypto.createHash('sha256').update(process.env.MFA_ENCRYPTION_KEY!).digest();
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const text = Buffer.concat([cipher.update(BASE32), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${text.toString('hex')}`;
}
async function scoped<T>(run: (client: PoolClient) => Promise<T>, orgId = ORG) {
  const client = await runtime.connect();
  try { await applySessionScope(client, { tenantId: String(orgId), role: 'admin' }); return await run(client); }
  finally { await clearSessionScope(client); client.release(); }
}
const read = (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`);
const post = (path: string, body: Record<string, unknown>) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body);

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL required for non-superuser protocol proof.');
  process.env.MFA_ENCRYPTION_KEY ||= 'synthetic-protocol-signer-encryption-key-only';
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, options: buildRlsStartupOptions(), max: 2 });
  await owner.query(`INSERT INTO organizations (id,name,slug,status) VALUES ($1,'Synthetic protocol audit','synthetic-protocol-audit','active'),($2,'Synthetic foreign protocol audit','synthetic-foreign-protocol-audit','active')
    ON CONFLICT(id) DO UPDATE SET status='active'`, [ORG, FOREIGN_ORG]);
  const account = await owner.query(`INSERT INTO users (email,name,password_hash,status) VALUES ('synthetic-protocol-rls@example.invalid','Synthetic Protocol Author',$1,'active')
    ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,status='active',mfa_enabled=false,mfa_secret=NULL,mfa_totp_last_step=NULL,
      failed_login_attempts=0,locked_until=NULL,password_changed_at=NULL,sessions_ended_at=NULL RETURNING id`, [await bcrypt.hash(PASSWORD, 4)]);
  userId = Number(account.rows[0].id);
  await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at) VALUES ($1,$2,'admin',now()-interval '1 day')
    ON CONFLICT(user_id,organization_id) DO UPDATE SET role='admin',created_at=EXCLUDED.created_at`, [ORG, userId]);
  const foreignAccount = await owner.query(`INSERT INTO users (email,name,password_hash,status,mfa_enabled,mfa_secret,failed_login_attempts)
    VALUES ('synthetic-foreign-protocol-rls@example.invalid','Synthetic Foreign Protocol Author',$1,'active',true,$2,3)
    ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,status='active',mfa_enabled=true,mfa_secret=EXCLUDED.mfa_secret,
      mfa_totp_last_step=NULL,failed_login_attempts=3,locked_until=NULL RETURNING id`, [await bcrypt.hash(PASSWORD, 4), encryptedSecret()]);
  foreignUserId = Number(foreignAccount.rows[0].id);
  await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at) VALUES ($1,$2,'admin',now()-interval '1 day')
    ON CONFLICT(user_id,organization_id) DO UPDATE SET role='admin'`, [FOREIGN_ORG, foreignUserId]);
  await owner.query(`INSERT INTO regulatory_programs (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
    VALUES ($1,$2,'Synthetic protocol program','SYN-NATIVE','ind','small_molecule','FDA','Synthetic protocol product',$3),($4,$5,'Synthetic foreign protocol program','SYN-FOREIGN','ind','small_molecule','FDA','Synthetic foreign protocol product',$3)
    ON CONFLICT(id) DO UPDATE SET deleted_at=NULL`, [PROGRAM, ORG, userId, FOREIGN_PROGRAM, FOREIGN_ORG]);
  const foreign = await owner.query('INSERT INTO protocol_documents (organization_id,protocol_kind,title,created_by,program_id) VALUES ($1,\'clinical\',\'Synthetic foreign protocol\',$2,$3) RETURNING id', [FOREIGN_ORG, userId, FOREIGN_PROGRAM]);
  foreignId = Number(foreign.rows[0].id);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  token = jwt.sign({ type: 'access', userId, organizationId: String(ORG), role: 'admin' }, activeJwtSecret(), { expiresIn: '1h' });
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/protocol-dev', authMiddleware, (await import('../../server/routes/protocol-dev.routes')).default);
  app.use('/api/protocol-development', authMiddleware, (await import('../../server/routes/protocol-development')).default);
});
afterAll(async () => {
  if (owner) await owner.end();
  if (runtime) await runtime.end();
  const { getPool } = await import('../../server/db/runtime'); await getPool().end();
});

describe('native protocol consumers on the request connection', () => {
  it('uses a genuine non-superuser without BYPASSRLS and deployed FORCE RLS policies', async () => {
    const who = await runtime.query('SELECT rolsuper,rolbypassrls,current_user AS role FROM pg_roles WHERE rolname=current_user');
    expect(who.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect(who.rows[0].role).not.toBe('postgres');
    const tables = await owner.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('protocol_documents'::regclass,'protocol_sections'::regclass,'users'::regclass,'organization_users'::regclass)");
    expect(tables.rows).toHaveLength(4); expect(tables.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });
  it('creates through the actual governed HTTP route and reads list/detail/index/full projection under FORCE RLS', async () => {
    const created = await post('/api/protocol-development/documents', { programId: PROGRAM, protocolKind: 'clinical', title: 'Synthetic native protocol', reason: REASON });
    expect(created.status, JSON.stringify(created.body)).toBe(201); docId = Number(created.body.id);
    expect(created.body.actionId).toBeTruthy(); expect(created.body.auditId).toBeTruthy();
    const list = await read('/api/protocol-development/documents'); expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.some((row: { id: number }) => row.id === docId)).toBe(true);
    const detail = await read(`/api/protocol-development/documents/${docId}`); expect(detail.status).toBe(200);
    expect(detail.body.sections.length).toBeGreaterThan(0); expect(detail.body.organization_id).toBe(ORG);
    const index = await read(`/api/protocol-dev?programId=${PROGRAM}&view=index`); expect(index.status, JSON.stringify(index.body)).toBe(200);
    expect(index.body.data.some((row: { id: string }) => row.id === String(docId))).toBe(true);
    const full = await read(`/api/protocol-dev?programId=${PROGRAM}&documentId=${docId}`); expect(full.status, JSON.stringify(full.body)).toBe(200);
    expect(full.body.data).toHaveLength(1); expect(full.body.data[0].id).toBe(String(docId)); expect(full.body.data[0].sections.length).toBeGreaterThan(0);
    expect((await runtime.query('SELECT id FROM protocol_documents WHERE organization_id=$1', [ORG])).rows).toEqual([]);
  });
  it('retains foreign tenant/record refusal and cannot create under a foreign program', async () => {
    expect((await read(`/api/protocol-development/documents/${foreignId}`)).status).toBe(404);
    const index = await read(`/api/protocol-dev?programId=${FOREIGN_PROGRAM}&view=index`); expect(index.status).toBe(200); expect(index.body.data).toEqual([]);
    const foreign = await post('/api/protocol-development/documents', { programId: FOREIGN_PROGRAM, protocolKind: 'clinical', title: 'Forbidden synthetic create', reason: REASON });
    expect(foreign.status).toBe(404);
  });
  it('computes completeness and records structured edits/version on the pinned request transaction', async () => {
    const completeness = await read(`/api/protocol-development/documents/${docId}/completeness`); expect(completeness.status).toBe(200);
    expect(completeness.body.requiredTotal).toBeGreaterThan(0); expect(completeness.body.readyToFinalize).toBe(false);
    const objective = await post(`/api/protocol-development/documents/${docId}/objectives`, { objective: 'Synthetic primary objective', endpoint: 'Synthetic endpoint', reason: REASON });
    expect(objective.status, JSON.stringify(objective.body)).toBe(201);
    expect((await post(`/api/protocol-development/documents/${docId}/eligibility`, { kind: 'inclusion', criterion: 'Synthetic inclusion', reason: REASON })).status).toBe(201);
    expect((await post(`/api/protocol-development/documents/${docId}/eligibility`, { kind: 'exclusion', criterion: 'Synthetic exclusion', reason: REASON })).status).toBe(201);
    expect((await post(`/api/protocol-development/documents/${docId}/visits`, { visitName: 'Synthetic baseline', reason: REASON })).status).toBe(201);
    const version = await post(`/api/protocol-development/documents/${docId}/versions`, { reason: REASON }); expect(version.status, JSON.stringify(version.body)).toBe(201);
    const detail = await read(`/api/protocol-development/documents/${docId}`); expect(detail.body.objectives).toHaveLength(1); expect(detail.body.versions).toHaveLength(1);
  });
  it('reads current signer authority, verifies real bcrypt and durably records wrong-password lockout', async () => {
    const { checkSigningAuthority } = await import('../../server/services/part11/signing-authority-gate');
    const { signerReverificationDeps } = await import('../../server/services/part11/reverify-signer-deps');
    const { reverifySigner } = await import('../../server/services/part11/reverify-signer');
    await scoped(async client => {
      expect(await checkSigningAuthority(userId, ORG, client)).toBeNull();
      expect(await reverifySigner(userId, { password: PASSWORD }, signerReverificationDeps(client))).toMatchObject({ ok: true, secondFactorVerified: false });
      expect(await reverifySigner(userId, { password: 'wrong-synthetic-password' }, signerReverificationDeps(client))).toMatchObject({ ok: false, code: 'PASSWORD_VERIFICATION_FAILED' });
    });
    expect((await owner.query('SELECT failed_login_attempts FROM users WHERE id=$1', [userId])).rows[0].failed_login_attempts).toBe(1);
    await owner.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [ORG, userId]);
    await scoped(async client => { expect(await checkSigningAuthority(userId, ORG, client)).toMatchObject({ code: 'ESIGNATURE_NO_AUTHORITY' }); });
    await owner.query("UPDATE organization_users SET role='admin' WHERE organization_id=$1 AND user_id=$2", [ORG, userId]);
  });
  it('uses the actual encrypted MFA enrolment and consumes its TOTP step only once on the pinned client', async () => {
    await owner.query('UPDATE users SET mfa_enabled=true,mfa_secret=$2,mfa_totp_last_step=NULL WHERE id=$1', [userId, encryptedSecret()]);
    const { signerReverificationDeps } = await import('../../server/services/part11/reverify-signer-deps');
    const { reverifySigner } = await import('../../server/services/part11/reverify-signer');
    await scoped(async client => {
      const deps = signerReverificationDeps(client);
      expect(await reverifySigner(userId, { password: PASSWORD }, deps)).toMatchObject({ ok: false, code: 'MFA_TOKEN_REQUIRED' });
      const code = totp();
      expect(await reverifySigner(userId, { password: PASSWORD, mfaToken: code }, deps)).toMatchObject({ ok: true, secondFactorVerified: true });
      expect(await reverifySigner(userId, { password: PASSWORD, mfaToken: code }, deps)).toMatchObject({ ok: false, code: 'MFA_VERIFICATION_FAILED' });
    });
    expect((await owner.query('SELECT mfa_totp_last_step FROM users WHERE id=$1', [userId])).rows[0].mfa_totp_last_step).not.toBeNull();
    await owner.query('UPDATE users SET mfa_enabled=false,mfa_secret=NULL,mfa_totp_last_step=NULL WHERE id=$1', [userId]);
  });
  it('refuses a solely foreign account and cannot expose its factors or change its lockout/TOTP state', async () => {
    const { signerReverificationDeps } = await import('../../server/services/part11/reverify-signer-deps');
    const { checkSigningAuthority } = await import('../../server/services/part11/signing-authority-gate');
    const { reverifySigner } = await import('../../server/services/part11/reverify-signer');
    await scoped(async client => {
      const deps = signerReverificationDeps(client);
      expect(await checkSigningAuthority(foreignUserId, ORG, client)).toMatchObject({ code: 'ESIGNATURE_NO_AUTHORITY' });
      expect(await deps.loadPasswordHash(foreignUserId)).toBeNull();
      expect(await deps.isAccountActive(foreignUserId)).toBe(false);
      expect(await deps.isMfaEnabled(foreignUserId)).toBe(false);
      expect(await deps.verifyMfaToken(foreignUserId, totp())).toBe(false);
      await expect(deps.recordFailedAttempt(foreignUserId)).rejects.toThrow();
      expect(await reverifySigner(foreignUserId, { password: PASSWORD, mfaToken: totp() }, deps)).toMatchObject({ ok: false, code: 'ACCOUNT_INACTIVE' });
    });
    const retained = await owner.query('SELECT failed_login_attempts,mfa_totp_last_step FROM users WHERE id=$1', [foreignUserId]);
    expect(retained.rows[0]).toMatchObject({ failed_login_attempts: 3, mfa_totp_last_step: null });
  });
  it('finalizes using current transactional completeness, real password and atomic signature/ledger/content binding', async () => {
    // Synthetic source text and statuses qualify only this connection proof.
    // No study results, clinical conclusions or production qualification.
    await owner.query("UPDATE protocol_sections SET content='Synthetic native connection proof section',status='complete' WHERE protocol_document_id=$1 AND organization_id=$2", [docId, ORG]);
    const check = await read(`/api/protocol-development/documents/${docId}/completeness`); expect(check.body.readyToFinalize).toBe(true);
    await owner.query('UPDATE users SET mfa_enabled=true,mfa_secret=$2,mfa_totp_last_step=NULL WHERE id=$1', [userId, encryptedSecret()]);
    const signed = await post(`/api/protocol-development/documents/${docId}/finalize`, { reason: REASON, meaning: 'authorship', reauth: { password: PASSWORD, totp: totp() } });
    expect(signed.status, JSON.stringify(signed.body)).toBe(201); expect(signed.body.signatureId).toBeTruthy();
    const stored = await owner.query('SELECT status,version FROM protocol_documents WHERE id=$1', [docId]); expect(stored.rows[0]).toMatchObject({ status: 'finalized', version: '1.0' });
    const signatures = await owner.query('SELECT signer_name,authentication_method FROM electronic_signatures WHERE signed_target=$1 AND organization_id=$2', [`protocol-document:${docId}`, ORG]);
    expect(signatures.rows).toHaveLength(1); expect(signatures.rows[0]).toMatchObject({ signer_name: 'Synthetic Protocol Author', authentication_method: 'password+totp' });
    const full = await read(`/api/protocol-dev?programId=${PROGRAM}&documentId=${docId}`); expect(full.status).toBe(200); expect(full.body.data[0].finalization.state).toBe('signed');
  });
});

describe('native protocol read snapshot ownership', () => {
  it('qualifies the actual signed GET on the idle request client and restores its transaction state', async () => {
    const { withProtocolReadSnapshot } = await import('../../server/services/protocol-development/protocol-signature-manifestation');
    const { assembleOrgPdevDocs } = await import('../../server/services/protocol-development/pdev-view-assembler');
    await scoped(async client => {
      const data = await withProtocolReadSnapshot(ORG, client, async (sameClient, snapshot) => {
        expect(sameClient).toBe(client); expect(snapshot.coherent).toBe(true);
        return assembleOrgPdevDocs(ORG, { documentId: docId }, sameClient);
      }, { startOnIdleExecutor: true });
      expect((data[0].finalization as { state: string }).state).toBe('signed');
      const after = (await client.query(`SELECT current_setting('transaction_isolation') AS isolation,
        current_setting('transaction_read_only') AS read_only,
        (SELECT xact_start < query_start FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS active`)).rows[0];
      expect(after).toMatchObject({ active: false, isolation: 'read committed', read_only: 'off' });
    });
  });

  it('retains an existing caller-owned coherent transaction and leaves its completion to that caller', async () => {
    const { withProtocolReadSnapshot } = await import('../../server/services/protocol-development/protocol-signature-manifestation');
    const { assembleOrgPdevDocs } = await import('../../server/services/protocol-development/pdev-view-assembler');
    await scoped(async client => {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const data = await withProtocolReadSnapshot(ORG, client, async (sameClient, snapshot) => {
          expect(sameClient).toBe(client); expect(snapshot.coherent).toBe(true);
          return assembleOrgPdevDocs(ORG, { documentId: docId }, sameClient);
        }, { startOnIdleExecutor: true });
        expect((data[0].finalization as { state: string }).state).toBe('signed');
        const held = (await client.query(`SELECT current_setting('transaction_isolation') AS isolation,
          (SELECT xact_start < query_start FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS active`)).rows[0];
        expect(held).toMatchObject({ active: true, isolation: 'repeatable read' });
      } finally { await client.query('ROLLBACK'); }
    });
  });

});
