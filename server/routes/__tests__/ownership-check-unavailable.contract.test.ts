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
 * This is not hypothetical. On a database where install-fresh's governed-content
 * step was skipped, `core.programs` exists WITHOUT `org_id` (WO-15 finding 1),
 * and source 2 of PROGRAM_ORG_SOURCES raises 42703 on every call. Before this
 * change that was swallowed.
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

function client(handler: (sql: string) => unknown) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('SET LOCAL')) return { rows: [] };
      const out = handler(sql);
      if (out instanceof Error) throw out;
      return { rows: out as unknown[] };
    }),
    release: vi.fn(),
  };
}

async function load() {
  vi.resetModules();
  return import('../innovation-routes');
}

beforeEach(() => {
  connectMock.mockReset();
  queryMock.mockReset();
});

describe('programBelongsToOrg distinguishes "no match" from "could not check"', () => {
  it('THROWS when every program->org source fails to run', async () => {
    // The reproduced production case: core.programs without org_id, and the
    // other two registries absent in this environment.
    connectMock.mockImplementation(async () =>
      client((sql) => {
        if (sql.includes('core.programs')) return pgError('42703', 'column "org_id" does not exist');
        return pgError('42P01', 'relation does not exist');
      }),
    );

    const { programBelongsToOrg, GuardUnavailableError } = await load();

    await expect(programBelongsToOrg('prog-1', 42)).rejects.toBeInstanceOf(GuardUnavailableError);
  });

  it('returns FALSE — a real deny — when a source ran and found nothing', async () => {
    connectMock.mockImplementation(async () => client(() => []));

    const { programBelongsToOrg } = await load();

    // This is the assertion that keeps the fix honest. If every failure became
    // a throw, the guard would 503 on a genuine cross-tenant attempt and stop
    // denying anything.
    await expect(programBelongsToOrg('prog-1', 42)).resolves.toBe(false);
  });

  it('returns TRUE when a source confirms the program', async () => {
    connectMock.mockImplementation(async () =>
      client((sql) => (sql.includes('FROM programs') ? [{ '?column?': 1 }] : [])),
    );

    const { programBelongsToOrg } = await load();

    await expect(programBelongsToOrg('prog-1', 42)).resolves.toBe(true);
  });

  it('still decides when only SOME sources fail — a partial outage is not an outage', async () => {
    connectMock.mockImplementation(async () =>
      client((sql) => {
        if (sql.includes('core.programs')) return pgError('42703', 'column "org_id" does not exist');
        if (sql.includes('FROM programs')) return [{ '?column?': 1 }];
        return [];
      }),
    );

    const { programBelongsToOrg } = await load();

    await expect(programBelongsToOrg('prog-1', 42)).resolves.toBe(true);
  });

  it('treats caller garbage (22P02) as a completed check, not an outage', async () => {
    // A malformed uuid that survived the ::text casts is the caller's problem.
    // Their own input cannot prove ownership, so denying is honest and the
    // check genuinely ran — it must NOT escalate to a 503.
    connectMock.mockImplementation(async () =>
      client(() => pgError('22P02', 'invalid input syntax for type uuid')),
    );

    const { programBelongsToOrg } = await load();

    await expect(programBelongsToOrg('not-a-uuid', 42)).resolves.toBe(false);
  });

  it('THROWS rather than denying when there is no pool at all', async () => {
    connectMock.mockImplementation(async () => {
      throw new Error('pool exhausted');
    });

    const { programBelongsToOrg, GuardUnavailableError } = await load();

    await expect(programBelongsToOrg('prog-1', 42)).rejects.toBeInstanceOf(GuardUnavailableError);
  });
});
