/**
 * A deep-research job is read for one organisation, on both routes that read it
 * (D3, 2026-10-11; evidence docs/evidence/D6/2026-10-11-trunk-ci/).
 *
 * `getJobStatus(jobId, organizationId?)` took the organisation as OPTIONAL and
 * its SQL read `($2::int IS NULL OR organization_id = $2)`, so a null lifted the
 * predicate over every tenant's row. `GET /jobs/:id` refused with 400 when it
 * could not resolve an organisation; `GET /jobs/:id/stream`, over the same read,
 * passed `undefined` instead — so a request with no resolvable organisation
 * streamed any tenant's job, its results and synthesis included, by guessing an
 * id. Its comment claimed "a foreign-tenant job id reads as not found".
 *
 * The scope is in the SQL and in the signature: the organisation is required,
 * and both routes refuse before the read when they cannot resolve one.
 */
import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const cards = vi.hoisted(() => ({ reauthOk: true, onReauth: null as null | (() => Promise<void>), reauthCalls: [] as number[], released: 0 }));
const { query, pass } = vi.hoisted(() => ({
  query: vi.fn(),
  pass: (_q: unknown, _s: unknown, n: () => void) => n(),
}));

vi.mock('../../middleware/auth.js', () => ({ authenticateToken: pass }));
vi.mock('../../services/license-manager.js', () => ({ loadLicense: () => pass, requireTier: () => pass }));
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../db/requestDb', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestPgClient: () => ({ query: (...args: unknown[]) => query(...args) }),
  requestConnectable: () => ({ connect: async () => ({ query: (...args: unknown[]) => query(...args), release: () => { cards.released++; } }) }),
}));
vi.mock('../c2c/actions', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyReauth: async (userId: number) => {
    cards.reauthCalls.push(userId);
    await cards.onReauth?.();
    return cards.reauthOk ? { ok: true } : { ok: false, error: 'Synthetic rejected proof' };
  },
}));

import router from '../deep-research';

/** Another organisation's job, as the table holds it. */
const FOREIGN_JOB = {
  id: 4242,
  uuid: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  organization_id: 999,
  project_id: null,
  user_id: 1,
  status: 'complete',
  query: 'Everything org 999 asked about its competitor',
  progress: 100,
  results: [{ secret: 'another tenant’s findings' }],
  synthesis: 'another tenant’s synthesis',
  credits_used: 10,
  connector_logs: null,
  created_at: new Date(),
  completed_at: new Date(),
};

/** `app(org)`: a request whose organisation is `org`, or none at all when null. */
function app(org: number | null, userId = 1) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as any).user = { organizationId: org, id: userId, role: 'admin' };
    next();
  });
  a.use('/api/deep-research', router);
  return a;
}

beforeEach(() => {
  query.mockReset();
  // The store answers only for the organisation the statement asks for: a read
  // with no organisation in its parameters finds nothing here, so the proof is
  // the refusal and the absent read, not a row this double happened to return.
  query.mockImplementation(async (_sql: string, params: unknown[] = []) => {
    const org = params[1];
    return { rows: org === 999 ? [FOREIGN_JOB] : [], rowCount: org === 999 ? 1 : 0 };
  });
});

describe('GET /api/deep-research/jobs/:id/stream is scoped to one organisation', () => {
  it('a request with no resolvable organisation is refused, and reads no job at all', async () => {
    const res = await request(app(null)).get('/api/deep-research/jobs/4242/stream');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body ?? res.text)).not.toContain('synthesis');
    expect(query).not.toHaveBeenCalled();
  });

  it("control: with an organisation, another organisation's job id streams as not found", async () => {
    const res = await request(app(7)).get('/api/deep-research/jobs/4242/stream');
    expect(res.text).toContain('Job not found');
    expect(res.text).not.toContain('synthesis');
    // The organisation reached the statement, so the store could refuse the row.
    expect(query.mock.calls[0][1]).toEqual([4242, 7]);
  });
});

