/**
 * /api/regulatory/tasks (unifiedTasks.routes.ts) refuses a review route member
 * on every write that names an existing row, and refuses a create naming a
 * route column (RR1a, B1 and M9; docs/design/REVIEW_ROUTING_2026-10-23.md
 * §2.3). Through the real router and the real unifiedTaskService SQL on
 * PGlite.
 *
 * The CODE guard is what this file proves, so the migration's trigger is
 * dropped after the schema is built: without the guard, each write lands. The
 * trigger is proved on its own by tests/db/review-route-guard.dbtest.ts.
 *
 * The module sync is insert-only (createUnifiedTask, a fixed column list) and
 * writes no existing row, so it has no row-level refusal of its own; its
 * protection is createUnifiedTask's. The last case pins that a sync leaves a
 * route member exactly as it was.
 */
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { extractTableDdl, REPO_ROOT } from '../../../tests/golden-journeys/harness';

vi.mock('../../db', async () => (await import('./_unified-tasks-pglite-harness')).dbModule());
vi.mock('../../db/requestDb', async () => (await import('./_unified-tasks-pglite-harness')).requestDbModule());
vi.mock('../c2c/actions', async () => (await import('./_unified-tasks-pglite-harness')).ledgerModule());
vi.mock('../../services/tasking/task-signoff', async () =>
  (await import('./_unified-tasks-pglite-harness')).signoffModule(),
);
vi.mock('../../services/notifications/notification-service', async () =>
  (await import('./_unified-tasks-pglite-harness')).notificationModule(),
);

import { h, pg, app, ORG, BASE, ledger, setUpPgliteApp } from './_unified-tasks-pglite-harness';

const BASELINE = 'migrations/0000_sweet_joseph.sql';
const ROUTE = '00000000-0000-4000-8000-0000000000aa';
const DDL = [
  extractTableDdl(BASELINE, [
    'unified_tasks',
    'task_dependencies',
    'cross_module_task_links',
    'stability_studies',
    'drug_substances',
    'drug_products',
    'analytical_methods',
    'process_validation',
    'cmc_change_control',
  ]),
  ...[
    'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
    'db/migrations/20260807_task_graph_org_columns.sql',
    'db/migrations/20260807_unified_tasks_soft_delete.sql',
    'migrations/20261005_cmc_core_registers_project.sql',
    'migrations/20261019_stability_shelf_life_signature.sql',
    'migrations/20261023_review_routes.sql',
  ].map(f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
  // The code guard alone: the backstop is proved by its own database test.
  `DROP TRIGGER unified_tasks_route_rows_guard ON unified_tasks;
   DROP TRIGGER task_dependencies_route_rows_guard ON task_dependencies;
   DROP TRIGGER cross_module_task_links_route_rows_guard ON cross_module_task_links;
   CREATE TABLE ledger_rows (
     seq serial PRIMARY KEY, target text NOT NULL, command text NOT NULL,
     payload jsonb, reason text, user_id integer
   );`,
].join('\n');

const FIXTURE = `
TRUNCATE ledger_rows, task_dependencies, cross_module_task_links, unified_tasks, stability_studies, review_routes RESTART IDENTITY CASCADE;
INSERT INTO review_routes (id, organization_id, subject_type, subject_id, round, sender_id, sender_name, review_order, approval_due_at, content_digest)
  VALUES ('${ROUTE}', ${ORG}, 'canonical_document', 'c-1', 1, 9, 'Sender', 'parallel', now() + interval '7 days', 'd');
INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id, created_by_id, review_route_id, review_role, review_step, source_entity_type, source_entity_id) VALUES
  ('ROUTE-R', ${ORG}, 'CMC', 'Review: Clinical overview v2', 'pending', 42, 9, '${ROUTE}', 'reviewer', 1, 'stability_study', '1'),
  ('TASK-A', ${ORG}, 'IND', 'Draft CSR shell', 'review', 9, 9, NULL, NULL, NULL, NULL, NULL);
INSERT INTO stability_studies (organization_id, study_title, product_name, batch_number, storage_conditions, test_parameters, start_date, study_director) VALUES
  (${ORG}, 'Stability 12M', 'Zanubrutinib', 'B-001', ARRAY['LT'], ARRAY['Assay'], now(), 45);
`;

setUpPgliteApp(DDL, FIXTURE);

const routeRow = async () =>
  (await pg.query('SELECT status, assignee_id, blocked_by, blocks, deleted_at FROM unified_tasks WHERE task_id = $1', ['ROUTE-R'])).rows[0];
const refused = (r: request.Response, code = 'ROUTE_TASK_OWNED_BY_ROUTE', status = 409) => {
  expect(r.status, JSON.stringify(r.body)).toBe(status);
  expect(r.body.code).toBe(code);
};

describe('the unified task writers refuse a review route member (B1)', () => {
  it('PATCH /:id/status: 409, unchanged, no ledger row', async () => {
    h.role = 'admin';
    const before = await routeRow();
    refused(await request(app).patch(`${BASE}/ROUTE-R/status`).send({ status: 'in-progress' }));
    expect(await routeRow()).toEqual(before);
    expect(await ledger()).toEqual([]);
  });

  it.each([
    ['from the route member', 'ROUTE-R', 'TASK-A'],
    ['to the route member', 'TASK-A', 'ROUTE-R'],
  ])('POST /:id/link %s: 409, no link, neither blocking array written', async (_end, source, target) => {
    h.role = 'admin';
    refused(await request(app).post(`${BASE}/${source}/link`).send({ targetTaskId: target, linkType: 'dependency', isBlocking: true }));
    expect((await pg.query('SELECT 1 FROM cross_module_task_links')).rows).toHaveLength(0);
    expect(await routeRow()).toMatchObject({ blocked_by: null, blocks: null });
    expect(await ledger()).toEqual([]);
  });
});

describe('the unified create paths refuse route columns (M9)', () => {
  it('POST /unified naming reviewRouteId: 400, no task, no ledger row', async () => {
    h.role = 'admin';
    refused(
      await request(app).post(`${BASE}/unified`).send({ moduleType: 'IND', title: 'Smuggled', organizationId: ORG, reviewRouteId: ROUTE }),
      'ROUTE_COLUMNS_NOT_ADMITTED',
      400,
    );
    expect((await pg.query("SELECT 1 FROM unified_tasks WHERE title = 'Smuggled'")).rows).toHaveLength(0);
    expect(await ledger()).toEqual([]);
  });

  it('createUnifiedTask, called directly with a route column, refuses and inserts nothing', async () => {
    const { default: service } = await import('../../services/unifiedTaskService');
    await expect(
      service.createUnifiedTask({ moduleType: 'IND', title: 'Direct', organizationId: ORG, review_route_id: ROUTE } as never),
    ).rejects.toMatchObject({ code: 'ROUTE_COLUMNS_NOT_ADMITTED' });
    expect((await pg.query("SELECT 1 FROM unified_tasks WHERE title = 'Direct'")).rows).toHaveLength(0);
  });

  it('a module sync (insert-only) leaves the route member as it was', async () => {
    h.role = 'admin';
    const before = await routeRow();
    const r = await request(app).post(`${BASE}/sync/CMC`).send({});
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await routeRow()).toEqual(before);
  });
});
