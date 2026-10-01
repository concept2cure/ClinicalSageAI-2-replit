/**
 * An ownership check that could not RUN must never answer "not found".
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * `guardQuery` in server/routes/innovation-routes.ts ended
 * `catch { ...; return null; }` — no binding, no logging — and its own header
 * said the intent out loud: "Any failure (missing table in this environment, no
 * pool, bad cast) is treated as 'no match' — deny by default."
 *
 * Deny-by-default is the right direction for a tenant boundary. Spelling it the
 * same way as a real deny is not. The route answers 404 "Program not found",
 * which the file deliberately makes indistinguishable from a cross-tenant id —
 * so a control that had completely stopped working looked exactly like a
 * control that was working, with nothing logged and no way for a test to tell.
 *
 * This was not hypothetical. On a database where install-fresh's governed-content
 * step was skipped, `core.programs` exists WITHOUT `org_id` (WO-15 finding 1),
 * and the program check's second source raised 42703 on every call. Before
 * 2026-09-10 that was swallowed. (Since D3, 2026-10-01, the program check reads
 * `regulatory_programs` only; core.programs is written by nothing.)
 *
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────
 * The distinction, in both directions. A check that RAN and found nothing still
 * denies — a guard that answered 503 for everything would be useless and must
 * not pass this suite either.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { connectMock, queryMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('../../db', () => ({
  pool: { connect: connectMock },
  default: { connect: connectMock },
}));

vi.mock('../../utils/logger.js', () => ({
  createScopedLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

/** A pg error carrying a SQLSTATE, the way node-postgres raises one. */
function pgError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

async function load() {
  vi.resetModules();
  return import('../innovation-routes');
}

beforeEach(() => {
  connectMock.mockReset();
  queryMock.mockReset();
});

/**
 * The program check itself is `programInOrganization` (D3, 2026-10-01): one
 * source, `regulatory_programs`, on the pool the router reads with. Its own
 * suite and tests/db/program-ownership.dbtest.ts pin what it answers; what is
 * pinned here is that the ROUTE keeps the distinction — "could not check" is a
 * 503, "checked and not yours" is a 404, through a real innovation route.
 */
describe('an innovation route distinguishes "not yours" from "could not check"', () => {
  const PROGRAM = '11111111-1111-4111-8111-111111111111';

  async function get(programQuery: (sql: string) => unknown, programId = PROGRAM) {
    const { default: express } = await import('express');
    const { default: request } = await import('supertest');
    const { initializeInnovationRoutes } = await load();
    const pool = {
      connect: connectMock,
      query: vi.fn(async (sql: string, _params?: unknown[]) => {
        const out = programQuery(sql);
        if (out instanceof Error) throw out;
        return { rows: out as unknown[] };
      }),
    };
    const app = express();
    app.use((req, _res, next) => {
      (req as unknown as { user: { organizationId: number } }).user = { organizationId: 42 };
      next();
    });
    app.use(initializeInnovationRoutes(pool as never));
    const res = await request(app).get(`/delta-radar/statistics/${programId}`);
    return { res, pool };
  }

  it('answers 503 — not 404 — when the check could not run', async () => {
    const { res } = await get(() => pgError('42P01', 'relation "regulatory_programs" does not exist'));
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not a permission decision/);
  });

  it('answers 404 — a real deny — when the check ran and found nothing', async () => {
    // This keeps the fix honest: a guard that 503'd on everything would stop
    // denying a genuine cross-tenant attempt.
    const { res, pool } = await get(() => []);
    expect(res.status).toBe(404);
    expect(pool.query.mock.calls[0][0]).toMatch(/FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2 AND deleted_at IS NULL/);
    expect(pool.query.mock.calls[0][1]).toEqual([PROGRAM, 42]);
  });

  it('asks no registry but regulatory_programs, and lets the owner through', async () => {
    const { res, pool } = await get(sql => (sql.includes('regulatory_programs') ? [{ id: PROGRAM }] : []));
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(503);
    const asked = pool.query.mock.calls.map(c => String(c[0])).filter(q => /programs\b/.test(q));
    expect(asked.every(q => q.includes('regulatory_programs'))).toBe(true);
  });

  it('denies caller garbage without asking the database, and without a 503', async () => {
    const { res, pool } = await get(() => pgError('22P02', 'invalid input syntax for type uuid'), 'not-a-uuid');
    expect(res.status).toBe(404);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
