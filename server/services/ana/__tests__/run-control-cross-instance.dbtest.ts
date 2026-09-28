/**
 * Run control across two server instances, on a real PostgreSQL server.
 *
 * ── What this closes ─────────────────────────────────────────────────────────
 * run-control.ts shipped with its cross-instance path unexercised: PGlite is one
 * in-process database and cannot host two servers, so the LISTEN client, the
 * NOTIFY handler and the poll fallback had only ever been reasoned about. This
 * suite runs them. Control is ACCEPTED on instance B and must STOP the work on
 * instance A, which holds the only AbortController for the run.
 *
 * ── Two instances in one test process ────────────────────────────────────────
 * Each "instance" is a separate module graph (vi.resetModules between imports):
 * its own run-control copy with its own localRuns map and INSTANCE_ID, its own
 * tenantStore AsyncLocalStorage, and its own pool instrumented by its own copy
 * of poolInstrumentation. Nothing is shared between them but the database, which
 * is what two processes share.
 *
 * ── As production runs it ────────────────────────────────────────────────────
 * Both pools connect as the NON-SUPERUSER runtime role minted by the real
 * provisioning script, with `app.rls_enforce=on` in the startup packet and the
 * table under RLS + FORCE + the canonical tenant policy. RLS_ENFORCE=on in the
 * process (tests/setup.db.ts), so an unscoped query is rejected by the pool
 * instrumentation before it reaches the server. That matters here more than
 * anywhere: the LISTEN handler and the poller run with no request scope, and the
 * module's claim is that each opens the system scope itself. If one did not, the
 * refresh would be refused, the error logged, and the cancel would silently
 * never land — which is exactly what the first case below catches.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { databaseUrl } from '../../../../tests/setup.db';
import { createScratchSchema, tenantIsolationPolicySql, type ScratchSchema } from '../../../../tests/db/harness';

const MIGRATION = path.join(__dirname, '../../../../db/migrations/20260917_ana_runs.sql');
const ORG = 4101;
const OTHER_ORG = 4102;
const USER = 7101;

type RunControl = typeof import('../run-control.js');
type TenantStore = typeof import('../../../db/tenantStore.js');

interface Instance {
  rc: RunControl;
  tenant: TenantStore;
  pool: Pool;
  /** Run `fn` inside a request-shaped tenant scope for `org`, as the route does. */
  asRequest<T>(org: number, fn: () => Promise<T>): Promise<T>;
}

let scratch: ScratchSchema;
let runtimeUrl: string;
const instances: Instance[] = [];

async function bootInstance(): Promise<Instance> {
  vi.resetModules();
  const { instrumentPool } = await import('../../../db/poolInstrumentation.js');
  const tenant = await import('../../../db/tenantStore.js');
  const rc = await import('../run-control.js');
  // `options` is a libpq startup parameter pg passes through but does not type.
  const config = {
    connectionString: runtimeUrl,
    max: 4,
    // As production: enforcement in the startup packet, not a SET a pooled
    // connection could lose.
    options: `-c search_path=${scratch.schema} -c app.rls_enforce=on`,
  } as ConstructorParameters<typeof Pool>[0];
  const pool = instrumentPool(new Pool(config));
  const inst: Instance = {
    rc,
    tenant,
    pool,
    asRequest: (org, fn) =>
      tenant.runWithTenantScope(
        { tenantId: String(org), role: null, source: 'request', caller: 'dbtest' },
        fn,
      ),
  };
  instances.push(inst);
  return inst;
}

/** Resolve once `predicate` holds, or reject after `withinMs`. */
async function eventually(predicate: () => boolean, withinMs: number): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < withinMs) {
    if (predicate()) return Date.now() - started;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error(`condition not met within ${withinMs}ms`);
}

beforeAll(async () => {
  scratch = await createScratchSchema(databaseUrl);
  const { ownerPool, schema } = scratch;
  // The migration's foreign keys name organizations(id) and users(id); stand-ins
  // in the scratch schema let the REAL migration file run unmodified.
  await ownerPool.query(`CREATE TABLE ${schema}.organizations (id integer PRIMARY KEY)`);
  await ownerPool.query(`CREATE TABLE ${schema}.users (id integer PRIMARY KEY)`);
  await ownerPool.query(`INSERT INTO ${schema}.organizations VALUES (${ORG}), (${OTHER_ORG})`);
  await ownerPool.query(`INSERT INTO ${schema}.users VALUES (${USER})`);

  const client = await ownerPool.connect();
  try {
    await client.query(`SET search_path = ${schema}`);
    await client.query(fs.readFileSync(MIGRATION, 'utf8'));
  } finally {
    await client.query('RESET search_path');
    client.release();
  }
  // What the isolation sweep that closes C2C_MIGRATION_FILES gives the table.
  await ownerPool.query(`ALTER TABLE ${schema}.ana_runs ENABLE ROW LEVEL SECURITY`);
  await ownerPool.query(`ALTER TABLE ${schema}.ana_runs FORCE ROW LEVEL SECURITY`);
  await ownerPool.query(tenantIsolationPolicySql(`${schema}.ana_runs`));

  const runtimePool = await scratch.connectAsRuntimeRole();
  runtimeUrl = String((runtimePool as any).options.connectionString);
});