describe('GET /api/deep-research/jobs/:id keeps refusing without an organisation', () => {
  it('is 400 and reads nothing (unchanged)', async () => {
    const res = await request(app(null)).get('/api/deep-research/jobs/4242');
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('getJobStatus cannot be called without an organisation', () => {
  it('refuses rather than reading every tenant: no statement runs', async () => {
    const { getJobStatus } = await import('../../services/deep-research-orchestrator');
    await expect(
      // The hole as it was: the organisation omitted at the call.
      (getJobStatus as unknown as (id: number) => Promise<unknown>)(4242),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});


describe('secure client-admin credential capture uses the existing connected-accounts route', () => {
  let pg: PGlite;
  const CANARY = 'synthetic-capture-route-client-canary-20261106';
  const body = () => ({ connectorId: 'llm_openai', action: 'capture', credentials: { apiKey: CANARY },
    scopes: ['model_inference'], reason: 'Client administrator captured a fixture key', reauth: { password: 'fixture-password', totp: '123456' } });
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE organizations (id INTEGER PRIMARY KEY, status TEXT); INSERT INTO organizations VALUES (1,'active'),(2,'active');
      CREATE TABLE users (id INTEGER PRIMARY KEY, status TEXT); INSERT INTO users VALUES (1,'active'),(2,'active');
      CREATE TABLE organization_users (organization_id INTEGER, user_id INTEGER, role TEXT); INSERT INTO organization_users VALUES (1,1,'admin'),(1,2,'member');
      CREATE TABLE connector_credentials (id SERIAL PRIMARY KEY, organization_id INTEGER, connector_id TEXT, credentials TEXT, is_valid BOOLEAN, last_validated_at TIMESTAMP, created_at TIMESTAMP, UNIQUE(organization_id,connector_id));
      CREATE TABLE audit_logs (id UUID PRIMARY KEY, tenant_id INTEGER, user_id INTEGER, action TEXT, table_name TEXT, record_id TEXT, actor_id INTEGER, target TEXT, payload_hash TEXT, sha256_chain TEXT, chain_seq BIGSERIAL, occurred_at TIMESTAMPTZ, hmac_seal TEXT, old_values JSON, new_values JSON, ip_address TEXT, user_agent TEXT, reason TEXT);`);
  });
  afterAll(async () => { await pg?.close(); });
  beforeEach(async () => {
    cards.reauthOk = true; cards.onReauth = null; cards.reauthCalls.length = 0; cards.released = 0;
    await pg.exec("ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS refuse_audit; DELETE FROM connector_credentials; DELETE FROM audit_logs; UPDATE organizations SET status='active'; UPDATE users SET status='active'; DELETE FROM organization_users; INSERT INTO organization_users VALUES (1,1,'admin'),(1,2,'member')");
    query.mockImplementation(async (sql: string, values?: unknown[]) => {
      const result = await pg.query(sql, values);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    });
  });
  const save = (change: Record<string, unknown> = {}, org = 1, userId = 1) => request(app(org, userId)).post('/api/deep-research/connectors').send({ ...body(), ...change });
  it('captures under the authenticated actor/tenant and returns only metadata after a durable audit', async () => {
    const res = await save();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ success: true, organizationId: 1, credentialCard: { id: 'llm_openai', status: 'stored_unvalidated', canManage: true } });
    expect(cards.reauthCalls).toEqual([1]);
    expect(cards.released).toBe(1);
    expect((await pg.query('SELECT organization_id,connector_id,is_valid FROM connector_credentials')).rows).toEqual([{ organization_id: 1, connector_id: 'llm_openai', is_valid: null }]);
    expect((await pg.query('SELECT tenant_id,user_id,action FROM audit_logs')).rows).toEqual([{ tenant_id: 1, user_id: 1, action: 'credential.capture' }]);
    expect(JSON.stringify(res.body)).not.toContain(CANARY);
  });
  it.each([{ organizationId: 2 }, { userId: 2 }, { role: 'owner' }])('refuses submitted authority selectors %j', async injected => {
    expect((await save(injected)).status).toBe(400);
    expect(cards.reauthCalls).toEqual([]);
    expect((await pg.query('SELECT * FROM connector_credentials')).rows).toEqual([]);
  });
  it('a stale administrator claim cannot replace the live persisted role', async () => {
    expect((await save({}, 1, 2)).status).toBe(403);
    expect(cards.reauthCalls).toEqual([]);
    expect((await pg.query('SELECT * FROM connector_credentials')).rows).toEqual([]);
  });
  it.each(['inactive_user', 'inactive_org', 'other_org'])('refuses capture after %s invalidates current standing', async state => {
    if (state === 'inactive_user') await pg.exec("UPDATE users SET status='inactive' WHERE id=1");
    if (state === 'inactive_org') await pg.exec("UPDATE organizations SET status='inactive' WHERE id=1");
    expect((await save({}, state === 'other_org' ? 2 : 1)).status).toBe(403);
    expect(cards.reauthCalls).toEqual([]);
  });
  it('missing or failed human re-authentication produces no capture or audit', async () => {
    cards.reauthOk = false;
    const res = await save({ reauth: undefined });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain(CANARY);
    expect((await pg.query('SELECT * FROM connector_credentials')).rows).toEqual([]);
    expect((await pg.query('SELECT * FROM audit_logs')).rows).toEqual([]);
  });
  it('rechecks membership after re-authentication before the transactional credential write', async () => {
    cards.onReauth = async () => { await pg.exec("UPDATE organization_users SET role='member' WHERE user_id=1"); };
    expect((await save()).status).toBe(403);
    expect(cards.reauthCalls).toEqual([1]);
    expect((await pg.query('SELECT * FROM connector_credentials')).rows).toEqual([]);
  });
  it('audit refusal rolls back the actual capture and gives a content-free response', async () => {
    await pg.exec('ALTER TABLE audit_logs ADD CONSTRAINT refuse_audit CHECK (false) NOT VALID');
    const res = await save();
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).toContain('CREDENTIAL_CHANGE_UNCONFIRMED');
    expect(JSON.stringify(res.body)).not.toContain(CANARY);
    expect((await pg.query('SELECT * FROM connector_credentials')).rows).toEqual([]);
    expect((await pg.query('SELECT * FROM audit_logs')).rows).toEqual([]);
    expect(cards.released).toBe(1);
  });
  it.each(['membership', 'inactive_user', 'inactive_org', 'foreign_org'])('a stale session with %s cannot read any credential card metadata', async standing => {
    await save();
    if (standing === 'membership') await pg.exec('DELETE FROM organization_users WHERE organization_id=1 AND user_id=1');
    if (standing === 'inactive_user') await pg.exec("UPDATE users SET status='inactive' WHERE id=1");
    if (standing === 'inactive_org') await pg.exec("UPDATE organizations SET status='inactive' WHERE id=1");
    const res = await request(app(standing === 'foreign_org' ? 2 : 1)).get('/api/deep-research/connectors');
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('CREDENTIAL_MEMBERSHIP_REQUIRED');
    expect(res.body).not.toHaveProperty('credentialCards');
    expect(JSON.stringify(res.body)).not.toContain(CANARY);
  });
  it('the connected-accounts read exposes current canManage and status, never saved values', async () => {
    await save();
    const admin = await request(app(1)).get('/api/deep-research/connectors');
    const member = await request(app(1,2)).get('/api/deep-research/connectors');
    expect(admin.status, JSON.stringify(admin.body)).toBe(200);
    expect(admin.body).toMatchObject({ organizationId: 1, canManage: true });
    expect(member.body).toMatchObject({ organizationId: 1, canManage: false, credentialCards: [] });
    expect(JSON.stringify([admin.body,member.body])).not.toContain(CANARY);
  });
});
