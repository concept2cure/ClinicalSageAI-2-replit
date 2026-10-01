/**
 * 20261001_integer_project_same_org_keys.sql — an artifact, a submission
 * package, a conversation and AnA's working memory name an integer project
 * only of their own organization, at the database (PF-03, D3; the integer half
 * of PF-04). The conversations key and the working-memory key (PF-10 S11) were
 * added 2026-10-01 by amending the file in place.
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
const memory = (id: string, project: number, org: number) =>
  db.query(
    `INSERT INTO conversation_working_memory (thread_id, project_id, organization_id, summary, message_count_at_generation)
     VALUES ($1, $2, $3, 's', 1)`,
    [id, project, org],
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
  // AnA's working memory, from the file that creates it, with its own NO ACTION project key.
  await db.exec(read('migrations/20260820_working_memory_project_id.sql'));
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
  await memory('legacy-m', 20, 1);
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

  it('a replay adds nothing: one NOT VALID key per table, each with its existing key\'s delete action', async () => {
    const { rows } = await db.query<{ conname: string; convalidated: boolean; confdeltype: string; confupdtype: string }>(
      `SELECT conname, convalidated, confdeltype, confupdtype FROM pg_constraint
        WHERE conname IN ('concept2cure_artifacts_project_same_org_fk', 'c2c_submission_packages_project_same_org_fk',
                          'concept2cure_conversations_project_same_org_fk',
                          'conversation_working_memory_project_same_org_fk')
        ORDER BY conname`,
    );
    expect(rows).toEqual([
      { conname: 'c2c_submission_packages_project_same_org_fk', convalidated: false, confdeltype: 'c', confupdtype: 'a' },
      { conname: 'concept2cure_artifacts_project_same_org_fk', convalidated: false, confdeltype: 'c', confupdtype: 'a' },
      { conname: 'concept2cure_conversations_project_same_org_fk', convalidated: false, confdeltype: 'c', confupdtype: 'a' },
      // SET NULL, as 20260820's own key on the column: two keys on one column must agree on delete.
      { conname: 'conversation_working_memory_project_same_org_fk', convalidated: false, confdeltype: 'n', confupdtype: 'a' },
    ]);
  });

  it("20260820's own key on working memory is SET NULL too, and only one of it", async () => {
    const { rows } = await db.query<{ n: number; confdeltype: string }>(
      `SELECT count(*)::int AS n, min(confdeltype) AS confdeltype FROM pg_constraint
        WHERE conrelid = 'conversation_working_memory'::regclass AND confrelid = 'projects'::regclass AND array_length(conkey, 1) = 1`,
    );
    expect(rows[0]).toEqual({ n: 1, confdeltype: 'n' });
  });
});

describe.each([
  ['concept2cure_artifacts', artifact],
  ['c2c_submission_packages', pkg],
  ['concept2cure_conversations', conv],
  ['conversation_working_memory', memory],
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
    expect(byRel['public.conversation_working_memory']?.skipped).toBe(false);
    expect(byRel['public.conversation_working_memory'].rows).toEqual([
      expect.objectContaining({ org: 1, project_id: 20, project_org: 2, project_missing: false }),
    ]);
  });

  it('working memory with no project is written, as for a conversation held in none', async () => {
    expect(await code(db.query(
      `INSERT INTO conversation_working_memory (thread_id, organization_id, summary, message_count_at_generation)
       VALUES ('no-project', 1, 's', 1)`,
    ))).toBe('ok');
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
    await memory('doomed-m', 40, 1);
    await db.query(`DELETE FROM projects WHERE id = 40`);
    const left = await db.query<{ a: number; p: number; c: number }>(
      `SELECT (SELECT count(*)::int FROM concept2cure_artifacts WHERE project_id = 40) AS a,
              (SELECT count(*)::int FROM c2c_submission_packages WHERE project_id = 40) AS p,
              (SELECT count(*)::int FROM concept2cure_conversations WHERE project_id = 40) AS c`,
    );
    expect(left.rows[0]).toEqual({ a: 0, p: 0, c: 0 });
  });

  it('and detaches the working memory of its conversations: kept, with its organization, under no project', async () => {
    const { rows } = await db.query(`SELECT project_id, organization_id FROM conversation_working_memory WHERE thread_id = 'doomed-m'`);
    expect(rows).toEqual([{ project_id: null, organization_id: 1 }]);
  });
});

describe('a database that deployed the NO ACTION working-memory keys (PF-13 follow-up)', () => {
  let old: PGlite;
  beforeAll(async () => {
    old = new PGlite();
    await old.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE users (id integer PRIMARY KEY);
                    CREATE TABLE client_workspaces (id integer PRIMARY KEY);`);
    await old.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['projects', 'concept2cure_artifacts', 'concept2cure_conversations']));
    await old.exec(extractTableDdl('migrations/0002_phase15_submission_ops.sql', ['c2c_submission_packages']));
    // The keys as they were deployed: a drizzle-pushed name, and the S11 key, both NO ACTION.
    await old.exec(`
      CREATE TABLE conversation_working_memory (
        id serial PRIMARY KEY, conversation_id integer, thread_id text,
        project_id integer CONSTRAINT conversation_working_memory_project_id_projects_id_fk REFERENCES projects(id),
        organization_id integer NOT NULL REFERENCES organizations(id), summary text NOT NULL, structured_data json,
        message_count_at_generation integer NOT NULL, generated_at timestamp DEFAULT now() NOT NULL);
      CREATE UNIQUE INDEX projects_id_org_uq ON projects (id, organization_id);
      ALTER TABLE conversation_working_memory ADD CONSTRAINT conversation_working_memory_project_same_org_fk
        FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) NOT VALID;
      INSERT INTO organizations VALUES (1); INSERT INTO client_workspaces VALUES (1);
      INSERT INTO projects (id, organization_id, client_workspace_id, name, type) VALUES (10, 1, 1, 'Chatted in', 'ind');
      INSERT INTO conversation_working_memory (thread_id, project_id, organization_id, summary, message_count_at_generation)
        VALUES ('kept', 10, 1, 's', 20);
    `);
    // The next two deploys.
    for (let i = 0; i < 2; i += 1) {
      await old.exec(read('migrations/20260820_working_memory_project_id.sql'));
      await old.exec(read(KEYS));
    }
  }, 60_000);
  afterAll(async () => {
    await old?.close();
  });

  it('both keys are SET NULL, under their own names, one of each', async () => {
    const { rows } = await old.query<{ conname: string; confdeltype: string }>(
      `SELECT conname, confdeltype FROM pg_constraint
        WHERE conrelid = 'conversation_working_memory'::regclass AND confrelid = 'projects'::regclass ORDER BY conname`,
    );
    expect(rows).toEqual([
      { conname: 'conversation_working_memory_project_id_projects_id_fk', confdeltype: 'n' },
      { conname: 'conversation_working_memory_project_same_org_fk', confdeltype: 'n' },
    ]);
  });

  it('the project its conversation was summarized in can now be deleted, and the summary stays', async () => {
    expect(await code(old.query(`DELETE FROM projects WHERE id = 10`))).toBe('ok');
    const { rows } = await old.query(`SELECT project_id, summary FROM conversation_working_memory WHERE thread_id = 'kept'`);
    expect(rows).toEqual([{ project_id: null, summary: 's' }]);
  });
});