afterEach(async () => {
  for (const inst of instances.splice(0)) {
    inst.rc._resetLocalRunsForTest();
    await inst.pool.end().catch(() => {});
  }
});

afterAll(async () => {
  await scratch?.destroy();
});

describe('run control across two instances: delivery (real PostgreSQL, RLS enforcing)', () => {
  it('a stop accepted on instance B aborts the run on instance A, by NOTIFY', async () => {
    const a = await bootInstance();
    const b = await bootInstance();

    const { runId, handle } = await a.asRequest(ORG, () =>
      a.rc.beginRun({ pool: a.pool, organizationId: ORG, userId: USER, surface: 'dbtest' }),
    );
    // beginRun arms the listener without awaiting it; let the LISTEN land.
    await a.rc.startRunControlListener(a.pool);
    await new Promise(r => setTimeout(r, 100));
    expect(handle.cancelSignal.aborted).toBe(false);

    const result = await b.asRequest(ORG, () =>
      b.rc.applyControl({ pool: b.pool, runId, organizationId: ORG, userId: USER, action: 'cancel' }),
    );
    expect(result).toMatchObject({ ok: true, status: 'cancelled' });

    // Well under POLL_FALLBACK_MS: the poller is not armed while the listener is
    // healthy, so only the notification can have delivered this.
    const elapsed = await eventually(() => handle.cancelSignal.aborted, 1_000);
    expect(elapsed).toBeLessThan(a.rc.POLL_FALLBACK_MS);
  });

  it('a listener on a connection another tenant opened still delivers this tenant\'s stop', async () => {
    // A notification callback runs in the async context its SOCKET was created
    // in, not the one LISTEN was issued from. In production the pool hands the
    // listener an idle connection some earlier request opened, so without its
    // own system scope the handler would read as that request's tenant, RLS
    // would hide every other tenant's run, and the stop would never land.
    const a = await bootInstance();
    const b = await bootInstance();
    await a.asRequest(OTHER_ORG, () => a.pool.query('SELECT count(*) FROM ana_runs'));
    expect(a.pool.idleCount).toBe(1); // born in OTHER_ORG's context, now idle

    const { runId, handle } = await a.asRequest(ORG, () =>
      a.rc.beginRun({ pool: a.pool, organizationId: ORG, userId: USER, surface: 'dbtest' }),
    );
    await eventually(() => a.pool.totalCount - a.pool.idleCount === 1, 2_000);
    expect(a.pool.totalCount).toBe(1); // the listener IS that recycled connection

    await b.asRequest(ORG, () =>
      b.rc.applyControl({ pool: b.pool, runId, organizationId: ORG, userId: USER, action: 'cancel' }),
    );
    await eventually(() => handle.cancelSignal.aborted, 1_000);
  });

  it('a pause wait on A is woken by a resume accepted on B, not by its timeout', async () => {
    const a = await bootInstance();
    const b = await bootInstance();
    const { runId, handle } = await a.asRequest(ORG, () =>
      a.rc.beginRun({ pool: a.pool, organizationId: ORG, userId: USER, surface: 'dbtest' }),
    );
    await a.rc.startRunControlListener(a.pool);
    await new Promise(r => setTimeout(r, 100));

    await b.asRequest(ORG, () =>
      b.rc.applyControl({ pool: b.pool, runId, organizationId: ORG, userId: USER, action: 'pause' }),
    );
    // Let the pause's own notification drain before A starts waiting.
    await new Promise(r => setTimeout(r, 100));

    const started = Date.now();
    const woke = handle.wake(30_000);
    await b.asRequest(ORG, () =>
      b.rc.applyControl({ pool: b.pool, runId, organizationId: ORG, userId: USER, action: 'resume' }),
    );
    await woke;
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(await a.asRequest(ORG, () => a.rc.readStatus(a.pool, runId))).toBe('running');
    expect(handle.cancelSignal.aborted).toBe(false);
  });

  it('a steer accepted on B is drained exactly once on A', async () => {
    const a = await bootInstance();
    const b = await bootInstance();
    const { runId } = await a.asRequest(ORG, () =>
      a.rc.beginRun({ pool: a.pool, organizationId: ORG, userId: USER, surface: 'dbtest' }),
    );
    await b.asRequest(ORG, () =>
      b.rc.applyControl({
        pool: b.pool,
        runId,
        organizationId: ORG,
        userId: USER,
        action: 'interject',
        message: 'Use the 2024 guidance, not the 2019 draft.',
      }),
    );
    const [first, second] = await Promise.all([
      a.asRequest(ORG, () => a.rc.consumeInterjections(a.pool, runId)),
      a.asRequest(ORG, () => a.rc.consumeInterjections(a.pool, runId)),
    ]);
    expect([...first, ...second]).toEqual(['Use the 2024 guidance, not the 2019 draft.']);
  });

});

