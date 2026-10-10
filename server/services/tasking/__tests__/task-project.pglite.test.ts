/**
 * A review task raised on an authoring document records the project of that
 * document's program, so the program's Review tab lists it (QA 2026-10-08,
 * second walk, j1).
 *
 * In TOLV the Authoring review assigned to Raj (unified_tasks id 19, raised from
 * the document workbench, module_data.programId = the program) was stored with
 * project_id NULL. The project page's Review tab reads the program's work
 * through its project record (GET …/unified-work → loadUnifiedWork, filtered by
 * unified_tasks.project_id), so it said "No tasks or approvals on this program".
 *
 * Real SQL (PGlite):
 *   - projectForTaskSource answers the document's program's project record, in
 *     the caller's organisation only, and nothing for a document with no
 *     program, an unanchored program or another source kind;
 *   - 20261008d gives the existing tasks the same project, idempotently, and
 *     touches nothing else;
 *   - the work view the Review tab reads then lists the task.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'fs';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../../../scripts/db/migration-set.mjs';
import { extractTableDdl } from '../../../../tests/golden-journeys/harness';
import type { RequestDb } from '../../../db/requestDb';

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../db', () => ({
  get db() {
    return h.db;
  },
  pool: {},
}));

const FILE = 'migrations/20261008d_unified_tasks_authoring_review_project.sql';
const ANCHOR = 'migrations/20260814_projects_regulatory_program_anchor.sql';
// This fixture reads five known migrations, never an arbitrary relative path.
const SQL_SOURCES = {
  [FILE]: new URL('../../../../migrations/20261008d_unified_tasks_authoring_review_project.sql', import.meta.url),
  [ANCHOR]: new URL('../../../../migrations/20260814_projects_regulatory_program_anchor.sql', import.meta.url),
  'migrations/20260524_program_workbench_schema.sql': new URL('../../../../migrations/20260524_program_workbench_schema.sql', import.meta.url),
  'db/migrations/20260727_unified_tasks_mdx_metadata.sql': new URL('../../../../db/migrations/20260727_unified_tasks_mdx_metadata.sql', import.meta.url),
  'db/migrations/20260807_unified_tasks_soft_delete.sql': new URL('../../../../db/migrations/20260807_unified_tasks_soft_delete.sql', import.meta.url),
} as const;
const read = (rel: keyof typeof SQL_SOURCES) => readFileSync(SQL_SOURCES[rel], 'utf8');

const PROGRAM = '8a11b987-ac2d-4748-9e9c-5dc40c082662'; // TOLV
const UNANCHORED = '40000000-0000-4000-8000-000000000002';
const OTHER_ORG_PROGRAM = '40000000-0000-4000-8000-000000000003';
const DOC = 'a96e686c-7098-4602-81db-5c762c234fe4'; // QA-W2 2.5 Clinical Overview — Tolvexa
const DOC_NO_PROGRAM = '40000000-0000-4000-8000-0000000000d2';
const DOC_UNANCHORED = '40000000-0000-4000-8000-0000000000d3';
const DOC_OTHER_ORG = '40000000-0000-4000-8000-0000000000d4';
/** Another organisation's document that names THIS organisation's program. */
const DOC_FOREIGN_POINTER = '40000000-0000-4000-8000-0000000000d5';

let pg: PGlite;
let rdb: RequestDb;

