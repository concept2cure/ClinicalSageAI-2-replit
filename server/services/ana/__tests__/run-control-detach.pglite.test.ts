/**
 * Run control for a turn that outlives its page (AnA detach DT3,
 * docs/design/ANA_DETACH_2026-10-08.md §2.4, §2.5, §2.9, §7), against the
 * shipped ana_runs DDL on PGlite — the same harness as
 * run-hold-writers.pglite.integration.test.ts.
 *
 *   DT3 test 1   a run that reached endRun stays `finished`: the reaper never
 *                touches it, however stale its heartbeat; the red variant —
 *                a detached run never settled — is reaped `orphaned`.
 *   DT3 test 8   a row another writer set failed/orphaned aborts its owner,
 *                and the abort carries the reason (RunStopped).
 *   DT3 test 9   (owner half) endHeldRun's `finished` never aborts the turn.
 *   DT3 test 11  stopRunsFor: a person's runs, an organisation's runs —
 *                cancelled/session_ended, each owner aborted, no control event.
 *   DT3 test 12  an admin's cancel of a colleague's run: accepted, attributed
 *                (byUserId, byRole) and stopped as admin_cancelled; an admin's
 *                pause, resume or steer refused; another org's admin 404.
 *   DT3 test 14  stopRunInternally('server_shutdown') writes `failed`, as the
 *                reaper does; settleOwnedRunsForShutdown ends every owned run
 *                failed/server_shutdown and aborts each with that reason.
 *   The hold     holdForPerson writes the Manual hold for a follower; a resume
 *                clears it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The chained audit rows stopRunsFor writes (one per organisation), captured;
// and the admin cancel's row, written on the cancel's own transaction client
// (DT3 review, DP-82): what it saw of the run, and whether it was refused.
const audit = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  chained: [] as Array<{ entry: Record<string, any>; statusSeen: string | null }>,
  refuse: false,
}));
vi.mock('../../auditService.js', () => ({
  default: {
    logAction: async (row: Record<string, any>) => {
      audit.rows.push(row);
      return { persisted: true, chained: true, tamperProof: true };
    },
  },
  writeChainedAuditRow: async (client: { query: (t: string, p?: unknown[]) => Promise<any> }, entry: Record<string, any>) => {
    if (audit.refuse) throw new Error('the audit chain refused the row');
    const { rows } = await client.query('SELECT status FROM ana_runs WHERE id = $1', [entry.resourceId]);
    audit.chained.push({ entry, statusSeen: rows[0]?.status ?? null });
  },
}));

import {
  abortOwnedRunsForShutdown,
  applyControl,
  approvalClaimed,
  beginRun,
  claimApproval,
  releaseApprovalClaim,
  requestApproval,
  endHeldRun,
  endRun,
  holdForPerson,
  readRun,
  readRunEnding,
  recordApprovalDecision,
  reapOrphanedRuns,
  RunStopped,
  runStopDetailOf,
  runStopReasonOf,
  settleOwnedRunsForShutdown,
  stopRunInternally,
  stopRunsFor,
  _resetLocalRunsForTest,
} from '../run-control.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MIGRATION = fs.readFileSync(path.join(repoRoot, 'db', 'migrations', '20260917_ana_runs.sql'), 'utf8');

let db: PGlite;

const q = async (text: string, params?: unknown[]) => {
  const r = await db.query(text, params as any[]);
  return { rows: r.rows as any[], rowCount: (r as any).affectedRows ?? r.rows.length };
};
function pool(): any {
  return {
    query: q,
    connect: async () => ({
      query: q,
      release: () => undefined,
      on: () => {
        throw new Error('PGlite has no notifications');
      },
    }),
  };
}

const ORG = 1;
const OTHER_ORG = 2;
const ASKER = 10;
const ADMIN = 11;
const OTHER_ADMIN = 12;
const COLLEAGUE = 13;

/** A bearer token carrying a session id, as the stream hands beginRun the request's credential (never verified here). */
const tokenOf = (sid: string) => `h.${Buffer.from(JSON.stringify({ sid, userId: ASKER })).toString('base64url')}.s`;
const newRun = (over: { organizationId?: number; userId?: number | null; sid?: string } = {}) =>
  beginRun({
    pool: pool(),
    organizationId: over.organizationId ?? ORG,
    userId: over.userId === undefined ? ASKER : over.userId,
    surface: 'ana-ri-stream',
    ...(over.sid ? { sessionToken: tokenOf(over.sid) } : {}),
  });
