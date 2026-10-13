import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('../../../db', () => ({ getPool: vi.fn() }));
import { resolveOwnedReportScope } from '../scope-ownership';

let database: PGlite;
const client = { query: (sql: string, params?: unknown[]) => database.query<Record<string, unknown>>(sql, params) };
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE projects(id int PRIMARY KEY, organization_id int, client_workspace_id int, status text);
    CREATE TABLE client_workspaces(id int PRIMARY KEY, organization_id int, status text);
    CREATE TABLE concept2cure_artifacts(artifact_id text PRIMARY KEY, organization_id int, project_id int);
    CREATE TABLE c2c_submissions(id text PRIMARY KEY, organization_id int, project_id int);
    CREATE TABLE report_program_groups(id int PRIMARY KEY, organization_id int, client_workspace_id int, status text);
    CREATE TABLE report_program_group_projects(program_group_id int, project_id int, organization_id int NOT NULL);
    INSERT INTO client_workspaces VALUES(71,7,'active'),(72,7,'active'),(81,8,'active');
    INSERT INTO projects VALUES(11,7,71,'active'),(12,7,72,'active'),(21,8,81,'active');
    INSERT INTO concept2cure_artifacts VALUES('own',7,11),('other-client',7,12),('foreign',8,21),('broken',7,21);
    INSERT INTO c2c_submissions VALUES('own',7,11),('foreign',8,21),('broken',7,21);
    INSERT INTO report_program_groups VALUES(1,7,71,'active'),(2,8,81,'active'),(3,7,71,'active');
    -- Group 3 deliberately retains a corrupt legacy foreign-project link.
    -- This fixture omits the new composite FKs to prove defensive read refusal;
    -- the separate native migration suite proves such a new link cannot persist.
    INSERT INTO report_program_group_projects VALUES(1,11,7),(2,21,8),(3,21,7);
  `);
});
afterAll(async () => { await database?.close(); });
const resolve = (scopeType: string, scopeId: string, clientWorkspaceId?: number) => resolveOwnedReportScope({ organizationId: 7, scopeType, scopeId, clientWorkspaceId }, client);

describe('canonical reporting scope ownership in PostgreSQL', () => {
  it('resolves owned project, document, submission, group and account scopes', async () => {
    expect(await resolve('project', '11', 71)).toEqual({ projectId: 11 });
    expect(await resolve('document', 'own', 71)).toEqual({ projectId: 11 });
    expect(await resolve('submission', 'own', 71)).toEqual({ projectId: 11 });
    expect(await resolve('program', '1', 71)).toEqual({ projectId: null, programProjectIds: [11] });
    expect(await resolve('account', '7')).toEqual({ projectId: null });
  });
  it('keeps organization mandatory when no workspace filter is selected', async () => {
    for (const [type,id] of [['project','11'],['document','own'],['submission','own'],['program','1']]) {
      expect(await resolve(type,id)).toMatchObject({ projectId: type==='program' ? null : 11 });
    }
    for (const [type,id] of [['project','21'],['document','foreign'],['submission','foreign'],['program','2']]) {
      await expect(resolve(type,id)).rejects.toMatchObject({code:'REPORT_SCOPE_NOT_FOUND'});
    }
  });
  it('binds a supplied workspace separately from the current organization on every scope', async () => {
    for (const [type,id] of [['project','11'],['document','own'],['submission','own'],['program','1']]) {
      await expect(resolve(type,id,72)).rejects.toMatchObject({code:'REPORT_SCOPE_NOT_FOUND'});
    }
    await expect(resolve('document','other-client',72)).resolves.toEqual({projectId:12});
  });
  it.each([['project','21'],['document','foreign'],['submission','foreign'],['program','2'],['program','999'],['document','broken'],['submission','broken'],['program','3'],['account','8']])('refuses foreign, unknown or corrupt %s scope %s', async (scope, id) => {
    await expect(resolve(scope, id)).rejects.toMatchObject({ code: 'REPORT_SCOPE_NOT_FOUND' });
  });
  it('refuses a same-organization document from another client and a foreign workspace', async () => {
    await expect(resolve('document', 'other-client', 71)).rejects.toMatchObject({ code: 'REPORT_SCOPE_NOT_FOUND' });
    await expect(resolve('project', '11', 81)).rejects.toMatchObject({ code: 'REPORT_SCOPE_NOT_FOUND' });
  });
  it('refuses unverified study scope and mismatched internal project proof', async () => {
    await expect(resolve('study', '11')).rejects.toMatchObject({ code: 'REPORT_SCOPE_UNSUPPORTED' });
    await expect(resolveOwnedReportScope({ organizationId: 7, scopeType: 'project', scopeId: '11', verifiedProject: { id: 21, organizationId: 8 } }, client)).rejects.toMatchObject({ code: 'REPORT_SCOPE_NOT_FOUND' });
  });
});
