/**
 * One person's edit right on one project, through the real project sharing policy, for a PGlite suite that drives
 * /api/c2c/documents about something else (F1, 2026-11-05).
 *
 * The route admits a document only of a program the person can open (getCurrentAccessibleProgramScope) and a write
 * only with the project's edit right (requireCurrentProgramAccess, then canAccessReportProject forWrite). A suite
 * about the section save, the filing seal or the submit evidence gives its caller both, on the policy's own tables,
 * rather than a stub. The suite that proves the access rules is documents-project-scope.pglite.test.ts.
 *
 * It completes whatever the suite's prerequisites already created (organizations, users, regulatory_programs are
 * usually bare) and creates the rest.
 */
export interface SqlRunner {
  exec(sql: string): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

const POLICY_TABLES = `
  ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
  ALTER TABLE regulatory_programs ADD COLUMN IF NOT EXISTS organization_id integer;
  ALTER TABLE regulatory_programs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
  CREATE TABLE IF NOT EXISTS organization_users (organization_id integer NOT NULL, user_id integer NOT NULL, role text);
  CREATE TABLE IF NOT EXISTS projects (id integer PRIMARY KEY);
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id integer, ADD COLUMN IF NOT EXISTS regulatory_program_id uuid,
    ADD COLUMN IF NOT EXISTS client_workspace_id integer, ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS owner_id integer, ADD COLUMN IF NOT EXISTS created_by_id integer,
    ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}';
  CREATE TABLE IF NOT EXISTS project_visibility_settings (organization_id integer, project_id integer, visibility text);
  CREATE TABLE IF NOT EXISTS project_members (organization_id integer, project_id integer, user_id integer, role text, status text);
  CREATE TABLE IF NOT EXISTS concept2cure_artifacts (id serial PRIMARY KEY);
  ALTER TABLE concept2cure_artifacts ADD COLUMN IF NOT EXISTS organization_id integer, ADD COLUMN IF NOT EXISTS project_id integer;
  CREATE TABLE IF NOT EXISTS concept2cure_review_assignments (organization_id integer, artifact_id integer, reviewer_id integer, status text);
`;

/**
 * `userId` becomes a current member of `organizationId` (keeping a role already seated) with edit on the one project
 * `programId` is anchored to. The program row is created if the suite has not.
 */
export async function grantDocumentProjectEdit(db: SqlRunner, who: {
  organizationId: number; userId: number; programId: string; projectId?: number;
}): Promise<void> {
  const { organizationId: org, userId: user, programId: program, projectId: project = 1 } = who;
  await db.exec(POLICY_TABLES);
  await db.query('INSERT INTO organizations (id) VALUES ($1::int) ON CONFLICT (id) DO NOTHING', [org]);
  // tenant-isolation-safe: fixture user in a throw-away PGlite database; `users` is global and tenancy is the organization_users row below
  await db.query('INSERT INTO users (id) VALUES ($1::int) ON CONFLICT (id) DO NOTHING', [user]);
  await db.query(`INSERT INTO organization_users (organization_id, user_id, role) SELECT $1::int, $2::int, 'member'
    WHERE NOT EXISTS (SELECT 1 FROM organization_users WHERE organization_id = $1::int AND user_id = $2::int)`, [org, user]);
  await db.query(`INSERT INTO regulatory_programs (id, organization_id) VALUES ($1::uuid, $2::int)
    ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id`, [program, org]);
  await db.query('INSERT INTO projects (id, organization_id, regulatory_program_id) VALUES ($1::int, $2::int, $3::uuid)',
    [project, org, program]);
  await db.query(`INSERT INTO project_members (organization_id, project_id, user_id, role, status)
    VALUES ($1::int, $2::int, $3::int, 'edit', 'active')`, [org, project, user]);
}
