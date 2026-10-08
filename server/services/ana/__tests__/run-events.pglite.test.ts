/**
 * The live mirror of a turn's timeline on a real Postgres engine (PGlite):
 * the shipped migrations, the mirror, the guard, the doors and the process
 * heartbeat together (AnA detach DT1, docs/design/ANA_DETACH_2026-10-08.md §8
 * DT1, tests 1–5 and 7; evidence docs/evidence/ANA-SUMMARY/2026-10-08/DT1-run-events/).
 *
 *   1. mirror = record: the rows equal the sealed record's timeline (notes
 *      resolved) until the release, and none remain after it;
 *   2. the guard: UPDATE and TRUNCATE refused; INSERT refused once a record
 *      exists; a plain DELETE as app_service refused in every state; each door
 *      deletes only under its own preconditions and refuses under a legal hold;
 *   3. flush before seal: the last events reach the mirror before the record
 *      is inserted; a failing close marks the gap and the record still seals;
 *   4. owner only: a batch, or a heartbeat, from another owner_instance
 *      changes zero rows;
 *   5. the cap: 2,050 events give rows 1–1,999 and the marker at 2,000; a row
 *      at 2,001 is refused; the record holds all 2,050;
 *   7. the heartbeat without a socket: heartbeat_at advances 15 s later with
 *      no request in sight (fake interval).
 *
 * Test 8 (the flush's tenant scope with RLS on) needs the runtime role and a
 * real server: run-events-rls.dbtest.ts. Tests 6, 9 and 10 read through the
 * route: routes/ana-ri/__tests__/runs-read.pglite.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { TurnRecorder, writeTurnRecordSafely } from '../turn-record';
import { TurnTimeline } from '../turn-timeline-emitter';
import {
  openRunEventsMirror,
  releaseSealedRunEvents,
  expireOrphanedRunEvents,
  sealAfterMirror,
} from '../run-events';
import {
  beginRun,
  beatOwnedRuns,
  endRun,
  runOwnerInstance,
  _resetLocalRunsForTest,
  RUN_HEARTBEAT_MS,
} from '../run-control';
import { resolveTimeline } from '@shared/ana/turn-timeline';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const sql = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ANA_RUNS = sql('db/migrations/20260917_ana_runs.sql');
const CHAIN_SEQ = sql('migrations/20260921_audit_logs_chain_seq.sql');
const TURN_RECORDS = sql('migrations/20260926_ana_turn_records.sql');
const RUN_EVENTS = sql('migrations/20261008f_ana_run_events.sql');

const ORG = 1;
const OTHER_ORG = 2;
const USER = 10;

let db: PGlite;
/** Statements to fail on, for the failure paths. */
let failOn: RegExp | null = null;
/** Every statement the adapter ran, in order. */
let log: string[] = [];

async function run(text: string, params?: unknown[]) {
  log.push(text);
  if (failOn && failOn.test(text)) throw new Error('simulated failure');
  const r = await db.query(text, params as any[]);
  return { rows: r.rows as any[], rowCount: (r as any).affectedRows ?? r.rows.length };
}

/**
 * pg.Pool-shaped over the one PGlite session. `connect` hands back the same
 * session (beginRun's transaction, writeTurnRecord's); the run-control
 * listener's `on` is refused, so it takes its declared poll fallback.
 */
function pool(): any {
  return {
    query: run,
    connect: async () => ({
      query: run,
      release: () => undefined,
      on: () => {
        throw new Error('PGlite has no notifications');
      },
    }),
  };
}

const asOwner = async <T>(fn: () => Promise<T>) => fn();
/** Run `fn` as app_service, the runtime role, then back to the superuser. */
async function asAppService<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec('SET ROLE app_service');
  try {
    return await fn();
  } finally {
    await db.exec('RESET ROLE');
  }
}

const rowsOf = async (runId: string) =>
  (await db.query<{ seq: number; event: any }>(`SELECT seq, event FROM ana_run_events WHERE run_id = $1 ORDER BY seq`, [runId])).rows;

async function openRun(userId: number | null = USER, org = ORG) {
  return beginRun({ pool: pool(), organizationId: org, userId, surface: 'ana-ri-stream', runPolicy: 'manual' });
}

