/**
 * Project-first authoring uses the existing project's edit policy for writes,
 * not its broader read policy. The real program/anchor/sharing readers execute
 * against PGlite; this is not a native PostgreSQL concurrency or RLS proof.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authorizeAuthoringProgram } from '../authoring-program-access';

const ORG = 7;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const PROJECT = 42;
let pg: PGlite;
const q = {
  query: (text: string, params?: unknown[]) => pg.query<Record<string, unknown>>(text, params),
};

function authorize(userId: number, forWrite?: boolean) {
  return authorizeAuthoringProgram(q, {
    tenantId: ORG,
    actor: { id: String(userId), email: `person-${userId}@example.test` },
    programId: PROGRAM,
    ...(forWrite === undefined ? {} : { forWrite }),
  });
}

async function refusesProjectWrites(userId: number) {
  for (const mode of [undefined, true] as const) {
    await expect(authorize(userId, mode)).rejects.toMatchObject({
      status: 403, code: 'PROJECT_PERMISSION_DENIED',
    });
  }
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid,
      client_workspace_id integer, owner_id integer, created_by_id integer, settings jsonb);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_artifacts (id integer PRIMARY KEY, organization_id integer, project_id integer);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, organization_id integer, reviewer_id integer, status text);
  `);
});

beforeEach(async () => {
  await pg.exec(`
    TRUNCATE users, organizations, organization_users, regulatory_programs, projects,
      project_visibility_settings, project_members, concept2cure_artifacts, concept2cure_review_assignments;
    INSERT INTO users VALUES (5,'active'),(6,'active'),(7,'active'),(8,'active'),
      (9,'active'),(10,'active'),(11,'active'),(12,'active');
    INSERT INTO organizations VALUES (${ORG},'active');
    INSERT INTO organization_users VALUES (${ORG},5,'member'),(${ORG},6,'member'),(${ORG},7,'member'),
      (${ORG},8,'member'),(${ORG},9,'member'),(${ORG},10,'admin'),(${ORG},11,'viewer'),(${ORG},12,'member');
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',${ORG},NULL);
    INSERT INTO projects VALUES (${PROJECT},${ORG},'${PROGRAM}',NULL,5,5,'{}');
    INSERT INTO project_visibility_settings VALUES (${PROJECT},${ORG},'private');
    INSERT INTO project_members VALUES (${PROJECT},${ORG},6,'edit','active'),
      (${PROJECT},${ORG},7,'use','active'),(${PROJECT},${ORG},11,'use','active'),
      (${PROJECT},${ORG},12,'edit','revoked');
    INSERT INTO concept2cure_artifacts VALUES (101,${ORG},${PROJECT});
    INSERT INTO concept2cure_review_assignments VALUES (101,${ORG},8,'pending');
  `);
});

afterAll(async () => { await pg?.close(); });

describe('authoring applies the existing project edit policy on its actual SQL connection', () => {
  it.each([['owner', 5], ['editor', 6], ['administrator', 10]] as const)(
    'keeps the current %s able to read and write', async (_label, userId) => {
      for (const mode of [false, undefined, true] as const) {
        await expect(authorize(userId, mode)).resolves.toMatchObject({ projectId: PROJECT, programId: PROGRAM });
      }
    },
  );

  it('keeps a use member able to read but refuses default and explicit writes', async () => {
    await expect(authorize(7, false)).resolves.toMatchObject({ projectId: PROJECT });
    await refusesProjectWrites(7);
  });

  it('keeps a pending reviewer able to read without granting project editing', async () => {
    await expect(authorize(8, false)).resolves.toMatchObject({ projectId: PROJECT });
    await refusesProjectWrites(8);
  });

  it('does not turn organization-public reading into project editing', async () => {
    await pg.query('UPDATE project_visibility_settings SET visibility=$1 WHERE project_id=$2', ['org_public', PROJECT]);
    await expect(authorize(9, false)).resolves.toMatchObject({ projectId: PROJECT });
    await refusesProjectWrites(9);
  });

  it('reads the actual edit downgrade while retaining the member’s read access', async () => {
    await expect(authorize(6)).resolves.toMatchObject({ projectId: PROJECT });
    await pg.query('UPDATE project_members SET role=$1 WHERE project_id=$2 AND user_id=$3', ['use', PROJECT, 6]);
    await expect(authorize(6, false)).resolves.toMatchObject({ projectId: PROJECT });
    await refusesProjectWrites(6);
  });

  it('retains the organization viewer refusal even when the project admits reading', async () => {
    await expect(authorize(11, false)).resolves.toMatchObject({ projectId: PROJECT });
    for (const mode of [undefined, true] as const) {
      await expect(authorize(11, mode)).rejects.toMatchObject({ status: 403, code: 'IMPORT_WRITE_PERMISSION_DENIED' });
    }
  });

  it('refuses a revoked private-project member for reads and writes', async () => {
    await expect(authorize(12, false)).rejects.toMatchObject({ status: 403, code: 'PROJECT_PERMISSION_DENIED' });
    await refusesProjectWrites(12);
  });
});
