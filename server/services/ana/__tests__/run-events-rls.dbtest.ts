/**
 * The live mirror and the process heartbeat with RLS enforcing, on a real
 * PostgreSQL server, as the runtime role (AnA detach DT1,
 * docs/design/ANA_DETACH_2026-10-08.md §8 DT1 test 8, and §2.8's race;
 * evidence docs/evidence/ANA-SUMMARY/2026-10-08/DT1-run-events/).
 *
 * Built by deploy-migrate (the CI-shaped database): public.ana_run_events with
 * the sweep's tenant policy, the doors on the reviewed definer allowlist, and
 * app_service holding the recipe's grants. The pool is instrumented as
 * production's is, with `app.rls_enforce=on` in the startup packet, so an
 * unscoped query is refused before it reaches the server and a wrongly scoped
 * one sees nothing.
 *
 *   8a. a flush armed inside tenant A's turn, fired from a timer that tenant
 *       B's request created, writes A's rows (red: without its explicit scope
 *       it writes zero rows and reports nothing);
 *   8b. the process heartbeat beats both tenants' runs, wherever it was armed;
 *   8c. the release door deletes in the run's own scope and refuses another's;
 *   §2.8 racing posts on separate connections: one run per conversation, at
 *       most three per person.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../../../../tests/setup.db';
import { instrumentPool } from '../../../db/poolInstrumentation';
import { runWithTenantScope } from '../../../db/tenantStore';
import { openRunEventsMirror, releaseSealedRunEvents } from '../run-events';
import {
  beginRun,
  beatOwnedRuns,
  runOwnerInstance,
  MAX_LIVE_RUNS_PER_PERSON,
  _resetLocalRunsForTest,
} from '../run-control';
import { TurnRecorder, writeTurnRecord } from '../turn-record';

const A = 92_801;
const B = 92_802;
const USER_A = 92_811;
const USER_B = 92_812;
const TAG = `dt1_${process.pid}_${Date.now().toString(36)}`;

const appUrl = process.env.APP_DATABASE_URL;
let owner: Pool;
let app: Pool;

const asRequest = <T>(org: number, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(org), role: null, source: 'request', caller: 'dbtest' }, fn);

const eventsOf = async (runId: string) =>
  (await owner.query(`SELECT seq FROM ana_run_events WHERE run_id = $1 ORDER BY seq`, [runId])).rows.map((r) => r.seq);

async function eventually(predicate: () => Promise<boolean>, withinMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < withinMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`condition not met within ${withinMs}ms`);
}

const task = (seq: number) => ({
  kind: 'task' as const,
  seq,
  at: new Date().toISOString(),
  round: 1,
  task: `t${seq}`,
  change: 'added' as const,
  title: `Task ${seq}`,
});

async function cleanup() {
  await owner.query(`ALTER TABLE ana_run_events DISABLE TRIGGER USER`);
  await owner.query(`DELETE FROM ana_run_events WHERE organization_id = ANY($1)`, [[A, B]]);
  await owner.query(`ALTER TABLE ana_run_events ENABLE TRIGGER USER`);
  for (const t of ['ana_turn_records', 'ana_record_blobs']) {
    await owner.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
    await owner.query(`DELETE FROM ${t} WHERE organization_id = ANY($1)`, [[A, B]]);
    await owner.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  }
  await owner.query(`DELETE FROM ana_runs WHERE organization_id = ANY($1)`, [[A, B]]);
}

beforeAll(async () => {
  expect(appUrl, 'APP_DATABASE_URL names the runtime role (CI sets it)').toBeTruthy();
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  // As production: enforcement in the startup packet, the pool instrumented.
  app = instrumentPool(
    new Pool({ connectionString: appUrl, max: 6, options: '-c app.rls_enforce=on' } as ConstructorParameters<typeof Pool>[0]),
  );
  for (const org of [A, B]) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $2) ON CONFLICT (id) DO NOTHING`,
      [org, `${TAG}-${org}`],
    );
  }
  for (const [id, org] of [[USER_A, A], [USER_B, B]]) {
    await owner.query(
      `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $2, 'x') ON CONFLICT (id) DO NOTHING`,
      [id, `${TAG}-${id}@example.invalid`],
    );
    void org;
  }
  await owner.query(
    `INSERT INTO chat_threads (id, user_id, organization_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
    [`${TAG}-thread`, USER_A, A],
  );
  await cleanup();
});

afterEach(async () => {
  _resetLocalRunsForTest();
  await cleanup();
});

afterAll(async () => {
  if (!owner) return;
  await cleanup();
  await owner.query(`DELETE FROM chat_threads WHERE id = $1`, [`${TAG}-thread`]);
  await app?.end();
  await owner.end();
});

describe('8. the mirror and the heartbeat under RLS, as the runtime role', () => {
  it("8a. a flush armed in tenant A's turn, fired from a timer tenant B's request created, writes A's rows", async () => {
    const { runId } = await asRequest(A, () =>
      beginRun({ pool: app, organizationId: A, userId: USER_A, surface: 'dbtest' }),
    );
    const mirror = openRunEventsMirror({ pool: app, runId, organizationId: A, ownerInstance: runOwnerInstance() });
    // The first event arms the flush timer, and it is armed inside tenant B's
    // request: the callback will run in B's context unless the flush opens A's.
    await asRequest(B, async () => {
      mirror.enqueue(task(1));
      mirror.enqueue(task(2));
    });
    await eventually(async () => (await eventsOf(runId)).length === 2, 3_000);
    expect(await eventsOf(runId)).toEqual([1, 2]);
    // Every row carries the run's organisation, copied from the run row.
    const { rows } = await owner.query(`SELECT DISTINCT organization_id FROM ana_run_events WHERE run_id = $1`, [runId]);
    expect(rows).toEqual([{ organization_id: A }]);
    await mirror.close();
  });

  it("8b. the process heartbeat beats both tenants' runs, though it was armed inside one tenant's request", async () => {
    const a = await asRequest(A, () => beginRun({ pool: app, organizationId: A, userId: USER_A, surface: 'dbtest' }));
    const b = await asRequest(B, () => beginRun({ pool: app, organizationId: B, userId: USER_B, surface: 'dbtest' }));
    await owner.query(`UPDATE ana_runs SET heartbeat_at = now() - interval '1 hour' WHERE id = ANY($1)`, [[a.runId, b.runId]]);
    const beat = await asRequest(A, () => beatOwnedRuns());
    expect(beat).toBe(2);
    const { rows } = await owner.query(
      `SELECT id, heartbeat_at > now() - interval '1 minute' AS fresh FROM ana_runs WHERE id = ANY($1) ORDER BY id`,
      [[a.runId, b.runId]],
    );
    expect(rows.every((r) => r.fresh)).toBe(true);
  });

  it("8c. the release door deletes in the run's own scope, and refuses from another tenant's", async () => {
    const { runId, handle } = await asRequest(A, () =>
      beginRun({ pool: app, organizationId: A, userId: USER_A, surface: 'dbtest' }),
    );
    handle.events!.enqueue(task(1));
    await handle.events!.close();
    const r = new TurnRecorder();
    r.setTurn({ organizationId: A, runId, actorUserId: USER_A, threadId: null });
    r.setRequest('q');
    r.setAnswer({ streamed: 'a', stored: 'a' });
    await writeTurnRecord(owner, r.seal('answered'));

    // From tenant B's scope, under RLS: refused by the door itself.
    await expect(
      asRequest(B, () => app.query('SELECT public.release_sealed_run_events($1, $2)', [A, runId])),
    ).rejects.toThrow(/RUN_EVENTS_RELEASE_REFUSED/);
    expect(await eventsOf(runId)).toEqual([1]);

    // A plain DELETE as the runtime role: refused.
    await expect(asRequest(A, () => app.query('DELETE FROM ana_run_events WHERE run_id = $1', [runId]))).rejects.toThrow();
    expect(await eventsOf(runId)).toEqual([1]);

    // The door, which opens the run's own scope: deleted.
    expect(await releaseSealedRunEvents(app, A, runId)).toBe(1);
    expect(await eventsOf(runId)).toEqual([]);
  });
});

describe('§2.8 racing posts, on separate connections', () => {
  it('two posts racing on one conversation open one run; the other is refused RUN_IN_PROGRESS', async () => {
    const thread = `${TAG}-thread`;
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        asRequest(A, () => beginRun({ pool: app, organizationId: A, userId: USER_A, threadId: thread, surface: 'dbtest' })),
      ),
    );
    const opened = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(opened).toHaveLength(1);
    expect(refused.map((r) => r.reason?.code)).toEqual(['RUN_IN_PROGRESS']);
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM ana_runs WHERE thread_id = $1`, [thread]);
    expect(rows[0].n).toBe(1);
  });

  it('racing posts by one person open at most three runs; the rest are refused RUN_LIMIT', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: MAX_LIVE_RUNS_PER_PERSON + 2 }, () =>
        asRequest(A, () => beginRun({ pool: app, organizationId: A, userId: USER_A, surface: 'dbtest' })),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(MAX_LIVE_RUNS_PER_PERSON);
    expect(
      results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason?.code),
    ).toEqual(['RUN_LIMIT', 'RUN_LIMIT']);
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM ana_runs WHERE organization_id = $1 AND user_id = $2`, [A, USER_A]);
    expect(rows[0].n).toBe(MAX_LIVE_RUNS_PER_PERSON);
  });
});
