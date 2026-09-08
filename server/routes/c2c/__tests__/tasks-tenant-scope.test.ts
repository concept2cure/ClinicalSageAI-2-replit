/**
 * Every task route carries an organization predicate.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * Five of the seven handlers in routes/c2c/tasks.ts filtered on `projectId`
 * alone. `project_tasks.id` and `projects.id` are both serial, and the router
 * sits behind `authMiddleware` only — so any authenticated user of any tenant
 * could read another tenant's task list, its health score and AnA's assessment
 * of it, and could create tasks (and generate a whole milestone set) inside
 * another tenant's project. The create path was the worse half: it read the
 * project unscoped and then took the victim's `organizationId` for the insert,
 * so the row was attributed to the victim and invisible to its author.
 *
 * The PUT and DELETE twins had already been fixed, and the note left at that
 * fix says why nothing caught the rest:
 *
 *     "The static tenant-isolation gate could not see it because it scans raw
 *      SQL literals and this is a Drizzle query-builder call."
 *
 * So this asserts the predicate the gate cannot see, at the layer where it is
 * decided.
 *
 * ── Why it inspects the condition instead of the response ────────────────────
 * A response-level test would need a fake database that actually evaluates
 * Drizzle conditions; a source-level grep would pass on a comment. This mock
 * captures the real condition object each handler hands to `.where()` and walks
 * its `queryChunks` for the columns it constrains. A handler that drops the org
 * predicate fails here even if its rows still look right against a mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/** Columns constrained by a Drizzle condition, by walking its chunks. */
function columnsOf(condition: unknown): string[] {
  const names: string[] = [];
  const walk = (n: any, depth = 0): void => {
    if (!n || depth > 8) return;
    if (n.name && n.columnType) names.push(n.name);
    for (const key of ['queryChunks', 'left', 'right']) {
      const v = n[key];
      if (v) (Array.isArray(v) ? v : [v]).forEach((x: unknown) => walk(x, depth + 1));
    }
  };
  walk(condition);
  return names;
}

/** Every condition passed to `.where()` during one request. */
const wheres: unknown[] = [];
/** Rows the next awaited chain resolves to, in order. */
let results: unknown[][] = [];

vi.mock('../../../db', () => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    set: () => chain,
    values: () => chain,
    returning: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    where: (condition: unknown) => {
      wheres.push(condition);
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(results.shift() ?? []).then(resolve),
  };
  return { db: chain, pool: {} };
});

// The route module's middleware chain is not what is under test here, and the
// rate limiter reaches Redis. Replace all four with pass-throughs so the
// handlers run with a known org on the request.
const ORG = 42;
vi.mock('../shared', async importOriginal => {
  const actual = await importOriginal<typeof import('../shared')>();
  return {
    ...actual,
    concept2cureRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
    getOrganizationId: () => ORG,
  };
});
vi.mock('../../../auth', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireOrganizationContext: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import taskRoutes from '../tasks';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 7, organizationId: ORG };
    (req as any).userId = 7;
    next();
  });
  a.use('/api/concept2cure', taskRoutes);
  return a;
}

beforeEach(() => {
  wheres.length = 0;
  results = [];
});

/** Every condition the handler built must name organization_id. */
function everyWhereIsOrgScoped() {
  expect(wheres.length).toBeGreaterThan(0);
  for (const w of wheres) {
    expect(columnsOf(w)).toContain('organization_id');
  }
}

describe('routes/c2c/tasks — reads', () => {
  it('GET /projects/:id/tasks constrains organization_id', async () => {
    results = [[]];
    await request(app()).get('/api/concept2cure/projects/1234/tasks').expect(200);
    everyWhereIsOrgScoped();
  });

  it('GET /projects/:id/tasks/summary constrains organization_id', async () => {
    results = [[]];
    await request(app()).get('/api/concept2cure/projects/1234/tasks/summary').expect(200);
    everyWhereIsOrgScoped();
  });
});

describe('routes/c2c/tasks — writes', () => {
  it('POST /projects/:id/tasks resolves the project within the org', async () => {
    // The project lookup, then the insert's .returning().
    results = [[{ id: 1234, organizationId: ORG }], [{ id: 1, name: 'T' }]];
    await request(app())
      .post('/api/concept2cure/projects/1234/tasks')
      .send({ name: 'T' })
      .expect(200);
    everyWhereIsOrgScoped();
  });

  it('POST /projects/:id/tasks 404s on a project belonging to another org', async () => {
    // Scoped lookup finds nothing, so the insert never runs — and crucially the
    // handler cannot reach the foreign project's organizationId to attribute to.
    results = [[]];
    await request(app())
      .post('/api/concept2cure/projects/1234/tasks')
      .send({ name: 'T' })
      .expect(404);
    everyWhereIsOrgScoped();
  });

  it('POST /projects/:id/tasks/bulk resolves the project within the org', async () => {
    results = [[{ id: 1234, organizationId: ORG }], [{ id: 1 }]];
    await request(app())
      .post('/api/concept2cure/projects/1234/tasks/bulk')
      .send({ submissionType: 'IND' })
      .expect(200);
    everyWhereIsOrgScoped();
  });

  it('PUT /projects/:id/tasks/:taskId constrains organization_id', async () => {
    results = [[{ id: 5 }]];
    await request(app())
      .put('/api/concept2cure/projects/1234/tasks/5')
      .send({ name: 'renamed' })
      .expect(200);
    everyWhereIsOrgScoped();
  });

  it('DELETE /projects/:id/tasks/:taskId constrains organization_id', async () => {
    results = [[{ id: 5 }]];
    await request(app()).delete('/api/concept2cure/projects/1234/tasks/5').expect(200);
    everyWhereIsOrgScoped();
  });
});

describe('routes/c2c/tasks — assessment', () => {
  it('POST /projects/:id/tasks/assess constrains organization_id on both reads', async () => {
    results = [[{ id: 1234, name: 'P' }], []];
    await request(app()).post('/api/concept2cure/projects/1234/tasks/assess').send({});
    // Two statements: the project lookup and the task list. Both must be scoped.
    expect(wheres.length).toBeGreaterThanOrEqual(2);
    everyWhereIsOrgScoped();
  });
});
