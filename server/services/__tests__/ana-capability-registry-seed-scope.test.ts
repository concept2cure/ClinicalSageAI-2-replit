/**
 * seedCapabilityRegistry under RLS_ENFORCE=on — the only posture production
 * accepts (server/db/rlsEnforcement.ts).
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * startup/services.ts fires seedCapabilityRegistry() 3s after boot with no
 * tenant scope. Pool instrumentation (server/db/poolInstrumentation.ts) refuses
 * every non-infrastructure statement issued without a scope once RLS_ENFORCE=on,
 * so on every enforcing estate the seed threw
 *
 *   "[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope"
 *
 * the boot log said "seeding failed (non-blocking)", and ana_capability_registry
 * stayed EMPTY (verified: count(*) = 0 after boot). ana-context-router.ts reads
 * that table to route AnA turns to capabilities and slash commands, so AnA's
 * routing was silently degraded in production.
 *
 * ── The harness ───────────────────────────────────────────────────────────────
 * A REAL drizzle instance over a REAL instrumentPool() wrapping a mock pg.Pool —
 * the same level server/db/__tests__/poolInstrumentation-tenant-scope.test.ts
 * mocks at. Nothing between the seeder and the fail-closed gate is stubbed, so
 * the first case below fails on the unpatched seeder with the exact production
 * error, and passes only when the seeder declares a system scope the way
 * template-seeds.ts and FeatureToggleService.initializeFeatureToggle do.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

type Call = { text: string; params?: unknown };

/**
 * A mock pool with a tiny in-memory ana_capability_registry so the seeder's
 * three statement shapes get honest answers: INSERT ... ON CONFLICT DO NOTHING
 * RETURNING id (a row only for a NEW key), the governance backfill's SELECT +
 * UPDATE, and the final count(*). Rows come back in pg's `rowMode: 'array'`
 * form because drizzle asks for it whenever it maps selected fields.
 */
const harness = vi.hoisted(() => {
  const clientCalls: Call[] = [];
  const poolCalls: Call[] = [];
  const table = new Map<string, { id: number; key: string; category: string; name: string; description: string }>();
  let nextId = 1;

  function textOf(arg: unknown): string {
    return typeof arg === 'string' ? arg : ((arg as { text?: string })?.text ?? '');
  }

  function answer(text: string, params: unknown): { rows: unknown[]; rowCount: number } {
    const sql = text.trim().toLowerCase();
    const p = (Array.isArray(params) ? params : []) as unknown[];
    if (sql.startsWith('insert into "ana_capability_registry"')) {
      const key = String(p[0]);
      if (table.has(key)) return { rows: [], rowCount: 0 };
      const row = { id: nextId++, key, category: String(p[1]), name: String(p[2]), description: String(p[3]) };
      table.set(key, row);
      return { rows: [[row.id]], rowCount: 1 };
    }
    if (sql.startsWith('select count(*)::int')) {
      return { rows: [[table.size]], rowCount: 1 };
    }
    if (sql.startsWith('select "id", "capability_key"')) {
      const rows = [...table.values()].map(r => [r.id, r.key, r.category, r.name, r.description]);
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  }

  const client = {
    query: (text: unknown, params?: unknown) => {
      clientCalls.push({ text: textOf(text), params });
      return Promise.resolve(answer(textOf(text), params));
    },
    release: () => undefined,
  };
  const pool = {
    query: (text: unknown, params?: unknown) => {
      poolCalls.push({ text: textOf(text), params });
      return Promise.resolve(answer(textOf(text), params));
    },
    connect: () => Promise.resolve(client),
    on: () => undefined,
  };

  return {
    clientCalls,
    poolCalls,
    pool,
    reset() {
      clientCalls.length = 0;
      poolCalls.length = 0;
      table.clear();
      nextId = 1;
    },
    size: () => table.size,
  };
});

vi.mock('../../db', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { instrumentPool } = await import('../../db/poolInstrumentation');
  instrumentPool(harness.pool as never);
  return { db: drizzle(harness.pool as never), pool: harness.pool };
});

import { db } from '../../db';
import { anaCapabilityRegistry } from 'shared/schema/ana-intelligence';
import {
  SEED_CAPABILITIES,
  backfillCapabilityGovernance,
  seedCapabilityRegistry,
} from '../ana-capability-registry';

