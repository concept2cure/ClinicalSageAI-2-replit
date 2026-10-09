/**
 * The two server writers a held turn needs, against the shipped ana_runs DDL
 * (row 74, slice S3): holdForPerson (running → paused) and endHeldRun
 * (paused → finished, 'hold_expired').
 *
 * Both are server decisions, like resumeAbandonedRun and stopRunInternally,
 * so neither writes a control event: nobody pressed pause, and nobody pressed
 * stop. What the person does next still goes through applyControl and is
 * recorded as theirs — and after endHeldRun there is nothing left for it to
 * act on (TERMINAL).
 *
 * Same harness as run-control.pglite.integration.test.ts: the migration is
 * executed verbatim and the service's own functions run against it. Kept in a
 * file of its own so that suite runs unchanged.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyControl,
  beginRun,
  endHeldRun,
  endRun,
  holdForPerson,
  readRun,
  _resetLocalRunsForTest,
} from '../run-control.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MIGRATION = fs.readFileSync(path.join(repoRoot, 'db', 'migrations', '20260917_ana_runs.sql'), 'utf8');

let db: PGlite;

/** pg.Pool-shaped over PGlite; `rowCount` is what the guarded writers read. */
function pool(): any {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as any[]);
      return { rows: r.rows as any[], rowCount: (r as any).affectedRows ?? r.rows.length };
    },
    connect: async () => {
      throw new Error('PGlite has no dedicated client');
    },
  };
}

const ORG = 1;
const USER = 10;

const newRun = () =>
  beginRun({ pool: pool(), organizationId: ORG, userId: USER, threadId: 'thread_1', surface: 'ana-ri-stream' });
const control = (runId: string, action: string, over: Record<string, unknown> = {}) =>
  applyControl({ pool: pool(), runId, organizationId: ORG, userId: USER, action, ...over } as any);
const row = async (runId: string) => (await readRun(pool(), runId, ORG))!;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${ORG});
    INSERT INTO users (id) VALUES (${USER});
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

describe('holdForPerson', () => {
  it('pauses a running run and records no control event — nobody pressed pause', async () => {
    const { runId } = await newRun();
    expect(await holdForPerson(pool(), runId)).toBe(true);
    const r = await row(runId);
    expect(r.status).toBe('paused');
    expect(r.controlEvents).toEqual([]);
  });

  it('a second hold of the same run writes nothing', async () => {
    const { runId } = await newRun();
    await holdForPerson(pool(), runId);
    expect(await holdForPerson(pool(), runId)).toBe(false);
  });

  it('never revives a cancelled run', async () => {
    const { runId } = await newRun();
    await control(runId, 'cancel');
    expect(await holdForPerson(pool(), runId)).toBe(false);
    expect((await row(runId)).status).toBe('cancelled');
  });

  it("the person's resume is theirs: running again, with exactly one event, by the owner", async () => {
    const { runId } = await newRun();
    await holdForPerson(pool(), runId);
    const res = await control(runId, 'resume');
    expect(res).toMatchObject({ ok: true, status: 'running' });
    const r = await row(runId);
    expect(r.status).toBe('running');
    expect(r.controlEvents).toHaveLength(1);
    expect(r.controlEvents[0]).toMatchObject({ action: 'resume', byUserId: USER });
  });
});

describe('endHeldRun', () => {
  it("ends a paused run as finished, 'hold_expired', with no control event", async () => {
    const { runId } = await newRun();
    await holdForPerson(pool(), runId);
    expect(await endHeldRun(pool(), runId)).toBe(true);
    const r = await row(runId);
    expect(r.status).toBe('finished');
    expect(r.stoppedReason).toBe('hold_expired');
    expect(r.controlEvents).toEqual([]);
    const { rows } = await db.query<{ finished_at: string | null }>(`SELECT finished_at FROM ana_runs WHERE id = $1`, [runId]);
    expect(rows[0].finished_at).not.toBeNull();
  });

  it('writes nothing to a run that is not paused — a resume that landed first wins', async () => {
    const { runId } = await newRun();
    await holdForPerson(pool(), runId);
    await control(runId, 'resume');
    expect(await endHeldRun(pool(), runId)).toBe(false);
    const r = await row(runId);
    expect(r.status).toBe('running');
    expect(r.stoppedReason).toBeNull();
  });

  it('a late resume afterwards is refused as TERMINAL', async () => {
    const { runId } = await newRun();
    await holdForPerson(pool(), runId);
    await endHeldRun(pool(), runId);
    expect(await control(runId, 'resume')).toMatchObject({ ok: false, code: 'TERMINAL' });
    expect((await row(runId)).controlEvents).toEqual([]);
  });

  it("the turn's own endRun afterwards changes nothing", async () => {
    const { runId } = await newRun();
    await holdForPerson(pool(), runId);
    await endHeldRun(pool(), runId);
    await endRun(pool(), runId, 'finished', 'no_more_tools');
    const r = await row(runId);
    expect(r.status).toBe('finished');
    expect(r.stoppedReason).toBe('hold_expired');
  });

  it('wakes what is waiting on the run in this process, without aborting it', async () => {
    const { runId, handle } = await newRun();
    await holdForPerson(pool(), runId);
    const waiting = handle.wake(60_000).then(() => 'woke' as const);
    await endHeldRun(pool(), runId);
    // Promptly, by the write itself — not by the poll fallback (POLL_FALLBACK_MS, 2 s) catching up.
    const first = await Promise.race([waiting, new Promise(resolve => setTimeout(() => resolve('late'), 1_000))]);
    expect(first).toBe('woke');
    expect(handle.cancelSignal.aborted, 'an expired hold read as a cancel').toBe(false);
  });
});

describe('endHeldRun when the write fails', () => {
  it('throws the error rather than answering false, which would read as a Continue that landed first', async () => {
    const failing = {
      query: async () => {
        throw new Error('connection terminated');
      },
    };
    await expect(endHeldRun(failing as any, 'run_x')).rejects.toThrow('connection terminated');
  });
});
