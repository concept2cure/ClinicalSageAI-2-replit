/**
 * The live run reads, through the routes, on a real Postgres engine (PGlite)
 * with RLS off: the statement is the only place the boundary can live (AnA
 * detach DT1, docs/design/ANA_DETACH_2026-10-08.md §3.7, §8 DT1 tests 6, 9, 10;
 * evidence docs/evidence/ANA-SUMMARY/2026-10-08/DT1-run-events/).
 *
 *   6. a gap: a dropped batch shows as missing seqs in `events` and as
 *      `highWater` above the last row;
 *   9. access, D-1(b): the asker 200; an admin 200 with `approval: null` and
 *      cancel-only control; a colleague who can read the transcript 403 with
 *      the sentence; another organisation 404; a run with no person 403 for
 *      a member;
 *  10. leak: sentinels in every excluded column appear in no payload.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

vi.mock('../../../db.js', () => ({ getPool: () => null, pool: null }));

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { TurnRecorder, writeTurnRecord } from '../../../services/ana/turn-record';
import { openRunEventsMirror } from '../../../services/ana/run-events';
import { _resetLocalRunsForTest } from '../../../services/ana/run-control';
import { mountRunReadRoutes, LIVE_PROGRESS_FORBIDDEN } from '../runs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const sql = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ORG = 913713;
const OTHER_ORG = 913714;
const ASKER = 771377;
const COLLEAGUE = 771378;
const ADMIN = 771379;
const OUTSIDER = 771380;
const OWNER = 'sentinel-owner-instance';
const S = {
  steer: 'SENTINEL_PENDING_STEER',
  decision: 'SENTINEL_APPROVAL_DECISION',
  decisionTool: 'tu_SENTINEL_DECIDED',
  surface: 'SENTINEL_SURFACE',
  pendingTool: 'tu_SENTINEL_PENDING',
  command: 'SENTINEL_COMMAND_NAME',
  moveId: 'tu_SENTINEL_MOVE',
};

const USERS: Record<string, { id: number; org: number; role: string }> = {
  asker: { id: ASKER, org: ORG, role: 'member' },
  colleague: { id: COLLEAGUE, org: ORG, role: 'member' },
  admin: { id: ADMIN, org: ORG, role: 'admin' },
  outsider: { id: OUTSIDER, org: OTHER_ORG, role: 'admin' },
};

let db: PGlite;
let failOn: RegExp | null = null;
async function q(text: string, params?: unknown[]) {
  if (failOn && failOn.test(text)) throw new Error('simulated failure');
  const r = await db.query(text, params as any[]);
  return { rows: r.rows as any[], rowCount: (r as any).affectedRows ?? r.rows.length };
}
const pool: any = { query: q, connect: async () => ({ query: q, release: () => undefined }) };

function app() {
  const a = express();
  a.use((req, _res, next) => {
    const u = USERS[String(req.header('x-as'))];
    (req as any).user = { id: u.id, role: u.role, roles: [u.role], organizationId: u.org };
    (req as any).tenantId = u.org;
    next();
  });
  const router = express.Router();
  mountRunReadRoutes(router, { pool: () => pool });
  a.use('/api/ana-ri', router);
  return a;
}
const get = (as: keyof typeof USERS, url: string) => request(app()).get(url).set('x-as', as);

let seq = 0;
async function insertRun(over: Partial<{ id: string; user_id: number | null; status: string; thread_id: string | null; released: boolean }> = {}) {
  const id = over.id ?? `run_t${++seq}`;
  await db.query(
    `INSERT INTO ana_runs (id, organization_id, user_id, thread_id, surface, status, owner_instance, current_round,
        pending_interjections, approval_decision, control_events, run_policy, released_at, user_message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8::jsonb, $9::jsonb, $10::jsonb, 'manual', $11, 501)`,
    [
      id,
      ORG,
      over.user_id === undefined ? ASKER : over.user_id,
      over.thread_id === undefined ? 'th_shared' : over.thread_id,
      S.surface,
      over.status ?? 'running',
      OWNER,
      JSON.stringify([{ text: S.steer, at: new Date().toISOString(), byUserId: ASKER, kind: 'screen_report', moveId: S.moveId }]),
      JSON.stringify({ toolUseId: S.decisionTool, decided: 'denied', byUserId: ASKER, error: S.decision }),
      JSON.stringify([{ action: 'pause', round: 2, at: new Date().toISOString(), byUserId: ASKER }]),
      over.released ? new Date().toISOString() : null,
    ],
  );
  return id;
}
async function mirror(runId: string, events: Array<Record<string, unknown>>) {
  const m = openRunEventsMirror({ pool, runId, organizationId: ORG, ownerInstance: OWNER, timing: { flushMs: 1, retryMs: [1, 1] } });
  for (const e of events) m.enqueue(e as never);
  return m.close();
}
const task = (s: number, t: string, change: string, title: string) => ({ kind: 'task', seq: s, at: new Date().toISOString(), round: 1, task: t, change, title });
const note = (s: number) => ({ kind: 'note', seq: s, at: new Date().toISOString(), round: 1, text: `note ${s}` });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE app_service NOLOGIN;
    CREATE TABLE organizations (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE chat_threads (id text PRIMARY KEY, user_id integer, organization_id integer, title text);
    INSERT INTO organizations (id) VALUES (${ORG}), (${OTHER_ORG});
    INSERT INTO users VALUES (${ASKER}), (${COLLEAGUE}), (${ADMIN}), (${OUTSIDER});
    -- An organisation-readable conversation: the colleague can read its transcript.
    INSERT INTO chat_threads (id, user_id, organization_id, title) VALUES ('th_shared', NULL, ${ORG}, 'Stability reports');
  `);
  await db.exec(AUDIT_LOGS_PGLITE_DDL);
  await db.exec(sql('migrations/20260921_audit_logs_chain_seq.sql'));
  await db.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;`);
  await db.exec(sql('db/migrations/20260917_ana_runs.sql'));
  await db.exec(sql('migrations/20260926_ana_turn_records.sql'));
  await db.exec(sql('migrations/20261008f_ana_run_events.sql'));
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  _resetLocalRunsForTest();
  failOn = null;
  await db.exec(`
    ALTER TABLE ana_run_events DISABLE TRIGGER USER; DELETE FROM ana_run_events; ALTER TABLE ana_run_events ENABLE TRIGGER USER;
    ALTER TABLE ana_turn_records DISABLE TRIGGER USER; ALTER TABLE ana_record_blobs DISABLE TRIGGER USER;
    DELETE FROM ana_turn_records; DELETE FROM ana_record_blobs;
    ALTER TABLE ana_turn_records ENABLE TRIGGER USER; ALTER TABLE ana_record_blobs ENABLE TRIGGER USER;
    DELETE FROM ana_runs;
  `);
});

describe('9. who may read a live run (D-1(b))', () => {
  it('the asker: 200, with the run, its rows, its plan and its controls', async () => {
    const runId = await insertRun();
    await mirror(runId, [task(1, 't1', 'added', 'Find the reports'), task(2, 't2', 'added', 'Read them'), task(3, 't1', 'started', 'Find the reports'), note(4)]);
    const res = await get('asker', `/api/ana-ri/runs/${runId}/events?after=1`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      runId,
      threadId: 'th_shared',
      threadTitle: 'Stability reports',
      userMessageId: 501,
      status: 'running',
      round: 3,
      runPolicy: 'manual',
      hold: null,
      plan: [
        { title: 'Find the reports', status: 'in_progress' },
        { title: 'Read them', status: 'pending' },
      ],
      highWater: 4,
      sealed: null,
      approval: null,
      canControl: true,
      controlScope: 'all',
      controls: [{ action: 'pause', round: 2 }],
    });
    expect(res.body.events.map((e: { seq: number }) => e.seq)).toEqual([2, 3, 4]);
    expect(typeof res.body.serverNow).toBe('string');
  });

  it("an admin: 200, with approval null and cancel-only control", async () => {
    const runId = await insertRun({ status: 'awaiting_approval' });
    await db.query(`UPDATE ana_runs SET pending_approval = $2::jsonb WHERE id = $1`, [
      runId,
      JSON.stringify({ toolUseId: S.pendingTool, command: S.command, params: {}, tier: 'reason', requestedAt: new Date().toISOString() }),
    ]);
    const res = await get('admin', `/api/ana-ri/runs/${runId}/events`);
    expect(res.status).toBe(200);
    expect(res.body.approval).toBeNull();
    expect(res.body).toMatchObject({ canControl: true, controlScope: 'cancel' });
  });

  it('the asker sees their own pending approval, as the approval_required frame carries it', async () => {
    const runId = await insertRun({ status: 'awaiting_approval' });
    await db.query(`UPDATE ana_runs SET pending_approval = $2::jsonb WHERE id = $1`, [
      runId,
      JSON.stringify({ toolUseId: S.pendingTool, command: 'save_document_to_vault', params: { title: 'Plan' }, tier: 'reason', requestedAt: new Date().toISOString() }),
    ]);
    const res = await get('asker', `/api/ana-ri/runs/${runId}/events`);
    expect(res.body.approval).toMatchObject({
      runId,
      toolUseId: S.pendingTool,
      openModal: 'esign',
      data: { tier: 'reason', proposedByAgent: true },
    });
  });

  it('a colleague who can read the transcript: 403, with the sentence', async () => {
    const runId = await insertRun();
    const res = await get('colleague', `/api/ana-ri/runs/${runId}/events`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(LIVE_PROGRESS_FORBIDDEN);
    expect(LIVE_PROGRESS_FORBIDDEN).toBe("You don't have access to this conversation's live progress.");
  });

  it('another organisation: 404, even for its admin', async () => {
    const runId = await insertRun();
    const res = await get('outsider', `/api/ana-ri/runs/${runId}/events`);
    expect(res.status).toBe(404);
  });

  it('a run with no person: 403 for a member, 200 for an admin', async () => {
    const runId = await insertRun({ user_id: null });
    expect((await get('colleague', `/api/ana-ri/runs/${runId}/events`)).status).toBe(403);
    expect((await get('asker', `/api/ana-ri/runs/${runId}/events`)).status).toBe(403);
    expect((await get('admin', `/api/ana-ri/runs/${runId}/events`)).status).toBe(200);
  });

});

describe('9. the listings apply the same rule', () => {
  it('the conversation listing: the asker and admins see its runs, a colleague none', async () => {
    const live = await insertRun();
    const releasedNoRecord = await insertRun({ status: 'failed', released: true });
    const sealed = await insertRun({ status: 'finished', released: true });
    const r = new TurnRecorder();
    r.setTurn({ organizationId: ORG, runId: sealed, actorUserId: ASKER, threadId: 'th_shared' });
    r.setRequest('q');
    r.setAnswer({ streamed: 'a', stored: 'a' });
    await writeTurnRecord(pool, r.seal('answered'));

    const asker = await get('asker', '/api/ana-ri/runs?thread_id=th_shared');
    expect(asker.status).toBe(200);
    expect(asker.body.runs.map((x: { runId: string }) => x.runId).sort()).toEqual([live, releasedNoRecord].sort());
    expect((await get('admin', '/api/ana-ri/runs?thread_id=th_shared')).body.runs).toHaveLength(2);
    expect((await get('colleague', '/api/ana-ri/runs?thread_id=th_shared')).body.runs).toEqual([]);
    expect((await get('outsider', '/api/ana-ri/runs?thread_id=th_shared')).body.runs).toEqual([]);

    const mine = await get('asker', '/api/ana-ri/runs?mine=live');
    expect(mine.body.runs).toEqual([expect.objectContaining({ runId: live, threadTitle: 'Stability reports', status: 'running' })]);
    expect((await get('colleague', '/api/ana-ri/runs?mine=live')).body.runs).toEqual([]);
    expect((await get('asker', '/api/ana-ri/runs')).status).toBe(400);
  });

});

describe('the recording window (DT2, flagged by DT1 as (b))', () => {
  /* A run that has ended but whose owner has not yet released it — the ~30 s
     in which post-processing writes the answer and seals the record — must be
     listed: a reload in that window otherwise finds nothing, and the turn the
     person just watched disappears until the record lands. A run in that
     state that already has its record is not listed: the transcript has it. */
  it('lists a terminal run that is not yet released and has no record', async () => {
    const recording = await insertRun({ status: 'finished' }); // ended, released_at null, no record
    const res = await get('asker', '/api/ana-ri/runs?thread_id=th_shared');
    expect(res.status).toBe(200);
    expect(res.body.runs).toEqual([
      expect.objectContaining({ runId: recording, status: 'finished', releasedAt: null, userMessageId: 501 }),
    ]);
  });

  it('does not list a terminal, unreleased run whose record already exists', async () => {
    const sealedUnreleased = await insertRun({ status: 'finished' });
    const r = new TurnRecorder();
    r.setTurn({ organizationId: ORG, runId: sealedUnreleased, actorUserId: ASKER, threadId: 'th_shared' });
    r.setRequest('q');
    r.setAnswer({ streamed: 'a', stored: 'a' });
    await writeTurnRecord(pool, r.seal('answered'));
    const res = await get('asker', '/api/ana-ri/runs?thread_id=th_shared');
    expect(res.body.runs).toEqual([]);
  });

  it('applies the same person rule: a colleague sees none of it', async () => {
    await insertRun({ status: 'cancelled' });
    expect((await get('colleague', '/api/ana-ri/runs?thread_id=th_shared')).body.runs).toEqual([]);
    expect((await get('admin', '/api/ana-ri/runs?thread_id=th_shared')).body.runs).toHaveLength(1);
  });
});

