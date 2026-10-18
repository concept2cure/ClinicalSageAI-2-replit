/** HTTP proof: company duties come from current membership, never the session role.
 * Only the chained-audit boundary is substituted; admission, capability reads,
 * request-bound transactions and the production governance migration are real. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestSqlClient } from '../../db/requestDb';

const h = vi.hoisted(() => ({ audit: vi.fn(), failAudit: false, statements: [] as string[] }));
vi.mock('../../services/auditService', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: h.audit,
}));
import governance from '../company-document-governance';
import { context } from '../../services/company-documents/profile';

let db: PGlite;
let q: { query: typeof fixtureQuery };
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  // These are authenticated session fields. The role deliberately disagrees
  // with current SQL membership in the stale-role tests.
  Object.assign(req, { dbClient: q, userId: Number(req.get('x-actor') ?? 10), userRole: req.get('x-session-role') ?? 'admin',
    user: { id: Number(req.get('x-actor') ?? 10), organizationId: 7, role: req.get('x-session-role') ?? 'admin' } });
  next();
});
app.use('/company-documents', governance);
// Read canonical capabilities through the same genuine context for assertions
// that inherited or delegated duties are unchanged by a refused request.
app.get('/current-capabilities', async (req, res) => {
  try { const current = await context(req); res.json(current.capabilities); }
  catch { res.sendStatus(403); }
});
const path = '/company-documents/permissions';
const update = (actor = 10, target = 12, patch = { manageBrand: true, manageLegal: true }) =>
  request(app).put(`${path}/${target}`).set('x-actor', String(actor)).set('x-session-role', 'admin')
    .send({ ...patch, reason: 'Assign reviewed company-document responsibilities' });
const grantRows = async () => (await db.query('SELECT organization_id,user_id,manage_brand,manage_legal,updated_by FROM company_document_grants ORDER BY organization_id,user_id')).rows;
const auditRows = async () => (await db.query('SELECT event FROM test_chained_audit')).rows;

type PgFixtureQuery = { text: string; rowMode?: string };
async function fixtureQuery(input: string | PgFixtureQuery, parameters?: unknown[]) {
  const text = typeof input === 'string' ? input : input.text;
  h.statements.push(text);
  const result = await db.query<Record<string, unknown>>(text, parameters);
  return { ...result, rows: typeof input !== 'string' && input.rowMode === 'array'
    ? result.rows.map(row => result.fields.map(field => row[field.name])) : result.rows };
}

beforeAll(async () => {
  db = new PGlite();
  // The real managed writer uses node-postgres Drizzle over this request
  // client. Preserve node-pg array row mode using actual PGlite result fields.
  q = { query: fixtureQuery };
  await db.exec(`CREATE TABLE organizations(id INTEGER PRIMARY KEY,uuid UUID NOT NULL DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,slug TEXT NOT NULL,domain TEXT,logo TEXT,industry_mode TEXT,client_type TEXT NOT NULL DEFAULT 'pharma',
    stripe_customer_id TEXT,stripe_subscription_id TEXT,billing_cycle TEXT DEFAULT 'monthly',payment_status TEXT DEFAULT 'incomplete',
    trial_ends_at TIMESTAMP,next_billing_date TIMESTAMP,seats_purchased INTEGER DEFAULT 5,settings JSON NOT NULL DEFAULT '{}',api_key TEXT,
    tier TEXT NOT NULL DEFAULT 'standard',status TEXT NOT NULL,max_users INTEGER DEFAULT 5,max_projects INTEGER DEFAULT 10,
    max_storage INTEGER DEFAULT 5,created_at TIMESTAMP NOT NULL DEFAULT now(),updated_at TIMESTAMP NOT NULL DEFAULT now());
    CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,email TEXT,status TEXT);
    CREATE TABLE organization_users(organization_id INTEGER REFERENCES organizations(id),user_id INTEGER REFERENCES users(id),role TEXT,
      PRIMARY KEY(organization_id,user_id));
    CREATE SCHEMA vault; CREATE TABLE vault.legal_holds(organization_id INTEGER,lifted_at TIMESTAMPTZ);
    CREATE TABLE test_chained_audit(id SERIAL PRIMARY KEY,event JSONB NOT NULL);
    INSERT INTO organizations(id,name,status,slug) VALUES(7,'Current tenant','active','current'),(8,'Foreign tenant','active','foreign');
    INSERT INTO users(id,name,email,status) VALUES
      (10,'Current owner','owner@current.invalid','active'),(11,'Current administrator','admin@current.invalid','active'),
      (12,'Current member','member@current.invalid','active'),(13,'Brand delegate','brand@current.invalid','active'),
      (14,'Foreign member','foreign@private.invalid','active'),(15,'Inactive administrator','inactive@current.invalid','disabled');
    INSERT INTO organization_users VALUES(7,10,'owner'),(7,11,'admin'),(7,12,'member'),(7,13,'member'),(8,14,'member'),(7,15,'admin');`);
  await db.exec(await readFile('migrations/20261018_company_document_governance.sql', 'utf8'));
  await db.exec(await readFile('migrations/20261018_company_legal_registry.sql', 'utf8'));
}, 60_000);
beforeEach(async () => {
  await db.exec(`TRUNCATE company_document_grants,test_chained_audit;
    UPDATE organizations SET status='active',settings='{}'::json; UPDATE users SET status='active' WHERE id<>15;
    UPDATE organization_users SET role=CASE user_id WHEN 10 THEN 'owner' WHEN 11 THEN 'admin' WHEN 15 THEN 'admin' ELSE 'member' END;
    INSERT INTO company_document_grants(organization_id,user_id,manage_brand,manage_legal,updated_by) VALUES(7,13,true,false,10);`);
  h.failAudit = false; h.audit.mockReset(); h.statements = [];
  h.audit.mockImplementation(async (client: RequestSqlClient, event: Record<string, unknown>) => {
    // Real transactional row shows an audit failure undoes both the grant and
    // any attempted audit record, instead of merely checking a mock call.
    await client.query('INSERT INTO test_chained_audit(event) VALUES($1::jsonb)', [JSON.stringify(event)]);
    if (h.failAudit) throw new Error('Chained audit persistence unavailable');
    return { id: 'persisted-test-audit' };
  });
});
afterAll(async () => { await db?.close(); });

describe('current-database company-document permission administration', () => {
  it('refuses a stale JWT administrator after SQL membership was reduced to ordinary member', async () => {
    await db.query("UPDATE organization_users SET role='member' WHERE organization_id=7 AND user_id=10");
    const before = await grantRows();
    const read = await request(app).get(path).set('x-actor', '10').set('x-session-role', 'admin');
    const write = await update();
    expect(read.status).toBe(403); expect(write.status).toBe(403);
    expect(write.body.error).toBe('COMPANY_PERMISSION_REQUIRED');
    expect(await grantRows()).toEqual(before); expect(await auditRows()).toEqual([]); expect(h.audit).not.toHaveBeenCalled();
  });
  it.each([10, 11])('allows the current owner/admin (%i) to grant duties even when the session claims a lower role', async actor => {
    const result = await request(app).put(`${path}/12`).set('x-actor', String(actor)).set('x-session-role', 'viewer')
      .send({ manageBrand: true, manageLegal: true, reason: 'Grant reviewed company-document responsibilities' });
    expect(result.status).toBe(200);
    expect(await grantRows()).toContainEqual({ organization_id: 7, user_id: 12, manage_brand: true, manage_legal: true, updated_by: actor });
    const events = await auditRows(); expect(events).toHaveLength(1);
    expect(events[0].event).toMatchObject({ tenantId: 7, userId: actor, action: 'company_documents.permissions_changed',
      resourceId: '12', details: { targetUserId: 12, manageBrand: true, manageLegal: true } });
    expect(h.statements.some(sql => /FOR SHARE OF ou,u,o/.test(sql))).toBe(true);
    expect(h.statements.at(-1)).toBe('COMMIT');
  });
  it('lists only active current-tenant members for an admitted administrator', async () => {
    const result = await request(app).get(path).set('x-actor', '11');
    expect(result.status).toBe(200);
    expect(result.body.data.map((row: { user_id: number }) => row.user_id).sort()).toEqual([10, 11, 12, 13]);
    expect(JSON.stringify(result.body)).not.toContain('foreign@private.invalid');
    expect(JSON.stringify(result.body)).not.toContain('inactive@current.invalid');
    expect(result.body.data.find((row: { user_id: number }) => row.user_id === 13)).toMatchObject({ manage_brand: true, manage_legal: false });
  });
  it.each([12, 13])('does not let a brand delegate grant legal duties to user %i or elevate itself', async target => {
    const before = await grantRows();
    const result = await update(13, target);
    expect(result.status).toBe(403); expect(await grantRows()).toEqual(before); expect(await auditRows()).toEqual([]);
    const capabilities = await request(app).get('/current-capabilities').set('x-actor', '13');
    expect(capabilities.body).toEqual({ manageBrand: true, manageLegal: false, managePermissions: false });
  });
  it('refuses a foreign-organization target even for the current owner, with no grant or audit row', async () => {
    const before = await grantRows(); const result = await update(10, 14);
    expect(result.status).toBe(403); expect(result.body.error).toBe('PROJECT_ACTOR_ACCESS_DENIED');
    expect(await grantRows()).toEqual(before); expect(await auditRows()).toEqual([]);
    expect(h.statements.at(-1)).toBe('ROLLBACK');
  });
  it('refuses an inactive administrator despite its retained SQL and session admin roles', async () => {
    const before = await grantRows();
    expect((await request(app).get(path).set('x-actor', '15')).status).toBe(403);
    expect((await update(15)).status).toBe(403); expect(await grantRows()).toEqual(before); expect(h.audit).not.toHaveBeenCalled();
  });
  it('refuses an inactive target without saving a delegation', async () => {
    const result = await update(10, 15);
    expect(result.status).toBe(403); expect((await grantRows()).some(row => row.user_id === 15)).toBe(false); expect(await auditRows()).toEqual([]);
  });
  it('rolls both a new grant and attempted audit row back when chained persistence fails', async () => {
    const before = await grantRows(); h.failAudit = true;
    const result = await update(); expect(result.status).toBe(500);
    expect(result.body.error).toBe('COMPANY_DOCUMENTS_UNAVAILABLE');
    expect(await grantRows()).toEqual(before); expect(await auditRows()).toEqual([]);
    expect(h.statements.at(-1)).toBe('ROLLBACK');
  });
  it('restores an existing delegate’s previous grant on audit failure', async () => {
    const before = await grantRows(); h.failAudit = true;
    const result = await update(10, 13, { manageBrand: false, manageLegal: true });
    expect(result.status).toBe(500); expect(await grantRows()).toEqual(before); expect(await auditRows()).toEqual([]);
  });
  it.each([10, 11])('refuses editing inherited owner/admin duties (%i) and retains all inherited capabilities', async target => {
    const before = await grantRows();
    const result = await update(10, target, { manageBrand: false, manageLegal: false });
    expect(result.status).toBe(409); expect(result.body.error).toBe('ADMIN_COMPANY_RIGHTS_INHERITED');
    expect(await grantRows()).toEqual(before); expect(await auditRows()).toEqual([]);
    const capabilities = await request(app).get('/current-capabilities').set('x-actor', String(target));
    expect(capabilities.body).toEqual({ manageBrand: true, manageLegal: true, managePermissions: true });
  });
  it('refuses administrative writes after the organization becomes inactive', async () => {
    await db.query("UPDATE organizations SET status='pending_deletion' WHERE id=7");
    const result = await update(); expect(result.status).toBe(403); expect(await auditRows()).toEqual([]);
  });
  it('does not permit body fields to substitute another actor or organization', async () => {
    const result = await request(app).put(`${path}/12`).set('x-actor', '13')
      .send({ manageBrand: true, manageLegal: true, reason: 'Attempt to impersonate an organization administrator', organizationId: 8, userId: 10 });
    expect(result.status).toBe(400); expect(h.audit).not.toHaveBeenCalled(); expect(await auditRows()).toEqual([]);
  });
});


const policyPath = '/company-documents/branding-policy';
const policy = (actor = 10, requireIndependentReview = false, expectedRevision = 0) => request(app).put(policyPath)
  .set('x-actor', String(actor)).set('x-session-role', 'admin')
  .send({ expectedRevision, requireIndependentReview, reason: 'Set reviewed default stationery approval policy' });
const settings = async () => (await db.query<{ settings: Record<string, unknown> }>('SELECT settings FROM organizations WHERE id=7')).rows[0].settings;

describe('current-database branding policy through the actual managed settings writer', () => {
  it.each([10, 11])('allows the current owner/admin (%i) to save the policy, revision and chained record together', async actor => {
    const result = await policy(actor);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ revision: 1, brandingApprovalRequired: false });
    expect((await settings()).companyDocuments).toMatchObject({ revision: 1, brandingApprovalRequired: false });
    expect((await auditRows())[0].event).toMatchObject({ tenantId: 7, userId: actor, action: 'tenant_settings_changed',
      details: { companyDocuments: { brandingPolicy: { after: { required: false } } } } });
    expect((await db.query('SELECT revision FROM company_document_revisions WHERE organization_id=7 AND revision=1')).rows).toHaveLength(1);
  });
  it('refuses a stale session admin whose current membership is ordinary member', async () => {
    await db.query("UPDATE organization_users SET role='member' WHERE organization_id=7 AND user_id=10");
    expect((await policy()).status).toBe(403); expect(await settings()).toEqual({}); expect(await auditRows()).toEqual([]);
  });
  it('does not let a brand delegate weaken or enable the organization policy', async () => {
    expect((await policy(13, false)).status).toBe(403); expect((await policy(13, true)).status).toBe(403);
    expect(await settings()).toEqual({}); expect(await auditRows()).toEqual([]);
  });
  it('refuses enabling mandatory review until a genuinely approved default has been activated', async () => {
    const result = await policy(10, true);
    expect(result.status).toBe(409); expect(result.body.error).toBe('COMPANY_DEFAULT_APPROVAL_REQUIRED');
    expect(await settings()).toEqual({}); expect(await auditRows()).toEqual([]);
    expect(h.statements.at(-1)).toBe('ROLLBACK');
  });
  it('rolls the actual settings update and audit row back when chained persistence fails', async () => {
    h.failAudit = true; const result = await policy();
    expect(result.status).toBe(500); expect(await settings()).toEqual({}); expect(await auditRows()).toEqual([]);
    expect(h.statements.at(-1)).toBe('ROLLBACK');
  });
  it('refuses a stale policy revision before changing stored settings', async () => {
    const result = await policy(10, false, 99);
    expect(result.status).toBe(409); expect(result.body.error).toBe('REVISION_CONFLICT');
    expect(await settings()).toEqual({}); expect(await auditRows()).toEqual([]);
  });
});
