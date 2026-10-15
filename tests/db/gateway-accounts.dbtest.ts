/**
 * Each organisation chooses the platform's gateway account or its own, per
 * agency gateway and environment (D7, founder decision 2026-10-01; evidence
 * docs/evidence/D7/2026-10-01-gateway-account-choice/).
 *
 * On PostgreSQL as the runtime role with RLS on, through the real route and
 * authMiddleware:
 *   - every gateway × environment is listed, the platform account by default;
 *   - a viewer cannot change it, and an admin only after confirming their password;
 *   - a client account's certificate and key are stored encrypted, never
 *     returned, and the audit row names the fields changed and not their values;
 *   - another organisation never sees or is affected by the choice;
 *   - choosing the platform account again clears every secret held.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const ORG_A = 93310;
const ORG_B = 93311;
const TAG = 'dbgwa';
const PASSWORD = 'Dbgwa-Gateway-Account-2026!';
const CERT = '-----BEGIN CERTIFICATE-----\nMIIBdbgwaclientcert\n-----END CERTIFICATE-----';
const KEY = '-----BEGIN PRIVATE KEY-----\nMIIEdbgwaSECRETKEYMATERIAL\n-----END PRIVATE KEY-----';

let owner: Pool;
let app: express.Express;
const tokens: Record<string, string> = {};

async function mintToken(userId: number, org: number, role: string): Promise<string> {
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return jwt.sign({ type: 'access', userId, organizationId: String(org), role }, activeJwtSecret(), { expiresIn: '10m' });
}

async function member(who: string, org: number, role: 'admin' | 'viewer'): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, $3, 'active')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
       failed_login_attempts = 0, locked_until = NULL, mfa_enabled = false, mfa_secret = NULL, password_changed_at = NULL
     RETURNING id`,
    [`${TAG}-${who}@example.invalid`, `Gateway ${who}`, await bcrypt.hash(PASSWORD, 4)],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [org, id, role],
  );
  tokens[who] = await mintToken(id, org, role);
  return id;
}

async function cleanup(): Promise<void> {
  await owner.query('DELETE FROM organization_gateway_accounts WHERE organization_id = ANY($1::int[])', [[ORG_A, ORG_B]]);
}

const fdaProd = '/api/gateway-accounts/fda/esg/production';
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  for (const [id, name] of [[ORG_A, `${TAG}-sponsor-a`], [ORG_B, `${TAG}-sponsor-b`]] as const) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active') ON CONFLICT (id) DO UPDATE SET status = 'active'`,
      [id, name],
    );
  }
  await cleanup();
  await member('admin-a', ORG_A, 'admin');
  await member('viewer-a', ORG_A, 'viewer');
  await member('admin-b', ORG_B, 'admin');
  const { authMiddleware } = await import('../../server/auth');
  const router = (await import('../../server/routes/gateway-accounts')).default;
  app = express();
  app.use(express.json());
  app.use('/api/gateway-accounts', authMiddleware, router);
}, 120_000);

afterAll(async () => {
  if (!owner) return;
  await cleanup().catch(() => undefined);
  await owner.end();
});

describe('agency gateway accounts (D7)', () => {
  it('lists every gateway × environment, the platform account by default', async () => {
    const res = await request(app).get('/api/gateway-accounts').set(as('admin-a'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.accounts).toHaveLength(26);
    expect(res.body.accounts.every((a: any) => a.mode === 'platform')).toBe(true);
  });

  it('a viewer cannot change it', async () => {
    const res = await request(app).put(fdaProd).set(as('viewer-a'))
      .send({ mode: 'client', senderIdentifier: 'DBGWA-AS2', reason: 'Viewer attempting to switch the account', reauth: { password: PASSWORD } });
    expect(res.status).toBe(403);
  });

  it('an admin cannot change it without confirming their password, and nothing is written', async () => {
    const res = await request(app).put(fdaProd).set(as('admin-a'))
      .send({ mode: 'client', senderIdentifier: 'DBGWA-AS2', reason: 'Switching to our own FDA ESG account', reauth: { password: 'wrong-password' } });
    expect(res.status).toBe(401);
    const { rows } = await owner.query('SELECT count(*)::int AS n FROM organization_gateway_accounts WHERE organization_id = $1', [ORG_A]);
    expect(rows[0].n).toBe(0);
  });

  it('an admin chooses their own FDA account: stored encrypted, never returned, audited by field name', async () => {
    const res = await request(app).put(fdaProd).set(as('admin-a')).send({
      mode: 'client',
      senderIdentifier: 'DBGWA-AS2',
      credentials: { clientCertPem: CERT, clientKeyPem: KEY },
      reason: 'Sponsor files under its own FDA ESG account',
      reauth: { password: PASSWORD },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ mode: 'client', senderIdentifier: 'DBGWA-AS2', credentialFieldsHeld: ['clientCertPem', 'clientKeyPem'], audited: true });
    expect(JSON.stringify(res.body)).not.toContain('SECRETKEYMATERIAL');

    const stored = await owner.query(
      `SELECT account_mode, credentials_ciphertext FROM organization_gateway_accounts
        WHERE organization_id = $1 AND region = 'fda' AND gateway = 'esg' AND environment = 'production'`,
      [ORG_A],
    );
    expect(stored.rows[0].account_mode).toBe('client');
    expect(stored.rows[0].credentials_ciphertext).not.toContain('SECRETKEYMATERIAL');

    const audit = await owner.query(
      `SELECT new_values AS details FROM audit_logs WHERE tenant_id = $1 AND table_name = 'organization_gateway_account' ORDER BY created_at DESC LIMIT 1`,
      [ORG_A],
    );
    const details = typeof audit.rows[0].details === 'string' ? JSON.parse(audit.rows[0].details) : audit.rows[0].details;
    expect(details).toMatchObject({ modeBefore: 'platform', modeAfter: 'client', credentialFieldsChanged: ['clientCertPem', 'clientKeyPem'] });
    expect(JSON.stringify(audit.rows[0])).not.toContain('SECRETKEYMATERIAL');

    const listed = await request(app).get('/api/gateway-accounts').set(as('admin-a'));
    const fda = listed.body.accounts.find((a: any) => a.gateway === 'esg' && a.environment === 'production');
    expect(fda).toMatchObject({ mode: 'client', senderIdentifier: 'DBGWA-AS2', credentialFieldsHeld: ['clientCertPem', 'clientKeyPem'] });
    expect(JSON.stringify(listed.body)).not.toContain('SECRETKEYMATERIAL');
  });

  it('another organisation never sees the choice and keeps the platform account', async () => {
    const res = await request(app).get('/api/gateway-accounts').set(as('admin-b'));
    const fda = res.body.accounts.find((a: any) => a.gateway === 'esg' && a.environment === 'production');
    expect(fda).toMatchObject({ mode: 'platform', senderIdentifier: null, credentialFieldsHeld: [] });
    expect(JSON.stringify(res.body)).not.toContain('DBGWA-AS2');
  });

  it('choosing the platform account again clears every secret held', async () => {
    const res = await request(app).put(fdaProd).set(as('admin-a'))
      .send({ mode: 'platform', reason: 'Back to the platform account for this agency', reauth: { password: PASSWORD } });
    expect(res.status).toBe(200);
    const stored = await owner.query(
      `SELECT account_mode, credentials_ciphertext, credential_fields, sender_identifier FROM organization_gateway_accounts
        WHERE organization_id = $1 AND gateway = 'esg' AND environment = 'production'`,
      [ORG_A],
    );
    expect(stored.rows[0]).toMatchObject({ account_mode: 'platform', credentials_ciphertext: null, credential_fields: [], sender_identifier: null });
  });

  it('the table carries the tenant policy the sweep attaches', async () => {
    const { rows } = await owner.query(
      `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
              (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = 'organization_gateway_accounts') AS policies
         FROM pg_class c WHERE c.relname = 'organization_gateway_accounts'`,
    );
    expect(rows[0]).toMatchObject({ rls: true });
    expect(rows[0].policies).toBeGreaterThan(0);
  });
});
