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
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { RequestDb } from '../../../db/requestDb';
import { projectTasks, c2cProjectWorkItems } from '../../../../shared/schema';
import { readMyWork } from '../my-work';

const SQL_SOURCES = {
  'migrations/20260524_program_workbench_schema.sql': new URL('../../../../migrations/20260524_program_workbench_schema.sql', import.meta.url),
  'migrations/20260814_projects_regulatory_program_anchor.sql': new URL('../../../../migrations/20260814_projects_regulatory_program_anchor.sql', import.meta.url),
  'db/migrations/20260727_unified_tasks_mdx_metadata.sql': new URL('../../../../db/migrations/20260727_unified_tasks_mdx_metadata.sql', import.meta.url),
  'db/migrations/20260807_unified_tasks_soft_delete.sql': new URL('../../../../db/migrations/20260807_unified_tasks_soft_delete.sql', import.meta.url),
  // The review route columns the Drizzle model names (RR1a).
  'migrations/20261023_review_routes.sql': new URL('../../../../migrations/20261023_review_routes.sql', import.meta.url),
  'migrations/20261109_unified_tasks_parent_task.sql': new URL('../../../../migrations/20261109_unified_tasks_parent_task.sql', import.meta.url),
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
  await pg.exec(read('migrations/20261109_unified_tasks_parent_task.sql')); // P-111: unified_tasks.parent_task_id, which the Drizzle model names
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
  // The other stores the cross-store view reads (P-131 item 6), with every column the Drizzle model names.
  for (const table of [projectTasks, c2cProjectWorkItems]) {
    const config = getTableConfig(table);
    await pg.exec(`CREATE TABLE ${config.name} (id serial PRIMARY KEY)`);
    for (const column of config.columns) if (column.name !== 'id') {
      await pg.exec(`ALTER TABLE ${config.name} ADD COLUMN "${column.name}" ${column.getSQLType()}`);
    }
  }
  // A second person in the same organisation, whose work spans the stores. User 3's rows above are untouched by it.
  await pg.exec(`
    INSERT INTO users (id, email, name, password_hash) VALUES (5, 'planner@example.test', 'Planner', 'x');
    INSERT INTO unified_tasks (task_id, organization_id, project_id, module_type, title, status, priority, assignee_id, due_date, created_by_id, created_at, source_entity_type, source_entity_id) VALUES
      ('U5-LOW-OVER', 1, 25, 'Plan', 'Low and overdue', 'pending', 'low', 5, '2026-10-20T17:00:00Z', 3, '2026-10-01T09:00:00Z', NULL, NULL),
      ('U5-CRIT-OVER', 1, 25, 'Plan', 'Critical and overdue', 'pending', 'critical', 5, '2026-10-24T17:00:00Z', 3, '2026-10-01T09:00:00Z', NULL, NULL),
      ('U5-URG-WEEK', 1, 25, 'Plan', 'Urgent this week', 'in-progress', 'urgent', 5, '2026-10-30T17:00:00Z', 3, '2026-10-01T09:00:00Z', NULL, NULL),
      ('U5-HIGH-LATER', 1, 25, 'Plan', 'High and later', 'pending', 'high', 5, '2026-12-30T17:00:00Z', 3, '2026-10-01T09:00:00Z', NULL, NULL),
      ('U5-MIRROR', 1, 25, 'Plan', 'AnA task mirrored from the schedule', 'pending', 'medium', 5, NULL, 3, '2026-10-01T09:00:00Z', 'project_task', '504');
    INSERT INTO project_tasks (id, organization_id, project_id, name, status, priority, assignee_id, due_date) VALUES
      (501, 1, 25, 'Schedule: pre-IND briefing book', 'todo', 'high', 5, '2026-10-23T17:00:00Z'),
      (502, 1, 25, 'Schedule: finished', 'done', 'high', 5, NULL),
      (503, 1, 25, 'Schedule: a colleague''s', 'todo', 'high', 4, NULL),
      (504, 1, 25, 'AnA task mirrored from the schedule', 'todo', 'medium', 5, NULL),
      (505, 2, 60, 'Schedule: another organisation''s', 'todo', 'high', 5, NULL);
    INSERT INTO c2c_project_work_items (work_item_id, org_id, project_id, source_type, source_id, owner_id, title, status, priority, due_at) VALUES
      ('pwi_corr', 1, 26, 'correspondence', 0, 5, 'Answer the information request', 'open', 'high', '2026-10-28T17:00:00Z'),
      ('pwi_thread', 1, 26, 'review_thread', 1, 5, 'Review thread the tray lists from its own store', 'open', 'high', NULL),
      ('pwi_task', 1, 26, 'review_task', 2, 5, 'Review task the tray lists from its own store', 'open', 'high', NULL),
      ('pwi_legal', 1, 26, 'company_legal_renewal', 0, 5, 'Renew company legal document: licence', 'open', 'medium', NULL),
      ('pwi_done', 1, 26, 'correspondence', 0, 5, 'Answered', 'resolved', 'high', NULL),
      ('pwi_other', 1, 26, 'correspondence', 0, 4, 'A colleague''s letter', 'open', 'high', NULL),
      ('pwi_foreign', 2, 60, 'correspondence', 0, 5, 'Another organisation''s letter', 'open', 'high', NULL);
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

/**
 * P-131 items 2, 3 and 6: everything needed of the person, in the order of need. Their own board tasks, and the work
 * another store records as theirs (a schedule task, a letter, a renewal), each once, never a colleague's and never
 * another organisation's.
 */
describe('readMyWork — every store, in the order of need (P-131)', () => {
  it('orders overdue, due this week, later, no date; within each critical, urgent, high, medium, low', async () => {
    const work = await readMyWork(rdb, 1, 5, NOW);
    expect(work.items.map((i) => i.taskId)).toEqual([
      'U5-CRIT-OVER', 'schedule:501', 'U5-LOW-OVER',
      'U5-URG-WEEK', 'correspondence:pwi_corr',
      'U5-HIGH-LATER',
      'U5-MIRROR', 'review:pwi_legal',
    ]);
    expect(work.total).toBe(8);
    expect(work.overdue).toBe(3);
  });

  it('carries a schedule task assigned to the person, read-only, with its project and where it lives', async () => {
    const work = await readMyWork(rdb, 1, 5, NOW);
    expect(work.items.find((i) => i.taskId === 'schedule:501')).toMatchObject({
      title: 'Schedule: pre-IND briefing book', projectId: 25, projectName: 'FS-101 — first IND', moduleType: 'Schedule',
      status: 'pending', priority: 'high', overdue: true, dueSoon: false, blocked: false, waitingOn: null, reviewRole: null,
      approvalRequired: false, home: { source: 'schedule', nativeId: '501', projectId: 25 },
    });
  });

  it('leaves out finished work, a colleague’s, another organisation’s, a mirrored schedule task and the review items the tray reads elsewhere', async () => {
    const ids = (await readMyWork(rdb, 1, 5, NOW)).items.map((i) => i.taskId);
    for (const id of ['schedule:502', 'schedule:503', 'schedule:504', 'schedule:505', 'review:pwi_thread', 'review:pwi_task',
      'correspondence:pwi_done', 'correspondence:pwi_other', 'correspondence:pwi_foreign']) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('fails closed when another store cannot be read, rather than listing less as everything', async () => {
    await pg.exec('ALTER TABLE c2c_project_work_items RENAME TO c2c_project_work_items_away');
    try {
      await expect(readMyWork(rdb, 1, 5, NOW)).rejects.toThrow(/could not be read/);
    } finally {
      await pg.exec('ALTER TABLE c2c_project_work_items_away RENAME TO c2c_project_work_items');
    }
  });
});
