/**
 * The stored enforcement mode must be readable under the only RLS posture
 * production accepts.
 *
 * enforcement-mode.test.ts mocks the pool as a bare function, so it cannot see
 * the pool guard that production runs behind: with RLS_ENFORCE=on, a query on
 * the shared pool that carries no tenant scope is refused before it reaches the
 * database. The stored-mode read runs from the background refresh and from the
 * gate's first call, outside any request scope. In the production-posture OQ
 * execution of 2026-09-22 it failed on every refresh:
 *
 *   [enforcement-mode] could not read the stored enforcement mode — serving a
 *   fail-safe value — FAIL-CLOSED: pool.query requires an active tenant scope
 *
 * So the mode an operator sets on the Master Licensing console never took
 * effect in production. The resolver served the deployment value capped at
 * `report`, which is failure mode 1 of the sibling test's header. These cases
 * run the real guard: a mock pool wrapped by the real instrumentPool.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'enforcement-mode-rls-test-secret-padded-32+';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const h = vi.hoisted(() => ({ pool: null as any, stored: null as Record<string, unknown> | null }));
vi.mock('../../../db.js', () => ({
  get pool() {
    return h.pool;
  },
}));

import { instrumentPool } from '../../../db/poolInstrumentation';
import { invalidateEnforcementModeCache, refreshEnforcementMode } from '../enforcement-mode';

/** A pool whose every path — direct query or checked-out client — answers the settings read. */
function makeInstrumentedPool() {
  const answer = (text: unknown) => {
    const sql = typeof text === 'string' ? text : ((text as { text?: string })?.text ?? '');
    return { rows: sql.includes('SELECT setting_value') && h.stored ? [h.stored] : [], rowCount: 0 };
  };
  const client: any = {
    query: vi.fn(async (text: unknown) => answer(text)),
    release: vi.fn(),
  };
  const pool: any = {
    query: vi.fn(async (text: unknown) => answer(text)),
    connect: vi.fn((callback?: (e: Error | null, c: unknown, r: unknown) => void) => {
      if (callback) {
        queueMicrotask(() => callback(null, client, client.release));
        return undefined;
      }
      return Promise.resolve(client);
    }),
    on: vi.fn(),
  };
  instrumentPool(pool);
  return pool;
}

let savedRls: string | undefined;
let savedDeployment: string | undefined;
beforeAll(() => {
  savedRls = process.env.RLS_ENFORCE;
  savedDeployment = process.env.MODULE_ENFORCEMENT;
});
afterAll(() => {
  if (savedRls === undefined) delete process.env.RLS_ENFORCE;
  else process.env.RLS_ENFORCE = savedRls;
  if (savedDeployment === undefined) delete process.env.MODULE_ENFORCEMENT;
  else process.env.MODULE_ENFORCEMENT = savedDeployment;
});

beforeEach(() => {
  process.env.RLS_ENFORCE = 'on';
  delete process.env.MODULE_ENFORCEMENT;
  h.pool = makeInstrumentedPool();
  h.stored = {
    setting_value: 'enforce',
    updated_at: new Date('2026-09-22T10:00:00.000Z'),
    updated_by: 1,
    reason: 'measured for a week',
  };
  invalidateEnforcementModeCache();
});

describe('the stored enforcement mode under RLS_ENFORCE=on', () => {
  it('is read, not replaced by a degraded fallback, when no request scope is active', async () => {
    const resolved = await refreshEnforcementMode();

    expect(resolved.degraded).toBe(false);
    expect(resolved.source).toBe('stored');
    expect(resolved.mode).toBe('enforce');
  });

  it('still reports nothing stored as the deployment value, undegraded', async () => {
    h.stored = null;

    const resolved = await refreshEnforcementMode();

    expect(resolved.degraded).toBe(false);
    expect(resolved.source).toBe('deployment');
  });
});