describe('the hand-over', () => {
  it('a sealed run names its record', async () => {
    const runId = await insertRun({ status: 'finished' });
    const r = new TurnRecorder();
    r.setTurn({ organizationId: ORG, runId, actorUserId: ASKER, threadId: 'th_shared' });
    r.setRequest('q');
    r.setAnswer({ streamed: 'a', stored: 'a' });
    r.setMessageIds({ assistant: 902 });
    const { id } = await writeTurnRecord(pool, r.seal('answered'));
    const res = await get('asker', `/api/ana-ri/runs/${runId}/events`);
    expect(res.body.sealed).toEqual({ recordId: id, assistantMessageId: 902 });
  });
});

describe('6. a gap is visible', () => {
  it('a dropped batch shows as missing seqs in events and as highWater above the last row', async () => {
    const runId = await insertRun();
    await mirror(runId, [note(1), note(2)]);
    failOn = /INSERT INTO ana_run_events/;
    await mirror(runId, [note(3), note(4)]); // dropped after its retries; close stamps the mark
    failOn = null;
    await mirror(runId, [note(5)]);
    await db.query(`UPDATE ana_runs SET timeline_seq = 6 WHERE id = $1`, [runId]); // the owner emitted a sixth, then died
    const res = await get('asker', `/api/ana-ri/runs/${runId}/events`);
    expect(res.body.events.map((e: { seq: number }) => e.seq)).toEqual([1, 2, 5]);
    expect(res.body.highWater).toBe(6);
  });
});