function recorderFor(runId: string, org = ORG) {
  const r = new TurnRecorder();
  r.setTurn({ organizationId: org, runId, actorUserId: USER, threadId: null });
  r.setRequest('find the stability reports');
  r.setAnswer({ streamed: 'The shelf life is 24 months.', stored: 'The shelf life is 24 months.' });
  return r;
}

/** One turn's worth of events through the one producer: a note, steps, a plan, the end. */
function emitTurn(timeline: TurnTimeline) {
  const search = { id: 'tu_s', name: 'search_project_documents', input: { query: 'shelf life' } };
  timeline.noteFrom('I will look in the Vault first.');
  timeline.announced(1, search, { label: 'Searching the Vault', source: 'vault', preview: null });
  timeline.planned(1, [
    { title: 'Find the reports', status: 'in_progress' },
    { title: 'Read them', status: 'pending' },
  ]);
  timeline.finished(1, search, {
    label: 'Searched the Vault',
    source: 'vault',
    preview: null,
    status: 'success',
    heldBack: false,
    ms: 12,
    startedAt: Date.now(),
  });
  timeline.planned(2, [
    { title: 'Find the reports', status: 'completed' },
    { title: 'Read them', status: 'completed' },
  ]);
  timeline.end('answered', null);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE app_service NOLOGIN;
    CREATE TABLE organizations (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE chat_threads (id text PRIMARY KEY, user_id integer, organization_id integer, title text);
    CREATE SCHEMA vault;
    CREATE TABLE vault.legal_holds (id serial PRIMARY KEY, organization_id integer, lifted_at timestamptz);
    INSERT INTO organizations (id) VALUES (${ORG}), (${OTHER_ORG});
    INSERT INTO users (id) VALUES (${USER});
  `);
  await db.exec(AUDIT_LOGS_PGLITE_DDL);
  await db.exec(CHAIN_SEQ);
  await db.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;`);
  await db.exec(ANA_RUNS);
  await db.exec(TURN_RECORDS);
  await db.exec(RUN_EVENTS);
  // RULE 1: the whole set replays on every deploy.
  await db.exec(ANA_RUNS);
  await db.exec(RUN_EVENTS);
  // What the runtime role holds on these tables in a provisioned database.
  await db.exec(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ana_runs, ana_run_events TO app_service;
    GRANT SELECT, INSERT ON ana_turn_records, ana_record_blobs TO app_service;
  `);
});

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  _resetLocalRunsForTest();
  failOn = null;
  log = [];
  await db.exec(`
    ALTER TABLE ana_run_events DISABLE TRIGGER USER;
    DELETE FROM ana_run_events;
    ALTER TABLE ana_run_events ENABLE TRIGGER USER;
    ALTER TABLE ana_turn_records DISABLE TRIGGER USER;
    ALTER TABLE ana_record_blobs DISABLE TRIGGER USER;
    DELETE FROM ana_turn_records; DELETE FROM ana_record_blobs;
    ALTER TABLE ana_turn_records ENABLE TRIGGER USER;
    ALTER TABLE ana_record_blobs ENABLE TRIGGER USER;
    DELETE FROM ana_runs;
    DELETE FROM vault.legal_holds;
    UPDATE organizations SET status = 'active';
  `);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the shipped migration', () => {
  it('adds the six ana_runs columns, and the table, idempotently', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'ana_runs'
        AND column_name IN ('timeline_seq','user_message_id','run_policy','hold','last_watched_at','released_at')`,
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual(
      ['hold', 'last_watched_at', 'released_at', 'run_policy', 'timeline_seq', 'user_message_id'],
    );
    expect((await db.query(`SELECT to_regclass('public.ana_run_events') AS t`)).rows[0]).toEqual({ t: 'ana_run_events' });
  });
});