const projectIdOf = async (taskId: string) =>
  (await pg.query<{ project_id: number | null }>(`SELECT project_id FROM unified_tasks WHERE task_id = $1`, [taskId])).rows[0]?.project_id ?? null;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'client_workspaces', 'projects', 'unified_tasks']));
  await pg.exec(read('migrations/20260524_program_workbench_schema.sql'));
  await pg.exec(read(ANCHOR));
  await pg.exec(read('db/migrations/20260727_unified_tasks_mdx_metadata.sql'));
  await pg.exec(read('db/migrations/20260807_unified_tasks_soft_delete.sql'));
  // authoring_documents as the authoring subsystem and 20260727 leave it: the
  // columns this read needs.
  await pg.exec(`CREATE TABLE authoring_documents (id uuid PRIMARY KEY, tenant_id integer NOT NULL, title text, client_program_id uuid);`);
  await pg.exec(`
    INSERT INTO organizations (id, name, slug) VALUES (1, 'Sponsor', 'sponsor'), (2, 'Other', 'other');
    INSERT INTO users (id, email, name, password_hash) VALUES (3, 'raj@qa.example', 'Raj Patel', 'x'), (4, 'emily@qa.example', 'Emily', 'x');
    INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES (10, 1, 'Default', 'default'), (20, 2, 'Other', 'other');
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name, status) VALUES
      ('${PROGRAM}', 1, 'QA-W2 Tolvexa', 'TOLV', 'ind', 'drug', 'FDA', 'Tolvexa', 'active'),
      ('${UNANCHORED}', 1, 'Unanchored', 'UNA', 'ind', 'drug', 'FDA', 'Una', 'active'),
      ('${OTHER_ORG_PROGRAM}', 2, 'Other org program', 'OTH', 'ind', 'drug', 'FDA', 'Oth', 'active');
    INSERT INTO projects (id, organization_id, client_workspace_id, name, code, type, regulatory_program_id) VALUES
      (25, 1, 10, 'QA-W2 Tolvexa', 'TOLV', 'regulatory', '${PROGRAM}'),
      (60, 2, 20, 'Other org program', 'OTH', 'regulatory', '${OTHER_ORG_PROGRAM}');
    INSERT INTO authoring_documents (id, tenant_id, title, client_program_id) VALUES
      ('${DOC}', 1, 'QA-W2 2.5 Clinical Overview — Tolvexa', '${PROGRAM}'),
      ('${DOC_NO_PROGRAM}', 1, 'Org-level draft', NULL),
      ('${DOC_UNANCHORED}', 1, 'Unanchored program draft', '${UNANCHORED}'),
      ('${DOC_OTHER_ORG}', 2, 'Other org draft', '${OTHER_ORG_PROGRAM}'),
      ('${DOC_FOREIGN_POINTER}', 2, 'Other org draft naming our program', '${PROGRAM}');
    -- As the walk left them: the review task with no project, and its neighbours.
    INSERT INTO unified_tasks (task_id, organization_id, project_id, module_type, source_entity_id, source_entity_type, title, status, created_by_id) VALUES
      ('TASK-19', 1, NULL, 'Authoring', '${DOC}', 'authoring_document', 'Review: QA-W2 2.5 Clinical Overview — Tolvexa', 'pending', 4),
      ('TASK-SET', 1, 25, 'Authoring', '${DOC}', 'authoring_document', 'Already on its project', 'pending', 4),
      ('TASK-NOPROG', 1, NULL, 'Authoring', '${DOC_NO_PROGRAM}', 'authoring_document', 'Org-level review', 'pending', 4),
      ('TASK-UNANCH', 1, NULL, 'Authoring', '${DOC_UNANCHORED}', 'authoring_document', 'Unanchored review', 'pending', 4),
      ('TASK-CROSS', 1, NULL, 'Authoring', '${DOC_OTHER_ORG}', 'authoring_document', 'Names another org''s document', 'pending', 4),
      ('TASK-OTHER', 1, NULL, 'IND', '${DOC}', 'section', 'Not an authoring-document task', 'pending', 4);
  `);
  rdb = drizzle(pg) as unknown as RequestDb;
  h.db = rdb;
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe('projectForTaskSource — the project a new task is recorded on', () => {
  it('a review raised on an authoring document: its program’s project record', async () => {
    const { projectForTaskSource } = await import('../task-project');
    expect(await projectForTaskSource(rdb, { orgId: 1, sourceEntityType: 'authoring_document', sourceEntityId: DOC })).toBe(25);
  });

  it('only within the caller’s organisation', async () => {
    const { projectForTaskSource } = await import('../task-project');
    expect(await projectForTaskSource(rdb, { orgId: 2, sourceEntityType: 'authoring_document', sourceEntityId: DOC })).toBeNull();
    expect(await projectForTaskSource(rdb, { orgId: 1, sourceEntityType: 'authoring_document', sourceEntityId: DOC_OTHER_ORG })).toBeNull();
    // A task in org 1 naming org 2's document is not placed on org 1's project,
    // even when that document points at org 1's program.
    expect(await projectForTaskSource(rdb, { orgId: 1, sourceEntityType: 'authoring_document', sourceEntityId: DOC_FOREIGN_POINTER })).toBeNull();
  });

  it('nothing for a document with no program, an unanchored program, another source kind or a malformed id', async () => {
    const { projectForTaskSource } = await import('../task-project');
    expect(await projectForTaskSource(rdb, { orgId: 1, sourceEntityType: 'authoring_document', sourceEntityId: DOC_NO_PROGRAM })).toBeNull();
    expect(await projectForTaskSource(rdb, { orgId: 1, sourceEntityType: 'authoring_document', sourceEntityId: DOC_UNANCHORED })).toBeNull();
    expect(await projectForTaskSource(rdb, { orgId: 1, sourceEntityType: 'section', sourceEntityId: DOC })).toBeNull();
    expect(await projectForTaskSource(rdb, { orgId: 1, sourceEntityType: 'authoring_document', sourceEntityId: 'not-a-uuid' })).toBeNull();
  });
});

