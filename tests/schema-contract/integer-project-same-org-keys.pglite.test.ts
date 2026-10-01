/**
 * 20261001_integer_project_same_org_keys.sql — an artifact, a submission
 * package and a conversation name an integer project only of their own
 * organization, at the database (PF-03, D3; the integer half of PF-04). The
 * conversations key was added 2026-10-01 by amending the file in place.
 *
 * The writers check first since PF-03. This holds every other writer, and the
 * next one, to the same rule. Run on real SQL (PGlite) with the tables lifted
 * from the files that create them:
 *   - a legacy cross-organization row exists before the keys;
 *   - the keys file is applied twice, as every deploy replays it (Rule 1).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';
import { runProgramSameOrgPreflight } from '../../scripts/db/program-same-org-preflight.mjs';
import { extractTableDdl } from '../golden-journeys/harness';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const KEYS = 'migrations/20261001_integer_project_same_org_keys.sql';

let db: PGlite;

/** One `ALTER TABLE … ADD CONSTRAINT <name> …;`, verbatim from the creating file. */
function constraintFrom(file: string, name: string): string {
  const m = read(file).match(new RegExp(`ALTER TABLE "[^"]+" ADD CONSTRAINT "${name}"[^;]*;`));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return m[0];
}

const artifact = (id: string, project: number, org: number) =>
  db.query(
    `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content)
     VALUES ($1, $2, $3, 'document', 'document', 't', 'x')`,
    [id, project, org],
  );
const conv = (id: string, project: number, org: number) =>
  db.query(
    `INSERT INTO concept2cure_conversations (conversation_id, project_id, organization_id, title) VALUES ($1, $2, $3, 't')`,
    [id, project, org],
  );
