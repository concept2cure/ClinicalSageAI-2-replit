/**
 * A cross-tenant check that could not RUN must not answer "no access".
 *
 * WO-15 finding 9, second instance. `verifyProjectAccess` is the only thing
 * standing between a caller in org A and org B's project rows — this module's
 * own header says "verifyProjectAccess or loadProjectAccessRow — nothing else
 * decides" — and it ended `catch { return false }`, unlogged.
 *
 * `false` is routed by every caller to `sendError(res, 404, 'Project not found')`
 * (governance-ops.ts:44, artifacts.ts:378 and four more), which is deliberately
 * indistinguishable from a cross-tenant id. So a schema failure, a dropped
 * connection or a statement timeout produced exactly the same answer as a
 * legitimate deny: a control that was completely broken looked like a control
 * that was working, to callers and operators alike.
 *
 * The taxonomy is the one innovation-routes.ts already fixed for `guardQuery`
 * (GuardUnavailableError, 2026-09-10):
 *
 *   genuine no-match    zero rows, no error              deny — correct
 *   caller garbage      unparseable project id           deny — correct
 *   SCHEMA failure      42P01 / 42703 / 42501 / 3F000    the check DID NOT RUN
 *   INFRASTRUCTURE      08006 / 53300 / 57014            the check DID NOT RUN
 *
 * The last two must not deny. They propagate, and every caller already wraps the
 * handler in a try/catch that logs and returns 500 — visible to an operator,
 * and not a sentence about the caller's access.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, poolQuery } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  poolQuery: vi.fn(async () => ({ rows: [{ id: 1 }], rowCount: 1 })),
}));

vi.mock('../../../db', () => ({ db: mockDb, pool: { query: poolQuery } }));

import { verifyProjectAccess } from '../project-access';

/** A drizzle select chain that rejects at the end, the way a real query does. */
function selectThatFailsWith(error: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'leftJoin', 'innerJoin', 'orderBy', 'groupBy']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.limit = vi.fn(() => Promise.reject(error));
  chain.then = (onOk: unknown, onErr: (e: unknown) => unknown) =>
    Promise.reject(error).then(onOk as never, onErr);
  return vi.fn(() => chain);
}

/** A select chain that resolves to zero rows — the legitimate deny. */
function selectThatReturnsNoRows() {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'leftJoin', 'innerJoin', 'orderBy', 'groupBy']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.limit = vi.fn(() => Promise.resolve([]));
  chain.then = (onOk: (v: unknown[]) => unknown) => Promise.resolve([]).then(onOk);
  return vi.fn(() => chain);
}

/* `userId` is read straight off the request (shared.ts:202), not out of
   `user`, and getOrganizationId throws without a resolvable org. */
const req = () =>
  ({
    userId: 7,
    organizationId: 1,
    tenantContext: { organizationId: '1', clientWorkspaceId: '1' },
    user: { id: 7, organizationId: 1, role: 'user' },
  }) as never;

const pgError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

beforeEach(() => {
  mockDb.select.mockReset();
  poolQuery.mockClear();
});

describe('verifyProjectAccess — a check that did not run is not a denial', () => {
  it('denies on a genuine no-match, with no error', async () => {
    mockDb.select = selectThatReturnsNoRows();
    await expect(verifyProjectAccess(req(), '1')).resolves.toBe(false);
  });

  it('denies an unparseable project id', async () => {
    mockDb.select = selectThatReturnsNoRows();
    await expect(verifyProjectAccess(req(), 'not-a-project')).resolves.toBe(false);
  });

  it('does NOT deny when the store is missing (42P01)', async () => {
    mockDb.select = selectThatFailsWith(pgError('42P01', 'relation "projects" does not exist'));
    await expect(verifyProjectAccess(req(), '1')).rejects.toThrow(/does not exist/);
  });

  it('does NOT deny when a column is missing (42703)', async () => {
    mockDb.select = selectThatFailsWith(pgError('42703', 'column "owner_id" does not exist'));
    await expect(verifyProjectAccess(req(), '1')).rejects.toThrow(/owner_id/);
  });

  it('does NOT deny when permission is refused (42501)', async () => {
    mockDb.select = selectThatFailsWith(pgError('42501', 'permission denied for table projects'));
    await expect(verifyProjectAccess(req(), '1')).rejects.toThrow(/permission denied/);
  });

  it('does NOT deny when the connection drops (08006)', async () => {
    mockDb.select = selectThatFailsWith(pgError('08006', 'connection failure'));
    await expect(verifyProjectAccess(req(), '1')).rejects.toThrow(/connection failure/);
  });

  it('does NOT deny when the statement is cancelled (57014)', async () => {
    mockDb.select = selectThatFailsWith(pgError('57014', 'canceling statement due to statement timeout'));
    await expect(verifyProjectAccess(req(), '1')).rejects.toThrow(/statement timeout/);
  });
});