describe('1. the mirror equals the record, until the release', () => {
  it('rows equal the sealed timeline with notes resolved; none remain after the release', async () => {
    const { runId, handle } = await openRun();
    const recorder = recorderFor(runId);
    const timeline = new TurnTimeline({ write: () => undefined, recorder: () => recorder, mirror: () => handle.events });
    emitTurn(timeline);

    let mirroredBeforeRelease: any[] = [];
    const status = await sealAfterMirror(handle.events, async () => {
      // Between the flush and the release: what a second device reads.
      mirroredBeforeRelease = (await rowsOf(runId)).map((r) => r.event);
      return writeTurnRecordSafely(pool(), recorder, 'answered');
    });
    expect(status.status).toBe('recorded');

    const sealed = recorder.seal('answered');
    const recordTimeline = resolveTimeline(sealed.body.timeline ?? [], sealed.blobs);
    expect(recordTimeline.length).toBeGreaterThan(5);
    expect(mirroredBeforeRelease).toEqual(recordTimeline);

    expect(await rowsOf(runId)).toEqual([]);
    const { rows } = await db.query<{ released_at: Date | null; timeline_seq: number; run_policy: string }>(
      `SELECT released_at, timeline_seq, run_policy FROM ana_runs WHERE id = $1`,
      [runId],
    );
    expect(rows[0].released_at).not.toBeNull();
    expect(rows[0].timeline_seq).toBe(recordTimeline.length);
    expect(rows[0].run_policy).toBe('manual');
  });

  it('a turn that could not be recorded keeps its rows, and still says it was released', async () => {
    const { runId, handle } = await openRun();
    const timeline = new TurnTimeline({ write: () => undefined, recorder: () => null, mirror: () => handle.events });
    emitTurn(timeline);
    const status = await sealAfterMirror(handle.events, async () => ({ status: 'not_recorded' as const, reason: 'x' }));
    expect(status.status).toBe('not_recorded');
    expect((await rowsOf(runId)).length).toBeGreaterThan(5);
    const { rows } = await db.query<{ released_at: Date | null }>(`SELECT released_at FROM ana_runs WHERE id = $1`, [runId]);
    expect(rows[0].released_at).not.toBeNull();
  });
});

/** A run with two mirrored rows. */
async function runWithRows(org = ORG) {
  const { runId, handle } = await openRun(USER, org);
  handle.events!.enqueue({ kind: 'task', seq: 1, at: new Date().toISOString(), round: 1, task: 't1', change: 'added', title: 'A' });
  handle.events!.enqueue({ kind: 'task', seq: 2, at: new Date().toISOString(), round: 1, task: 't1', change: 'started', title: 'A' });
  await handle.events!.close();
  expect((await rowsOf(runId)).length).toBe(2);
  return { runId, handle };
}
const seal = async (runId: string, org = ORG) =>
  expect((await writeTurnRecordSafely(pool(), recorderFor(runId, org), 'answered')).status).toBe('recorded');