describe('10. nothing excluded leaks', () => {
  it('sentinels in every excluded column appear in no payload, for the asker or an admin', async () => {
    const runId = await insertRun({ status: 'awaiting_approval' });
    await db.query(`UPDATE ana_runs SET pending_approval = $2::jsonb WHERE id = $1`, [
      runId,
      JSON.stringify({ toolUseId: S.pendingTool, command: S.command, params: {}, tier: 'reason', requestedAt: new Date().toISOString() }),
    ]);
    await mirror(runId, [note(1)]);
    const always = [OWNER, S.steer, S.decision, S.decisionTool, S.surface, S.moveId, String(ORG), String(ASKER), 'byUserId', 'owner_instance', 'organization_id', 'user_id', 'surface'];
    const bodies = {
      asker: JSON.stringify((await get('asker', `/api/ana-ri/runs/${runId}/events`)).body),
      admin: JSON.stringify((await get('admin', `/api/ana-ri/runs/${runId}/events`)).body),
      list: JSON.stringify((await get('asker', '/api/ana-ri/runs?thread_id=th_shared')).body),
      mine: JSON.stringify((await get('asker', '/api/ana-ri/runs?mine=live')).body),
    };
    for (const [who, body] of Object.entries(bodies)) {
      for (const s of always) expect(body, `${who} carries ${s}`).not.toContain(s);
    }
    // The pending approval's tool and tool-use id are the asker's alone.
    for (const s of [S.pendingTool, S.command]) {
      expect(bodies.admin, `admin carries ${s}`).not.toContain(s);
      expect(bodies.list).not.toContain(s);
      expect(bodies.mine).not.toContain(s);
    }
    expect(bodies.asker).toContain(S.pendingTool);
  });
});