const SET_CONFIG_RE = /set_config\('app\.current_tenant_id'/;
const SYSTEM_SCOPE_PARAMS = ['0', '', 'app_super_admin'];

const priorEnforce = process.env.RLS_ENFORCE;
beforeEach(() => {
  harness.reset();
  process.env.RLS_ENFORCE = 'on';
});
afterEach(() => {
  if (priorEnforce === undefined) delete process.env.RLS_ENFORCE;
  else process.env.RLS_ENFORCE = priorEnforce;
});

/** Indexes into clientCalls of every statement whose text starts with `prefix`. */
function statementIndexes(prefix: string): number[] {
  return harness.clientCalls
    .map((c, i) => (c.text.trim().toLowerCase().startsWith(prefix) ? i : -1))
    .filter(i => i >= 0);
}

describe('seedCapabilityRegistry under RLS_ENFORCE=on', () => {
  it('control: the harness refuses an unscoped write, exactly as production does', async () => {
    // A gate that has only been seen to pass has not been tested. This pins
    // that the instrumented pool under this drizzle instance really does fail
    // closed with no scope — so a pass in the next case means the seeder
    // declared one, not that the gate was absent.
    // drizzle wraps the driver error ("Failed query: …") and carries the
    // instrumentation's refusal as `cause`; match either surface.
    const refusal = /requires an active tenant scope/;
    await expect(
      db.insert(anaCapabilityRegistry).values({
        capabilityKey: 'unscoped-probe',
        category: 'drafting',
        name: 'probe',
        description: 'probe',
      }),
    ).rejects.toSatisfy((e: unknown) => {
      const err = e as { message?: string; cause?: { message?: string } };
      return refusal.test(String(err?.message)) || refusal.test(String(err?.cause?.message));
    });
    expect(harness.size()).toBe(0);
  });

  it('THE DEFECT: called from startup with no ambient scope, the seed must still populate the registry', async () => {
    // Exactly how startup/services.ts invokes it: bare, from a setTimeout, in
    // no request and no job. Unpatched, this rejects with the FAIL-CLOSED error
    // and the table stays empty — the production boot in the incident.
    const result = await seedCapabilityRegistry();

    expect(result.seeded).toBe(SEED_CAPABILITIES.length);
    expect(result.total).toBe(SEED_CAPABILITIES.length);
    expect(harness.size()).toBe(SEED_CAPABILITIES.length);
  });

  it('runs every statement inside a SYSTEM-scoped micro-transaction, never on the bare pool', async () => {
    await seedCapabilityRegistry();

    // While enforcing, nothing may go out on pool.query directly.
    expect(harness.poolCalls).toHaveLength(0);

    // Every INSERT: BEGIN → set_config(tenant '0', org '', role app_super_admin) → INSERT → COMMIT.
    const inserts = statementIndexes('insert into "ana_capability_registry"');
    expect(inserts).toHaveLength(SEED_CAPABILITIES.length);
    for (const i of inserts) {
      expect(harness.clientCalls[i - 2].text).toBe('BEGIN');
      expect(harness.clientCalls[i - 1].text).toMatch(SET_CONFIG_RE);
      expect(harness.clientCalls[i - 1].params).toEqual(SYSTEM_SCOPE_PARAMS);
      expect(harness.clientCalls[i + 1].text).toBe('COMMIT');
    }

    // The governance backfill and the final count ride the same scope.
    const scoped = harness.clientCalls.filter(c => SET_CONFIG_RE.test(c.text));
    expect(scoped.length).toBeGreaterThan(SEED_CAPABILITIES.length);
    expect(scoped.every(c => JSON.stringify(c.params) === JSON.stringify(SYSTEM_SCOPE_PARAMS))).toBe(true);
    expect(statementIndexes('select count(*)::int')).toHaveLength(1);
  });

  it('is idempotent: a second boot seeds nothing new and keeps the total', async () => {
    await seedCapabilityRegistry();
    const second = await seedCapabilityRegistry();

    expect(second.seeded).toBe(0);
    expect(second.total).toBe(SEED_CAPABILITIES.length);
  });

  it('backfillCapabilityGovernance declares its own scope when called on its own', async () => {
    await seedCapabilityRegistry();
    harness.clientCalls.length = 0;

    const { updated } = await backfillCapabilityGovernance();

    expect(updated).toBe(SEED_CAPABILITIES.length);
    const updates = statementIndexes('update "ana_capability_registry"');
    expect(updates).toHaveLength(SEED_CAPABILITIES.length);
    for (const i of updates) {
      expect(harness.clientCalls[i - 1].params).toEqual(SYSTEM_SCOPE_PARAMS);
    }
  });
});