const SIGN_OUT_EVERYWHERE = { cause: 'sign_out_everywhere', byUserId: ASKER } as const;
const row = async (runId: string, org = ORG) => (await readRun(pool(), runId, org))!;
const raw = async (runId: string) => (await q(`SELECT status, stopped_reason, hold FROM ana_runs WHERE id = $1`, [runId])).rows[0];
const control = (runId: string, action: string, userId: number, over: Record<string, unknown> = {}) =>
  applyControl({ pool: pool(), runId, organizationId: ORG, userId, action, ...over } as any);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE chat_threads (id text PRIMARY KEY, user_id integer, organization_id integer, title text);
    CREATE TABLE ana_run_events (organization_id integer, run_id text, seq integer, written_at timestamptz);
    CREATE TABLE ana_turn_records (organization_id integer, run_id text);
    INSERT INTO organizations (id) VALUES (${ORG}), (${OTHER_ORG});
    INSERT INTO users (id) VALUES (${ASKER}), (${ADMIN}), (${OTHER_ADMIN}), (${COLLEAGUE});
  `);
  await db.exec(MIGRATION);
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  _resetLocalRunsForTest();
  audit.rows = [];
  audit.chained = [];
  audit.refuse = false;
  await db.exec('DELETE FROM ana_runs;');
});

describe('DT3 test 1: a run that reached endRun stays finished', () => {
  it('the reaper never touches a finished run, however stale its heartbeat', async () => {
    const { runId } = await newRun();
    await endRun(pool(), runId, 'finished', 'no_more_tools');
    // Six minutes on, as the reaper sees it.
    await q(`UPDATE ana_runs SET heartbeat_at = now() - interval '6 minutes' WHERE id = $1`, [runId]);
    expect(await reapOrphanedRuns(pool())).toBe(0);
    expect(await raw(runId)).toMatchObject({ status: 'finished', stopped_reason: 'no_more_tools' });
  });

  it('the red variant: a detached run that never reached endRun stays running and is reaped orphaned', async () => {
    const { runId } = await newRun();
    _resetLocalRunsForTest(); // the turn went away without settling its row
    await q(`UPDATE ana_runs SET heartbeat_at = now() - interval '6 minutes' WHERE id = $1`, [runId]);
    expect(await reapOrphanedRuns(pool())).toBe(1);
    expect(await raw(runId)).toMatchObject({ status: 'failed', stopped_reason: 'orphaned' });
  });
});

describe('DT3 test 8: a reaped owner stops, and knows why', () => {
  it('a row failed/orphaned by another writer aborts its owner with RunStopped(orphaned)', async () => {
    const { runId, handle } = await newRun();
    await q(`UPDATE ana_runs SET heartbeat_at = now() - interval '6 minutes' WHERE id = $1`, [runId]);
    expect(await reapOrphanedRuns(pool())).toBe(1);
    expect(handle.cancelSignal.aborted).toBe(true);
    expect(handle.cancelSignal.reason).toBeInstanceOf(RunStopped);
    expect((handle.cancelSignal.reason as Error).name).toBe('AbortError');
    expect(runStopReasonOf(handle.cancelSignal)).toBe('orphaned');
  });
});

describe("DT3 test 9 (owner half): the owner's own finished never aborts it", () => {
  it('endHeldRun writes paused → finished and wakes the turn without aborting its closing answer', async () => {
    const { runId, handle } = await newRun();
    expect(await holdForPerson(pool(), runId, ['Search the literature'])).toBe(true);
    expect(await endHeldRun(pool(), runId)).toBe(true);
    expect(handle.cancelSignal.aborted).toBe(false);
    expect(await raw(runId)).toMatchObject({ status: 'finished', stopped_reason: 'hold_expired', hold: null });
  });
});

describe('DT3 test 11: stopRunsFor', () => {
  it("a person's runs, in every organisation: cancelled/session_ended, each owner aborted, no control event", async () => {
    const mine = await newRun();
    const mineElsewhere = await newRun({ organizationId: OTHER_ORG });
    const colleague = await newRun({ userId: COLLEAGUE });
    const stopped = await stopRunsFor(pool(), { userId: ASKER }, SIGN_OUT_EVERYWHERE);
    expect(stopped.sort()).toEqual([mine.runId, mineElsewhere.runId].sort());
    for (const r of [mine, mineElsewhere]) {
      expect(await raw(r.runId)).toMatchObject({ status: 'cancelled', stopped_reason: 'session_ended' });
      expect(runStopReasonOf(r.handle.cancelSignal)).toBe('session_ended');
    }
    expect((await row(mine.runId)).controlEvents).toEqual([]);
    expect((await raw(colleague.runId)).status).toBe('running');
    expect(colleague.handle.cancelSignal.aborted).toBe(false);
  });

  it("one session's sign-out stops that session's runs and not the person's others (DT3 review)", async () => {
    const desktop = await newRun({ sid: 'sid-desktop' });
    const phone = await newRun({ sid: 'sid-phone' });
    const stopped = await stopRunsFor(pool(), { userId: ASKER, sessionId: 'sid-desktop' }, { cause: 'sign_out', byUserId: ASKER });
    expect(stopped).toEqual([desktop.runId]);
    expect((await raw(desktop.runId)).status).toBe('cancelled');
    expect((await raw(phone.runId)).status).toBe('running');
    expect(phone.handle.cancelSignal.aborted).toBe(false);
  });

  it('writes what ended the session on the row, and aborts the owner with it (DT3 review, the session-end cause)', async () => {
    const r = await newRun({ sid: 'sid-1' });
    await stopRunsFor(pool(), { organizationId: ORG, userId: ASKER }, { cause: 'member_removed', byUserId: ADMIN });
    expect((await q(`SELECT stopped_detail, started_session_id FROM ana_runs WHERE id = $1`, [r.runId])).rows[0]).toEqual({
      stopped_detail: { cause: 'member_removed', byUserId: ADMIN },
      started_session_id: 'sid-1',
    });
    expect(runStopDetailOf(r.handle.cancelSignal)).toEqual({ cause: 'member_removed', byUserId: ADMIN });
    expect((await readRunEnding(pool(), r.runId))?.detail).toEqual({ cause: 'member_removed', byUserId: ADMIN });
  });

  it('links the act to the work in the ledger: one audit row per organisation, naming the cause, the actor and the runs', async () => {
    const here = await newRun();
    const there = await newRun({ organizationId: OTHER_ORG });
    await stopRunsFor(pool(), { userId: ASKER }, { cause: 'password_change', byUserId: ASKER });
    expect(audit.rows.map(r => [r.tenantId, r.action, r.details.cause, r.details.runIds]).sort()).toEqual(
      [
        [ORG, 'ana.runs.ended_with_session', 'password_change', [here.runId]],
        [OTHER_ORG, 'ana.runs.ended_with_session', 'password_change', [there.runId]],
      ].sort(),
    );
    expect(audit.rows.every(r => r.userId === ASKER && r.details.ownerUserId === ASKER)).toBe(true);
  });

  it('stops nothing, and writes no audit row, when no live run matched', async () => {
    await stopRunsFor(pool(), { userId: ASKER }, SIGN_OUT_EVERYWHERE);
    expect(audit.rows).toEqual([]);
  });

  it("an organisation's runs, everyone's, and no other organisation's", async () => {
    const a = await newRun();
    const b = await newRun({ userId: COLLEAGUE });
    const other = await newRun({ organizationId: OTHER_ORG });
    const stopped = await stopRunsFor(pool(), { organizationId: ORG }, { cause: 'org_suspended', byUserId: ADMIN });
    expect(stopped.sort()).toEqual([a.runId, b.runId].sort());
    expect((await raw(other.runId)).status).toBe('running');
    expect(runStopReasonOf(b.handle.cancelSignal)).toBe('session_ended');
  });

  it('a run already ended is not rewritten, and an empty scope stops nothing', async () => {
    const { runId } = await newRun();
    await endRun(pool(), runId, 'finished', 'no_more_tools');
    expect(await stopRunsFor(pool(), { userId: ASKER }, SIGN_OUT_EVERYWHERE)).toEqual([]);
    expect(await stopRunsFor(pool(), {}, SIGN_OUT_EVERYWHERE)).toEqual([]);
    // A session needs a person: alone it names nobody's runs.
    expect(await stopRunsFor(pool(), { sessionId: 'sid-a' }, SIGN_OUT_EVERYWHERE)).toEqual([]);
    expect((await raw(runId)).status).toBe('finished');
  });
});

const WHY = 'The draft is going to the wrong agency.';

describe("DT3 test 12: an admin's cancel", () => {
  it("is accepted on a colleague's run, attributed to the admin with byRole and their reason, and stops it admin_cancelled", async () => {
    const { runId, handle } = await newRun();
    const result = await control(runId, 'cancel', ADMIN, { callerIsAdmin: true, reason: WHY });
    expect(result).toMatchObject({ ok: true, status: 'cancelled', byRole: 'admin' });
    expect(await raw(runId)).toMatchObject({ status: 'cancelled', stopped_reason: 'admin_cancelled' });
    expect((await row(runId)).controlEvents).toEqual([
      expect.objectContaining({ action: 'cancel', byUserId: ADMIN, byRole: 'admin', reason: WHY }),
    ]);
    expect(runStopReasonOf(handle.cancelSignal)).toBe('admin_cancelled');
  });

  it.each([['pause'], ['resume'], ['interject']])("an admin's %s is refused: only the asker steers", async action => {
    const { runId } = await newRun();
    if (action === 'resume') await control(runId, 'pause', ASKER);
    const result = await control(runId, action, ADMIN, { callerIsAdmin: true, message: 'do this instead' });
    expect(result).toMatchObject({ ok: false, code: 'NOT_YOURS' });
  });

  it("a member who is not an admin cannot cancel a colleague's run", async () => {
    const { runId } = await newRun();
    expect(await control(runId, 'cancel', COLLEAGUE)).toMatchObject({ ok: false, code: 'NOT_YOURS' });
  });

  it("another organisation's admin gets NOT_FOUND", async () => {
    const { runId } = await newRun();
    const result = await applyControl({ pool: pool(), runId, organizationId: OTHER_ORG, userId: OTHER_ADMIN, action: 'cancel', callerIsAdmin: true });
    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect((await raw(runId)).status).toBe('running');
  });

  it("the asker's own cancel is still `cancelled`, with no byRole, no reason asked and no admin audit row", async () => {
    const { runId } = await newRun();
    const result = await control(runId, 'cancel', ASKER, { callerIsAdmin: true });
    expect(result.byRole).toBeUndefined();
    expect((await raw(runId)).stopped_reason).toBe('cancelled');
    expect(audit.chained).toEqual([]);
  });
});

/* DT3 review (DP-82, the admin-cancel gap): an administrator overriding a
   colleague is held to the repo's standard for it (membership-change.ts) — a
   stated reason, and the chained audit row written in the change's own
   transaction, so a refused row rolls the cancel back. The asker's own Stop
   is unaffected. */
describe("an admin's cancel is one transaction with its chained audit row (DT3 review)", () => {
  /** A pool whose transaction client logs every statement it is sent. */
  function loggedPool(log: string[]): any {
    const base = pool();
    return {
      ...base,
      connect: async () => ({
        query: (t: string, p?: unknown[]) => {
          log.push(t.trim().split(/\s+/)[0].toUpperCase());
          return q(t, p);
        },
        release: () => undefined,
      }),
    };
  }

  it('needs a reason: refused REASON_REQUIRED, the run goes on, and nothing is written', async () => {
    for (const reason of [undefined, '', '   ']) {
      const { runId, handle } = await newRun();
      const result = await control(runId, 'cancel', ADMIN, { callerIsAdmin: true, ...(reason === undefined ? {} : { reason }) });
      expect(result).toMatchObject({ ok: false, code: 'REASON_REQUIRED', status: 'running' });
      expect(await raw(runId)).toMatchObject({ status: 'running', stopped_reason: null });
      expect((await row(runId)).controlEvents).toEqual([]);
      expect(handle.cancelSignal.aborted).toBe(false);
      await endRun(pool(), runId, 'finished', 'no_more_tools');
    }
    expect(audit.chained).toEqual([]);
  });

  it('writes the chained row inside the cancel: who, whose run, which conversation, and why', async () => {
    const log: string[] = [];
    await q(`INSERT INTO chat_threads (id, user_id, organization_id, title) VALUES ('thr-a', $1, $2, 't')`, [ASKER, ORG]);
    const { runId } = await beginRun({ pool: pool(), organizationId: ORG, userId: ASKER, surface: 'ana-ri-stream', threadId: 'thr-a' });
    const result = await applyControl({
      pool: loggedPool(log), runId, organizationId: ORG, userId: ADMIN, action: 'cancel', callerIsAdmin: true,
      reason: `  ${WHY}  `, requestMeta: { ipAddress: '10.0.0.9', userAgent: 'vitest' },
    } as any);
    expect(result).toMatchObject({ ok: true, status: 'cancelled', byRole: 'admin' });
    expect(audit.chained).toHaveLength(1);
    const { entry, statusSeen } = audit.chained[0];
    // Written after the run's UPDATE, on the same transaction client.
    expect(statusSeen).toBe('cancelled');
    expect(log).toEqual(['BEGIN', 'UPDATE', 'SELECT', 'COMMIT']);
    expect(entry).toMatchObject({
      tenantId: ORG,
      userId: ADMIN,
      action: 'ana.run.admin_cancelled',
      resourceType: 'ana_run',
      resourceId: runId,
      reason: WHY,
      ipAddress: '10.0.0.9',
      userAgent: 'vitest',
      details: { runId, byRole: 'admin', stoppedReason: 'admin_cancelled', ownerUserId: ASKER, threadId: 'thr-a', reason: WHY },
    });
    await q(`DELETE FROM chat_threads WHERE id = 'thr-a'`);
  });

  it('a refused audit row rolls the cancel back: AUDIT_REFUSED, the run still running, no abort, no control event', async () => {
    const log: string[] = [];
    const { runId, handle } = await newRun();
    audit.refuse = true;
    const result = await applyControl({
      pool: loggedPool(log), runId, organizationId: ORG, userId: ADMIN, action: 'cancel', callerIsAdmin: true, reason: WHY,
    } as any);
    expect(result).toMatchObject({ ok: false, code: 'AUDIT_REFUSED', status: 'running' });
    expect(log).toEqual(['BEGIN', 'UPDATE', 'ROLLBACK']);
    expect(await raw(runId)).toMatchObject({ status: 'running', stopped_reason: null });
    expect((await row(runId)).controlEvents).toEqual([]);
    expect(handle.cancelSignal.aborted).toBe(false);
  });
});

describe('DT3 test 14: shutdown', () => {
  it("stopRunInternally('server_shutdown') writes failed, as the reaper does, and aborts with the reason", async () => {
    const { runId, handle } = await newRun();
    await stopRunInternally(pool(), runId, 'server_shutdown', ORG);
    expect(await raw(runId)).toMatchObject({ status: 'failed', stopped_reason: 'server_shutdown' });
    expect(runStopReasonOf(handle.cancelSignal)).toBe('server_shutdown');
  });

  it("stopRunInternally('session_ended') writes cancelled; client_disconnected stays cancelled", async () => {
    const a = await newRun();
    const b = await newRun({ userId: COLLEAGUE });
    await stopRunInternally(pool(), a.runId, 'session_ended', ORG);
    await stopRunInternally(pool(), b.runId, 'client_disconnected', ORG);
    expect(await raw(a.runId)).toMatchObject({ status: 'cancelled', stopped_reason: 'session_ended' });
    expect(await raw(b.runId)).toMatchObject({ status: 'cancelled', stopped_reason: 'client_disconnected' });
    expect(runStopReasonOf(b.handle.cancelSignal)).toBe('client_disconnected');
  });

  it('settleOwnedRunsForShutdown ends every owned live run failed/server_shutdown, in each org, and aborts each', async () => {
    const a = await newRun();
    const b = await newRun({ organizationId: OTHER_ORG });
    const done = await newRun({ userId: COLLEAGUE });
    await endRun(pool(), done.runId, 'finished', 'no_more_tools'); // released: not owned any more
    const ended = await settleOwnedRunsForShutdown(pool());
    expect(ended.sort()).toEqual([a.runId, b.runId].sort());
    for (const r of [a, b]) {
      expect(await raw(r.runId)).toMatchObject({ status: 'failed', stopped_reason: 'server_shutdown' });
      expect(runStopReasonOf(r.handle.cancelSignal)).toBe('server_shutdown');
    }
    expect((await raw(done.runId)).status).toBe('finished');
  });
});

describe('endRun says which writer ended the row (DT3 review, Part 11)', () => {
  it("'ended' when its write ended the run; readRunEnding has nothing to report", async () => {
    const { runId } = await newRun();
    expect(await endRun(pool(), runId, 'finished', 'no_more_tools')).toBe('ended');
    expect(await readRunEnding(pool(), runId)).toBeNull();
  });

  it.each([
    ['a shutdown', (id: string) => stopRunInternally(pool(), id, 'server_shutdown', ORG), 'server_shutdown'],
    ["an admin's cancel", (id: string) => control(id, 'cancel', ADMIN, { callerIsAdmin: true, reason: WHY }), 'admin_cancelled'],
    ["the session's end", () => stopRunsFor(pool(), { userId: ASKER }, SIGN_OUT_EVERYWHERE), 'session_ended'],
  ])("'already_ended' after %s, and readRunEnding returns the row's reason", async (_name, stop, reason) => {
    const { runId } = await newRun();
    await stop(runId);
    expect(await endRun(pool(), runId, 'finished', 'no_more_tools')).toBe('already_ended');
    expect((await readRunEnding(pool(), runId))?.stoppedReason).toBe(reason);
    expect((await raw(runId)).stopped_reason).toBe(reason);
  });
});

describe('the hold, for a follower', () => {
  it("holdForPerson writes { reason: 'manual', next }; the person's resume clears it", async () => {
    const { runId } = await newRun();
    await holdForPerson(pool(), runId, ['Search the literature']);
    expect((await raw(runId)).hold).toEqual({ reason: 'manual', next: ['Search the literature'] });
    await control(runId, 'resume', ASKER);
    expect(await raw(runId)).toMatchObject({ status: 'running', hold: null });
  });

  it('a steer that answers the hold clears it too', async () => {
    const { runId } = await newRun();
    await holdForPerson(pool(), runId, ['Search the literature']);
    await control(runId, 'interject', ASKER, { message: 'Read the protocol instead' });
    expect(await raw(runId)).toMatchObject({ status: 'running', hold: null });
  });
});

/* DT3 review (finding 4.3): a governed action could execute after its run had
   ended — a stop while the person was signing — and the turn's record then
   said it "did not run". The governed-action route now claims the held
   approval atomically, before its sign-off and execution, on a run still
   awaiting it; a run that ended refuses the claim and nothing is executed. */
describe('claimApproval: the held approval is claimed once, on a run still waiting (DT3 review)', () => {
  const HELD = { toolUseId: 'tu_save', command: 'save_document_to_vault', params: { title: 'Plan' }, tier: 'reason' as const, requestedAt: '2026-10-22T10:00:00.000Z' };
  async function held() {
    const { runId, handle } = await newRun();
    expect(await requestApproval(pool(), runId, HELD as never)).toBe(true);
    return { runId, handle };
  }

  it('claims once; a second claim is refused as already claimed', async () => {
    const { runId } = await held();
    expect(await approvalClaimed(pool(), runId, 'tu_save')).toBe(false);
    expect(await claimApproval(pool(), runId, ORG, ASKER, 'tu_save')).toBe('claimed');
    expect(await approvalClaimed(pool(), runId, 'tu_save')).toBe(true);
    expect(await claimApproval(pool(), runId, ORG, ASKER, 'tu_save')).toBe('already_claimed');
  });

  it.each([
    ["an admin's cancel", (id: string) => control(id, 'cancel', ADMIN, { callerIsAdmin: true, reason: WHY })],
    ["the session's end", () => stopRunsFor(pool(), { userId: ASKER }, SIGN_OUT_EVERYWHERE)],
    ['a shutdown', (id: string) => stopRunInternally(pool(), id, 'server_shutdown', ORG)],
  ])('a run %s ended while the person signed: not_waiting, and nothing is claimed', async (_name, stop) => {
    const { runId } = await held();
    await stop(runId);
    expect(await claimApproval(pool(), runId, ORG, ASKER, 'tu_save')).toBe('not_waiting');
    expect(await approvalClaimed(pool(), runId, 'tu_save')).toBe(false);
  });

  it("only the asker's, in the run's organisation, for the step held", async () => {
    const { runId } = await held();
    expect(await claimApproval(pool(), runId, ORG, COLLEAGUE, 'tu_save')).toBe('not_waiting');
    expect(await claimApproval(pool(), runId, OTHER_ORG, ASKER, 'tu_save')).toBe('not_waiting');
    expect(await claimApproval(pool(), runId, ORG, ASKER, 'tu_other')).toBe('not_waiting');
  });

  const decisionRow = async (runId: string) =>
    (await q(`SELECT status, approval_decision FROM ana_runs WHERE id = $1`, [runId])).rows[0];

  // The approval window closing is the waiting turn's own deny. It used to
  // match a claimed approval too, so the turn recorded "nobody authorised
  // this, so it did not run" while the person's action was being carried out.
  it("the approval window closing does not deny an approval its person has claimed; the person's decision still lands", async () => {
    const { runId } = await held();
    expect(await claimApproval(pool(), runId, ORG, ASKER, 'tu_save')).toBe('claimed');
    const windowClosed = await recordApprovalDecision(pool(), runId, ORG, {
      toolUseId: 'tu_save', decided: 'denied', decidedAt: new Date().toISOString(), byUserId: null, error: 'no decision within the approval window',
    });
    expect(windowClosed).toBe(false);
    expect(await decisionRow(runId)).toMatchObject({ status: 'awaiting_approval', approval_decision: null });
    const decided = await recordApprovalDecision(pool(), runId, ORG, {
      toolUseId: 'tu_save', decided: 'approved', decidedAt: new Date().toISOString(), byUserId: ASKER, result: { success: true },
    });
    expect(decided).toBe(true);
    expect(await decisionRow(runId)).toMatchObject({ status: 'running', approval_decision: expect.objectContaining({ decided: 'approved', byUserId: ASKER }) });
  });

  it('an approval nobody claimed is still denied when the window closes', async () => {
    const { runId } = await held();
    expect(
      await recordApprovalDecision(pool(), runId, ORG, {
        toolUseId: 'tu_save', decided: 'denied', decidedAt: new Date().toISOString(), byUserId: null, error: 'no decision within the approval window',
      }),
    ).toBe(true);
    expect(await decisionRow(runId)).toMatchObject({ status: 'running', approval_decision: expect.objectContaining({ decided: 'denied', byUserId: null }) });
  });

  it('a claim released (the sign-off row was refused) can be claimed again', async () => {
    const { runId } = await held();
    expect(await claimApproval(pool(), runId, ORG, ASKER, 'tu_save')).toBe('claimed');
    await releaseApprovalClaim(pool(), runId, ORG, 'tu_save');
    expect(await approvalClaimed(pool(), runId, 'tu_save')).toBe(false);
    expect(await claimApproval(pool(), runId, ORG, ASKER, 'tu_save')).toBe('claimed');
  });
});

/* DT3 review (INF-41): past the shutdown's deadline for its writes, every
   owned turn is stopped locally anyway, writing nothing; the reaper ends the
   rows it left live. */
describe('abortOwnedRunsForShutdown (DT3 review)', () => {
  it('stops every owned turn with server_shutdown, writes nothing, and counts each once', async () => {
    const a = await newRun();
    const b = await newRun({ userId: COLLEAGUE });
    expect(abortOwnedRunsForShutdown()).toBe(2);
    expect(runStopReasonOf(a.handle.cancelSignal)).toBe('server_shutdown');
    expect(runStopReasonOf(b.handle.cancelSignal)).toBe('server_shutdown');
    expect((await raw(a.runId)).status).toBe('running');
    expect(abortOwnedRunsForShutdown()).toBe(0);
  });
});
