/**
 * A turn whose page closed, through the real stream route (AnA detach DT3,
 * docs/design/ANA_DETACH_2026-10-08.md §2.1, §2.4, §2.6, §2.7, §2.9, §5.5).
 *
 * The page "closes" inside the first model call: the response is destroyed
 * and its 'close' is awaited before the call returns, so everything after
 * runs detached — the way a phone locking mid-turn leaves it. The route's
 * seams are the harness's (support/stream-route-harness.ts); the loop, the
 * checkpoint, the hold, the approval gate, the turn policy, the unattended
 * clock and the recorder are real. What is read: the run's ending (endRun),
 * the internal stops the route asked for, what post-processing was handed,
 * and the sealed record.
 *
 *   DT3 test 10  the unattended limit: 15 minutes unwatched ends the turn
 *                with a closing answer; a watch moves it; 40 minutes from the
 *                start ends it as budget_exhausted whatever the watching.
 *   DT3 test 11  a session or organisation that ended stops the turn at its
 *                next round boundary; a check that cannot be read stops it.
 *   DT3 test 13  holds and approvals while nobody watches: Manual
 *                hold_expired; no-policy denial and the turn goes on; Auto
 *                approval_timeout — as attached, never "lost its connection".
 *   DT3 test 14  the row's reason wins: a shutdown mid-call, and one that
 *                lands as the last call returns, record stopped/server_shutdown.
 *   DT4 (merged) the notice: only for a detached, unwatched turn.
 *
 * The DT3 review's fixes (D-7, the ceiling, the stop that landed first, the
 * row stopped by another writer, the follower's approval) are in
 * stream-detach-review.test.ts.
 */
import type { Response } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnOutcome, TurnRecordBody } from '../../../services/ana/turn-record.js';

