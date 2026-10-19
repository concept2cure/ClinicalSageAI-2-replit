/** Real sequential SQL against the canonical project-sharing implementation.
 * This fixture does not establish concurrent PostgreSQL/RLS deployment proof. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  admitAnaSourceReadScope,
  assertAnaSourceProgramAllowed,
  revalidateAnaSourceReadScope,
  type AnaSourceReadScopeInput,
} from '../source-read-scope';

const PUBLIC = '10000000-0000-4000-8000-000000000011';
const PRIVATE = '10000000-0000-4000-8000-000000000012';
const OWNER = '10000000-0000-4000-8000-000000000013';
const REVIEW = '10000000-0000-4000-8000-000000000014';
const NO_ANCHOR = '10000000-0000-4000-8000-000000000015';
const FOREIGN = '10000000-0000-4000-8000-000000000021';
const ARTIFACT = '20000000-0000-4000-8000-000000000014';
let pg: PGlite;
const query = vi.fn();
const q = { query };
const actor = (extra: Partial<AnaSourceReadScopeInput> = {}): AnaSourceReadScopeInput => ({ organizationId: 7, userId: 7, ...extra });
const admit = (extra: Partial<AnaSourceReadScopeInput> = {}) => admitAnaSourceReadScope(q, actor(extra));

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamp);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer,
      regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_artifacts (id uuid PRIMARY KEY, project_id integer, organization_id integer);
    CREATE TABLE concept2cure_review_assignments (reviewer_id integer, organization_id integer, artifact_id uuid, status text);
  `);
});
beforeEach(async () => {
  await pg.exec(`
    TRUNCATE organizations,users,organization_users,regulatory_programs,projects,
      project_visibility_settings,project_members,concept2cure_artifacts,concept2cure_review_assignments;
    INSERT INTO organizations VALUES (7,'active'),(8,'active');
    INSERT INTO users VALUES (5,'active'),(6,'active'),(7,'active'),(8,'active'),(9,'active');
    INSERT INTO organization_users VALUES (7,5,'member'),(7,6,'member'),(7,7,'viewer'),(7,8,'member'),(7,9,'admin');
    INSERT INTO regulatory_programs VALUES
      ('${PUBLIC}',7,NULL),('${PRIVATE}',7,NULL),('${OWNER}',7,NULL),('${REVIEW}',7,NULL),('${NO_ANCHOR}',7,NULL),('${FOREIGN}',8,NULL);
    INSERT INTO projects VALUES
      (11,7,71,'${PUBLIC}',6,5,'{"projectSharing":{"visibility":"org_public","members":[]}}'),
      (12,7,71,'${PRIVATE}',6,5,'{"projectSharing":{"visibility":"private","members":[{"userId":7,"role":"use","status":"active"}]}}'),
      (13,7,71,'${OWNER}',7,5,'{"projectSharing":{"visibility":"private","members":[]}}'),
      (14,7,71,'${REVIEW}',6,5,'{"projectSharing":{"visibility":"private","members":[]}}'),
      (16,7,71,NULL,6,5,'{"projectSharing":{"visibility":"org_public","members":[]}}'),
      (21,8,81,'${FOREIGN}',6,5,'{"projectSharing":{"visibility":"org_public","members":[]}}');
    INSERT INTO project_members VALUES (12,7,7,'use','active');
    INSERT INTO concept2cure_artifacts VALUES ('${ARTIFACT}',14,7);
    INSERT INTO concept2cure_review_assignments VALUES (7,7,'${ARTIFACT}','pending');
  `);
  query.mockReset().mockImplementation((sql: string, args: unknown[] = []) => pg.query(sql, args));
});
afterAll(async () => { await pg?.close(); });

describe('source reads use the current canonical actor and sharing policy', () => {
  it('filters organization-wide programs by viewer public/share/owner/review access', async () => {
    const scope = await admit();
    expect(scope).toEqual({ organizationId: 7, userId: 7, role: 'viewer', projectId: null,
      programId: null, accessibleProgramIds: [PUBLIC, PRIVATE, OWNER, REVIEW], actorFiltered: true });
  });

  it.each(['viewer', 'custom_analyst'])('preserves %s private use-sharing reads without a write role allow-list', async role => {
    await pg.query('UPDATE organization_users SET role=$1 WHERE organization_id=7 AND user_id=7', [role]);
    expect(await admit({ projectRef: PRIVATE })).toMatchObject({ role, projectId: 12, programId: PRIVATE, accessibleProgramIds: [PRIVATE] });
  });

  it('refuses an unrelated member when a private program is explicitly requested', async () => {
    await expect(admit({ userId: 8, requestedProgramId: PRIVATE })).rejects.toMatchObject({ status: 403, code: 'ANA_PROJECT_ACCESS_DENIED' });
  });

  it('allows the private project creator and owner without explicit member rows', async () => {
    for (const userId of [5, 6]) expect(await admit({ userId, projectRef: PRIVATE })).toMatchObject({ projectId: 12 });
  });

  it('removes a revoked sharing grant despite stale JSON membership', async () => {
    expect((await admit()).accessibleProgramIds).toContain(PRIVATE);
    await pg.query('UPDATE project_members SET status=$1 WHERE project_id=12 AND user_id=7', ['revoked']);
    expect((await admit()).accessibleProgramIds).not.toContain(PRIVATE);
    await expect(admit({ projectRef: PRIVATE })).rejects.toMatchObject({ status: 403, code: 'ANA_PROJECT_ACCESS_DENIED' });
  });

  it('removes a finished review assignment instead of caching its access', async () => {
    expect((await admit()).accessibleProgramIds).toContain(REVIEW);
    await pg.query('UPDATE concept2cure_review_assignments SET status=$1 WHERE reviewer_id=7', ['completed']);
    expect((await admit()).accessibleProgramIds).not.toContain(REVIEW);
  });

  it('refreshes an administrator role after downgrade', async () => {
    expect((await admit({ userId: 9 })).accessibleProgramIds).toContain(PRIVATE);
    await pg.query('UPDATE organization_users SET role=$1 WHERE organization_id=7 AND user_id=9', ['viewer']);
    expect((await admit({ userId: 9 })).accessibleProgramIds).toEqual([PUBLIC]);
  });

  it.each(['removed_membership', 'suspended_user', 'inactive_org', 'duplicate_membership', 'blank_role'])('refuses organization-wide %s instead of reporting empty discovery', async kind => {
    if (kind === 'removed_membership') await pg.exec('DELETE FROM organization_users WHERE user_id=7');
    if (kind === 'suspended_user') await pg.exec("UPDATE users SET status='suspended' WHERE id=7");
    if (kind === 'inactive_org') await pg.exec("UPDATE organizations SET status='inactive' WHERE id=7");
    if (kind === 'duplicate_membership') await pg.exec("INSERT INTO organization_users VALUES(7,7,'admin')");
    if (kind === 'blank_role') await pg.exec("UPDATE organization_users SET role=' ' WHERE user_id=7");
    await expect(admit()).rejects.toMatchObject({ status: 403, code: 'ANA_PROJECT_ACCESS_DENIED' });
  });

  it('distinguishes a real empty permitted scope from failed policy reads', async () => {
    await pg.exec("UPDATE project_visibility_settings SET visibility='private'");
    await pg.exec("UPDATE projects SET settings='{" + '"projectSharing":{"visibility":"private","members":[]}' + "}'::jsonb WHERE organization_id=7");
    expect((await admit({ userId: 8 })).accessibleProgramIds).toEqual([]);
    query.mockImplementationOnce(async () => { throw new Error('private SQL detail'); });
    await expect(admit({ userId: 8 })).rejects.toMatchObject({ status: 503, code: 'ANA_PROJECT_ACCESS_UNAVAILABLE' });
  });
});

describe('source scope retains exact identifiers and all-anchor uniqueness', () => {
  it.each([
    { projectRef: PRIVATE.toUpperCase() }, { projectRef: '12' }, { projectRef: 'proj_12' },
    { projectId: 12 }, { projectId: 12, projectRef: PRIVATE, requestedProgramId: PRIVATE },
  ])('admits equivalent server-resolved scope %j', async input => {
    expect(await admit(input)).toMatchObject({ projectId: 12, programId: PRIVATE, accessibleProgramIds: [PRIVATE] });
  });

  it('preserves an explicit numeric legacy project with an empty Vault program scope', async () => {
    expect(await admit({ projectId: 16 })).toMatchObject({ projectId: 16, programId: null, accessibleProgramIds: [] });
  });

  it.each([
    { userId: 0 }, { userId: null }, { organizationId: 0 }, { userId: 2_147_483_648 },
    { projectId: '12' }, { projectRef: '' }, { projectRef: 'bogus' }, { projectRef: '2147483648' }, { requestedProgramId: '' },
    { requestedProgramId: 'bogus' },
  ])('rejects missing or malformed pinned input %j without querying source policy', async input => {
    await expect(admit(input as Partial<AnaSourceReadScopeInput>)).rejects.toMatchObject({ name: 'AnaProjectScopeError' });
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects contradictory numeric/ref and named-program scope', async () => {
    await expect(admit({ projectId: 11, projectRef: PRIVATE })).rejects.toMatchObject({ code: 'ANA_PROJECT_SCOPE_MISMATCH' });
    await expect(admit({ projectRef: PUBLIC, requestedProgramId: PRIVATE })).rejects.toMatchObject({ code: 'CROSS_PROJECT' });
    await expect(admit({ projectId: 16, requestedProgramId: PUBLIC })).rejects.toMatchObject({ code: 'CROSS_PROJECT' });
  });

  it('excludes a public/private duplicate even when only the public anchor is accessible', async () => {
    await pg.query('INSERT INTO projects VALUES(17,7,71,$1,6,5,$2::jsonb)', [PUBLIC, { projectSharing: { visibility: 'private', members: [] } }]);
    expect((await admit({ userId: 8 })).accessibleProgramIds).toEqual([]);
    await expect(admit({ userId: 8, requestedProgramId: PUBLIC })).rejects.toMatchObject({ code: 'ANA_PROJECT_ANCHOR_UNRESOLVED' });
  });

  it('excludes unanchored, foreign-parent and deleted programs while requested defects refuse', async () => {
    expect((await admit()).accessibleProgramIds).not.toContain(NO_ANCHOR);
    await expect(admit({ requestedProgramId: NO_ANCHOR })).rejects.toMatchObject({ code: 'ANA_PROJECT_ANCHOR_UNRESOLVED' });
    await expect(admit({ requestedProgramId: FOREIGN })).rejects.toMatchObject({ code: 'ANA_PROJECT_NOT_FOUND' });
    await pg.query('UPDATE regulatory_programs SET deleted_at=now() WHERE id=$1', [PUBLIC]);
    expect((await admit()).accessibleProgramIds).not.toContain(PUBLIC);
    await expect(admit({ requestedProgramId: PUBLIC })).rejects.toMatchObject({ code: 'ANA_PROJECT_NOT_FOUND' });
  });

  it('does not create a program allow-list from a foreign program linked by an owned project', async () => {
    await pg.query('UPDATE projects SET regulatory_program_id=$1 WHERE id=11', [FOREIGN]);
    expect((await admit({ userId: 8 })).accessibleProgramIds).toEqual([]);
  });

  it('returns frozen private scope values and rejects a source outside that scope', async () => {
    const scope = await admit({ userId: 8 });
    expect(Object.isFrozen(scope)).toBe(true);
    expect(Object.isFrozen(scope.accessibleProgramIds)).toBe(true);
    expect(() => assertAnaSourceProgramAllowed(scope, PUBLIC.toUpperCase())).not.toThrow();
    expect(() => assertAnaSourceProgramAllowed(scope, PRIVATE)).toThrowError();
    expect(() => assertAnaSourceProgramAllowed(scope, 'not-a-program')).toThrowError();
  });

  it('snapshots actor and scope primitives before the first await', async () => {
    const input = actor({ requestedProgramId: PUBLIC });
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    query.mockImplementationOnce(async (sql: string, args: unknown[]) => { await paused; return pg.query(sql, args); });
    const pending = admitAnaSourceReadScope(q, input);
    input.userId = 9;
    input.organizationId = 8;
    input.requestedProgramId = FOREIGN;
    release();
    expect(await pending).toMatchObject({ organizationId: 7, userId: 7, programId: PUBLIC, accessibleProgramIds: [PUBLIC] });
  });

  it('names malformed stored identity as unavailable instead of laundering a list', async () => {
    query.mockImplementation(async (sql: string, args: unknown[]) => {
      const result = await pg.query<Record<string, unknown>>(sql, args);
      if (/program_organization_id/.test(sql) && result.rows.length) result.rows[0] = { ...result.rows[0], organization_id: 8 };
      return result;
    });
    await expect(admit()).rejects.toMatchObject({ status: 503, code: 'ANA_PROJECT_ACCESS_UNAVAILABLE' });
  });
});

describe('read scope revalidation is current and cannot broaden pinned delivery', () => {
  it('returns a fresh immutable equivalent scope when policy is unchanged', async () => {
    const scope = await admit();
    const checked = await revalidateAnaSourceReadScope(q, scope);
    expect(checked).toEqual(scope);
    expect(checked).not.toBe(scope);
  });

  it('refuses an organization-wide roster change before source result delivery', async () => {
    const scope = await admit();
    await pg.exec("UPDATE project_members SET status='revoked' WHERE project_id=12 AND user_id=7");
    await expect(revalidateAnaSourceReadScope(q, scope)).rejects.toMatchObject({ code: 'ANA_SOURCE_SCOPE_CHANGED', status: 403 });
  });

  it('refuses a still-readable role change instead of carrying its stale role onward', async () => {
    const scope = await admit({ projectRef: PUBLIC });
    await pg.exec("UPDATE organization_users SET role='custom_analyst' WHERE organization_id=7 AND user_id=7");
    await expect(revalidateAnaSourceReadScope(q, scope)).rejects.toMatchObject({ code: 'ANA_SOURCE_SCOPE_CHANGED' });
  });

  it('refuses malformed or mutated DTOs rather than reading a broader organization', async () => {
    const scope = await admit({ projectRef: PUBLIC });
    for (const changed of [
      { ...scope, actorFiltered: false }, { ...scope, accessibleProgramIds: [PUBLIC, PUBLIC] },
      { ...scope, accessibleProgramIds: new Array(1) },
      { ...scope, programId: PRIVATE }, { ...scope, projectId: null },
    ]) await expect(revalidateAnaSourceReadScope(q, changed as typeof scope)).rejects.toMatchObject({ name: 'AnaProjectScopeError' });
  });
});
