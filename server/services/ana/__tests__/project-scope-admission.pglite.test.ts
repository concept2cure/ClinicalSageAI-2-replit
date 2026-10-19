/** AnA's project admission uses current persisted authorization through real
 * SQL, independent of browser roles and the model's choice of tool. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { admitAnaProjectScope, AnaProjectScopeError, type AnaProjectScopeInput } from '../project-scope-admission';

let pg: PGlite;
const query = vi.fn();
const client = { query };
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const FOREIGN = '11111111-2222-4333-8444-000000000021';
const UNANCHORED = '11111111-2222-4333-8444-000000000031';
const scope = (extra: Partial<AnaProjectScopeInput> = {}) => ({ organizationId: 7, userId: 7, projectRef: PROGRAM, ...extra });
const admit = (extra: Partial<AnaProjectScopeInput> = {}) => admitAnaProjectScope(client, scope(extra));
async function expectDenied(extra: Partial<AnaProjectScopeInput> = {}) {
  await expect(admit(extra)).rejects.toMatchObject({ status: 403, code: 'ANA_PROJECT_ACCESS_DENIED' });
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamp);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer,
      regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb);
    CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id integer, user_id integer, role text);
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (reviewer_id integer, organization_id integer, artifact_id uuid, status text);
    CREATE TABLE concept2cure_artifacts (id uuid PRIMARY KEY, project_id integer, organization_id integer);
  `);
});
beforeEach(async () => {
  await pg.exec(`
    TRUNCATE regulatory_programs,projects,organization_users,users,organizations,project_visibility_settings,
      project_members,concept2cure_review_assignments,concept2cure_artifacts RESTART IDENTITY;
    INSERT INTO organizations VALUES (7,'active'),(8,'active');
    INSERT INTO users VALUES (5,'active'),(6,'active'),(7,'active'),(8,'active'),(9,'active');
    INSERT INTO organization_users (organization_id,user_id,role) VALUES
      (7,5,'member'),(7,6,'member'),(7,7,'member'),(7,8,'member'),(7,9,'admin');
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',7,NULL),('${FOREIGN}',8,NULL),('${UNANCHORED}',7,NULL);
    INSERT INTO projects VALUES
      (11,7,71,'${PROGRAM}',6,5,'{"projectSharing":{"visibility":"private","members":[{"userId":7,"role":"use","status":"active"}]}}'),
      (12,7,71,NULL,6,5,'{"projectSharing":{"visibility":"org_public","members":[]}}'),
      (21,8,81,'${FOREIGN}',6,5,'{"projectSharing":{"visibility":"org_public","members":[]}}');
    INSERT INTO project_members VALUES (11,7,7,'use','active');
  `);
  query.mockReset().mockImplementation((sql: string, args: unknown[] = []) => pg.query(sql, args));
});
afterAll(async () => { await pg?.close(); });

describe('AnA project identifiers retain their exact tenant and project scope', () => {
  it('keeps an omitted project database-free, including ordinary null context fields', async () => {
    for (const input of [
      { organizationId: null, userId: null },
      { organizationId: 7, userId: 7, projectId: null, projectRef: null },
    ]) {
      expect(await admitAnaProjectScope(client, input)).toEqual({ projectId: null, programId: null, projectRef: null });
    }
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { projectRef: PROGRAM.toUpperCase() },
    { projectRef: '11' },
    { projectRef: 'proj_11' },
    { projectRef: undefined, projectId: 11 },
    { projectRef: PROGRAM, projectId: 11 },
  ])('admits the same authorized anchored project through %j', async input => {
    expect(await admit(input)).toEqual({ projectId: 11, programId: PROGRAM, projectRef: PROGRAM });
  });

  it('preserves a real unanchored numeric project without inventing a program', async () => {
    expect(await admit({ userId: 8, projectRef: '12' })).toEqual({ projectId: 12, programId: null, projectRef: '12' });
  });

  it.each([{ projectRef: '21' }, { projectRef: FOREIGN }, { projectRef: '999' }])('refuses foreign or absent target %j', async input => {
    await expect(admit(input)).rejects.toMatchObject({ status: 404, code: 'ANA_PROJECT_NOT_FOUND' });
  });

  it('refuses conflicting numeric and program references rather than choosing one', async () => {
    await expect(admit({ projectId: 12 })).rejects.toMatchObject({ status: 400, code: 'ANA_PROJECT_SCOPE_MISMATCH' });
  });

  it.each([{ projectRef: 'unknown-project' }, { projectRef: 0 }, { projectRef: PROGRAM, projectId: 'not-a-number' }])('never converts malformed explicit scope %j into an organization-wide turn', async input => {
    await expect(admit(input)).rejects.toMatchObject({ status: 400, code: 'ANA_PROJECT_SCOPE_INVALID' });
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a program with no anchor and an ambiguous anchor before private content can be selected', async () => {
    await expect(admit({ projectRef: UNANCHORED })).rejects.toMatchObject({ status: 409, code: 'ANA_PROJECT_ANCHOR_UNRESOLVED' });
    await pg.query('INSERT INTO projects VALUES ($1,$2,$3,$4,$5,$6,$7)', [13, 7, 71, PROGRAM, 6, 5, {}]);
    await expect(admit()).rejects.toMatchObject({ status: 409, code: 'ANA_PROJECT_ANCHOR_UNRESOLVED' });
  });

  it('validates the stored program tenant even when the numeric project exists in this organization', async () => {
    await pg.query('UPDATE projects SET regulatory_program_id=$1 WHERE id=$2', [FOREIGN, 11]);
    await expect(admit({ projectRef: '11' })).rejects.toMatchObject({ status: 404, code: 'ANA_PROJECT_NOT_FOUND' });
  });
});

describe('AnA uses current canonical project permission and active membership', () => {
  it.each([{ projectRef: PROGRAM }, { projectRef: '11' }])('refuses an unrelated organization member for %j', async input => {
    await expectDenied({ userId: 8, ...input });
  });

  it('admits the private project creator and owner without an explicit member entry', async () => {
    for (const userId of [5, 6]) expect(await admit({ userId })).toMatchObject({ projectId: 11 });
  });

  it('uses normalized current membership after revocation instead of stale JSON sharing or a cached admission', async () => {
    expect(await admit()).toMatchObject({ projectId: 11 });
    await pg.query('UPDATE project_members SET status=$1 WHERE project_id=$2 AND user_id=$3', ['revoked', 11, 7]);
    await expectDenied();
  });

  it('rechecks the live role after an administrator is downgraded', async () => {
    expect(await admit({ userId: 9 })).toMatchObject({ projectId: 11 });
    await pg.query('UPDATE organization_users SET role=$1 WHERE organization_id=$2 AND user_id=$3', ['member', 7, 9]);
    await expectDenied({ userId: 9 });
  });

  it('allows a shared member with a tenant-specific role rather than introducing a new role allow-list', async () => {
    await pg.query('UPDATE organization_users SET role=$1 WHERE organization_id=$2 AND user_id=$3', ['custom_analyst', 7, 7]);
    expect(await admit()).toMatchObject({ projectId: 11 });
  });

  it('refuses a creator whose organization membership has been removed', async () => {
    await pg.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [7, 5]);
    await expectDenied({ userId: 5 });
  });

  it('refuses ambiguous membership rows instead of selecting the most privileged role', async () => {
    await pg.query('INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,$2,$3)', [7, 8, 'admin']);
    await expectDenied({ userId: 8 });
  });

  it('refuses a suspended administrator and an inactive organization', async () => {
    await pg.query('UPDATE users SET status=$1 WHERE id=$2', ['suspended', 9]);
    await expectDenied({ userId: 9 });
    await pg.query('UPDATE organizations SET status=$1 WHERE id=$2', ['inactive', 7]);
    await expectDenied();
  });

  it('refuses an explicit project without a valid pinned actor', async () => {
    await expectDenied({ userId: null });
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['organization_users', 'project_members'])('fails closed when %s cannot be read', async table => {
    await pg.exec(`ALTER TABLE ${table} RENAME TO inaccessible_${table}`);
    try {
      const failure = await admit().catch(error => error);
      expect(failure).toBeInstanceOf(AnaProjectScopeError);
      expect(failure).toMatchObject({ status: 503, code: 'ANA_PROJECT_ACCESS_UNAVAILABLE' });
      expect(failure.message).not.toContain(table);
    } finally {
      await pg.exec(`ALTER TABLE inaccessible_${table} RENAME TO ${table}`);
    }
  });
});
