/** The actual registered planner refuses private source reads, including
 * calls made outside the HTTP admission boundary. No model is invoked. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ query: vi.fn(), getPool: vi.fn() }));
vi.mock('../../../db', () => ({ db: {}, pool: { query: io.query }, getPool: io.getPool }));
vi.mock('../../../db.js', () => ({ db: {}, pool: { query: io.query }, getPool: io.getPool }));

import { getToolHandler, type ToolContext } from '../AnaToolExecutor';

let pg: PGlite;
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const PRIVATE_TITLE = 'Private CSR Project 11';
const context = (userId: number): ToolContext => ({ organizationId: 7, userId, projectRef: PROGRAM });
async function plan(ctx: ToolContext, input: Record<string, unknown> = {}) {
  return JSON.parse(await getToolHandler('plan_submission_from_database_lock')!(input, ctx));
}
function assertNoVaultRead() {
  expect(io.query.mock.calls.some(([sql]) => /\bFROM\s+vault\.documents\b/i.test(String(sql)))).toBe(false);
}
function assertRefused(out: Record<string, unknown>, code = 'ANA_PROJECT_ACCESS_DENIED') {
  expect(out.standing).toBeNull();
  expect(out.code).toBe(code);
  expect(JSON.stringify(out)).not.toContain(PRIVATE_TITLE);
  expect(JSON.stringify(out)).not.toMatch(/organization_users|project_members|relation .* does not exist/i);
  assertNoVaultRead();
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
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, program_id uuid, organization_id integer,
      ctd_section text, folder_id text, evidence_kind text, placement_status text, document_title text, deleted_at timestamp);
  `);
});
beforeEach(async () => {
  await pg.exec(`
    TRUNCATE regulatory_programs,projects,organization_users,users,organizations,project_visibility_settings,project_members,
      concept2cure_review_assignments,concept2cure_artifacts,vault.documents RESTART IDENTITY;
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',7,NULL);
    INSERT INTO projects VALUES (11,7,71,'${PROGRAM}',6,5,
      '{"projectSharing":{"visibility":"private","members":[{"userId":7,"role":"use","status":"active"}]}}');
    INSERT INTO organization_users (organization_id,user_id,role) VALUES
      (7,5,'member'),(7,6,'member'),(7,7,'member'),(7,8,'member'),(7,9,'admin');
    INSERT INTO organizations VALUES (7,'active');
    INSERT INTO users VALUES (5,'active'),(6,'active'),(7,'active'),(8,'active'),(9,'active');
    INSERT INTO project_members VALUES (11,7,7,'use','active');
    INSERT INTO vault.documents VALUES ('11111111-2222-4333-8444-000000000099','${PROGRAM}',7,
      NULL,'module-5','csr','confirmed','${PRIVATE_TITLE}',NULL);
  `);
  io.query.mockReset().mockImplementation((sql: string, args: unknown[] = []) => pg.query(sql, args));
  io.getPool.mockReset().mockReturnValue({ query: io.query });
});
afterAll(async () => { await pg?.close(); });

describe('registered submission plan uses current private-project access', () => {
  it('refuses an unrelated member before reading Vault titles or standing', async () => {
    assertRefused(await plan(context(8)));
  });

  it('reads recorded standing for an active shared member and for the project creator', async () => {
    for (const userId of [7, 5]) {
      const out = await plan(context(userId));
      expect(out.code).toBeUndefined();
      expect(out.standing).not.toBeNull();
      expect(JSON.stringify(out.standing)).toContain(PRIVATE_TITLE);
    }
  });

  it('rechecks a normalized share after revocation instead of trusting old JSON or a prior successful call', async () => {
    expect((await plan(context(7))).standing).not.toBeNull();
    await pg.query('UPDATE project_members SET status=$1 WHERE project_id=$2 AND user_id=$3', ['revoked', 11, 7]);
    io.query.mockClear();
    assertRefused(await plan(context(7)));
  });

  it('rechecks the live organization role after an administrator is downgraded', async () => {
    expect((await plan(context(9))).standing).not.toBeNull();
    await pg.query('UPDATE organization_users SET role=$1 WHERE organization_id=$2 AND user_id=$3', ['member', 7, 9]);
    io.query.mockClear();
    assertRefused(await plan(context(9)));
  });

  it('refuses a creator who is no longer an organization member', async () => {
    await pg.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [7, 5]);
    assertRefused(await plan(context(5)));
  });

  it('refuses a suspended actor even when their organization role still grants management access', async () => {
    await pg.query('UPDATE users SET status=$1 WHERE id=$2', ['suspended', 9]);
    assertRefused(await plan(context(9)));
  });

  it('refuses standing from an inactive organization', async () => {
    await pg.query('UPDATE organizations SET status=$1 WHERE id=$2', ['inactive', 7]);
    assertRefused(await plan(context(7)));
  });

  it('refuses a requested private project without a pinned actor', async () => {
    assertRefused(await plan({ organizationId: 7, projectRef: PROGRAM }));
  });

  it('fails closed before source reads when membership verification fails', async () => {
    await pg.exec('ALTER TABLE organization_users RENAME TO inaccessible_organization_users');
    try {
      assertRefused(await plan(context(7)), 'ANA_PROJECT_ACCESS_UNAVAILABLE');
    } finally {
      await pg.exec('ALTER TABLE inaccessible_organization_users RENAME TO organization_users');
    }
  });

  it('keeps the general plan available without a project or actor and performs no database query', async () => {
    const out = await plan({ organizationId: 7 });
    expect(out.plan).toEqual(expect.arrayContaining([expect.stringContaining('csr:')]));
    expect(out.standing).toBeNull();
    expect(out.code).toBeUndefined();
    expect(io.query).not.toHaveBeenCalled();
  });

  it('keeps static plan steps and the registered IND reference catalogue database-free', async () => {
    expect((await plan(context(8), { step: 'csr' })).step.id).toBe('csr');
    const catalogue = JSON.parse(await getToolHandler('get_document_section_requirements')!({ document: 'ind_pyramid', limit: 1 }));
    expect(catalogue.kind).toBe('IND reference catalogue');
    expect(catalogue.entries).toHaveLength(1);
    expect(catalogue.standing).toBeUndefined();
    expect(io.query).not.toHaveBeenCalled();
  });
});
