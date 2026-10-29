/**
 * A blocked review route member is waiting for an earlier step and cannot
 * act, so it is neither reminded by the due-date sweep nor triaged as overdue
 * or due soon in "my work" (RR1a, finding B11; docs/design/
 * REVIEW_ROUTING_2026-10-23.md §2.11). An open route member is reminded as
 * today, and so is an ordinary blocked task.
 *
 * Real SQL on PGlite: the sweep's own SELECT and guarded UPDATE, and
 * readMyWork's own query. The trigger is present and does not stop the sweep:
 * it stamps metadata only, which the trigger leaves writable.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { extractTableDdl } from '../../../tests/golden-journeys/harness';
import type { RequestDb } from '../../db/requestDb';

const h = vi.hoisted(() => ({ db: null as unknown, notices: [] as Array<{ taskId: string; title: string }> }));
vi.mock('../../db', () => ({ get db() { return h.db; } }));
vi.mock('../../services/tenant/tenant-lifecycle', () => ({
  filterTenantsForBackgroundWork: async (ids: number[]) => new Set(ids),
}));
vi.mock('../../services/tasking/task-side-effects', () => ({
  notifyTaskEvent: (n: { taskId: string; title: string }) => h.notices.push(n),
}));

const SQL = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8');
const ROUTE = '00000000-0000-4000-8000-0000000000aa';
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'client_workspaces', 'projects', 'unified_tasks']));
  await pg.exec(SQL('migrations/20260524_program_workbench_schema.sql'));
  await pg.exec(SQL('migrations/20260814_projects_regulatory_program_anchor.sql'));
  await pg.exec(SQL('db/migrations/20260727_unified_tasks_mdx_metadata.sql'));
  await pg.exec(SQL('db/migrations/20260807_unified_tasks_soft_delete.sql'));
  await pg.exec(SQL('migrations/20261023_review_routes.sql'));
  await pg.exec(`
    INSERT INTO organizations (id, name, slug) VALUES (1, 'Sponsor', 'sponsor');
    INSERT INTO users (id, email, name, password_hash) VALUES (3, 'rita@example.test', 'Rita', 'x'), (4, 'sam@example.test', 'Sam', 'x');
    INSERT INTO review_routes (id, organization_id, subject_type, subject_id, round, sender_id, sender_name, review_order, approval_due_at, content_digest)
      VALUES ('${ROUTE}', 1, 'canonical_document', 'c-1', 1, 4, 'Sam', 'parallel', now() + interval '7 days', 'd');
    SET c2c.review_route_writer = 'on';
    INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id, due_date, created_by_id, review_route_id, review_role, review_step) VALUES
      ('R-APPROVER', 1, 'Vault', 'Approve: overview v2', 'blocked', 3, now() - interval '1 day', 4, '${ROUTE}', 'approver', 2),
      ('R-REVIEWER', 1, 'Vault', 'Review: overview v2', 'pending', 4, now() - interval '1 day', 4, '${ROUTE}', 'reviewer', 1);
    RESET c2c.review_route_writer;
    INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id, due_date, created_by_id) VALUES
      ('T-BLOCKED', 1, 'IND', 'Blocked ordinary work', 'blocked', 3, now() - interval '1 day', 4);
  `);
  h.db = drizzle(pg);
}, 60_000);
afterAll(async () => pg?.close());

describe('the due-date sweep (B11)', () => {
  it('does not remind a blocked route member; reminds an open one and an ordinary blocked task', async () => {
    const { runTaskDueSweep } = await import('../taskDueSweep');
    const summary = await runTaskDueSweep();
    expect(h.notices.map(n => n.taskId).sort()).toEqual(['R-REVIEWER', 'T-BLOCKED']);
    expect(summary.overdueNotified).toBe(2);
    const marker = await pg.query<{ task_id: string; marked: boolean }>(
      `SELECT task_id, (metadata::jsonb ? 'overdueNotifiedAt') AS marked FROM unified_tasks ORDER BY task_id`);
    expect(marker.rows).toEqual([
      { task_id: 'R-APPROVER', marked: null },
      { task_id: 'R-REVIEWER', marked: true },
      { task_id: 'T-BLOCKED', marked: true },
    ]);
  });
});

describe('my work (B11)', () => {
  it('reports a blocked route member as waiting, outside the overdue and due-soon triage', async () => {
    const { readMyWork } = await import('../../services/tasking/my-work');
    const work = await readMyWork(drizzle(pg) as unknown as RequestDb, 1, 3);
    const approver = work.items.find(i => i.taskId === 'R-APPROVER')!;
    expect(approver).toMatchObject({ waitingOn: 'review', overdue: false, dueSoon: false });
    const ordinary = work.items.find(i => i.taskId === 'T-BLOCKED')!;
    expect(ordinary).toMatchObject({ waitingOn: null, overdue: true });
    expect(work.overdue).toBe(1);
  });
});
