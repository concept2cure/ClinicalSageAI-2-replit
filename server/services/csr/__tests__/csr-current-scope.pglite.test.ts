import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readCsrProjectActor, requireCsrJobAccess, resolveCsrScope } from '../project-scope';

let pg: PGlite;
// PGlite supplies the same SQL methods; its driver result generics differ from node-postgres.
let db: Parameters<typeof resolveCsrScope>[0];
const sqlClient = { query: async (text: string, params?: unknown[]) => ({ rows: (await pg.query<Record<string, unknown>>(text, params)).rows }) };
beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg) as unknown as typeof db;
  await pg.exec(`
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, status text,
      owner_id integer, created_by_id integer, settings jsonb, client_workspace_id integer);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, organization_id integer, reviewer_id integer, status text);
    CREATE TABLE csr_build_jobs (id integer, organization_id integer, project_id integer);
  `);
});
beforeEach(async () => {
  await pg.exec(`
    TRUNCATE users,organizations,organization_users,projects,project_visibility_settings,
      project_members,concept2cure_artifacts,concept2cure_review_assignments,csr_build_jobs;
    INSERT INTO users VALUES (5,'active'),(6,'active'),(7,'active'),(8,'active'),(9,'active');
    INSERT INTO organizations VALUES (7,'active'),(8,'active');
    INSERT INTO organization_users VALUES (7,5,'member'),(7,6,'member'),(7,7,'member'),(7,8,'member'),(7,9,'admin');
    INSERT INTO projects VALUES (11,7,'active',5,5,'{}',NULL);
    INSERT INTO project_visibility_settings VALUES (11,7,'private');
    INSERT INTO project_members VALUES (11,7,6,'edit','active'),(11,7,7,'use','active');
    INSERT INTO concept2cure_artifacts VALUES (101,7,11);
    INSERT INTO concept2cure_review_assignments VALUES (101,7,8,'pending');
    INSERT INTO csr_build_jobs VALUES (1,7,11);
  `);
});
afterAll(async () => { await pg?.close(); });

describe('CSR current project policy through real SQL and Drizzle', () => {
  it.each([5, 6, 9])('allows current owner, editor or administrator %s to write', async actorUserId => {
    await expect(resolveCsrScope(db, 7, { projectId: 11 }, { forWrite: true, actorUserId })).resolves.toEqual({ projectId: 11 });
  });
  it.each([7, 8])('retains reader/reviewer %s reads but refuses explicit and default writes', async actorUserId => {
    await expect(resolveCsrScope(db, 7, { projectId: 11 }, { forWrite: false, actorUserId })).resolves.toEqual({ projectId: 11 });
    await expect(requireCsrJobAccess(db, 7, 1, actorUserId)).resolves.toBe(true);
    await expect(requireCsrJobAccess(sqlClient, 7, 1, actorUserId)).resolves.toBe(true);
    for (const options of [{ actorUserId }, { forWrite: true, actorUserId }]) {
      await expect(resolveCsrScope(db, 7, { projectId: 11 }, options)).rejects.toMatchObject({ code: 'CSR_PROJECT_ACCESS_DENIED', status: 403 });
    }
  });
  it('does not turn organization visibility into edit permission', async () => {
    await pg.exec("UPDATE project_visibility_settings SET visibility='org_public'; DELETE FROM concept2cure_review_assignments;");
    await expect(resolveCsrScope(db, 7, { projectId: 11 }, { forWrite: false, actorUserId: 8 })).resolves.toEqual({ projectId: 11 });
    await expect(resolveCsrScope(db, 7, { projectId: 11 }, { actorUserId: 8 })).rejects.toMatchObject({ status: 403 });
  });
  it('uses current normalized edit membership after a downgrade, retaining read access', async () => {
    await pg.exec("UPDATE project_members SET role='use' WHERE user_id=6");
    await expect(resolveCsrScope(db, 7, { projectId: 11 }, { actorUserId: 6 })).rejects.toMatchObject({ status: 403 });
    await expect(resolveCsrScope(db, 7, { projectId: 11 }, { forWrite: false, actorUserId: 6 })).resolves.toEqual({ projectId: 11 });
  });
  it('keeps archived history readable and refuses new builds by its owner', async () => {
    await pg.exec("UPDATE projects SET status='archived'");
    await expect(resolveCsrScope(db, 7, { projectId: 11 }, { actorUserId: 5 })).rejects.toMatchObject({ code: 'CSR_PROJECT_ARCHIVED' });
    await expect(resolveCsrScope(db, 7, { projectId: 11 }, { forWrite: false, actorUserId: 5 })).resolves.toEqual({ projectId: 11 });
  });
  it('keeps pending-deletion retained project reads available under the existing read-only tenant policy', async () => {
    await pg.exec("UPDATE organizations SET status='pending_deletion' WHERE id=7");
    await expect(resolveCsrScope(db, 7, { projectId: 11 }, { forWrite: false, actorUserId: 7 })).resolves.toEqual({ projectId: 11 });
    await expect(requireCsrJobAccess(db, 7, 1, 7)).resolves.toBe(true);
    await expect(requireCsrJobAccess(sqlClient, 7, 1, 7)).resolves.toBe(true);
    await expect(resolveCsrScope(db, 7, { projectId: 11 }, { actorUserId: 5 })).rejects.toMatchObject({ status: 403 });
  });
});

describe.each(['sql', 'drizzle'] as const)('CSR active actor parity: %s', mode => {
  const actor = (options: { allowReadOnlyTenant?: boolean; forShare?: boolean } = {}) =>
    readCsrProjectActor(mode === 'sql' ? sqlClient : db, 7, 5, options);
  it('returns only the current persisted role', async () => {
    await expect(actor()).resolves.toEqual({ userId: 5, role: 'member' });
    await pg.exec("UPDATE organization_users SET role='  VIEWER  ' WHERE user_id=5");
    await expect(actor()).resolves.toEqual({ userId: 5, role: 'viewer' });
  });
  it.each(['disabled', 'deleted'])('refuses a %s actor even when membership and project ownership remain', async status => {
    await pg.query('UPDATE users SET status=$1 WHERE id=5', [status]);
    await expect(actor()).rejects.toMatchObject({ status: 403 });
  });
  it('refuses a missing user and an ambiguous or empty membership', async () => {
    await pg.exec('DELETE FROM users WHERE id=5');
    await expect(actor()).rejects.toMatchObject({ status: 403 });
    await pg.exec("INSERT INTO users VALUES (5,'active'); INSERT INTO organization_users VALUES (7,5,'admin')");
    await expect(actor()).rejects.toMatchObject({ status: 403 });
    await pg.exec("DELETE FROM organization_users WHERE user_id=5; INSERT INTO organization_users VALUES (7,5,'  ')");
    await expect(actor()).rejects.toMatchObject({ status: 403 });
  });
  it.each(['disabled', 'deleted'])('refuses a %s tenant even for retained reads', async status => {
    await pg.query('UPDATE organizations SET status=$1 WHERE id=7', [status]);
    await expect(actor({ allowReadOnlyTenant: true })).rejects.toMatchObject({ status: 403 });
  });
  it('allows pending-deletion retained actor reads only by explicit policy, never writer locks', async () => {
    await pg.exec("UPDATE organizations SET status='pending_deletion' WHERE id=7");
    await expect(actor()).rejects.toMatchObject({ status: 403 });
    await expect(actor({ allowReadOnlyTenant: true })).resolves.toEqual({ userId: 5, role: 'member' });
    await expect(actor({ allowReadOnlyTenant: true, forShare: true })).rejects.toMatchObject({ status: 403 });
  });
});
