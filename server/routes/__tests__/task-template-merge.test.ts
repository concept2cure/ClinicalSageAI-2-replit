/**
 * GET /api/task-management/templates — the built-in catalog must actually be
 * SERVED, not merely imported.
 *
 * WHY THIS FILE EXISTS
 * The route selected only from `task_templates` and never referenced
 * `BUILTIN_WORKFLOW_TEMPLATES` — the import was dead. Nothing in the repo seeds
 * that table and there is no UI to author a template, so on every real install
 * the picker received `[]`, rendered "No workflow templates yet", and left the
 * Create button permanently disabled. The from-template POST accepted the
 * built-in ids the whole time; no user could ever reach it.
 *
 * The two tests that already covered this route are why it shipped:
 * `workflow-templates.test.ts` exercises the catalog module in isolation, and
 * `task-template-list.test.ts` reads the route file as TEXT and pattern-matches
 * it. Neither could observe that the merge does not happen, because neither
 * calls the endpoint.
 *
 * So this one drives the real handler over HTTP with a stubbed database and
 * asserts on the RESPONSE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

/** Rows the stubbed `task_templates` select should resolve to, per test. */
const state = vi.hoisted(() => ({ rows: [] as any[], throws: null as any }));

/**
 * Minimal drizzle-shaped select chain. Every builder method returns `this`, and
 * the object is awaitable — so `select().from().where().orderBy()` resolves to
 * `state.rows`, or rejects when a test wants to simulate an unprovisioned table.
 */
vi.mock('../../db', () => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (resolve: (v: any) => unknown, reject: (e: any) => unknown) =>
      state.throws ? Promise.resolve().then(() => reject(state.throws)) : Promise.resolve(state.rows).then(resolve),
  };
  return { db: chain, pool: {} };
});
// Keep the ledger and notifier out of a list-route test.
vi.mock('../../services/tasking/task-audit', () => ({ auditTaskAction: vi.fn() }));
vi.mock('../../services/notifications/notification-service', () => ({ createNotification: vi.fn() }));

import taskManagementRoutes from '../taskManagement.routes';
import { BUILTIN_WORKFLOW_TEMPLATES } from '../../services/tasking/workflow-templates';

function makeApp(org?: number) {
  const app = express();
  app.use(express.json());
  if (org != null) {
    app.use((req, _res, next) => {
      (req as any).user = { organizationId: org, id: 7 };
      next();
    });
  }
  app.use('/api/task-management', taskManagementRoutes);
  return app;
}

beforeEach(() => {
  state.rows = [];
  state.throws = null;
  vi.clearAllMocks();
});

describe('GET /templates — built-in catalog reachability', () => {
  it('serves the built-in catalog when the org has no stored templates', async () => {
    const res = await request(makeApp(2)).get('/api/task-management/templates');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The exact failure that shipped: this array was empty.
    expect(res.body.data.length).toBe(BUILTIN_WORKFLOW_TEMPLATES.length);
    expect(res.body.data.length).toBeGreaterThan(0);

    const ids = res.body.data.map((t: any) => t.templateId);
    for (const b of BUILTIN_WORKFLOW_TEMPLATES) expect(ids).toContain(b.templateId);
    expect(res.body.data.every((t: any) => t.builtin === true)).toBe(true);
  });

  it('returns each built-in in the shape the picker renders', async () => {
    const res = await request(makeApp(2)).get('/api/task-management/templates');
    const first = res.body.data[0];
    const source = BUILTIN_WORKFLOW_TEMPLATES.find(b => b.templateId === first.templateId)!;

    // The preview must not disagree with what instantiation will create.
    expect(first.taskCount).toBe(source.tasks.length);
    expect(first.dependencyCount).toBe(source.dependencies.length);
    expect(first.name).toBe(source.name);
    expect(typeof first.spanDays).toBe('number');
    expect(Array.isArray(first.tasks)).toBe(true);
    // The picker enables its Create button off these, so they must be real.
    expect(first.taskCount).toBeGreaterThan(0);
  });

  it('lets an org template override a built-in of the same id (org wins, no duplicate)', async () => {
    const clash = BUILTIN_WORKFLOW_TEMPLATES[0].templateId;
    state.rows = [
      {
        templateId: clash,
        name: 'Our tailored version',
        description: null,
        category: 'regulatory',
        submissionType: null,
        milestone: null,
        isDefault: false,
        version: 3,
        usageCount: 11,
        tasks: [{ id: 't1', title: 'Ours', moduleType: 'IND', dayOffset: 0, duration: 1, estimatedHours: 2 }],
        dependencies: [],
      },
    ];

    const res = await request(makeApp(2)).get('/api/task-management/templates');
    const matching = res.body.data.filter((t: any) => t.templateId === clash);
    expect(matching).toHaveLength(1);
    expect(matching[0].name).toBe('Our tailored version');
    expect(matching[0].builtin).toBe(false);
    // The other built-ins are still offered alongside it.
    expect(res.body.data.length).toBe(BUILTIN_WORKFLOW_TEMPLATES.length);
  });

  it('still serves the built-ins when task_templates is unprovisioned (42P01)', async () => {
    state.throws = Object.assign(new Error('relation "task_templates" does not exist'), { code: '42P01' });

    const res = await request(makeApp(2)).get('/api/task-management/templates');

    // Previously a 500 — in exactly the situation the catalog exists to cover.
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(BUILTIN_WORKFLOW_TEMPLATES.length);
  });

  it('propagates a non-42P01 database error rather than pretending the list is fine', async () => {
    state.throws = Object.assign(new Error('connection terminated'), { code: '57P01' });
    const res = await request(makeApp(2)).get('/api/task-management/templates');
    expect(res.status).toBe(500);
  });

  it('requires an organization context', async () => {
    const res = await request(makeApp(undefined)).get('/api/task-management/templates');
    expect(res.status).toBe(401);
  });
});
