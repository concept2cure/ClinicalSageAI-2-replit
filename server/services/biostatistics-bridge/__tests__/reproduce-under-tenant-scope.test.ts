/**
 * The reproduce read runs under the request's tenant scope (R1, 2026-11-06).
 *
 * Found by reaching GET /api/biostat-bridge/computation-runs/:runId/reproduce from the protocol's Statistics tab. In
 * the running app, with RLS enforced, the design card named stored run #1 and the reproduction of run #1 answered 404.
 * `reproduceSizingRun` took a client with `pool.connect()` and queried it outside a transaction. The pool's scope
 * layer (poolInstrumentation.ts wrapClientForScope) writes the tenant's settings onto such a client only after a
 * BEGIN, so the read ran with no tenant. The policy on public.stats_computation_runs then hid the organization's own
 * row, and the route said "not found". Its route test mocks the service, and nothing else called it, so it was never
 * seen.
 *
 * This drives the real scope layer over a fake connection that records each statement. The reproduce SELECT must run
 * on a connection where the tenant's settings were written first.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ statements: [] as Array<{ conn: number; text: string; params?: unknown[] }>, pool: null as any }));

vi.mock('../../../db', () => ({ get pool() { return holder.pool; }, db: {} }));

import { instrumentPool } from '../../../db/poolInstrumentation';
import { runWithTenantScope } from '../../../db/tenantStore';
import { reproduceSizingRun } from '../bridge-service';

/** A pg.Pool-shaped fake: each checkout is a numbered connection that records its statements and answers no rows. */
function recordingPool() {
  let next = 0;
  const checkout = () => {
    const conn = ++next;
    return {
      query: async (text: unknown, params?: unknown[]) => {
        holder.statements.push({ conn, text: typeof text === 'string' ? text : String((text as { text?: string })?.text ?? ''), params });
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    };
  };
  return { connect: async () => checkout(), query: async () => ({ rows: [], rowCount: 0 }) } as any;
}

const priorEnforce = process.env.RLS_ENFORCE;
afterEach(() => {
  holder.statements = [];
  if (priorEnforce === undefined) delete process.env.RLS_ENFORCE;
  else process.env.RLS_ENFORCE = priorEnforce;
});

describe('reproducing a stored run, with RLS enforced', () => {
  it('reads the run on a connection that carries the organization’s tenant settings', async () => {
    process.env.RLS_ENFORCE = 'on';
    holder.pool = recordingPool();
    instrumentPool(holder.pool);

    await runWithTenantScope({ tenantId: '2', role: 'editor', source: 'request', caller: 'reproduce-test' }, () => reproduceSizingRun(2, 1));

    const select = holder.statements.find((s) => /FROM public\.stats_computation_runs/.test(s.text));
    expect(select, 'the reproduce read was not issued').toBeTruthy();
    const before = holder.statements.slice(0, holder.statements.indexOf(select!)).filter((s) => s.conn === select!.conn);
    const scoped = before.find((s) => /set_config\('app\.current_tenant_id'/.test(s.text));
    expect(scoped, 'the read ran on a connection with no tenant: RLS hides the organization’s own run').toBeTruthy();
    expect(scoped!.params?.[0]).toBe('2');
  });
});
