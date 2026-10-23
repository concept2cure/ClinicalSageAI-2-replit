/** D2 PM-03: real HTTP/SQL against a disposable, restricted PostgreSQL role.
 * Narrow source-table fixtures with FORCE RLS prove read behavior, not the
 * entire deploy schema or authentication middleware. No provider calls/data.
 */
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RequestSqlClient } from '../../server/db/requestDb';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, type SchedulerDb } from './scheduler-harness';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
const TABLES = ['organization_users', 'regulatory_programs', 'projects', 'project_members',
  'project_visibility_settings', 'concept2cure_artifacts', 'concept2cure_review_assignments'];
const DDL = `
CREATE TABLE organizations (id integer PRIMARY KEY, status text NOT NULL);
CREATE TABLE users (id integer PRIMARY KEY, name text, email text, status text);
CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer,
 lead_user_id integer, team_members jsonb, deleted_at timestamptz);
CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid,
 owner_id integer, created_by_id integer, settings jsonb, status text, client_workspace_id integer);
CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
`;

let env: SchedulerDb;
let runtime: typeof import('../../server/db/runtime');
let store: typeof import('../../server/db/tenantStore');
let router: express.Router;
let afterRoster: (() => Promise<void>) | undefined;
let failRoster = false;
let rosterQueries = 0;

