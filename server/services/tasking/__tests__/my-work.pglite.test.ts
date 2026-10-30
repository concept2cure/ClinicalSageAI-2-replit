/**
 * My work names each task's project (D2 first-session journey, 2026-10-25,
 * CLIENT_JOURNEY_2026-10-25.md decision 13).
 *
 * Home's "Your open items" listed "Prepare: Target Product Profile · Plan" once
 * per project, with nothing to tell the projects apart. Real SQL (PGlite):
 *   - each open task assigned to the caller carries its project's name;
 *   - a task with no project, or whose project is another organisation's, has
 *     no name (never the other tenant's);
 *   - what the read selects is unchanged: only the caller's open, undeleted
 *     tasks in their organisation, due first;
 *   - tasks due the same day come newest-assigned first, in a fixed order (it
 *     was the database's arbitrary order, so rows could swap between reads).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'fs';
import { extractTableDdl } from '../../../../tests/golden-journeys/harness';
import type { RequestDb } from '../../../db/requestDb';
import { readMyWork } from '../my-work';

const SQL_SOURCES = {
  'migrations/20260524_program_workbench_schema.sql': new URL('../../../../migrations/20260524_program_workbench_schema.sql', import.meta.url),
  'migrations/20260814_projects_regulatory_program_anchor.sql': new URL('../../../../migrations/20260814_projects_regulatory_program_anchor.sql', import.meta.url),
  'db/migrations/20260727_unified_tasks_mdx_metadata.sql': new URL('../../../../db/migrations/20260727_unified_tasks_mdx_metadata.sql', import.meta.url),
  'db/migrations/20260807_unified_tasks_soft_delete.sql': new URL('../../../../db/migrations/20260807_unified_tasks_soft_delete.sql', import.meta.url),
  // The review route columns the Drizzle model names (RR1a).
  'migrations/20261023_review_routes.sql': new URL('../../../../migrations/20261023_review_routes.sql', import.meta.url),
} as const;
const read = (rel: keyof typeof SQL_SOURCES) => readFileSync(SQL_SOURCES[rel], 'utf8');

const NOW = Date.parse('2026-10-25T12:00:00Z');
let pg: PGlite;
let rdb: RequestDb;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'client_workspaces', 'projects', 'unified_tasks']));
  await pg.exec(read('migrations/20260524_program_workbench_schema.sql'));
  await pg.exec(read('migrations/20260814_projects_regulatory_program_anchor.sql'));
  await pg.exec(read('db/migrations/20260727_unified_tasks_mdx_metadata.sql'));
  await pg.exec(read('db/migrations/20260807_unified_tasks_soft_delete.sql'));
  await pg.exec(read('migrations/20261023_review_routes.sql'));
  await pg.exec(`
    INSERT INTO organizations (id, name, slug) VALUES (1, 'Sponsor', 'sponsor'), (2, 'Other', 'other');
    INSERT INTO users (id, email, name, password_hash) VALUES (3, 'lead@example.test', 'Lead', 'x'), (4, 'colleague@example.test', 'Colleague', 'x');
    INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES (10, 1, 'Default', 'default'), (20, 2, 'Other', 'other');
    INSERT INTO projects (id, organization_id, client_workspace_id, name, code, type) VALUES
      (25, 1, 10, 'FS-101 — first IND', 'FS-101', 'regulatory'),
      (26, 1, 10, 'FS-202 — second IND', 'FS-202', 'regulatory'),
      (60, 2, 20, 'Another organisation''s project', 'OTH', 'regulatory');
    INSERT INTO unified_tasks (task_id, organization_id, project_id, module_type, title, status, assignee_id, due_date, created_by_id, deleted_at, created_at) VALUES
      ('T-A', 1, 25, 'Plan', 'Prepare: Target Product Profile', 'pending', 3, '2026-12-15T17:00:00Z', 3, NULL, '2026-10-01T09:00:00Z'),
      ('T-A2', 1, 26, 'Plan', 'Prepare: Investigator Brochure', 'pending', 3, '2026-12-15T17:00:00Z', 3, NULL, '2026-10-20T09:00:00Z'),
      ('T-B', 1, 26, 'Plan', 'Prepare: Target Product Profile', 'pending', 3, '2026-11-01T17:00:00Z', 3, NULL, '2026-10-01T09:00:00Z'),
      ('T-NOPROJ', 1, NULL, 'Authoring', 'Org-level task', 'in-progress', 3, NULL, 3, NULL, '2026-10-02T09:00:00Z'),
      ('T-FOREIGN', 1, 60, 'Plan', 'Points at another organisation''s project', 'pending', 3, NULL, 3, NULL, '2026-10-01T09:00:00Z'),
      ('T-DONE', 1, 25, 'Plan', 'Completed', 'completed', 3, NULL, 3, NULL, now()),
      ('T-DELETED', 1, 25, 'Plan', 'Deleted', 'pending', 3, NULL, 3, now(), now()),
      ('T-OTHERUSER', 1, 25, 'Plan', 'Someone else''s', 'pending', 4, NULL, 3, NULL, now()),
      ('T-OTHERORG', 2, 60, 'Plan', 'Other organisation''s', 'pending', 3, NULL, 3, NULL, now());
  `);
  rdb = drizzle(pg) as unknown as RequestDb;
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe('readMyWork — the caller’s open tasks, each with its project’s name', () => {
  it('two tasks with the same title are told apart by their projects', async () => {
    const work = await readMyWork(rdb, 1, 3, NOW);
    const named = work.items.filter((i) => i.title === 'Prepare: Target Product Profile');
    expect(named.map((i) => [i.taskId, i.projectName])).toEqual([
      ['T-B', 'FS-202 — second IND'],
      ['T-A', 'FS-101 — first IND'],
    ]);
  });

  it('no name for a task with no project, and never another organisation’s', async () => {
    const work = await readMyWork(rdb, 1, 3, NOW);
    const byId = Object.fromEntries(work.items.map((i) => [i.taskId, i]));
    expect(byId['T-NOPROJ'].projectName).toBeNull();
    expect(byId['T-FOREIGN'].projectName).toBeNull();
    expect(JSON.stringify(work)).not.toContain('Another organisation');
  });

  it('selects only the caller’s open, undeleted tasks in their organisation: due first, then newest assigned', async () => {
    const work = await readMyWork(rdb, 1, 3, NOW);
    expect(work.items.map((i) => i.taskId)).toEqual(['T-B', 'T-A2', 'T-A', 'T-NOPROJ', 'T-FOREIGN']);
    expect(work.total).toBe(5);
    expect(work.overdue).toBe(0);
  });
});
