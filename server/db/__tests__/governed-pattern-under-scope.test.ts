/**
 * The governed() routers need no per-file edit — proven at the instrumentation
 * layer.
 *
 * The RLS route-layer audit flagged ~20 "GOV" routers whose shared helper does:
 *
 *     const client = await pool.connect();   // (A)
 *     await client.query('BEGIN');
 *     await setTenantContextTx(client, orgId); // set_config(..., true)
 *     ...work...
 *     await client.query('COMMIT');
 *
 * Under RLS_ENFORCE=on the instrumented pool fails closed at (A) when NO tenant
 * scope is active — which is why these routers 500 today. The systemic fix's
 * only job for them is to open a scope upstream; once one is active, (A)
 * succeeds and returns a scope-wrapped client, so the whole governed() sequence
 * runs unchanged. This test pins exactly that, so the design's claim ("no
 * per-file governed() edit is required") is verifiable rather than asserted.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { instrumentPool } from '../poolInstrumentation';
import { runWithTenantScope } from '../tenantStore';

// Minimal pg.Pool-shaped fake whose checked-out client answers every query.
function makeFakePool() {
  const client = {
    query: async (_sql?: unknown, _params?: unknown) => ({ rows: [], rowCount: 0 }),
    release: (_err?: unknown) => undefined,
  };
  return {
    connect: async () => client,
    query: async () => ({ rows: [], rowCount: 0 }),
  } as any;
}

const priorEnforce = process.env.RLS_ENFORCE;
afterEach(() => {
  if (priorEnforce === undefined) delete process.env.RLS_ENFORCE;
  else process.env.RLS_ENFORCE = priorEnforce;
});

describe('governed() pattern vs RLS fail-closed', () => {
  it('pool.connect() fails closed with no active scope (the current 500)', async () => {
    process.env.RLS_ENFORCE = 'on';
    const pool = makeFakePool();
    instrumentPool(pool);

    await expect(pool.connect()).rejects.toThrow(/FAIL-CLOSED/);
  });

  it('runs the full connect→BEGIN→set_config→COMMIT sequence once a scope is open', async () => {
    process.env.RLS_ENFORCE = 'on';
    const pool = makeFakePool();
    instrumentPool(pool);

    await runWithTenantScope(
      { tenantId: '42', role: 'editor', source: 'request', caller: 'governed-test' },
      async () => {
        // Exactly what the governed() helper does — unchanged by the fix.
        const client = await pool.connect();
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", ['42']);
        const result = await client.query('INSERT INTO protocol_documents (org_id) VALUES ($1)', ['42']);
        await client.query('COMMIT');
        client.release();
        expect(result).toBeTruthy();
      },
    );
  });
});
