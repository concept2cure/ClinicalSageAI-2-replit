/** D2 PM-04a: existing sharing HTTP handlers against real PostgreSQL, using
 * a restricted role and FORCE RLS on narrow source-table fixtures. Auth and
 * tenant middleware are synthetic; this is not full deploy/auth qualification. */
import express from 'express';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, type SchedulerDb } from './scheduler-harness';

vi.mock('../../server/auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../server/middleware/tenantContext', () => ({ tenantContextMiddleware: (_q: unknown, _s: unknown, next: () => void) => next(), requireOrganizationContext: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../server/middleware/redisRateLimiter', () => ({ createRedisRateLimiter: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../server/middleware/enterprise-performance', () => ({ cacheResponse: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../server/services/intelligence/project-intelligence-service.js', () => ({ getOrCreateProfile: async () => undefined }));
vi.mock('../../server/services/regulatory/projectBootstrapFromRegistry.js', () => ({ bootstrapFromRegistry: async () => null }));
vi.mock('../../services/regulatory/ind-ectd-sections.js', () => ({ getAllINDSections: () => [] }));

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';
const TABLES = ['organization_users', 'client_workspaces', 'regulatory_programs', 'projects',
  'project_members', 'project_visibility_settings', 'concept2cure_artifacts', 'concept2cure_review_assignments', 'regulatory_audit_logs'];
const DDL = `
CREATE TABLE organizations (id integer PRIMARY KEY, status text NOT NULL);
CREATE TABLE users (id integer PRIMARY KEY, name text, email text, status text);
CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id integer, user_id integer, role text);
CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer);
CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, lead_user_id integer, team_members jsonb, deleted_at timestamptz);
CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer, regulatory_program_id uuid,
 status text, owner_id integer, created_by_id integer, settings jsonb, name text, description text, metadata jsonb,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE project_visibility_settings (id serial PRIMARY KEY, project_id integer UNIQUE, organization_id integer,
 visibility text, updated_by_id integer, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE project_members (id serial PRIMARY KEY, project_id integer, organization_id integer, user_id integer,
 role text CHECK(role IN ('owner','edit','use')), status text CHECK(status IN ('active','revoked')),
 invited_by_id integer, accepted_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(project_id,user_id));
CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
`;
let env: SchedulerDb;
let runtime: typeof import('../../server/db/runtime');
let store: typeof import('../../server/db/tenantStore');
let coreRouter: express.Router;
let teamRouter: express.Router;
let failMembers = false;
let requests = 0;
let loseCommitAck = false;
let discards = 0;

function app(userId = 7, organizationId = 9, workspace = 71) {
  const a = express(); a.use(express.json());
  a.use((req, res, next) => {
    void store.runWithTenantScope({ tenantId: String(organizationId), role: 'member', source: 'test', caller: 'pm04-native-http' }, async () => {
      const client = await runtime.getPool().connect();
      let released = false;
      // The production lazy request owner pins tenant GUCs. This narrow HTTP
      // fixture uses an explicit read transaction on the real instrumented
      // client; writer transactions are opened by the actual sharing service.
      const readTransaction = req.method === 'GET';
      if (readTransaction) await client.query('BEGIN');
      res.once('finish', () => {
        if (released) return;
        released = true;
        if (readTransaction) void client.query('ROLLBACK').then(() => client.release(), error => client.release(error));
        else client.release();
      });
      Object.assign(req, { userId, userRole: 'admin', userEmail: 'synthetic@example.test',
        user: { id: userId, organizationId, role: 'admin' }, organizationId,
        tenantContext: { organizationId, clientWorkspaceId: workspace }, tenantId: organizationId,
        dbClient: { async query(sql: string, params?: unknown[]) {
          requests++;
          if (failMembers && sql.includes('project-sharing:members')) throw Object.assign(new Error('Synthetic unavailable sharing store'), { code: '42P01' });
          const result = await client.query(sql, params);
          if (loseCommitAck && sql.trim().toUpperCase() === 'COMMIT') {
            loseCommitAck = false; throw Object.assign(new Error('Synthetic lost commit acknowledgement'), {code:'ECONNRESET'});
          }
          return result;
        }, async discard(error: Error) { if (!released) { released = true; discards++; client.release(error); } } } });
      next();
    }).catch(next);
  });
  a.use('/api/concept2cure', coreRouter);
  a.use('/api/c2c/projects', teamRouter);
  return a;
}
const sharing = (project = 11, program = PROGRAM) => `/api/concept2cure/projects/${project}/sharing?programId=${program}`;
const member = (userId: number, project = 11, program = PROGRAM) => `/api/concept2cure/projects/${project}/sharing/members/${userId}?programId=${program}`;

beforeAll(async () => {
  const base = await readFile('migrations/0000_sweet_joseph.sql', 'utf8');
  const auditDdl = base.match(/CREATE TABLE "regulatory_audit_logs" \([\s\S]*?\n\);/)?.[0];
  if (!auditDdl) throw new Error('Canonical audit fixture DDL unavailable');
  env = await setupSchedulerDb(databaseUrl, 'dbpm04', DDL + auditDdl + 'ALTER TABLE regulatory_audit_logs ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN updated_at timestamptz DEFAULT now();', TABLES);
  runtime = await import('../../server/db/runtime');
  store = await import('../../server/db/tenantStore');
  coreRouter = (await import('../../server/routes/concept2cure')).default;
  teamRouter = (await import('../../server/routes/c2c/projects')).default;
  const proof = await store.runWithTenantScope({ tenantId: '9', role: 'member', source: 'test', caller: 'pm04-role-proof' }, () =>
    runtime.getPool().query('SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user'));
  expect(proof.rows[0]).toEqual({ role: env.runtimeRole, rolsuper: false, rolbypassrls: false });
}, 120_000);

beforeEach(async () => {
  failMembers = false; requests = 0; loseCommitAck = false; discards = 0;
  await env.owner.query(`TRUNCATE ${[...TABLES, 'users', 'organizations'].map(t => env.t(t)).join(', ')} RESTART IDENTITY`);
  await env.owner.query(`INSERT INTO ${env.t('organizations')} VALUES (9,'active'),(10,'active');
    INSERT INTO ${env.t('users')} VALUES
      (7,'Project manager','manager@example.test','active'),(8,'Same Name','one@example.test','active'),
      (9,'Same Name','two@example.test','active'),(10,'Inactive secret','inactive@example.test','inactive'),
      (11,'Foreign secret','foreign@example.test','active'),(12,'Read-only owner','viewer@example.test','active');
    INSERT INTO ${env.t('organization_users')}(organization_id,user_id,role) VALUES
      (9,7,'member'),(9,8,'member'),(9,9,'member'),(9,10,'member'),(10,11,'admin'),(9,12,'viewer');
    INSERT INTO ${env.t('client_workspaces')} VALUES (71,9),(72,9),(81,10);
    INSERT INTO ${env.t('regulatory_programs')} VALUES
      ('${PROGRAM}',9,7,'[]',NULL),('${OTHER}',9,9,'[]',NULL),('${FOREIGN}',10,11,'[]',NULL);
    INSERT INTO ${env.t('projects')}(id,organization_id,client_workspace_id,regulatory_program_id,status,owner_id,created_by_id,settings,name)
      VALUES (11,9,71,'${PROGRAM}','active',7,7,'{}','First client'),
      (12,9,72,'${OTHER}','active',9,9,'{}','Second client'),(13,10,81,'${FOREIGN}','active',11,11,'{}','Foreign client');
    INSERT INTO ${env.t('project_visibility_settings')}(project_id,organization_id,visibility) VALUES (11,9,'private'),(12,9,'private'),(13,10,'private');
    INSERT INTO ${env.t('project_members')}(project_id,organization_id,user_id,role,status,invited_by_id,accepted_at) VALUES
      (11,9,8,'use','active',7,'2026-10-01T00:00:00Z'),(11,9,12,'owner','active',7,'2026-10-01T00:00:00Z');`);
});
afterAll(async () => { if (runtime) await runtime.getPool().end(); if (env) await env.destroy(); });

describe('existing sharing routes with native PostgreSQL tenant enforcement', () => {
  it('reaches actual same-name accounts for the current owner and persists an audited Edit grant', async () => {
    const state = await request(app()).get(sharing());
    expect(state.status, JSON.stringify(state.body)).toBe(200);
    expect(state.body.data).toMatchObject({ projectId: 'proj_11', programId: PROGRAM, organizationId: 9, clientWorkspaceId: 71, actorUserId: 7, canManage: true });
    const choices = state.body.data.candidates as {userId: number; label: string}[];
    expect(choices.some(c => c.userId === 8 && c.label.includes('one@example.test'))).toBe(true);
    expect(choices.some(c => c.userId === 9 && c.label.includes('two@example.test'))).toBe(true);
    expect(choices.map(c => c.userId)).not.toContain(10);
    expect(choices.map(c => c.userId)).not.toContain(11);
    const changed = await request(app()).put(member(8)).send({role:'edit'});
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.meta.auditTrail).toMatchObject({persisted:true,chained:false});
    expect((await env.owner.query(`SELECT role,status,invited_by_id FROM ${env.t('project_members')} WHERE project_id=11 AND user_id=8`)).rows).toEqual([{role:'edit',status:'active',invited_by_id:7}]);
    expect((await env.owner.query(`SELECT action,user_id,entity_id FROM ${env.t('regulatory_audit_logs')}`)).rows).toEqual([{action:'UPDATE',user_id:7,entity_id:'11'}]);
    expect(requests).toBeGreaterThan(0);
  });
  it('revokes the durable share, retains provenance and removes future private program reads', async () => {
    const admitted = await request(app(8)).get(`/api/c2c/projects/${PROGRAM}/team`);
    expect(admitted.status, JSON.stringify(admitted.body)).toBe(200);
    const before = (await env.owner.query(`SELECT * FROM ${env.t('project_members')} WHERE project_id=11 AND user_id=8`)).rows[0];
    const removed = await request(app()).delete(member(8));
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const after = (await env.owner.query(`SELECT * FROM ${env.t('project_members')} WHERE project_id=11 AND user_id=8`)).rows[0];
    expect(after).toMatchObject({id:before.id,role:before.role,status:'revoked',invited_by_id:before.invited_by_id,accepted_at:before.accepted_at,created_at:before.created_at});
    expect((await request(app(8)).get(`/api/c2c/projects/${PROGRAM}/team`)).status).toBe(404);
    expect((await request(app()).delete(member(8))).status).toBe(409);
  });
  it('can clean up a departed account’s share without erasing its identity or original grant', async () => {
    await env.owner.query(`DELETE FROM ${env.t('organization_users')} WHERE organization_id=9 AND user_id=8`);
    const removed = await request(app()).delete(member(8));
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect((await env.owner.query(`SELECT user_id,role,status,invited_by_id FROM ${env.t('project_members')} WHERE project_id=11 AND user_id=8`)).rows).toEqual([{user_id:8,role:'use',status:'revoked',invited_by_id:7}]);
  });
  it('does not mistake a claimed admin role or a read-only owner for current management rights', async () => {
    const reader = await request(app(8)).get(sharing());
    expect(reader.status).toBe(200);
    expect(reader.body.data).toMatchObject({canManage:false,candidates:[]});
    expect((await request(app(8)).put(member(9)).send({role:'edit'})).status).toBe(403);
    expect((await request(app(12)).put(member(9)).send({role:'edit'})).status).toBe(403);
    expect((await request(app(12)).patch(`/api/concept2cure/projects/11/sharing/visibility?programId=${PROGRAM}`).send({visibility:'org_public'})).status).toBe(403);
    expect((await env.owner.query(`SELECT visibility FROM ${env.t('project_visibility_settings')} WHERE project_id=11`)).rows[0].visibility).toBe('private');
  });
  it.each([10,11])('refuses inactive/foreign recipient %s without a grant', async id => {
    const response = await request(app()).put(member(id)).send({role:'use'});
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect((await env.owner.query(`SELECT * FROM ${env.t('project_members')} WHERE project_id=11 AND user_id=$1`,[id])).rows).toEqual([]);
  });
  it('refuses a mismatched program/anchor and a second client owned by another current member', async () => {
    for (const url of [member(8,12,PROGRAM),member(8,12,OTHER),member(8,13,FOREIGN)]) {
      const response = await request(app()).put(url).send({role:'edit'});
      expect(response.status).toBeGreaterThanOrEqual(400); expect(response.status).toBeLessThan(500);
    }
    expect((await env.owner.query(`SELECT * FROM ${env.t('project_members')} WHERE project_id IN (12,13) AND user_id=8`)).rows).toEqual([]);
  });
  it('rejects an explicit different client workspace even when the UUID and integer anchor match', async () => {
    const read = await request(app(7,9,72)).get(sharing());
    const write = await request(app(7,9,72)).put(member(9)).send({role:'edit'});
    for (const result of [read,write]) { expect(result.status).toBeGreaterThanOrEqual(400); expect(result.status).toBeLessThan(500); }
    expect((await env.owner.query(`SELECT * FROM ${env.t('project_members')} WHERE project_id=11 AND user_id=9`)).rows).toEqual([]);
  });
  it('protects implicit owner/creator access and archived projects', async () => {
    expect((await request(app()).delete(member(7))).status).toBe(409);
    await env.owner.query(`UPDATE ${env.t('projects')} SET status='archived' WHERE id=11`);
    expect((await request(app()).put(member(9)).send({role:'edit'})).status).toBe(409);
  });
  it('reports a lost COMMIT acknowledgement as unconfirmed while the actual saved grant can be re-read', async () => {
    loseCommitAck = true;
    const changed = await request(app()).put(member(8)).send({role:'edit'});
    expect(changed.status, JSON.stringify(changed.body)).toBe(503);
    expect(JSON.stringify(changed.body)).not.toMatch(/nothing was changed|rolled back/i);
    expect(discards).toBe(1);
    expect((await env.owner.query(`SELECT role,status FROM ${env.t('project_members')} WHERE project_id=11 AND user_id=8`)).rows).toEqual([{role:'edit',status:'active'}]);
    const state = await request(app()).get(sharing());
    expect(state.status, JSON.stringify(state.body)).toBe(200);
    expect(state.body.data.members.find((row: {userId:number}) => row.userId === 8).role).toBe('edit');
  });
  it('refuses unverified member-store reads instead of returning a verified empty state', async () => {
    failMembers = true;
    const response = await request(app()).get(sharing());
    expect(response.status).toBe(503);
    expect(response.body.data).toBeUndefined();
  });
});