async function read(userId = 20, programId = PROGRAM, includeClient = true) {
  return store.runWithTenantScope({ tenantId: '7', role: 'member', source: 'test', caller: 'pm03-native-http' }, async () => {
    const client = await runtime.getPool().connect();
    try {
      // The instrumented explicit transaction pins tenant GUCs to this client;
      // the HTTP callback must not depend on AsyncLocalStorage crossing sockets.
      await client.query('BEGIN');
      const q: RequestSqlClient = { async query(sql, params) {
        const roster = sql.includes('/* project-team:roster */');
        if (roster) {
          rosterQueries++;
          if (failRoster) throw Object.assign(new Error('Synthetic missing roster store'), { code: '42P01' });
        }
        const result = await client.query(sql, params);
        if (roster && afterRoster) {
          const change = afterRoster;
          afterRoster = undefined;
          await change();
        }
        return result;
      } };
      const app = express();
      app.use((req, _res, next) => {
        Object.assign(req, { organizationId: 7, userRole: 'admin', user: { id: userId, organizationId: 7, role: 'admin' },
          ...(includeClient ? { dbClient: q } : {}) });
        next();
      });
      app.use('/api/c2c/projects', router);
      return await request(app).get(`/api/c2c/projects/${programId}/team`);
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
}

beforeAll(async () => {
  env = await setupSchedulerDb(databaseUrl, 'dbpm03', DDL, TABLES);
  runtime = await import('../../server/db/runtime');
  store = await import('../../server/db/tenantStore');
  router = (await import('../../server/routes/c2c/projects')).default;
  const proof = await store.runWithTenantScope({ tenantId: '7', role: 'member', source: 'test', caller: 'pm03-proof' }, () =>
    runtime.getPool().query('SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user'));
  expect(proof.rows[0]).toEqual({ role: env.runtimeRole, rolsuper: false, rolbypassrls: false });
}, 120_000);

beforeEach(async () => {
  afterRoster = undefined; failRoster = false; rosterQueries = 0;
  await env.owner.query(`TRUNCATE ${[...TABLES, 'users', 'organizations'].map(t => env.t(t)).join(', ')}`);
  await env.owner.query(`INSERT INTO ${env.t('organizations')} VALUES (7,'active'),(8,'active');
    INSERT INTO ${env.t('users')} VALUES
      (5,'Program coordinator','lead@example.test','active'),
      (6,'Project owner','owner@example.test','active'),
      (7,'Original creator','creator@example.test','active'),
      (8,'Same Name','first@example.test','active'),
      (9,'Same Name','second@example.test','active'),
      (10,'Inactive secret','inactive@example.test','inactive'),
      (11,'Foreign secret','foreign@example.test','active'),
      (12,'Revoked secret','revoked@example.test','active'),
      (20,'Current reader','reader@example.test','active'),
      (21,'Unassigned reader','unassigned@example.test','active');
    INSERT INTO ${env.t('organization_users')} VALUES
      (7,5,'member'),(7,6,'member'),(7,7,'member'),(7,8,'member'),(7,9,'member'),
      (7,10,'member'),(8,11,'member'),(7,12,'member'),(7,20,'member'),(7,21,'member');
    INSERT INTO ${env.t('regulatory_programs')} VALUES
      ('${PROGRAM}',7,5,'["Same Name","  Legacy contact  ","",null]',NULL),
      ('${FOREIGN}',8,11,'[]',NULL);
    INSERT INTO ${env.t('projects')} VALUES
      (11,7,'${PROGRAM}',6,7,'{}','active',71),(12,8,'${FOREIGN}',11,11,'{}','active',81);
    INSERT INTO ${env.t('project_visibility_settings')} VALUES (11,7,'private'),(12,8,'private');
    INSERT INTO ${env.t('project_members')} VALUES
      (11,7,8,'edit','active'),(11,7,9,'use','active'),(11,7,10,'edit','active'),
      (11,7,11,'edit','active'),(11,7,12,'use','revoked'),(11,7,20,'use','active'),
      (12,8,11,'owner','active');`);
});

afterAll(async () => {
  if (runtime) await runtime.getPool().end();
  if (env) await env.destroy();
});

describe('identity-backed team read through native HTTP and tenant SQL', () => {
  it('keeps lead, project owner, creator provenance and sharing separate on the unique anchor', async () => {
    const result = await read();
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body).toMatchObject({ program_id: PROGRAM, project_id: 11 });
    expect(result.body.team.find((r: { user_id: number }) => r.user_id === 5)).toMatchObject({
      identity: 'active_member', role: 'lead', responsibilities: ['project_lead'], sharing_role: null, sources: ['program_lead'] });
    expect(result.body.team.find((r: { user_id: number }) => r.user_id === 6)).toMatchObject({
      responsibilities: ['project_owner'], sharing_role: 'owner', sources: ['project_owner'] });
    expect(result.body.team.find((r: { user_id: number }) => r.user_id === 7)).toMatchObject({
      responsibilities: [], sharing_role: 'owner', sources: ['project_creator'] });
  });

  it('disambiguates accounts and never links recorded names to matching account names', async () => {
    const { body, status } = await read();
    expect(status, JSON.stringify(body)).toBe(200);
    const first = body.team.find((r: { user_id: number }) => r.user_id === 8);
    const second = body.team.find((r: { user_id: number }) => r.user_id === 9);
    expect(first.label).toContain('first@example.test');
    expect(second.label).toContain('second@example.test');
    const recorded = body.team.filter((r: { identity: string }) => r.identity === 'recorded_name');
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({ user_id: null, name: 'Same Name', role: null, email: null, responsibilities: [], sharing_role: null });
    expect(recorded[1].name).toBe('Legacy contact');
    expect(new Set(body.team.map((r: { entry_id: string }) => r.entry_id)).size).toBe(body.team.length);
  });

  it('reads current contact objects as unlinked names without trusting their identity or role claims', async () => {
    await env.owner.query(`UPDATE ${env.t('regulatory_programs')} SET team_members=$1 WHERE id=$2`, [JSON.stringify([
      'Historical contact', { name: '  Current contact  ', role: 'approver', userId: 20, email: 'claim@example.test' },
      { name: 'Same Name', role: 'reviewer' }, { userId: 20, role: 'owner' }, { name: ' ' },
    ]), PROGRAM]);
    const result = await read();
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const contacts = result.body.team.filter((r: { identity: string }) => r.identity === 'recorded_name');
    expect(contacts.map((r: { entry_id: string; name: string }) => [r.entry_id, r.name])).toEqual([
      ['recorded-name:0', 'Historical contact'], ['recorded-name:1', 'Current contact'], ['recorded-name:2', 'Same Name'],
    ]);
    for (const contact of contacts) expect(contact).toMatchObject({ user_id: null, email: null, role: null,
      responsibilities: [], sharing_role: null, sources: ['recorded_name'] });
    expect(JSON.stringify(contacts)).not.toMatch(/approver|reviewer|claim@example/);
  });

  it('withholds inactive/foreign account details and excludes revoked sharing-only members', async () => {
    const result = await read();
    expect(result.status).toBe(200);
    for (const id of [10, 11]) expect(result.body.team.find((r: { user_id: number }) => r.user_id === id)).toMatchObject({
      identity: 'unconfirmed_account', name: null, email: null, sharing_role: null });
    expect(result.body.team.some((r: { user_id: number }) => r.user_id === 12)).toBe(false);
    expect(JSON.stringify(result.body)).not.toMatch(/Inactive secret|inactive@example|Foreign secret|foreign@example|Revoked secret/);
  });

  it('retains a departed lead reference without treating it as a current account', async () => {
    await env.owner.query(`DELETE FROM ${env.t('organization_users')} WHERE organization_id=7 AND user_id=5`);
    const result = await read();
    expect(result.status).toBe(200);
    expect(result.body.team.find((r: { user_id: number }) => r.user_id === 5)).toMatchObject({
      identity: 'unconfirmed_account', role: 'lead', responsibilities: ['project_lead'], name: null, email: null });
  });

  it.each(['duplicate membership', 'blank role'])('does not confirm an account with %s', async kind => {
    await env.owner.query(kind === 'duplicate membership'
      ? `INSERT INTO ${env.t('organization_users')} VALUES (7,8,'member')`
      : `UPDATE ${env.t('organization_users')} SET role=' ' WHERE user_id=8`);
    const result = await read();
    if (result.status === 503) {
      expect(result.body.team).toBeUndefined();
      return;
    }
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.team.find((r: { user_id: number }) => r.user_id === 8)).toMatchObject({
      identity: 'unconfirmed_account', name: null, email: null, sharing_role: null });
  });

});

describe('current admission before and after roster loading', () => {
  it.each(['unassigned', 'foreign', 'revoked actor', 'inactive actor', 'inactive organization', 'deleted program'])('conceals %s before roster queries', async kind => {
    if (kind === 'revoked actor') await env.owner.query(`DELETE FROM ${env.t('organization_users')} WHERE user_id=20`);
    if (kind === 'inactive actor') await env.owner.query(`UPDATE ${env.t('users')} SET status='inactive' WHERE id=20`);
    if (kind === 'inactive organization') await env.owner.query(`UPDATE ${env.t('organizations')} SET status='inactive' WHERE id=7`);
    if (kind === 'deleted program') await env.owner.query(`UPDATE ${env.t('regulatory_programs')} SET deleted_at=now() WHERE id=$1`, [PROGRAM]);
    const result = await read(kind === 'unassigned' ? 21 : 20, kind === 'foreign' ? FOREIGN : PROGRAM);
    expect(result.status, JSON.stringify(result.body)).toBe(404);
    expect(rosterQueries).toBe(0);
    expect(result.body.team).toBeUndefined();
  });

  it.each(['missing', 'duplicate'])('refuses a %s live anchor before roster queries', async kind => {
    await env.owner.query(kind === 'missing'
      ? `UPDATE ${env.t('projects')} SET regulatory_program_id=NULL WHERE id=11`
      : `INSERT INTO ${env.t('projects')} SELECT 13,organization_id,regulatory_program_id,owner_id,created_by_id,settings,status,client_workspace_id FROM ${env.t('projects')} WHERE id=11`);
    expect((await read()).status).toBe(409);
    expect(rosterQueries).toBe(0);
  });

  it('reports a missing roster store as unavailable without an empty-success fallback or SQL details', async () => {
    failRoster = true;
    const result = await read();
    expect(result.status, JSON.stringify(result.body)).toBe(503);
    expect(result.body.team).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain('Synthetic');
  });

  it.each(['sharing revocation', 'actor revocation', 'anchor replacement'])('withholds the loaded roster after mid-read %s', async kind => {
    afterRoster = async () => {
      if (kind === 'sharing revocation') await env.owner.query(`DELETE FROM ${env.t('project_members')} WHERE user_id=20`);
      if (kind === 'actor revocation') await env.owner.query(`DELETE FROM ${env.t('organization_users')} WHERE user_id=20`);
      if (kind === 'anchor replacement') await env.owner.query(`UPDATE ${env.t('projects')} SET status='deleted' WHERE id=11;
        INSERT INTO ${env.t('projects')} VALUES (13,7,'${PROGRAM}',6,7,'{}','active',71);
        INSERT INTO ${env.t('project_visibility_settings')} VALUES (13,7,'org_public')`);
    };
    const result = await read();
    expect([404, 409, 503]).toContain(result.status);
    expect(rosterQueries).toBe(1);
    expect(afterRoster).toBeUndefined();
    expect(result.body.team).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain('Same Name');
  });

  it('does not fall back to a shared pool when the request client is absent', async () => {
    const result = await read(20, PROGRAM, false);
    expect(result.status).toBe(503);
    expect(result.body.team).toBeUndefined();
    expect(rosterQueries).toBe(0);
  });
});