const io = vi.hoisted(() => ({
  baseGateway: null as null | ((request: unknown) => Promise<unknown>),
  response: null as Response | null,
  /** Called inside each model call, by number from 1 (the first call closes the page). */
  duringCall: null as null | ((call: number) => void | Promise<void>),
  calls: 0,
  records: [] as Array<{ outcome: TurnOutcome; body: TurnRecordBody | undefined }>,
  notices: [] as Array<Record<string, unknown>>,
  /** The round's result bodies exceed the strict handoff limit (7780de83f): the turn fails mid-loop. */
  budgetExceeded: false,
}));
vi.mock('../../../services/ana/agentic-loop.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/agentic-loop.js')>();
  return {
    ...real,
    budgetToolResultsForModel: (...args: Parameters<typeof real.budgetToolResultsForModel>) => {
      if (io.budgetExceeded) throw new real.ToolResultBudgetExceededError();
      return real.budgetToolResultsForModel(...args);
    },
  };
});
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async importOriginal => {
  const shared = (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>());
  const gateway = shared.ensureGateway();
  io.baseGateway = gateway.route;
  return {
    ...shared,
    ensureGateway: () => ({
      ...gateway,
      route: async (request: unknown) => {
        io.calls++;
        await io.duringCall?.(io.calls);
        return io.baseGateway!(request);
      },
    }),
  };
});
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async importOriginal =>
  (await harnessModule()).mocks.runControl(await importOriginal<typeof import('../../../services/ana/run-control.js')>()),
);
vi.mock('../../../services/ana/turn-record.js', async importOriginal => {
  const original = await importOriginal<typeof import('../../../services/ana/turn-record.js')>();
  return {
    ...original,
    writeTurnRecordSafely: async (...args: Parameters<typeof original.writeTurnRecordSafely>) => {
      const [, recorder, outcome] = args;
      io.records.push({ outcome, body: recorder?.seal(outcome).body });
      return { status: 'not_recorded', reason: 'This test captures the sealed record without persistence.' };
    },
  };
});
vi.mock('../../../services/notifications/notification-service.js', () => ({
  createNotification: async (input: Record<string, unknown>) => {
    io.notices.push(input);
    return io.notices.length;
  },
}));
vi.mock('../../../services/ana-ri/orchestrator.js', async () => (await harnessModule()).mocks.orchestrator());
vi.mock('../../../services/ana-ri/chat-context-builder.js', async importOriginal =>
  (await harnessModule()).mocks.chatContextBuilder(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../../services/lumen-context-builder.js', async () => (await harnessModule()).mocks.lumen());
vi.mock('../../../services/memory-context-assembler.js', async () => (await harnessModule()).mocks.memory());
vi.mock('../../../services/ana-ri/context-enrichment.js', async () => (await harnessModule()).mocks.enrichment());
vi.mock('../../../services/chat-thread-helpers.js', async () => (await harnessModule()).mocks.chatThreads());
vi.mock('../../../services/ana-session-bootstrap.js', async () => (await harnessModule()).mocks.sessionBootstrap());
vi.mock('../../../services/kernel-adaptive-policy.js', async () => (await harnessModule()).mocks.kernelPolicy());
vi.mock('../../../services/ana/ana-input-guard.js', async () => (await harnessModule()).mocks.inputGuard());
vi.mock('../../../services/auditService.js', async () => (await harnessModule()).mocks.audit());
vi.mock('../../../services/toolRegistry.js', async () => (await harnessModule()).mocks.toolRegistry());
vi.mock('../../../services/ana-ri/relational-profile-service.js', async () => (await harnessModule()).mocks.relationalProfile());
vi.mock('../../../services/ana/tool-telemetry.js', async () => (await harnessModule()).mocks.toolTelemetry());
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());

import { mountStreamRoute } from '../stream.js';
import { MAX_PAUSE_MS } from '../../../services/ana/run-status.js';
import { DETACHED_WALL_MS, UNATTENDED_MS } from '@shared/ana/run-detach';
import { harness as h, resetHarness, streamApp, turn, type ToolUse } from './support/stream-route-harness.js';

const app = streamApp(router => {
  router.use((_req, res, next) => {
    io.response = res;
    next();
  });
  mountStreamRoute(router);
});

const screens = (id = 'tu_1'): ToolUse => ({ id, name: 'list_app_screens', input: {} });
const pubmed: ToolUse = { id: 'tu_2', name: 'search_literature', input: { query: 'endpoint' } };
const save: ToolUse = { id: 'tu_s', name: 'save_document_to_vault', input: { title: 'Plan', content: 'x' } };

/** Close the page inside the first model call, and wait for the route to see it. */
async function closePage(): Promise<void> {
  const res = io.response!;
  const closed = new Promise<void>(resolve => res.once('close', () => resolve()));
  res.destroy();
  await closed;
}

/** One turn whose page closes during its first model call; resolves once the run has ended. */
async function detachedTurn(body: Record<string, unknown> = {}, after?: (call: number) => void | Promise<void>) {
  io.duringCall = async call => {
    if (call === 1) await closePage();
    await after?.(call);
  };
  await turn(app, { message: 'Compare the endpoints of the two pivotal studies', ...body }).catch(() => undefined);
  await vi.waitFor(() => expect(h.state.endRuns.length + io.records.length).toBeGreaterThan(0));
  // The notice (if any) is sent after endRun, without being awaited.
  await new Promise(resolve => setTimeout(resolve, 10));
}

const answered = () => h.state.post.turnRecorder.seal('answered').body as TurnRecordBody;

const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});
beforeEach(() => {
  resetHarness();
  Object.assign(io, { response: null, duringCall: null, calls: 0, records: [], notices: [], budgetExceeded: false });
  const realNow = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + h.state.clockOffset);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe("a detached turn keeps its request's tenant connection (blocking review finding, 14362ef00)", () => {
  /* Since 14362ef00 every tool, the round's document-title lookup and context
     assembly read through the request's pinned, tenant-scoped client
     (requestPgClient(req)), and the auth boundary releases that client on the
     response's 'close'. A detached turn's next round must still have it: the
     turn holds the client (db/requestDbLease.ts) until it and its
     post-processing end. */
  it("the round after the page closed reads on the request's client, and the client is released once, after the turn", async () => {
    const reads: string[] = [];
    const searchLiterature = h.handlers.search_literature;
    // A read step (no person needed) that reads the way a source tool does:
    // on the tool context's sqlClient, the request's pinned client.
    h.handlers.search_literature = async (_input: unknown, ctx?: { sqlClient?: { query(sql: string): Promise<unknown> } }) => {
      h.state.handlerCalls.search_literature = (h.state.handlerCalls.search_literature ?? 0) + 1;
      await ctx!.sqlClient!.query('SELECT 1 AS tool_read');
      reads.push(`released=${h.state.requestClientReleases}`);
      return JSON.stringify({ totalMatches: 1, results: [] });
    };
    try {
      h.state.script = [[screens()], [pubmed], 'Compared.'];
      await detachedTurn();
      expect(h.state.detachStamps, 'the page did not close mid-turn').toHaveLength(1);
      expect(h.state.requestClientRefusals, 'a query reached a released request client').toBe(0);
      expect(reads, 'the tool after the close did not read on the request client').toEqual(['released=0']);
      expect(h.state.endRuns).toEqual([{ status: 'finished', stoppedReason: 'no_more_tools' }]);
      await vi.waitFor(() => expect(h.state.requestClientReleases).toBe(1));
    } finally {
      h.handlers.search_literature = searchLiterature;
    }
  });
});

describe('a step a server-side stop ended is not credited to the person (5d8e60f3e)', () => {
  it.each([
    ['server_shutdown', /was ended because the server restarted for an update\./],
    ['session_ended', /was ended because the sign-in or access that started this turn ended\./],
    ['admin_cancelled', /was ended because an administrator stopped the turn\./],
    ['unattended_limit', /was ended because nobody was watching for 15 minutes\./],
  ])('a step in flight when the row stops the turn (%s) says what ended it, never "You stopped"', async (reason, line) => {
    const searchLiterature = h.handlers.search_literature;
    // The step is running when the row's stop lands; it never answers.
    h.handlers.search_literature = () => {
      h.state.stop!(reason);
      return new Promise<string>(() => {});
    };
    try {
      h.state.script = [[pubmed], 'never reached'];
      const events = await turn(app, { message: 'Compare the endpoints' });
      const result = events.find(e => e.type === 'tool_result' && e.name === 'search_literature');
      expect(result?.status).toBe('cancelled');
      expect(String(result?.message)).toMatch(line);
      expect(String(result?.message)).not.toMatch(/^You stopped/);
    } finally {
      h.handlers.search_literature = searchLiterature;
    }
  });

  it("a person's own Stop still says they stopped it", async () => {
    const searchLiterature = h.handlers.search_literature;
    h.handlers.search_literature = () => {
      h.state.cancel!();
      return new Promise<string>(() => {});
    };
    try {
      h.state.script = [[pubmed], 'never reached'];
      const events = await turn(app, { message: 'Compare the endpoints' });
      const result = events.find(e => e.type === 'tool_result' && e.name === 'search_literature');
      expect(String(result?.message)).toMatch(/^You stopped /);
    } finally {
      h.handlers.search_literature = searchLiterature;
    }
  });
});

describe("a page still attached when the run row stops its turn mid-call (found in the DT3 browser acceptance)", () => {
  // The row's stop aborts the model call, so the turn unwinds through the
  // error path. That path told the page "An error occurred while generating
  // the response" for a turn that was stopped, not failed — the admin's
  // cancel read as an outage. It now closes like any stop: `done` with the
  // row's reason, then `post_done` with the record.
  it.each(['admin_cancelled', 'server_shutdown', 'session_ended'])('%s: done with the reason and post_done with the record, never an error frame', async reason => {
    h.state.script = [[screens()], 'never reached'];
    io.duringCall = call => {
      if (call === 2) {
        h.state.stop!(reason);
        throw Object.assign(new Error('Provider generation aborted.'), { name: 'AbortError' });
      }
    };
    const events = await turn(app, { message: 'Compare the endpoints of the two pivotal studies' });
    expect(events.filter(e => e.type === 'error'), 'a stop reached the page as an error').toEqual([]);
    expect(events.find(e => e.type === 'done')?.stoppedReason).toBe(reason);
    expect(events.at(-1)?.type).toBe('post_done');
  });
});

describe('a detached turn that fails mid-loop still ends, and is recorded (7780de83f)', () => {
  it('the strict round-body limit refuses the round: the run ends failed, the record is filed failed, and the person is told', async () => {
    h.state.script = [[screens()], 'never reached'];
    await detachedTurn({}, call => {
      // The page closed in call 1; the round's results then exceed the limit.
      if (call === 1) io.budgetExceeded = true;
    });
    expect(h.state.detachStamps).toHaveLength(1);
    expect(h.state.endRuns).toEqual([{ status: 'failed', stoppedReason: 'error' }]);
    expect(io.records.map(r => r.outcome)).toEqual(['failed']);
    expect(io.records[0].body!.warnings.join(' ')).toMatch(/could not be passed to the assistant within its result limit/);
    expect(io.notices.map(n => n.title)).toEqual(['AnA stopped: the turn ended with an error']);
    expect(h.state.requests, 'a model call after the refused round').toHaveLength(1);
  });
});

describe('DT3 test 10: the unattended limit', () => {
  it('15 minutes with nobody watching: the next model call is the closing answer, and the run ends unattended_limit', async () => {
    h.state.script = [[screens()], [pubmed], 'Compared.', 'Closing answer.'];
    await detachedTurn({}, call => {
      // The page is gone and nobody opens it: time passes inside the call.
      if (call === 1) h.state.clockOffset += UNATTENDED_MS + 1_000;
    });
    expect(h.state.detachStamps).toHaveLength(1);
    expect(h.state.requests[1].toolChoice, 'the second call still offered tools').toBe('none');
    expect(h.state.handlerCalls.search_literature).toBeUndefined();
    expect(h.state.post.stoppedReason).toBe('unattended_limit');
    expect(h.state.post.stopped).toBe(false);
    expect(h.state.endRuns).toEqual([{ status: 'finished', stoppedReason: 'unattended_limit' }]);
    const warnings = answered().warnings.join(' ');
    expect(warnings).toMatch(/The page closed at .*Unattended limit: stops after 15 minutes with nobody watching/);
    expect(warnings).toMatch(/nobody watched it for 15 minutes, so AnA stopped/);
  });

  it('a watch moves the clock: watched at 10 minutes, the turn is still going at 16', async () => {
    h.state.script = [[screens()], [pubmed], 'Compared.'];
    await detachedTurn({}, call => {
      if (call === 1) {
        h.state.lastWatched = Date.now() + 10 * 60_000;
        h.state.clockOffset += 16 * 60_000;
      }
    });
    expect(h.state.handlerCalls.search_literature).toBe(1);
    expect(h.state.endRuns).toEqual([{ status: 'finished', stoppedReason: 'no_more_tools' }]);
  });

  it('40 minutes from the start ends it as budget_exhausted, whatever the watching', async () => {
    h.state.script = [[screens()], [pubmed], 'Compared.', 'Closing answer.'];
    await detachedTurn({}, call => {
      if (call === 1) {
        h.state.clockOffset += DETACHED_WALL_MS + 60_000;
        h.state.lastWatched = Date.now() - 1_000; // watched a second ago
      }
    });
    expect(h.state.requests[1].toolChoice).toBe('none');
    expect(h.state.endRuns).toEqual([{ status: 'finished', stoppedReason: 'budget_exhausted' }]);
  });
});

describe('DT3 test 11: a session that ended stops the turn at its next round boundary', () => {
  it.each([
    ['the session ended', 'session_ended' as const],
    ['the standing could not be read (fails closed)', 'throws' as const],
  ])('%s: stopped as session_ended, and the record says so', async (_name, second) => {
    h.state.script = [[screens()], [pubmed], 'Compared.'];
    h.state.standing = [null, second];
    await detachedTurn();
    expect(h.state.standingChecks).toBe(2);
    expect(h.state.internalStops).toEqual(['session_ended']);
    expect(h.state.handlerCalls.search_literature, 'a round ran after the session ended').toBeUndefined();
    expect(h.state.post.stopped).toBe(true);
    expect(h.state.post.stoppedReason).toBe('session_ended');
  });

  /* DT3 review (DP-83): the record names what the check found, not
     always "the session ended" — here an organisation gone read-only. */
  it('the record names the cause the check found: an organisation that can no longer run work', async () => {
    h.state.script = [[screens()], [pubmed], 'Compared.'];
    h.state.standing = [null, { reason: 'session_ended', detail: { cause: 'org_unavailable' } }];
    await detachedTurn();
    expect(h.state.internalStops).toEqual(['session_ended']);
    // Filed as post-processing files it.
    await h.state.post.fileTurnRecord('stopped');
    const warnings = io.records.at(-1)!.body!.warnings.join(' ');
    expect(warnings).toContain('The session ended because the organisation can no longer run work in the background');
    expect(warnings).not.toContain('the person signed out');
  });

  /* DT3 review (IAM-35): a turn whose run row could not be opened has no row
     to stop, but its person's standing is still checked at each round
     boundary, and an ended one stops the turn (fail closed). */
  it('a turn with no run row is re-checked too, and stopped when its standing ended', async () => {
    h.state.beginRunThrows = true;
    h.state.localStanding = [null, 'session_ended'];
    h.state.script = [[screens()], [pubmed], 'Compared.'];
    await turn(app, { message: 'Compare the endpoints' });
    expect(h.state.standingChecks).toBe(2);
    expect(h.state.localAborts).toEqual(['session_ended']);
    expect(h.state.handlerCalls.search_literature, 'a round ran after the standing ended').toBeUndefined();
    expect(h.state.post.stopped).toBe(true);
    expect(h.state.post.stoppedReason).toBe('session_ended');
  });

  it('a standing session goes on', async () => {
    h.state.script = [[screens()], [pubmed], 'Compared.'];
    h.state.standing = [null];
    await detachedTurn();
    expect(h.state.internalStops).toEqual([]);
    expect(h.state.endRuns).toEqual([{ status: 'finished', stoppedReason: 'no_more_tools' }]);
  });
});

describe('DT3 test 14: the row reason wins', () => {
  it('a shutdown mid-call: stopped/server_shutdown, never answered, with the reason on the record', async () => {
    h.state.script = [[screens()], 'never reached'];
    await detachedTurn({}, call => {
      if (call === 2) {
        h.state.stop!('server_shutdown');
        throw Object.assign(new Error('Provider generation aborted.'), { name: 'AbortError' });
      }
    });
    expect(io.records).toHaveLength(1);
    expect(io.records[0].outcome).toBe('stopped');
    const end = (io.records[0].body!.timeline ?? []).find(e => e.kind === 'end') as { stoppedReason: string | null } | undefined;
    expect(end?.stoppedReason).toBe('server_shutdown');
    expect(io.records[0].body!.warnings.join(' ')).toMatch(/server restarted for an update/);
  });

  it('a shutdown that lands as the last call returns: post-processing files it stopped/server_shutdown', async () => {
    h.state.script = [[screens()], 'Compared.'];
    await detachedTurn({}, call => {
      if (call === 2) h.state.stop!('server_shutdown');
    });
    expect(h.state.post.stopped).toBe(true);
    expect(h.state.post.stoppedReason).toBe('server_shutdown');
  });
});

describe('DT3 test 13: holds and approvals while nobody watches, as attached', () => {
  it('Manual: a hold nobody answers ends hold_expired, never "lost its connection"', async () => {
    h.state.script = [[screens()], [pubmed], 'Compared.'];
    h.state.afterManualHold = ['paused'];
    await detachedTurn({ run_policy: 'manual' });
    expect(h.state.endHeldCalls).toBe(1);
    expect(h.state.clockOffset).toBeGreaterThanOrEqual(MAX_PAUSE_MS);
    expect(h.state.internalStops).toEqual([]);
    expect(h.state.post.stoppedReason).toBe('hold_expired');
    expect(h.state.endRuns).toEqual([{ status: 'finished', stoppedReason: 'hold_expired' }]);
  });

  it('no policy: an approval nobody answers is denied and the turn goes on', async () => {
    h.state.script = [[save], 'Nothing was saved.'];
    h.state.approvalOpens = true;
    await detachedTurn();
    expect(h.state.handlerCalls.save_document_to_vault).toBeUndefined();
    expect(h.state.approvalDecisionsRecorded).toBe(1);
    expect(h.state.internalStops).toEqual([]);
    expect(h.state.post.stoppedReason).toBe('no_more_tools');
  });

  it('Auto: an approval nobody answers ends the turn approval_timeout', async () => {
    h.state.script = [[save], 'Nothing was saved.'];
    h.state.approvalOpens = true;
    await detachedTurn({ run_policy: 'auto' });
    expect(h.state.internalStops).toEqual([]);
    expect(h.state.post.stoppedReason).toBe('approval_timeout');
  });
});

describe('the notice (§5.5): a detached turn nobody watches tells its person', () => {
  // Named by its title, or by when it started: never the question's words (DT3 review, DP-84).
  it('ends: one notice to the asker, naming the conversation by when it started, linking to it, and expiring', async () => {
    h.state.script = [[screens()], 'Compared.'];
    await detachedTurn();
    expect(io.notices).toHaveLength(1);
    expect(io.notices[0]).toMatchObject({
      organizationId: 7,
      recipientUserId: 3,
      category: 'ana_turn',
      severity: 'info',
      title: 'AnA finished your request',
      // The record the canonical notification door resolves (and checks is
      // the recipient's own); the address is a label hint only.
      resourceType: 'chat_thread',
      resourceId: 'thread-1',
      actionUrl: '/concept2cure/conversation-thread/thread-1',
    });
    expect(String(io.notices[0].body)).toMatch(/^Your conversation started at \d\d:\d\d UTC$/);
    expect(String(io.notices[0].body)).not.toContain('Compare the endpoints');
    expect(io.notices[0].expiresAt).toBeInstanceOf(Date);
  });

  it('a step not authorised is said in the finished notice', async () => {
    h.state.script = [[save], 'Nothing was saved.'];
    h.state.approvalOpens = true;
    await detachedTurn();
    const ended = io.notices.find(n => n.title === 'AnA finished your request');
    expect(String(ended?.body)).toMatch(/· 1 step was not authorised and did not run\.$/);
  });

  it('an approval while nobody watches: one warning, with no parameters and no ids in its words', async () => {
    h.state.script = [[save], 'Nothing was saved.'];
    h.state.approvalOpens = true;
    await detachedTurn();
    const waiting = io.notices.filter(n => n.title === 'AnA is waiting for your approval');
    expect(waiting).toHaveLength(1);
    expect(waiting[0].severity).toBe('warning');
    expect(String(waiting[0].body)).not.toMatch(/Plan|tu_s|save_document|run_test/);
  });

  it('a stop says why: "AnA stopped: the server restarted for an update"', async () => {
    h.state.script = [[screens()], 'Compared.'];
    await detachedTurn({}, call => {
      if (call === 2) h.state.stop!('server_shutdown');
    });
    expect(io.notices.map(n => n.title)).toEqual(['AnA stopped: the server restarted for an update']);
  });

  it('a watched turn sends none', async () => {
    h.state.script = [[screens()], 'Compared.'];
    await detachedTurn({}, () => {
      h.state.lastWatched = Date.now();
    });
    expect(io.notices).toEqual([]);
  });

  it("a watch stamped after the clock's last read, before the end, sends none (DT3 review, product)", async () => {
    /* The clock reads the stamp at the detach and at each round boundary, and
       is stopped when the turn ends, so its refresh is then a no-op. A person
       whose phone's poll stamped the run during the closing answer was
       watching it finish, and must not get "AnA finished your request". */
    h.state.script = [[screens()], 'Compared.'];
    await detachedTurn({}, call => {
      if (call === 2) h.state.lastWatched = Date.now();
    });
    expect(h.state.detachStamps).toHaveLength(1);
    expect(io.notices.map(n => n.title)).toEqual([]);
  });

  it('a turn whose page stayed open sends none', async () => {
    h.state.script = [[screens()], 'Compared.'];
    await turn(app, { message: 'Compare the endpoints' });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(io.notices).toEqual([]);
  });
});
