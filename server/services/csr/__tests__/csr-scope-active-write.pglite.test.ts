import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readCsrProjectActor, resolveCsrBuildContext, resolveCsrScope } from '../project-scope';

let pg: PGlite;
let database: Parameters<typeof resolveCsrScope>[0];
const PROGRAM_A = '11111111-2222-4333-8444-000000000011';
const PROGRAM_B = '11111111-2222-4333-8444-000000000012';
const RUN = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000011';
const actor = (userId: number, forWrite = true) => resolveCsrScope(database, 7,
  { projectId: 11 }, { actorUserId: userId, forWrite });

beforeAll(async () => {
  pg = new PGlite();
  // PGlite executes the same real SQL and returns rows, but its result envelope
  // lacks node-pg command/rowCount/oid fields. Bridge that driver-only test
  // boundary; production types and row/admission checks remain unchanged.
  database = drizzle(pg) as unknown as typeof database;
  await pg.exec(`
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer,
      status text, regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb);
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    INSERT INTO users VALUES (5,'active'),(6,'active'),(7,'active'),(8,'active'),(9,'active');
    INSERT INTO organizations VALUES (7,'active');
    INSERT INTO organization_users VALUES (7,5,'member'),(7,6,'member'),(7,7,'member'),(7,8,'member'),(7,9,'member');
    INSERT INTO projects VALUES (11,7,NULL,'active','${PROGRAM_A}',5,5,'{}'),(12,7,NULL,'active','${PROGRAM_B}',5,5,'{}');
    INSERT INTO project_visibility_settings VALUES (11,7,'private');
    INSERT INTO project_members VALUES (11,7,6,'edit','active'),(11,7,7,'use','active');
    INSERT INTO concept2cure_artifacts VALUES (31,7,11);
    INSERT INTO concept2cure_review_assignments VALUES (31,8,7,'pending');
  `);
});
beforeEach(async () => {
  await pg.exec("UPDATE users SET status='active'; UPDATE organizations SET status='active'; UPDATE organization_users SET role='member'");
});
afterAll(async () => { await pg.close(); });

describe('CSR current source-project read and write admission', () => {
  it.each([5, 6])('admits owner/editor %s for a new CSR write', async userId => {
    await expect(actor(userId)).resolves.toEqual({ projectId: 11 });
  });
  it.each([7, 8])('retains read access for user %s while refusing build/review writes', async userId => {
    await expect(actor(userId, false)).resolves.toEqual({ projectId: 11 });
    await expect(actor(userId)).rejects.toMatchObject({ code: 'CSR_PROJECT_ACCESS_DENIED', status: 403 });
  });
  it('does not treat organization-public read visibility as edit permission', async () => {
    await pg.exec("UPDATE project_visibility_settings SET visibility='org_public'");
    try {
      await expect(actor(9, false)).resolves.toEqual({ projectId: 11 });
      await expect(actor(9)).rejects.toMatchObject({ code: 'CSR_PROJECT_ACCESS_DENIED' });
    } finally { await pg.exec("UPDATE project_visibility_settings SET visibility='private'"); }
  });
  it.each(['inactive', 'suspended'])('denies a currently %s requester through the Drizzle path', async status => {
    await pg.query('UPDATE users SET status=$1 WHERE id=5', [status]);
    await expect(actor(5)).rejects.toMatchObject({ code: 'CSR_PROJECT_ACCESS_DENIED' });
    await expect(readCsrProjectActor(database, 7, 5)).rejects.toMatchObject({ status: 403 });
  });
  it.each(['inactive', 'suspended', 'pending_deletion'])('does not write under a currently %s tenant', async status => {
    await pg.query('UPDATE organizations SET status=$1 WHERE id=7', [status]);
    await expect(actor(5)).rejects.toMatchObject({ code: 'CSR_PROJECT_ACCESS_DENIED' });
  });
  it('applies the same explicit pending-deletion retained-read policy to both adapters', async () => {
    await pg.exec("UPDATE organizations SET status='pending_deletion'");
    const sql = { query: (text: string, params?: unknown[]) => pg.query<Record<string, unknown>>(text, params) };
    await expect(readCsrProjectActor(sql, 7, 5)).rejects.toMatchObject({ status: 403 });
    await expect(readCsrProjectActor(database, 7, 5)).rejects.toMatchObject({ status: 403 });
    await expect(readCsrProjectActor(sql, 7, 5, { allowReadOnlyTenant: true })).resolves.toEqual({ userId: 5, role: 'member' });
    await expect(readCsrProjectActor(database, 7, 5, { allowReadOnlyTenant: true })).resolves.toEqual({ userId: 5, role: 'member' });
    await expect(readCsrProjectActor(database, 7, 5, { allowReadOnlyTenant: true, forShare: true })).rejects.toMatchObject({ status: 403 });
  });
  it('retains pending-deletion project history while refusing new CSR writes', async () => {
    await pg.exec("UPDATE organizations SET status='pending_deletion'");
    await expect(actor(5, false)).resolves.toEqual({ projectId: 11 });
    await expect(actor(5)).rejects.toMatchObject({ code: 'CSR_PROJECT_ACCESS_DENIED' });
  });
  it('refuses a malformed blank membership role in either adapter', async () => {
    await pg.exec("UPDATE organization_users SET role='   ' WHERE user_id=5");
    await expect(readCsrProjectActor(database, 7, 5)).rejects.toMatchObject({ status: 403 });
  });
});


describe('CSR retained source target before quota reservation', () => {
  const source = (programId: string) => ({ programId, runId: RUN, studyId: 'SAME-PROTOCOL' });
  it('binds the actual source program to the numeric project before billing', async () => {
    const request = { organizationId: 7, userId: 5, projectId: 11, evidenceSource: source(PROGRAM_B) };
    await expect(resolveCsrBuildContext(database, request, { organizationId: 7, projectId: 11 }))
      .rejects.toMatchObject({ code: 'CSR_SCOPE_MISMATCH' });
  });
  it('refuses contradictory program declarations before quota reservation', async () => {
    const request = { organizationId: 7, userId: 5, projectId: 11, evidenceSource: source(PROGRAM_B) };
    await expect(resolveCsrBuildContext(database, request, { organizationId: 7, programId: PROGRAM_A }))
      .rejects.toMatchObject({ code: 'CSR_SCOPE_MISMATCH' });
  });
  it('derives the unique editable target from an explicitly selected retained program', async () => {
    const request = { organizationId: 7, userId: 5, evidenceSource: source(PROGRAM_B) };
    await expect(resolveCsrBuildContext(database, request, { organizationId: 7 }))
      .resolves.toMatchObject({ projectId: 12, programId: PROGRAM_B, requestedBy: 5 });
  });
  it('retains matching exact source identity', async () => {
    const request = { organizationId: 7, userId: 5, projectId: 11, evidenceSource: source(PROGRAM_A) };
    await expect(resolveCsrBuildContext(database, request, { organizationId: 7 }))
      .resolves.toMatchObject({ projectId: 11, programId: PROGRAM_A, requestedBy: 5 });
  });
  it.each([null, {}, { programId: PROGRAM_A }, { ...source(PROGRAM_A), runId: 'not-a-run' }])('refuses malformed retained source selection before quota: %j', async evidenceSource => {
      const request = { organizationId: 7, userId: 5, projectId: 11, evidenceSource };
      await expect(resolveCsrBuildContext(database, request, { organizationId: 7 })).rejects.toBeDefined();
    });
});