const pkg = (id: string, project: number, org: number) =>
  db.query(
    `INSERT INTO c2c_submission_packages (package_id, org_id, project_id, package_family, title) VALUES ($1, $2, $3, 'ind', 't')`,
    [id, org, project],
  );
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE users (id integer PRIMARY KEY);
                 CREATE TABLE client_workspaces (id integer PRIMARY KEY);`);
  // projects and concept2cure_artifacts as 0000 creates them, with the artifacts' own cascade key.
  await db.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['projects', 'concept2cure_artifacts', 'concept2cure_conversations']));
  await db.exec(constraintFrom('migrations/0000_sweet_joseph.sql', 'concept2cure_artifacts_project_id_projects_id_fk'));
  await db.exec(constraintFrom('migrations/0000_sweet_joseph.sql', 'concept2cure_conversations_project_id_projects_id_fk'));
  await db.exec(extractTableDdl('migrations/0002_phase15_submission_ops.sql', ['c2c_submission_packages']));
  await db.exec(`
    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO client_workspaces VALUES (1), (2);
    INSERT INTO projects (id, organization_id, client_workspace_id, name, type) VALUES
      (10, 1, 1, 'Own', 'ind'), (20, 2, 2, 'Theirs', 'ind'), (30, 1, 1, 'Movable', 'ind');
  `);
  // A legacy row written before the keys: organization 1's artifact and package under organization 2's project.
  await artifact('legacy-a', 20, 1);
  await pkg('legacy-p', 20, 1);
  await conv('legacy-c', 20, 1);
  // Two deploys.
  await db.exec(read(KEYS));
  await db.exec(read(KEYS));
}, 60_000);
afterAll(async () => {
  await db?.close();
});

describe('20261001 on the applier', () => {
  it('runs after the program keys and before the tenant sweep', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(KEYS);
    expect(at).toBeGreaterThan(-1);
    expect(files.indexOf('migrations/20260926b_program_same_org_keys.sql')).toBeLessThan(at);
    expect(at).toBeLessThan(files.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC as string));
  });

  it('a replay adds nothing: one NOT VALID key per table, ON DELETE CASCADE, ON UPDATE NO ACTION', async () => {
    const { rows } = await db.query<{ conname: string; convalidated: boolean; confdeltype: string; confupdtype: string }>(
      `SELECT conname, convalidated, confdeltype, confupdtype FROM pg_constraint
        WHERE conname IN ('concept2cure_artifacts_project_same_org_fk', 'c2c_submission_packages_project_same_org_fk',
                          'concept2cure_conversations_project_same_org_fk')
        ORDER BY conname`,
    );
    expect(rows).toEqual([
      { conname: 'c2c_submission_packages_project_same_org_fk', convalidated: false, confdeltype: 'c', confupdtype: 'a' },
      { conname: 'concept2cure_artifacts_project_same_org_fk', convalidated: false, confdeltype: 'c', confupdtype: 'a' },
      { conname: 'concept2cure_conversations_project_same_org_fk', convalidated: false, confdeltype: 'c', confupdtype: 'a' },
    ]);
  });
});

describe.each([
  ['concept2cure_artifacts', artifact],
  ['c2c_submission_packages', pkg],
  ['concept2cure_conversations', conv],
] as const)('%s: (project_id, org) → projects (id, organization_id)', (_table, write) => {
  it('a row under a project of its own organization is written', async () => {
    expect(await code(write(`own-${_table}`, 10, 1))).toBe('ok');
  });

  it("a row under another organization's project is refused by the database", async () => {
    expect(await code(write(`foreign-${_table}`, 20, 1))).toBe('23503');
  });
});

describe('legacy rows and the existing behaviour', () => {
  it('the legacy cross-organization rows did not fail the deploy, and are listed by the preflight', async () => {
    const results = await runProgramSameOrgPreflight({ query: (t: string, p?: unknown[]) => db.query(t, p) });
    const byRel = Object.fromEntries(results.map((r: { relation: string; rows: unknown[]; skipped: boolean }) => [r.relation, r]));
    expect(byRel['public.concept2cure_artifacts'].skipped).toBe(false);
    expect(byRel['public.concept2cure_artifacts'].rows).toEqual([
      expect.objectContaining({ org: 1, project_id: 20, project_org: 2, project_missing: false }),
    ]);
    expect(byRel['public.c2c_submission_packages'].rows).toEqual([
      expect.objectContaining({ org: 1, project_id: 20, project_org: 2 }),
    ]);
    expect(byRel['public.concept2cure_conversations']?.skipped).toBe(false);
    expect(byRel['public.concept2cure_conversations'].rows).toEqual([
      expect.objectContaining({ org: 1, project_id: 20, project_org: 2, project_missing: false }),
    ]);
  });

  it('a legacy row still takes a change that is neither its project nor its organization', async () => {
    expect(await code(db.query(`UPDATE concept2cure_artifacts SET title = 'renamed' WHERE artifact_id = 'legacy-a'`))).toBe('ok');
  });

  it('a project with records of its organization under it cannot be moved to another organization', async () => {
    await artifact('movable-a', 30, 1);
    expect(await code(db.query(`UPDATE projects SET organization_id = 2 WHERE id = 30`))).toBe('23503');
  });

  it('a project delete still cascades its own artifacts, packages and conversations, as before', async () => {
    await db.query(`INSERT INTO projects (id, organization_id, client_workspace_id, name, type) VALUES (40, 1, 1, 'Doomed', 'ind')`);
    await artifact('doomed-a', 40, 1);
    await pkg('doomed-p', 40, 1);
    await conv('doomed-c', 40, 1);
    await db.query(`DELETE FROM projects WHERE id = 40`);
    const left = await db.query<{ a: number; p: number; c: number }>(
      `SELECT (SELECT count(*)::int FROM concept2cure_artifacts WHERE project_id = 40) AS a,
              (SELECT count(*)::int FROM c2c_submission_packages WHERE project_id = 40) AS p,
              (SELECT count(*)::int FROM concept2cure_conversations WHERE project_id = 40) AS c`,
    );
    expect(left.rows[0]).toEqual({ a: 0, p: 0, c: 0 });
  });
});
