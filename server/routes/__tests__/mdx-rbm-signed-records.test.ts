/**
 * RBM routes — a signed record cannot be minted, extended or edited around its
 * signature, and a QTL evaluates in the direction its limit bites.
 *
 * Ported from the abandoned RBQM PRs (#1166, #1123, #1120) onto the v2 route
 * module, where the plan and action routes still live in mdx-rbm.ts:
 *
 *   - POST cannot create an active (signed-looking) plan or assessment: `status`
 *     is not accepted on create, so every hand-created record starts as a draft.
 *   - A monitoring action can be added only to a DRAFT plan. The approver's
 *     signature attests to a specific set of actions.
 *   - PATCH on an approved plan is a 409 pointing at /amend; /amend opens the
 *     next version as a draft.
 *   - PATCH /rbm-qtls/:id with an explicit `threshold: null` clears the limit,
 *     so status recomputes to not_evaluated instead of keeping the old band.
 *   - QTL direction: a lower-bound limit breaches at/below; a two-sided limit
 *     without both bounds is a 422.
 *
 * The pool is a SQL-routing double: each test states what the tenant-scoped
 * SELECT returns, and asserts on the statements the route issued.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

type Route = { match: RegExp; rows: unknown[] | ((args: unknown[]) => unknown[]) };
const h = vi.hoisted(() => ({
  routes: [] as { match: RegExp; rows: unknown[] | ((args: unknown[]) => unknown[]) }[],
  calls: [] as { sql: string; args: unknown[] }[],
}));
const query = vi.hoisted(() => vi.fn(async (sql: string, args: unknown[] = []) => {
  h.calls.push({ sql, args });
  for (const r of h.routes) {
    if (r.match.test(sql)) return { rows: typeof r.rows === 'function' ? r.rows(args) : r.rows, rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
}));
vi.mock('../../db', () => ({
  pool: { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) },
}));
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: vi.fn() }));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: vi.fn() }));

import rbmRouter from '../mdx-rbm';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 7, userId: 7, organizationId: 1, role: 'admin' };
    next();
  });
  a.use('/api/mdx', rbmRouter);
  return a;
}

function on(match: RegExp, rows: Route['rows']) { h.routes.push({ match, rows }); }
const issued = (re: RegExp) => h.calls.filter(c => re.test(c.sql));

beforeEach(() => {
  query.mockClear();
  h.routes.length = 0;
  h.calls.length = 0;
});

describe('POST cannot create a signed-looking record', () => {
  it('a monitoring plan posted with status:active is stored as a draft', async () => {
    on(/COALESCE\(MAX\(version\)/, [{ v: 0 }]);
    on(/INSERT INTO rbm_monitoring_plans/, (args) => [{ id: 1, status: 'draft', args }]);
    const res = await request(app()).post('/api/mdx/rbm-monitoring-plans')
      .send({ title: 'Plan', status: 'active', programId: '11111111-2222-3333-4444-555555555555' });
    expect(res.status).toBe(201);
    const [ins] = issued(/INSERT INTO rbm_monitoring_plans/);
    expect(ins.sql).toContain("'draft'");
    expect(ins.args).not.toContain('active');
  });

  it('a risk assessment posted with status:active is stored as a draft', async () => {
    on(/INSERT INTO rbm_risk_assessments/, [{ id: 1, status: 'draft' }]);
    const res = await request(app()).post('/api/mdx/rbm-assessments').send({ title: 'RACT', status: 'active' });
    expect(res.status).toBe(201);
    const [ins] = issued(/INSERT INTO rbm_risk_assessments/);
    expect(ins.sql).toContain("'draft'");
    expect(ins.args).not.toContain('active');
  });
});

describe('POST /rbm-monitoring-actions — only a draft plan takes new actions', () => {
  it('refuses an action on an approved plan with a 409 that points at /amend', async () => {
    on(/SELECT status, version FROM rbm_monitoring_plans/, [{ status: 'active' }]);
    const res = await request(app()).post('/api/mdx/rbm-monitoring-actions').send({ planId: 11, description: 'late' });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('/amend');
    expect(issued(/INSERT INTO rbm_monitoring_actions/)).toHaveLength(0);
  });

  it('accepts an action on a draft plan', async () => {
    on(/SELECT status, version FROM rbm_monitoring_plans/, [{ status: 'draft' }]);
    on(/INSERT INTO rbm_monitoring_actions/, [{ id: 5 }]);
    const res = await request(app()).post('/api/mdx/rbm-monitoring-actions').send({ planId: 11, description: 'ok' });
    expect(res.status).toBe(201);
  });
});

describe('PATCH /rbm-monitoring-plans/:id — an approved plan is read-only', () => {
  it('refuses a content edit on an active plan with 409 and writes nothing', async () => {
    on(/SELECT status, version FROM rbm_monitoring_plans/, [{ status: 'active', version: 2 }]);
    const res = await request(app()).patch('/api/mdx/rbm-monitoring-plans/11').send({ title: 'Edited' });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('/amend');
    expect(issued(/UPDATE rbm_monitoring_plans/)).toHaveLength(0);
  });

  it('still lets an active plan be archived (status-only)', async () => {
    on(/SELECT status, version FROM rbm_monitoring_plans/, [{ status: 'active', version: 2 }]);
    on(/UPDATE rbm_monitoring_plans/, [{ id: 11, status: 'archived' }]);
    const res = await request(app()).patch('/api/mdx/rbm-monitoring-plans/11').send({ status: 'archived' });
    expect(res.status).toBe(200);
  });

  it('POST /:id/amend opens the next version as a draft', async () => {
    on(/SELECT \* FROM rbm_monitoring_plans/, [{ id: 11, program_id: 'p', status: 'active', version: 2, title: 'Plan', strategy: 'hybrid' }]);
    on(/COALESCE\(MAX\(version\)/, [{ v: 2 }]);
    on(/INSERT INTO rbm_monitoring_plans/, [{ id: 12, version: 3, status: 'draft' }]);
    const res = await request(app()).post('/api/mdx/rbm-monitoring-plans/11/amend').send({ reason: 'Add CSM review' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: 12, version: 3, status: 'draft' });
    expect(res.body.meta).toMatchObject({ supersedes: 2 });
    const stmts = h.calls.map(c => c.sql.trim());
    expect(stmts[0]).toBe('BEGIN');
    expect(stmts[stmts.length - 1]).toBe('COMMIT');
  });

  it('POST /:id/amend without a reason is a 422', async () => {
    const res = await request(app()).post('/api/mdx/rbm-monitoring-plans/11/amend').send({});
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('QTL limits', () => {
  const stored = { threshold: '0.15', secondary_limit: '0.1', direction: 'upper', threshold_lower: null, secondary_limit_lower: null, current_value: '0.2' };

  it('PATCH { threshold: null } clears the limit — status is not_evaluated, not the old band', async () => {
    on(/FROM rbm_qtls WHERE id/, [stored]);
    on(/UPDATE rbm_qtls/, (args) => [{ id: 3, args }]);
    const res = await request(app()).patch('/api/mdx/rbm-qtls/3').send({ threshold: null });
    expect(res.status).toBe(200);
    const [upd] = issued(/UPDATE rbm_qtls/);
    expect(upd.args).toContain('not_evaluated');
    expect(upd.args).not.toContain('breached');
  });

  it('PATCH that omits threshold keeps the stored limit', async () => {
    on(/FROM rbm_qtls WHERE id/, [stored]);
    on(/UPDATE rbm_qtls/, [{ id: 3 }]);
    await request(app()).patch('/api/mdx/rbm-qtls/3').send({ rationale: 'noted' });
    const [upd] = issued(/UPDATE rbm_qtls/);
    expect(upd.args).toContain('breached');
  });

  it('POST a lower-bound QTL evaluates 40% against >= 90% as breached', async () => {
    on(/INSERT INTO rbm_qtls/, (args) => [{ id: 4, args }]);
    const res = await request(app()).post('/api/mdx/rbm-qtls')
      .send({ parameter: 'Endpoint completeness', threshold: 0.9, secondaryLimit: 0.95, direction: 'lower', currentValue: 0.4 });
    expect(res.status).toBe(201);
    const [ins] = issued(/INSERT INTO rbm_qtls/);
    expect(ins.args).toContain('lower');
    expect(ins.args).toContain('breached');
  });

  it('POST a two-sided QTL without its lower bound is a 422', async () => {
    const res = await request(app()).post('/api/mdx/rbm-qtls')
      .send({ parameter: 'Randomisation ratio', threshold: 1.1, direction: 'two_sided' });
    expect(res.status).toBe(422);
    expect(issued(/INSERT INTO rbm_qtls/)).toHaveLength(0);
  });

  it('PATCH switching to two_sided validates the MERGED limits', async () => {
    on(/FROM rbm_qtls WHERE id/, [stored]);
    const res = await request(app()).patch('/api/mdx/rbm-qtls/3').send({ direction: 'two_sided' });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/both bounds/);
    expect(issued(/UPDATE rbm_qtls/)).toHaveLength(0);
  });
});
