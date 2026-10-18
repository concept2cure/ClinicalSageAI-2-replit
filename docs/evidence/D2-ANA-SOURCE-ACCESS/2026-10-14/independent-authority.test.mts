/** Held-out expected authority fixtures. Actual canonical SQL and policy in
 * sequential PGlite; not PostgreSQL concurrency, deployed role or RLS proof. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../server/db.js', () => ({ pool: { query: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); } }, getPool: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); }, db: {} }));
import { admitAnaSourceReadScope, revalidateAnaSourceReadScope, assertAnaSourceProgramAllowed } from '../../../../server/services/ana/source-read-scope.ts';

const PUBLIC = '63636363-1111-4111-8111-000000000001';
const PRIVATE = '63636363-1111-4111-8111-000000000002';
const REVIEW = '63636363-1111-4111-8111-000000000003';
const EMPTY = '63636363-1111-4111-8111-000000000004';
let pg: PGlite;
const q = { query: vi.fn() };
const admit = (extra: Record<string, any> = {}) => admitAnaSourceReadScope(q as any, { organizationId: 163, userId: 1631, ...extra });

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations(id int PRIMARY KEY,status text);
    CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,regulatory_program_id uuid,client_workspace_id int,owner_id int,created_by_id int,settings jsonb);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_artifacts(id int PRIMARY KEY,project_id int,organization_id int);
    CREATE TABLE concept2cure_review_assignments(artifact_id int,organization_id int,reviewer_id int,status text);`);
});
beforeEach(async () => {
  await pg.exec(`TRUNCATE organizations,users,organization_users,regulatory_programs,projects,project_visibility_settings,project_members,concept2cure_artifacts,concept2cure_review_assignments;
    INSERT INTO organizations VALUES(163,'active');
    INSERT INTO users VALUES(1631,'active'),(1632,'active');
    INSERT INTO organization_users VALUES(163,1631,'viewer'),(163,1632,'member');
    INSERT INTO regulatory_programs VALUES('${PUBLIC}',163,NULL),('${PRIVATE}',163,NULL),('${REVIEW}',163,NULL),('${EMPTY}',163,NULL);
    INSERT INTO projects VALUES(16301,163,'${PUBLIC}',1630,1632,1632,'{}'),(16302,163,'${PRIVATE}',1630,1632,1632,'{}'),(16303,163,'${REVIEW}',1630,1632,1632,'{}');
    INSERT INTO project_visibility_settings VALUES(16301,163,'org_public'),(16302,163,'private'),(16303,163,'private');`);
  q.query.mockReset().mockImplementation((sql: string, params: unknown[] = []) => pg.query(sql, params));
});
afterAll(async () => { await pg?.close(); });

describe('independent actor scope expected fixtures', () => {
  it('A01 grants an active viewer organization-visible reads with its persisted role', async () => {
    const s = await admit({ projectRef: PUBLIC });
    expect(s).toMatchObject({ organizationId: 163, userId: 1631, role: 'viewer', projectId: 16301, programId: PUBLIC, actorFiltered: true });
    expect(s.accessibleProgramIds).toEqual([PUBLIC]);
  });
  it('A02 grants custom-role shared reads without a new role allowlist', async () => {
    await pg.exec("UPDATE organization_users SET role='lab_observer' WHERE user_id=1631; INSERT INTO project_members VALUES(16302,163,1631,'use','active')");
    expect(await admit({ projectRef: PRIVATE })).toMatchObject({ role: 'lab_observer', programId: PRIVATE });
  });
  it('A03 uses canonical ownership for a private project', async () => {
    expect(await admit({ userId: 1632, projectRef: PRIVATE })).toMatchObject({ programId: PRIVATE });
  });
  it('A04 grants pending artifact reviewers canonical private reads', async () => {
    await pg.exec('INSERT INTO concept2cure_artifacts VALUES(16377,16303,163); INSERT INTO concept2cure_review_assignments VALUES(16377,163,1631,\'pending\')');
    expect(await admit({ projectRef: REVIEW })).toMatchObject({ programId: REVIEW });
  });
  it('A05 refuses unrelated private members and never grants organization-wide fallback', async () => {
    await expect(admit({ projectRef: PRIVATE })).rejects.toMatchObject({ status: 403 });
    const s = await admit();
    expect(s.accessibleProgramIds).toEqual([PUBLIC]);
    expect(() => assertAnaSourceProgramAllowed(s, PRIVATE)).toThrow();
  });
  it('A06 re-admission detects persisted role change even when source projects are unchanged', async () => {
    const s = await admit({ projectRef: PUBLIC });
    await pg.exec("UPDATE organization_users SET role='member' WHERE user_id=1631");
    await expect(revalidateAnaSourceReadScope(q as any, s)).rejects.toMatchObject({ code: 'ANA_SOURCE_SCOPE_CHANGED' });
  });
  it('A07 refuses an inactive or missing actor even without an explicit project', async () => {
    await pg.exec("UPDATE users SET status='inactive' WHERE id=1631");
    await expect(admit()).rejects.toMatchObject({ status: 403 });
    await expect(admit({ userId: null })).rejects.toMatchObject({ status: 403 });
  });
  it('A08 rejects contradictory explicit identifiers instead of widening', async () => {
    await expect(admit({ projectId: 16302, projectRef: PUBLIC })).rejects.toMatchObject({ status: 400 });
    await expect(admit({ projectRef: 'bad-ref' })).rejects.toMatchObject({ status: 400 });
  });
  it('A09 checks all anchors before access intersection to defeat private duplicate laundering', async () => {
    await pg.query('INSERT INTO projects VALUES(16304,163,$1,1630,1632,1632,\'{}\')', [PUBLIC]);
    await pg.exec("INSERT INTO project_visibility_settings VALUES(16304,163,'private')");
    expect((await admit()).accessibleProgramIds).not.toContain(PUBLIC);
    await expect(admit({ projectRef: PUBLIC })).rejects.toMatchObject({ status: 409 });
  });
  it('A10 excludes unanchored programs and refuses explicit selection', async () => {
    expect((await admit()).accessibleProgramIds).not.toContain(EMPTY);
    await expect(admit({ requestedProgramId: EMPTY })).rejects.toMatchObject({ status: 409 });
  });
  it('A11 a policy read failure is unavailable rather than empty', async () => {
    q.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('project_members')) throw new Error('synthetic private policy failure');
      return pg.query(sql, params);
    });
    await expect(admit()).rejects.toMatchObject({ status: 503 });
  });
  it('A12 an authenticated evaluated empty set is explicitly actor-filtered', async () => {
    await pg.exec("UPDATE project_visibility_settings SET visibility='private'");
    expect(await admit()).toMatchObject({ role: 'viewer', programId: null, projectId: null, actorFiltered: true, accessibleProgramIds: [] });
  });
});
