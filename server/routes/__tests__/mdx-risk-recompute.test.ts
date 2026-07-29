/**
 * PATCH /api/mdx/risk-items/:id — ISO 14971 score recomputation.
 *
 * Both stored risk products used to go stale on a partial update:
 *
 *   initial_risk   was never recomputed. The handler carried an empty
 *                  `if` block and a comment claiming there was "no clean
 *                  way" to do it in one statement, so raising a hazard's
 *                  severity left the stored product at its old value.
 *   residual_risk  was recomputed only when both residual components
 *                  arrived together; sending one alone left a product
 *                  contradicting its own columns.
 *
 * These columns drive the risk matrix, the high-residual counts and the
 * acceptability banding, so a stale score can leave a hazard sitting in
 * the wrong band while its own severity and probability say otherwise.
 *
 * The fix relies on Postgres evaluating the right-hand side of SET
 * against the OLD row, so COALESCE(<new>, <col>) yields the correct
 * post-update value for whichever subset of components was supplied.
 * These tests assert the emitted SQL and bound parameters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import riskRouter from '../mdx-risk-management';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/mdx', riskRouter);
  return app;
}

/** The UPDATE statement the handler emitted, with its bound args. */
function updateCall() {
  const call = query.mock.calls.find((c) => /UPDATE\s+risk_items/i.test(String(c[0])));
  if (!call) throw new Error('no UPDATE risk_items issued');
  return { sql: String(call[0]).replace(/\s+/g, ' '), args: call[1] as unknown[] };
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [{ id: 1 }] });
});

describe('risk score recomputation', () => {
  it('recomputes initial_risk when only severity changes', async () => {
    const res = await request(appWith(1))
      .patch('/api/mdx/risk-items/1')
      .send({ severity: 5 });

    expect(res.status).toBe(200);
    const { sql, args } = updateCall();
    expect(sql).toMatch(
      /initial_risk = COALESCE\(\$\d+::int, severity\) \* COALESCE\(\$\d+::int, probability\)/,
    );
    /* The unsupplied component is bound as NULL so COALESCE falls back
       to the stored column rather than to a fabricated default. */
    expect(args).toContain(5);
    expect(args).toContain(null);
  });

  it('recomputes initial_risk when only probability changes', async () => {
    await request(appWith(1)).patch('/api/mdx/risk-items/1').send({ probability: 4 });

    const { sql } = updateCall();
    expect(sql).toMatch(/initial_risk = COALESCE/);
  });

  it('recomputes initial_risk when both components change together', async () => {
    await request(appWith(1))
      .patch('/api/mdx/risk-items/1')
      .send({ severity: 3, probability: 2 });

    const { sql, args } = updateCall();
    expect(sql).toMatch(/initial_risk = COALESCE/);
    expect(args).toContain(3);
    expect(args).toContain(2);
  });

  it('recomputes residual_risk when only one residual component changes', async () => {
    /* The precise old bug: this case silently left the stored residual
       product disagreeing with residual_severity. */
    await request(appWith(1))
      .patch('/api/mdx/risk-items/1')
      .send({ residualSeverity: 2 });

    const { sql } = updateCall();
    expect(sql).toMatch(
      /residual_risk = COALESCE\(\$\d+::int, residual_severity\) \* COALESCE\(\$\d+::int, residual_probability\)/,
    );
  });

  it('recomputes residual_risk when both residual components change', async () => {
    await request(appWith(1))
      .patch('/api/mdx/risk-items/1')
      .send({ residualSeverity: 2, residualProbability: 3 });

    const { sql } = updateCall();
    expect(sql).toMatch(/residual_risk = COALESCE/);
  });

  it('leaves both products alone when no component is touched', async () => {
    /* Editing prose must not rewrite the scores. */
    await request(appWith(1))
      .patch('/api/mdx/risk-items/1')
      .send({ hazard: 'Reworded hazard' });

    const { sql } = updateCall();
    expect(sql).not.toMatch(/initial_risk/);
    expect(sql).not.toMatch(/residual_risk/);
    expect(sql).toMatch(/hazard = \$\d+/);
  });

  it('updates initial without disturbing residual, and vice versa', async () => {
    await request(appWith(1)).patch('/api/mdx/risk-items/1').send({ severity: 5 });
    expect(updateCall().sql).not.toMatch(/residual_risk/);

    query.mockClear();
    query.mockResolvedValue({ rows: [{ id: 1 }] });
    await request(appWith(1)).patch('/api/mdx/risk-items/1').send({ residualProbability: 1 });
    expect(updateCall().sql).not.toMatch(/initial_risk/);
  });

  it('still enforces tenancy on the recomputing update', async () => {
    await request(appWith(9)).patch('/api/mdx/risk-items/1').send({ severity: 5 });

    const { sql, args } = updateCall();
    expect(sql).toMatch(/organization_id = \$\d+/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(args[args.length - 1]).toBe(9);
  });

  it('403s without org context', async () => {
    const res = await request(appWith(null))
      .patch('/api/mdx/risk-items/1')
      .send({ severity: 5 });
    expect(res.status).toBe(403);
  });
});