describe('20261008d — the existing review tasks get their project', () => {
  it('is on the applier, before the tenant sweeps, and drops nothing', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(FILE);
    expect(at, `${FILE} is not in C2C_MIGRATION_FILES`).toBeGreaterThan(-1);
    expect(files.indexOf(ANCHOR)).toBeLessThan(at);
    expect(files.indexOf('migrations/20261008_program_project_anchor_backfill.sql')).toBeLessThan(at);
    expect(at).toBeLessThan(files.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC as string));
    expect(read(FILE).replace(/--[^\n]*/g, '')).not.toMatch(/\bDROP\b/i);
  });

  it('the walk’s task 19 is recorded on TOLV’s project; nothing else moves', async () => {
    const notices: string[] = [];
    await pg.exec(read(FILE), { onNotice: (n) => notices.push(n.message ?? '') });
    expect(await projectIdOf('TASK-19')).toBe(25);
    expect(await projectIdOf('TASK-SET')).toBe(25);
    expect(await projectIdOf('TASK-NOPROG')).toBeNull();
    expect(await projectIdOf('TASK-UNANCH')).toBeNull();
    expect(await projectIdOf('TASK-CROSS')).toBeNull();
    expect(await projectIdOf('TASK-OTHER')).toBeNull();
    expect(notices.join('\n')).toMatch(/1 authoring review task\(s\) recorded on their document's project/);
  });

  it('Rule 1: a second deploy changes nothing', async () => {
    const before = (await pg.query(`SELECT task_id, project_id FROM unified_tasks ORDER BY task_id`)).rows;
    await pg.exec(read(FILE));
    expect((await pg.query(`SELECT task_id, project_id FROM unified_tasks ORDER BY task_id`)).rows).toEqual(before);
  });

  it('the work view the Review tab reads now lists the review on the program’s project', async () => {
    const { loadUnifiedWork } = await import('../../unified-work/unified-work-view');
    const view = await loadUnifiedWork({ organizationId: 1, projectId: 25 });
    expect(view.sources.unified_tasks, JSON.stringify(view.sources)).toMatchObject({ ran: true });
    expect(view.items.map((i) => i.title)).toContain('Review: QA-W2 2.5 Clinical Overview — Tolvexa');
  });
});