describe('run control across two instances: refusal and fallback', () => {
  it('control from another organization is refused on B and never reaches A', async () => {
    const a = await bootInstance();
    const b = await bootInstance();
    const { runId, handle } = await a.asRequest(ORG, () =>
      a.rc.beginRun({ pool: a.pool, organizationId: ORG, userId: USER, surface: 'dbtest' }),
    );
    await a.rc.startRunControlListener(a.pool);

    const result = await b.asRequest(OTHER_ORG, () =>
      b.rc.applyControl({ pool: b.pool, runId, organizationId: OTHER_ORG, userId: USER, action: 'cancel' }),
    );
    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    await new Promise(r => setTimeout(r, 300));
    expect(handle.cancelSignal.aborted).toBe(false);
  });

  it('with no LISTEN client, the declared poll fallback still delivers the stop', async () => {
    const a = await bootInstance();
    const b = await bootInstance();
    // The listener's dedicated connection cannot be opened. Every other query
    // uses pool.query, which does not go through this patched connect.
    const realConnect = a.pool.connect.bind(a.pool);
    let refused = false;
    (a.pool as any).connect = (...args: any[]) => {
      if (!refused) {
        refused = true;
        return Promise.reject(new Error('dbtest: listener connection refused'));
      }
      return (realConnect as any)(...args);
    };

    const { runId, handle } = await a.asRequest(ORG, () =>
      a.rc.beginRun({ pool: a.pool, organizationId: ORG, userId: USER, surface: 'dbtest' }),
    );
    await a.rc.startRunControlListener(a.pool);
    expect(refused).toBe(true);

    await b.asRequest(ORG, () =>
      b.rc.applyControl({ pool: b.pool, runId, organizationId: ORG, userId: USER, action: 'cancel' }),
    );
    await eventually(() => handle.cancelSignal.aborted, a.rc.POLL_FALLBACK_MS * 2 + 500);
  });

});

describe('run control lifecycle: shutdown and the reaper', () => {
  it('shutdown returns the LISTEN connection, so closing the pool completes', async () => {
    const a = await bootInstance();
    await a.asRequest(ORG, () =>
      a.rc.beginRun({ pool: a.pool, organizationId: ORG, userId: USER, surface: 'dbtest' }),
    );
    // beginRun arms the listener without awaiting it; wait for its connection.
    await eventually(() => a.pool.totalCount - a.pool.idleCount === 1, 2_000);

    // What gracefulShutdown does: stop delivery, then end the pool. Without the
    // stop, pool.end() waits on the listener forever and the process never
    // reaches exit — found by this suite's own teardown hanging.
    a.rc.stopRunControlListener();
    const ended = a.pool.end().then(() => 'ended');
    const outcome = await Promise.race([
      ended,
      new Promise(r => setTimeout(() => r('still waiting'), 2_000)),
    ]);
    expect(outcome).toBe('ended');
  });

  it('the reaper fails a run whose instance stopped heartbeating, across tenants', async () => {
    const a = await bootInstance();
    const { runId: mine } = await a.asRequest(ORG, () =>
      a.rc.beginRun({ pool: a.pool, organizationId: ORG, userId: USER, surface: 'dbtest' }),
    );
    const { runId: theirs } = await a.asRequest(OTHER_ORG, () =>
      a.rc.beginRun({ pool: a.pool, organizationId: OTHER_ORG, userId: null, surface: 'dbtest' }),
    );
    await scratch.ownerPool.query(
      `UPDATE ${scratch.schema}.ana_runs SET heartbeat_at = now() - interval '1 hour' WHERE id = ANY($1)`,
      [[mine, theirs]],
    );
    // Called from inside ORG's request, as the route does opportunistically. The
    // sweep must still reach OTHER_ORG's run — a request-scoped sweep would
    // silently reap only its own tenant and report a reassuring small number.
    const reaped = await a.asRequest(ORG, () => a.rc.reapOrphanedRuns(a.pool));
    expect(reaped).toBe(2);
    const { rows } = await scratch.ownerPool.query(
      `SELECT status, stopped_reason FROM ${scratch.schema}.ana_runs WHERE id = ANY($1)`,
      [[mine, theirs]],
    );
    expect(rows).toEqual([
      { status: 'failed', stopped_reason: 'orphaned' },
      { status: 'failed', stopped_reason: 'orphaned' },
    ]);
  });
});