describe('2. the guard', () => {

  it('refuses UPDATE and TRUNCATE, for the owner too', async () => {
    const { runId } = await runWithRows();
    await expect(db.query(`UPDATE ana_run_events SET at = now() WHERE run_id = $1`, [runId])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await expect(db.exec(`TRUNCATE ana_run_events`)).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('refuses an INSERT once the run has a sealed record', async () => {
    const { runId } = await runWithRows();
    await seal(runId);
    await expect(
      db.query(
        `INSERT INTO ana_run_events (organization_id, run_id, seq, at, event) VALUES ($1, $2, 3, now(), '{}'::jsonb)`,
        [ORG, runId],
      ),
    ).rejects.toThrow(/RUN_EVENTS_SEALED/);
  });

  it('refuses a plain DELETE as app_service in every state: live, sealed, terminal without a record', async () => {
    const live = await runWithRows();
    const sealed = await runWithRows();
    await seal(sealed.runId);
    const orphan = await runWithRows();
    await endRun(pool(), orphan.runId, 'failed', 'orphaned');
    for (const runId of [live.runId, sealed.runId, orphan.runId]) {
      await expect(asAppService(() => db.query(`DELETE FROM ana_run_events WHERE run_id = $1`, [runId]))).rejects.toThrow(
        /IMMUTABILITY_VIOLATION/,
      );
      // And as the owner.
      await expect(asOwner(() => db.query(`DELETE FROM ana_run_events WHERE run_id = $1`, [runId]))).rejects.toThrow(
        /IMMUTABILITY_VIOLATION/,
      );
    }
  });

});

describe('2. the doors', () => {
  it('release: only a sealed run, only that run, and never under a legal hold', async () => {
    const a = await runWithRows();
    const b = await runWithRows();
    // No record: refused, rows kept.
    expect(await releaseSealedRunEvents(pool(), ORG, a.runId)).toBeNull();
    expect((await rowsOf(a.runId)).length).toBe(2);
    await seal(a.runId);
    // A legal hold: refused, rows kept.
    await db.exec(`INSERT INTO vault.legal_holds (organization_id) VALUES (${ORG})`);
    expect(await releaseSealedRunEvents(pool(), ORG, a.runId)).toBeNull();
    expect((await rowsOf(a.runId)).length).toBe(2);
    await db.exec(`UPDATE vault.legal_holds SET lifted_at = now()`);
    // Sealed, no hold, called by app_service: that run's rows only.
    expect(await asAppService(() => releaseSealedRunEvents(pool(), ORG, a.runId))).toBe(2);
    expect(await rowsOf(a.runId)).toEqual([]);
    expect((await rowsOf(b.runId)).length).toBe(2);
    // Under RLS, from another organisation's scope: refused.
    await seal(b.runId);
    await db.exec(`SET app.rls_enforce = 'on'; SET app.current_tenant_id = '${OTHER_ORG}'`);
    try {
      await expect(db.query('SELECT public.release_sealed_run_events($1, $2)', [ORG, b.runId])).rejects.toThrow(
        /RUN_EVENTS_RELEASE_REFUSED/,
      );
    } finally {
      await db.exec(`RESET app.rls_enforce; RESET app.current_tenant_id`);
    }
    expect((await rowsOf(b.runId)).length).toBe(2);
  });

  it('expiry: only a terminal run with no record, only past retention, never under a legal hold', async () => {
    const live = await runWithRows();
    const sealedRun = await runWithRows();
    await endRun(pool(), sealedRun.runId, 'finished', 'no_more_tools');
    await seal(sealedRun.runId);
    const orphan = await runWithRows();
    await endRun(pool(), orphan.runId, 'failed', 'orphaned');
    const young = await runWithRows();
    await endRun(pool(), young.runId, 'failed', 'orphaned');
    // Age every row but the young run's past the retention period. The table
    // refuses UPDATE, so the test steps around its own guard.
    await db.exec(`ALTER TABLE ana_run_events DISABLE TRIGGER USER;
      UPDATE ana_run_events SET written_at = now() - interval '120 days' WHERE run_id <> '${young.runId}';
      ALTER TABLE ana_run_events ENABLE TRIGGER USER;`);

    // Younger than retention: refused.
    await expect(db.query(`SELECT public.expire_orphaned_run_events($1, now() - interval '30 days')`, [ORG])).rejects.toThrow(
      /RUN_EVENTS_EXPIRY_REFUSED/,
    );
    // A legal hold: refused.
    await db.exec(`INSERT INTO vault.legal_holds (organization_id) VALUES (${ORG})`);
    expect(await expireOrphanedRunEvents(pool(), ORG)).toBeNull();
    expect((await rowsOf(orphan.runId)).length).toBe(2);
    await db.exec(`UPDATE vault.legal_holds SET lifted_at = now()`);

    expect(await asAppService(() => expireOrphanedRunEvents(pool(), ORG))).toBe(2);
    expect(await rowsOf(orphan.runId)).toEqual([]);
    expect((await rowsOf(live.runId)).length).toBe(2); // live
    expect((await rowsOf(sealedRun.runId)).length).toBe(2); // has a record: the release door's
    expect((await rowsOf(young.runId)).length).toBe(2); // within retention
  });

  it('the tenant purge door: platform scope, pending deletion, no legal hold', async () => {
    const a = await runWithRows();
    const other = await runWithRows(OTHER_ORG);
    // Not pending deletion: refused.
    await expect(db.query(`SELECT events FROM public.purge_tenant_run_events($1)`, [ORG])).rejects.toThrow(
      /RUN_EVENTS_PURGE_REFUSED/,
    );
    await db.exec(`UPDATE organizations SET status = 'pending_deletion' WHERE id = ${ORG}`);
    // A tenant scope, not the platform's: refused.
    await db.exec(`SET app.rls_enforce = 'on'; SET app.current_tenant_id = '${ORG}'`);
    try {
      await expect(db.query(`SELECT events FROM public.purge_tenant_run_events($1)`, [ORG])).rejects.toThrow(
        /RUN_EVENTS_PURGE_REFUSED/,
      );
    } finally {
      await db.exec(`RESET app.rls_enforce; RESET app.current_tenant_id`);
    }
    // A legal hold: refused.
    await db.exec(`INSERT INTO vault.legal_holds (organization_id) VALUES (${ORG})`);
    await expect(db.query(`SELECT events FROM public.purge_tenant_run_events($1)`, [ORG])).rejects.toThrow(
      /legal hold/,
    );
    await db.exec(`UPDATE vault.legal_holds SET lifted_at = now()`);
    const { rows } = await asAppService(() => db.query<{ events: number }>(`SELECT events FROM public.purge_tenant_run_events($1)`, [ORG]));
    expect(rows[0].events).toBe(2);
    expect(await rowsOf(a.runId)).toEqual([]);
    expect((await rowsOf(other.runId)).length).toBe(2);
  });

  it('every door is SECURITY DEFINER, owned by the purger role, and not executable by PUBLIC', async () => {
    const { rows } = await db.query<{ fn: string; definer: boolean; owner: string; public_exec: boolean; app_exec: boolean }>(`
      SELECT p.proname AS fn, p.prosecdef AS definer, pg_get_userbyid(p.proowner) AS owner,
             has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
             has_function_privilege('app_service', p.oid, 'EXECUTE') AS app_exec
        FROM pg_proc p
       WHERE p.proname IN ('release_sealed_run_events','expire_orphaned_run_events','purge_tenant_run_events')
       ORDER BY p.proname`);
    expect(rows).toEqual([
      { fn: 'expire_orphaned_run_events', definer: true, owner: 'ana_run_events_purger', public_exec: false, app_exec: true },
      { fn: 'purge_tenant_run_events', definer: true, owner: 'ana_run_events_purger', public_exec: false, app_exec: true },
      { fn: 'release_sealed_run_events', definer: true, owner: 'ana_run_events_purger', public_exec: false, app_exec: true },
    ]);
    const role = (await db.query<any>(`SELECT rolcanlogin, rolinherit, rolbypassrls FROM pg_roles WHERE rolname = 'ana_run_events_purger'`)).rows[0];
    expect(role).toEqual({ rolcanlogin: false, rolinherit: false, rolbypassrls: false });
  });
});

describe('3. flush, then seal', () => {
  it('events emitted just before the end are all in the mirror before the record is inserted', async () => {
    const { runId, handle } = await openRun();
    const recorder = recorderFor(runId);
    const timeline = new TurnTimeline({ write: () => undefined, recorder: () => recorder, mirror: () => handle.events });
    emitTurn(timeline); // fewer than a batch: still waiting on the 250 ms timer
    const emitted = recorder.seal('answered').body.timeline?.length;
    log = [];
    await sealAfterMirror(handle.events, () => writeTurnRecordSafely(pool(), recorder, 'answered'));
    const firstRecordInsert = log.findIndex((t) => /INSERT INTO ana_turn_records/.test(t));
    const lastMirrorInsert = log.map((t) => /INSERT INTO ana_run_events/.test(t)).lastIndexOf(true);
    expect(firstRecordInsert).toBeGreaterThan(-1);
    expect(lastMirrorInsert).toBeGreaterThan(-1);
    expect(lastMirrorInsert).toBeLessThan(firstRecordInsert);
    // And the rows were all written: released only because all were there.
    const { rows } = await db.query<{ timeline_seq: number }>(`SELECT timeline_seq FROM ana_runs WHERE id = $1`, [runId]);
    expect(rows[0].timeline_seq).toBe(emitted);
  });

  it('a close that cannot write marks the gap, and the record is sealed anyway', async () => {
    const { runId } = await openRun();
    const recorder = recorderFor(runId);
    const mirror = openRunEventsMirror({
      pool: pool(),
      runId,
      organizationId: ORG,
      ownerInstance: runOwnerInstance(),
      timing: { flushMs: 5, retryMs: [1, 1] },
    });
    const timeline = new TurnTimeline({ write: () => undefined, recorder: () => recorder, mirror: () => mirror });
    failOn = /INSERT INTO ana_run_events/;
    emitTurn(timeline);
    const status = await sealAfterMirror(mirror, () => {
      failOn = null;
      return writeTurnRecordSafely(pool(), recorder, 'answered');
    });
    expect(status.status).toBe('recorded');
    const { rows } = await db.query<{ timeline_seq: number; released_at: Date | null }>(
      `SELECT timeline_seq, released_at FROM ana_runs WHERE id = $1`,
      [runId],
    );
    // No row was written, and the high-water mark says how many should have been.
    expect(rows[0].timeline_seq).toBe(recorder.seal('answered').body.timeline?.length);
    expect(rows[0].released_at).not.toBeNull();
  });
});

describe('4. owner only', () => {
  it('a batch from another owner_instance writes zero rows', async () => {
    const { runId } = await openRun();
    const stranger = openRunEventsMirror({ pool: pool(), runId, organizationId: ORG, ownerInstance: 'another-process' });
    stranger.enqueue({ kind: 'task', seq: 1, at: new Date().toISOString(), round: 1, task: 't1', change: 'added', title: 'A' });
    const closed = await stranger.close();
    expect(closed.written).toBe(0);
    expect(await rowsOf(runId)).toEqual([]);
  });

  it('a heartbeat from another owner_instance changes zero rows', async () => {
    const { runId } = await openRun();
    await db.query(`UPDATE ana_runs SET owner_instance = 'another-process', heartbeat_at = now() - interval '1 hour' WHERE id = $1`, [runId]);
    expect(await beatOwnedRuns()).toBe(0);
    const { rows } = await db.query<{ stale: boolean }>(
      `SELECT heartbeat_at < now() - interval '30 minutes' AS stale FROM ana_runs WHERE id = $1`,
      [runId],
    );
    expect(rows[0].stale).toBe(true);
  });
});

describe('5. the cap', () => {
  it('2,050 events give rows 1–1,999 and the marker; 2,001 is refused; the record keeps all 2,050', async () => {
    const { runId, handle } = await openRun();
    const recorder = recorderFor(runId);
    const timeline = new TurnTimeline({ write: () => undefined, recorder: () => recorder, mirror: () => handle.events });
    for (let i = 0; i < 2_050; i++) timeline.emitTimeline({ kind: 'task', round: 1, task: `t${i}`, change: 'added', title: `Task ${i}` });
    await handle.events!.close();
    const { rows } = await db.query<{ n: number; max: number }>(`SELECT count(*)::int AS n, max(seq) AS max FROM ana_run_events WHERE run_id = $1`, [runId]);
    expect(rows[0]).toEqual({ n: 2_000, max: 2_000 });
    const marker = (await db.query<{ event: any }>(`SELECT event FROM ana_run_events WHERE run_id = $1 AND seq = 2000`, [runId])).rows[0].event;
    expect(marker).toMatchObject({ kind: 'truncated', seq: 2_000, round: 1 });
    expect((await db.query(`SELECT 1 FROM ana_run_events WHERE run_id = $1 AND seq = 1999 AND event->>'kind' = 'task'`, [runId])).rows).toHaveLength(1);
    await expect(
      db.query(`INSERT INTO ana_run_events (organization_id, run_id, seq, at, event) VALUES ($1, $2, 2001, now(), '{}'::jsonb)`, [ORG, runId]),
    ).rejects.toThrow(/check constraint/i);
    expect(recorder.seal('answered').body.timeline).toHaveLength(2_050);
  });
});

describe('7. the heartbeat needs no socket', () => {
  it('heartbeat_at advances one interval after the run opened, with no request in sight', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { runId } = await openRun();
    await db.query(`UPDATE ana_runs SET heartbeat_at = now() - interval '1 hour' WHERE id = $1`, [runId]);
    await vi.advanceTimersByTimeAsync(RUN_HEARTBEAT_MS);
    // The beat is a database round-trip the interval started; let it land.
    await new Promise((r) => setTimeout(r, 50));
    const { rows } = await db.query<{ fresh: boolean }>(
      `SELECT heartbeat_at > now() - interval '1 minute' AS fresh FROM ana_runs WHERE id = $1`,
      [runId],
    );
    expect(rows[0].fresh).toBe(true);
  });
});
