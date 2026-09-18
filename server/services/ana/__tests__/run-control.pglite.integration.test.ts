/**
 * Durable run control, against a real PostgreSQL.
 *
 * ── Why this is an integration test and not a unit test ──────────────────────
 * Almost everything that can go wrong here is in the SQL, not the TypeScript:
 * whether the drain really returns the pre-image, whether a guarded UPDATE
 * actually loses a race it is supposed to lose, whether the CHECK constraint
 * refuses a status the state machine has never heard of. A mocked pool would
 * assert that we SENT a string, which is the one thing that was never in doubt.
 *
 * So the shipped DDL is executed verbatim from `db/migrations/20260917_ana_runs.sql`
 * — a paraphrase would drift from the migration without either failing — and the
 * service's own exported functions are driven against it through a thin
 * pg-shaped adapter. What runs here is the code that ships.
 *
 * ── The drain, and the case that holds it ────────────────────────────────────
 * `consumeInterjections` was first written as
 *
 *     UPDATE … SET pending_interjections = '[]'
 *     RETURNING pending_interjections AS drained
 *
 * which returns the row AFTER the update — an empty array, every time, silently
 * eating every steer the person typed. `a naive RETURNING drains nothing` runs
 * exactly that statement and pins the defect, so the CTE cannot be simplified
 * back into it by someone who reads it as redundant.
 *
 * ── What PGlite cannot cover ─────────────────────────────────────────────────
 * It is one in-process database, so it cannot host two servers. The
 * cross-instance NOTIFY delivery is therefore NOT exercised anywhere, which is
 * stated in the service docstring too and is why the poll fallback exists.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  beginRun,
  endRun,
  readRun,
  applyControl,
  consumeInterjections,
  reapOrphanedRuns,
  stopRunInternally,
  _resetLocalRunsForTest,
} from '../run-control.js';
import { MAX_INTERJECTION_CHARS } from '../run-status.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MIGRATION = fs.readFileSync(
  path.join(repoRoot, 'db', 'migrations', '20260917_ana_runs.sql'),
  'utf8',
);

let db: PGlite;

/**
 * A `pg.Pool`-shaped adapter over PGlite.
 *
 * PGlite reports `affectedRows`; `pg` reports `rowCount`, and the service reads
 * `rowCount` to tell a guarded UPDATE that applied from one that lost its race.
 * Getting that mapping wrong would make every optimistic guard look like it
 * worked, so it is the one piece of glue here worth naming.
 */
function pool(): any {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as any[]);
      return { rows: r.rows as any[], rowCount: (r as any).affectedRows ?? r.rows.length };
    },
    // The listener opens a dedicated client; PGlite has none, so the service
    // takes its declared poll fallback. That is the degraded path running.
    connect: async () => {
      throw new Error('PGlite has no dedicated client');
    },
  };
}

const ORG = 1;
const OTHER_ORG = 2;
const USER = 10;
const OTHER_USER = 11;

async function newRun(over: Partial<{ organizationId: number; userId: number | null }> = {}) {
  return beginRun({
    pool: pool(),
    organizationId: over.organizationId ?? ORG,
    userId: over.userId === undefined ? USER : over.userId,
    threadId: 'thread_1',
    surface: 'ana-ri-stream',
  });
}

const control = (runId: string, action: any, over: Record<string, unknown> = {}) =>
  applyControl({ pool: pool(), runId, organizationId: ORG, userId: USER, action, ...over } as any);

