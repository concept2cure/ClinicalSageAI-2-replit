/** Actual ceremony, canonical role/grant policy and PGlite SQL. Credential and
 * ledger persistence recorders bound the test; no native lock/COMMIT claim. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import type { RequestSqlClient } from '../../../db/requestDb';

const h = vi.hoisted(() => ({
  db: null as unknown, pool: null as unknown,
  reauth: vi.fn(async () => ({ ok: true })),
  ledger: vi.fn(async () => ({ actionId: 'action', auditId: 'audit', sha256Chain: 'chain' })),
  signature: vi.fn(async () => ({ id: 1, signedAt: new Date('2026-10-14T00:00:00Z') })),
}));
vi.mock('../../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; } }));
vi.mock('../../../routes/c2c/actions', () => ({ verifyReauth: h.reauth, recordGovernedAction: h.ledger }));
vi.mock('../../governance/separation-of-duties', () => ({
  assertSignerIsNotAuthor: vi.fn(async () => undefined), resolveTargetAuthors: vi.fn(async () => ({ authors: [7] })),
  SeparationOfDutiesError: class extends Error {}, SeparationOfDutiesAuthorUnresolvedError: class extends Error {},
}));
vi.mock('../signature-persistence', () => ({ persistGovernedSignSignature: h.signature }));

import { signGovernedAct, type GovernedSignatureInput } from '../governed-signature-ceremony';

let pg: PGlite;
const queries: Array<{ sql: string; params?: unknown[]; executor: 'pool' | 'transaction' }> = [];
const release = vi.fn();
async function runQuery(executor: 'pool' | 'transaction', sql: string, params?: unknown[]) {
  queries.push({ sql, params, executor });
  return { rows: (await pg.query<Record<string, unknown>>(sql, params)).rows };
}
const transaction = { query: (sql: string, params?: unknown[]) => runQuery('transaction', sql, params), release };
const pool = { query: (sql: string, params?: unknown[]) => runQuery('pool', sql, params), connect: vi.fn(async () => transaction) };
const domainWrite = vi.fn(async (client: RequestSqlClient) => {
  await client.query('INSERT INTO signature_domain_effects VALUES($1)', ['signed']);
  return { body: { domainWritten: true } };
});
const input = (role = 'admin', prepare?: GovernedSignatureInput['prepare']): GovernedSignatureInput => ({
  orgId: 42, userId: 7, target: 'protocol-document:5', domain: 'protocol', surface: 'test', subject: 'protocol',
  reason: 'Independent recorded review', meaning: 'approval', allowedMeanings: ['approval'],
  reauth: {}, ipAddress: null, role, prepare, write: domainWrite,
});
const grantReads = () => queries.filter(q => /FROM c2c_governance_grants/.test(q.sql));
async function expectNoSignedEffect() {
  expect((await pg.query('SELECT * FROM signature_domain_effects')).rows).toEqual([]);
  expect(domainWrite).not.toHaveBeenCalled();
  expect(h.ledger).not.toHaveBeenCalled();
  expect(h.signature).not.toHaveBeenCalled();
}

beforeAll(async () => {
  pg = new PGlite(); h.db = drizzle(pg); h.pool = pool;
  await pg.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,status text);
    CREATE TABLE users(id integer PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id integer,user_id integer,role text,UNIQUE(organization_id,user_id));
    CREATE TABLE signature_domain_effects(effect text);
    INSERT INTO organizations VALUES(42,'active'),(99,'active');
    INSERT INTO users VALUES(7,'active'); INSERT INTO organization_users VALUES(42,7,'admin');`);
  await pg.exec(readFileSync(new URL('../../../../migrations/20260603_governance_permission_grants.sql', import.meta.url), 'utf8'));
});
beforeEach(async () => {
  vi.stubEnv('GOVERNANCE_RBAC_ENFORCE', 'true'); vi.stubEnv('ESIGNATURE_SIGNING_ROLES', '');
  await pg.exec("DELETE FROM c2c_governance_grants; DELETE FROM signature_domain_effects; UPDATE organization_users SET role='admin';");
  queries.length = 0; vi.clearAllMocks();
});
afterEach(async () => {
  // A baseline red run may commit its deliberately renamed scratch table.
  if ((await pg.query<{ relation: string | null }>("SELECT to_regclass('public.unavailable_grants') AS relation")).rows[0]?.relation) {
    await pg.exec('ALTER TABLE unavailable_grants RENAME TO c2c_governance_grants');
  }
  vi.unstubAllEnvs();
});
afterAll(async () => { await pg?.close(); });

describe('flagged sign permission follows the current reserved transaction', () => {
  it('refuses a current reviewer’s resource deny after an earlier allowed admin role', async () => {
    await pg.exec("INSERT INTO c2c_governance_grants(org_id,role,action,resource_type,effect) VALUES(42,'reviewer','sign','protocol-document','deny')");
    const prepare = async (client: RequestSqlClient) => { await client.query("UPDATE organization_users SET role='reviewer' WHERE organization_id=42 AND user_id=7"); };
    await expect(signGovernedAct(input('admin', prepare))).rejects.toMatchObject({ status: 403, code: 'NOT_AUTHORIZED' });
    await expectNoSignedEffect();
    expect(grantReads()).toEqual([expect.objectContaining({ executor: 'transaction', params: [42, 'reviewer'] })]);
    expect(queries.at(-1)?.sql).toBe('ROLLBACK'); expect(release).toHaveBeenCalledOnce();
  });

  it('admits the current reviewer instead of denying a stale caller viewer role', async () => {
    const prepare = async (client: RequestSqlClient) => { await client.query("UPDATE organization_users SET role='reviewer' WHERE organization_id=42 AND user_id=7"); };
    expect(await signGovernedAct(input('viewer', prepare))).toMatchObject({ domainWritten: true, signatureId: 1 });
    expect(grantReads()).toEqual([expect.objectContaining({ executor: 'transaction', params: [42, 'reviewer'] })]);
    expect(h.reauth).toHaveBeenCalledOnce(); expect(h.ledger).toHaveBeenCalledOnce(); expect(h.signature).toHaveBeenCalledOnce();
    expect(queries.at(-1)?.sql).toBe('COMMIT');
  });

  it('rolls back when the actual grant store becomes unavailable during preparation', async () => {
    const prepare = async (client: RequestSqlClient) => { await client.query('ALTER TABLE c2c_governance_grants RENAME TO unavailable_grants'); };
    await expect(signGovernedAct(input('admin', prepare))).rejects.toMatchObject({ status: 503, code: 'SIGNING_PERMISSION_UNVERIFIED' });
    await expectNoSignedEffect();
    expect(grantReads()).toEqual([expect.objectContaining({ executor: 'transaction', params: [42, 'admin'] })]);
    expect(queries.at(-1)?.sql).toBe('ROLLBACK');
    expect((await pg.query<{ relation: string | null }>("SELECT to_regclass('public.c2c_governance_grants') AS relation")).rows[0]?.relation).toBeTruthy();
  });

  it('refuses a non-signing membership before comparing credentials or opening a transaction', async () => {
    await pg.exec("UPDATE organization_users SET role='viewer'");
    await expect(signGovernedAct(input('admin'))).rejects.toMatchObject({ status: 403, code: 'ESIGNATURE_NO_AUTHORITY' });
    expect(h.reauth).not.toHaveBeenCalled(); expect(pool.connect).not.toHaveBeenCalled(); expect(grantReads()).toEqual([]);
    await expectNoSignedEffect();
  });

  it('refuses a demoted member after preparation even when a stored grant allows signing', async () => {
    await pg.exec("INSERT INTO c2c_governance_grants(org_id,role,action,effect) VALUES(42,'member','sign','allow')");
    const prepare = async (client: RequestSqlClient) => { await client.query("UPDATE organization_users SET role='member' WHERE organization_id=42 AND user_id=7"); };
    await expect(signGovernedAct(input('admin', prepare))).rejects.toMatchObject({ status: 403, code: 'ESIGNATURE_NO_AUTHORITY' });
    expect(h.reauth).toHaveBeenCalledOnce(); expect(grantReads()).toEqual([]);
    await expectNoSignedEffect(); expect(queries.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('does not borrow another organization’s deny for the current allowed member', async () => {
    await pg.exec("INSERT INTO c2c_governance_grants(org_id,role,action,effect) VALUES(99,'admin','sign','deny')");
    expect(await signGovernedAct(input('viewer'))).toMatchObject({ domainWritten: true });
    expect(grantReads()).toEqual([expect.objectContaining({ executor: 'transaction', params: [42, 'admin'] })]);
    expect(h.signature).toHaveBeenCalledOnce(); expect(queries.at(-1)?.sql).toBe('COMMIT');
  });

  it('does not change the dark flag’s off behavior or query grant overrides', async () => {
    vi.stubEnv('GOVERNANCE_RBAC_ENFORCE', 'false');
    await pg.exec("INSERT INTO c2c_governance_grants(org_id,role,action,effect) VALUES(42,'admin','sign','deny')");
    expect(await signGovernedAct(input('viewer'))).toMatchObject({ domainWritten: true });
    expect(grantReads()).toEqual([]); expect(h.signature).toHaveBeenCalledOnce();
  });
});