beforeAll(async () => {
  db = new PGlite();
  // The two parents the migration's foreign keys point at. Creating them means
  // the shipped REFERENCES clauses are exercised rather than stripped out.
  await db.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${ORG}), (${OTHER_ORG});
    INSERT INTO users (id) VALUES (${USER}), (${OTHER_USER});
  `);
  await db.exec(MIGRATION);
});

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  _resetLocalRunsForTest();
  await db.exec('DELETE FROM ana_runs;');
});

describe('the shipped migration', () => {
  it('applies, and re-applies — every statement is IF NOT EXISTS', async () => {
    // CLAUDE.md RULE 1: the whole set re-executes on every deploy. A file that
    // only works the first time takes the next deploy down.
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });

  it('refuses a status the state machine has never heard of', async () => {
    const { runId } = await newRun();
    await expect(
      db.query(`UPDATE ana_runs SET status = 'wedged' WHERE id = $1`, [runId]),
    ).rejects.toThrow(/ana_runs_status_chk|check constraint/i);
  });

  it('refuses a run with no tenant', async () => {
    // The column is NOT NULL on purpose: a nullable org is the
    // ana_deep_investigations shape, where the reader has to match null-to-null
    // and a row with no tenant is readable by the sweep as belonging to none.
    await expect(
      db.query(
        `INSERT INTO ana_runs (id, organization_id, surface, owner_instance)
         VALUES ('run_x', NULL, 's', 'i')`,
      ),
    ).rejects.toThrow(/null/i);
  });
});

describe('lifecycle', () => {
  it('opens a run as running, owned by this process', async () => {
    const { runId } = await newRun();
    const row = await readRun(pool(), runId, ORG);
    expect(row?.status).toBe('running');
    expect(row?.organizationId).toBe(ORG);
    expect(row?.ownerInstance).toBeTruthy();
  });

  it('finishes a run', async () => {
    const { runId } = await newRun();
    await endRun(pool(), runId, 'finished', 'no_more_tools');
    expect((await readRun(pool(), runId, ORG))?.status).toBe('finished');
  });

  it('NEVER rewrites a cancelled run as finished', async () => {
    // The loop unwinds after a cancel, and whichever writer lands last must not
    // be able to claim the turn completed. A cancelled run reporting a finished
    // answer is worse than one reporting nothing.
    const { runId } = await newRun();
    await control(runId, 'cancel');
    await endRun(pool(), runId, 'finished', 'no_more_tools');
    const row = await readRun(pool(), runId, ORG);
    expect(row?.status).toBe('cancelled');
    expect(row?.stoppedReason).toBe('cancelled');
  });

  it('records a dropped socket as a disconnect, not as a human decision', async () => {
    const { runId } = await newRun();
    await stopRunInternally(pool(), runId, 'client_disconnected');
    const row = await readRun(pool(), runId, ORG);
    expect(row?.stoppedReason).toBe('client_disconnected');
    // Nobody pressed stop, so nothing may appear in the decision lineage.
    expect(row?.controlEvents).toEqual([]);
  });
});

describe('control', () => {
  it('pauses and resumes', async () => {
    const { runId } = await newRun();
    expect((await control(runId, 'pause')).status).toBe('paused');
    expect((await control(runId, 'resume')).status).toBe('running');
  });

  it('writes the control event at the moment of acceptance', async () => {
    // Not at the end of the turn — the registry held them in a process-local
    // array until then, so a crash lost every decision taken during the run.
    const { runId } = await newRun();
    await control(runId, 'pause');
    const row = await readRun(pool(), runId, ORG);
    expect(row?.controlEvents).toHaveLength(1);
    expect(row?.controlEvents[0]).toMatchObject({ action: 'pause', byUserId: USER });
  });

  it('CANCEL IS TERMINAL — pause, resume and steer are all refused afterward', async () => {
    const { runId } = await newRun();
    await control(runId, 'cancel');
    for (const action of ['pause', 'resume', 'interject'] as const) {
      const r = await control(runId, action, { message: 'steer' });
      expect(r.ok).toBe(false);
      expect(r.code).toBe('TERMINAL');
      expect(r.status).toBe('cancelled');
    }
  });

  it('aborts the local handle on cancel, and not on pause', async () => {
    // Pause deliberately does not abort: killing a tool to pause throws the
    // work away and then has to redo it.
    const { runId, handle } = await newRun();
    await control(runId, 'pause');
    expect(handle.cancelSignal.aborted).toBe(false);
    await control(runId, 'cancel');
    expect(handle.cancelSignal.aborted).toBe(true);
  });

  it('a steer accepted while paused also resumes', async () => {
    const { runId } = await newRun();
    await control(runId, 'pause');
    const r = await control(runId, 'interject', { message: 'narrow to Class III' });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('running');
  });

  it('refuses an empty steer', async () => {
    const { runId } = await newRun();
    const r = await control(runId, 'interject', { message: '   ' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID');
  });

  it('caps a steer — a redirect, not a new document', async () => {
    const { runId } = await newRun();
    await control(runId, 'interject', { message: 'x'.repeat(MAX_INTERJECTION_CHARS + 500) });
    const [drained] = await consumeInterjections(pool(), runId);
    expect(drained.length).toBe(MAX_INTERJECTION_CHARS);
  });

  it('loses a guarded race rather than applying twice', async () => {
    // Two controls arriving together: the second reads 'running', writes
    // WHERE status = 'running', matches nothing, and reports what actually won.
    const { runId } = await newRun();
    const [a, b] = await Promise.all([control(runId, 'cancel'), control(runId, 'pause')]);
    const finalStatus = (await readRun(pool(), runId, ORG))?.status;
    expect(finalStatus).toBe('cancelled');
    for (const r of [a, b]) if (r.ok) expect(r.status).toBe(finalStatus);
  });
});

describe('ownership', () => {
  it("another organization's run is NOT FOUND, not forbidden", async () => {
    // Its existence must not be confirmable from outside the tenant.
    const { runId } = await newRun({ organizationId: OTHER_ORG, userId: null });
    const r = await applyControl({
      pool: pool(),
      runId,
      organizationId: ORG,
      userId: USER,
      action: 'cancel',
    });
    expect(r.code).toBe('NOT_FOUND');
    expect((await readRun(pool(), runId, OTHER_ORG))?.status).toBe('running');
  });

  it("a colleague's run in the same tenant is forbidden, not hidden", async () => {
    // Inside a tenant the row is not a secret, and "not found" would be a lie
    // the caller could disprove by watching the run continue.
    const { runId } = await newRun({ userId: OTHER_USER });
    const r = await control(runId, 'cancel');
    expect(r.code).toBe('NOT_YOURS');
    expect((await readRun(pool(), runId, ORG))?.status).toBe('running');
  });

  it('a read is scoped to the tenant', async () => {
    const { runId } = await newRun();
    expect(await readRun(pool(), runId, OTHER_ORG)).toBeNull();
  });

  it('an unknown run is NOT FOUND', async () => {
    const r = await control('run_nope', 'cancel');
    expect(r.code).toBe('NOT_FOUND');
  });
});

describe('the steer drain', () => {
  it('returns what was queued', async () => {
    const { runId } = await newRun();
    await control(runId, 'interject', { message: 'narrow to Class III' });
    await control(runId, 'interject', { message: 'skip the EU section' });
    expect(await consumeInterjections(pool(), runId)).toEqual([
      'narrow to Class III',
      'skip the EU section',
    ]);
  });

  it('empties the queue, so a steer is never applied twice', async () => {
    const { runId } = await newRun();
    await control(runId, 'interject', { message: 'narrow to Class III' });
    expect(await consumeInterjections(pool(), runId)).toHaveLength(1);
    expect(await consumeInterjections(pool(), runId)).toEqual([]);
  });

  it('two concurrent drains split the queue — neither sees the same steer', async () => {
    const { runId } = await newRun();
    await control(runId, 'interject', { message: 'narrow to Class III' });
    const [a, b] = await Promise.all([
      consumeInterjections(pool(), runId),
      consumeInterjections(pool(), runId),
    ]);
    expect([...a, ...b]).toEqual(['narrow to Class III']);
  });

  it('is empty for a run with nothing queued', async () => {
    const { runId } = await newRun();
    expect(await consumeInterjections(pool(), runId)).toEqual([]);
  });

  it('a naive RETURNING drains nothing — the defect this CTE exists for', async () => {
    // RETURNING reports the row AFTER the update, so the obvious form hands
    // back the '[]' it just wrote and silently eats every steer the person
    // typed. Without this case, someone reading the CTE as redundant machinery
    // could simplify it back and every other assertion here would still pass.
    const { runId } = await newRun();
    await control(runId, 'interject', { message: 'narrow to Class III' });
    const naive = await db.query<{ drained: unknown }>(
      `UPDATE ana_runs SET pending_interjections = '[]'::jsonb
       WHERE id = $1 AND pending_interjections <> '[]'::jsonb
       RETURNING pending_interjections AS drained`,
      [runId],
    );
    expect(naive.rows[0].drained).toEqual([]);
  });
});

describe('the reaper', () => {
  it('fails a run whose heartbeat went stale, and says it was orphaned', async () => {
    // A restart leaves rows saying `running` with nobody executing them.
    // Reporting those as live is the lie check_deep_investigation already
    // refuses to tell.
    const { runId } = await newRun();
    await db.query(`UPDATE ana_runs SET heartbeat_at = now() - interval '1 hour' WHERE id = $1`, [
      runId,
    ]);
    expect(await reapOrphanedRuns(pool())).toBe(1);
    const row = await readRun(pool(), runId, ORG);
    expect(row?.status).toBe('failed');
    expect(row?.stoppedReason).toBe('orphaned');
  });

  it('leaves a run that is still beating alone', async () => {
    const { runId, handle } = await newRun();
    await handle.heartbeat(3);
    expect(await reapOrphanedRuns(pool())).toBe(0);
    expect((await readRun(pool(), runId, ORG))?.status).toBe('running');
  });

  it('does not resurrect or re-stamp a run that already settled', async () => {
    const { runId } = await newRun();
    await control(runId, 'cancel');
    await db.query(`UPDATE ana_runs SET heartbeat_at = now() - interval '1 hour' WHERE id = $1`, [
      runId,
    ]);
    expect(await reapOrphanedRuns(pool())).toBe(0);
    const row = await readRun(pool(), runId, ORG);
    expect(row?.status).toBe('cancelled');
    expect(row?.stoppedReason).toBe('cancelled');
  });

  it('a heartbeat carries the round forward', async () => {
    const { runId, handle } = await newRun();
    await handle.heartbeat(4);
    expect((await readRun(pool(), runId, ORG))?.currentRound).toBe(4);
  });
});
