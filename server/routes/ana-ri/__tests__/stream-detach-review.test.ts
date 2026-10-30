/**
 * A turn whose page closed, through the real stream route: the fixes of the
 * AnA detach DT3 review (docs/design/ANA_DETACH_2026-10-08.md §9 D-7, §12.6).
 * The same harness and the same closed page as stream-detach.test.ts, whose
 * preamble this repeats (vi.mock calls are hoisted per test file).
 *
 *   D-7 (2026-10-22)   a Live Drive turn detaches; a screen action after the
 *                      close is refused, never run, and listed as not run.
 *   INF-40             the ceiling on turns that go on after their page closed.
 *   product            a stop that landed before the close is not a detach.
 *   Part 11            the row stopped by another writer: its reason wins,
 *                      with the cause the session check found (DP-83).
 *   4.1                the follower's approval is the attached frame.
 *   4.3                a run stopped while its approved action was carried out.
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
import { approvalRequiredEnvelope } from '../../../services/ana-ri/part11-governance.js';
import {
  MAX_DETACHED_PER_ORGANISATION,
  _resetDetachSlotsForTest,
  claimDetachSlot,
  detachedCount,
} from '../../../services/ana/detach-slots.js';
import { harness as h, resetHarness, streamApp, turn, type ToolUse } from './support/stream-route-harness.js';
import { MAX_PAUSE_MS } from '@shared/ana/run-control-limits';

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

/* Founder decision, 2026-10-22 (coordinator, under the founder's delegation),
   replacing D-7. Live Drive has been on by default since 9db931c56, so every
   default turn sent live_drive: true and, by the old D-7, never detached. Now
   a Live Drive turn detaches like any other when its page closes. From that
   moment AnA stops driving the screen: a further screen action (navigate_to,
   act_on_screen, start_product_demo) is refused, never queued, never run on a
   page that is gone, and listed as a step that did not run with the line
   below. The rest of the turn's work continues. */
describe('a Live Drive turn whose page closes (D-7, decided 2026-10-22)', () => {
  const SCREEN_GONE = 'Not run: the page was closed, so AnA stopped driving the screen.';
  const navigate: ToolUse = { id: 'tu_nav', name: 'navigate_to', input: { target: 'vault' } };
  const act: ToolUse = { id: 'tu_act', name: 'act_on_screen', input: { action: 'vault.search', params: { query: 'stability' } } };
  const demo: ToolUse = { id: 'tu_demo', name: 'start_product_demo', input: { demo: 'training-orientation' } };
  const directive = (name: string) => async () => {
    h.state.handlerCalls[name] = (h.state.handlerCalls[name] ?? 0) + 1;
    return name === 'navigate_to'
      ? JSON.stringify({ status: 'navigation_ready', directive: { actionType: 'navigate', targetId: 'vault', label: 'Vault', path: '/vault', scope: 'global' } })
      : name === 'act_on_screen'
        ? JSON.stringify({ status: 'action_ready', directive: { actionType: 'surface_action', actionId: 'vault.search', surfaceId: 'vault', label: 'Search the vault', params: { query: 'stability' } } })
        : JSON.stringify({ status: 'demo_ready', driven: true, demo: { id: 'training-orientation', title: 'Orientation' } });
  };
  const finishedStep = (body: TurnRecordBody | undefined, id: string) =>
    (body?.timeline ?? []).find((e: any) => e.kind === 'step' && e.phase === 'finished' && e.step && (body?.steps ?? []).some((s: any) => s.toolUseId === id && s.handle === e.step)) as any;
  beforeEach(() => {
    for (const name of ['navigate_to', 'act_on_screen', 'start_product_demo']) h.handlers[name] = directive(name);
  });
  afterEach(() => {
    for (const name of ['navigate_to', 'act_on_screen', 'start_product_demo']) delete h.handlers[name];
  });

  it('detaches like any other turn, and finishes `finished`', async () => {
    h.state.script = [[screens()], [pubmed], 'Compared.'];
    await detachedTurn({ live_drive: true });
    expect(h.state.internalStops, 'the close stopped the turn').toEqual([]);
    expect(h.state.detachStamps).toHaveLength(1);
    expect(h.state.endRuns).toEqual([{ status: 'finished', stoppedReason: 'no_more_tools' }]);
    expect(h.state.handlerCalls.search_literature).toBe(1);
    // Answered, through post-processing, as an attached turn ends.
    expect(h.state.post.stopped).toBe(false);
    expect(answered().warnings.join(' ')).toMatch(/The page closed at .*; the turn continued\./);
  });

  it('a screen action after the close is refused, never run, and listed as a step that did not run; the rest goes on', async () => {
    // Round 1 drives while the page is open; the page closes in the second
    // model call; round 2 asks to drive again and to search.
    h.state.script = [[navigate], [act, demo, pubmed], 'Compared.'];
    io.duringCall = async call => {
      if (call === 2) await closePage();
    };
    await turn(app, { message: 'Open the vault and find the stability reports', live_drive: true }).catch(() => undefined);
    await vi.waitFor(() => expect(h.state.endRuns.length).toBeGreaterThan(0));
    // Before the close: driven as before.
    expect(h.state.handlerCalls.navigate_to).toBe(1);
    // After it: nothing is executed on a page that is gone.
    expect(h.state.handlerCalls.act_on_screen).toBeUndefined();
    expect(h.state.handlerCalls.start_product_demo).toBeUndefined();
    // The rest of the turn's work continues, and the turn finishes.
    expect(h.state.handlerCalls.search_literature).toBe(1);
    expect(h.state.endRuns).toEqual([{ status: 'finished', stoppedReason: 'no_more_tools' }]);
    expect(h.state.post.stopped).toBe(false);
    const body = answered();
    for (const id of ['tu_act', 'tu_demo']) {
      const step = finishedStep(body, id);
      expect(step, `${id} is not listed`).toBeTruthy();
      expect(step).toMatchObject({ status: 'not_run', message: SCREEN_GONE });
    }
    // Never counted as a step a person did not authorise.
    expect(finishedStep(body, 'tu_act').heldBack).toBe(false);
    // The model is told, so it stops asking.
    const third = JSON.stringify(h.state.requests[2]?.messages ?? []);
    expect(third).toContain('The page that started this turn was closed');
  });
});

/* DT3 review (INF-40): past the ceiling on turns left running with no page —
   each holds its request's pinned database connection — a closing page's
   turn does not detach. It stops as before DT3, says why in its record, and
   Continue picks it up. */
describe('the ceiling on turns that go on after their page closed (DT3 review)', () => {
  afterEach(() => _resetDetachSlotsForTest());

  it("at the organisation's ceiling, the turn stops as client_disconnected and its record says why", async () => {
    for (let i = 0; i < MAX_DETACHED_PER_ORGANISATION; i++) claimDetachSlot(7);
    h.state.script = [[screens()], [pubmed], 'Compared.'];
    io.duringCall = async call => {
      if (call === 1) await closePage();
    };
    await turn(app, { message: 'Compare the endpoints of the two pivotal studies' }).catch(() => undefined);
    await vi.waitFor(() => expect(h.state.post).toBeTruthy());
    expect(h.state.detachStamps).toEqual([]);
    expect(h.state.internalStops).toEqual(['client_disconnected']);
    expect(h.state.handlerCalls.search_literature).toBeUndefined();
    expect(h.state.post.stopped).toBe(true);
    expect(h.state.post.stoppedReason).toBe('client_disconnected');
    expect(h.state.post.turnRecorder.seal('stopped').body.warnings.join(' ')).toMatch(
      /could not go on without it: this server is already running \d+ turns/,
    );
  });

  it('a detached turn gives its slot back when it ends', async () => {
    h.state.script = [[screens()], 'Compared.'];
    await detachedTurn();
    expect(h.state.detachStamps).toHaveLength(1);
    await vi.waitFor(() => expect(detachedCount()).toBe(0));
  });
});

describe('a stop that landed before the page closed is not a detach (DT3 review, product)', () => {
  /* useAnaChat.stop awaits the cancel's 200 and then aborts its own stream,
     and the turn's unwinding (control lineage, the stopped answer, the record)
     takes round trips before res.end(). So the close can arrive after the
     stop and before the response ends. The detach branch took it: the run was
     stamped detached, the unattended clock armed, and the sealed record said
     "the turn continued" for a turn the person had stopped. A row stop
     (shutdown, session end, an administrator) that lands first is the same. */
  it.each([
    ["the person's own Stop", () => h.state.cancel!()],
    ['an administrator', () => h.state.stop!('admin_cancelled')],
    ['a shutdown', () => h.state.stop!('server_shutdown')],
  ])('%s, then the close: no detach stamp, no detach warning, no armed limit', async (_name, stopFirst) => {
    h.state.script = [[screens()], 'never reached'];
    io.duringCall = async call => {
      if (call === 1) {
        stopFirst();
        await closePage();
      }
    };
    await turn(app, { message: 'Compare the endpoints of the two pivotal studies' }).catch(() => undefined);
    // The turn closes through post-processing (a stop between rounds) or the
    // error path's record (a stop that aborted the call).
    await vi.waitFor(() => expect(h.state.post !== null || io.records.length > 0).toBe(true));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.state.detachStamps, 'a stopped turn was stamped detached').toEqual([]);
    const warnings = (h.state.post?.turnRecorder?.seal('stopped').body as TurnRecordBody | undefined)?.warnings ?? [];
    expect(warnings.join(' ')).not.toMatch(/the turn continued|Unattended limit/);
    expect(io.notices).toEqual([]);
  });
});

describe('the row stopped by another writer before its abort arrived (DT3 review, Part 11)', () => {
  /* Every server-side stop writes its row first and aborts after: a shutdown
     one organisation after another, an admin's cancel, the session's end, a
     stop delivered to another instance by NOTIFY or the 2 s poll. A turn that
     finishes in that window used to snapshot "not aborted" and seal itself
     `answered` with a normal saved answer, while its row said stopped.
     endRun's guarded UPDATE now decides: when another writer had already ended
     the row, the turn ends as that stop. */
  it.each(['server_shutdown', 'admin_cancelled', 'session_ended'])(
    '%s: the done frame, the closing row and what post-processing saves and files all say stopped with the row reason',
    async reason => {
      h.state.script = [[screens()], 'Compared.'];
      h.state.endRunOutcome = 'already_ended';
      h.state.rowEnding = reason;
      const events = await turn(app, { message: 'Compare the endpoints of the two pivotal studies' });
      expect(events.find(e => e.type === 'done')?.stoppedReason).toBe(reason);
      const end = events.filter(e => e.type === 'timeline').map(e => e.event).find(e => e?.kind === 'end');
      expect(end).toMatchObject({ outcome: 'stopped', stoppedReason: reason });
      expect(h.state.post.stopped, 'post-processing would file the record answered').toBe(true);
      expect(h.state.post.stoppedReason).toBe(reason);
    },
  );

  it('a turn that errored after the row was stopped is recorded stopped with the row reason, and the error is written down', async () => {
    h.state.script = [[screens()], 'never reached'];
    h.state.endRunOutcome = 'already_ended';
    h.state.rowEnding = 'admin_cancelled';
    io.duringCall = call => {
      if (call === 2) throw new Error('provider overloaded');
    };
    await turn(app, { message: 'Compare the endpoints of the two pivotal studies' });
    expect(io.records.map(r => r.outcome)).toEqual(['stopped']);
    const end = (io.records[0].body!.timeline ?? []).find(e => e.kind === 'end') as { stoppedReason: string | null } | undefined;
    expect(end?.stoppedReason).toBe('admin_cancelled');
    expect(io.records[0].body!.warnings.join(' ')).toMatch(/The turn ended with an error: provider overloaded/);
  });

  it("a session's end names what ended it in the record: the abort's cause, and the row's when it won late (DT3 review)", async () => {
    h.state.script = [[screens()], 'never reached'];
    await detachedTurn({}, call => {
      if (call === 2) {
        h.state.stop!('session_ended', { cause: 'member_removed', byUserId: 11 });
        throw Object.assign(new Error('Provider generation aborted.'), { name: 'AbortError' });
      }
    });
    expect(io.records[0].body!.warnings).toContain('The session ended because the person was removed from the organisation (by user 11).');

    resetHarness();
    Object.assign(io, { records: [], notices: [] });
    h.state.script = [[screens()], 'Compared.'];
    h.state.endRunOutcome = 'already_ended';
    h.state.rowEnding = 'session_ended';
    h.state.rowEndingDetail = { cause: 'password_change', byUserId: 3 };
    await turn(app, { message: 'Compare the endpoints of the two pivotal studies' });
    await h.state.post.fileTurnRecord('stopped');
    expect(io.records[0].body!.warnings).toContain(
      "The session ended because the account's password was changed, which ended every session (by user 3).",
    );
  });

  it('a row this turn ended itself is answered as before', async () => {
    h.state.script = [[screens()], 'Compared.'];
    const events = await turn(app, { message: 'Compare the endpoints of the two pivotal studies' });
    expect(events.find(e => e.type === 'done')?.stoppedReason).toBe('no_more_tools');
    expect(h.state.post.stopped).toBe(false);
  });
});

/* DT3 review (finding 4.1): the follower's approval (GET /runs/:id/events,
   runs.ts) is built from the held row by the same builder the attached
   approval_required frame is, so the dialog a follower opens shows what the
   attached page showed, proposal check and words included. */
describe("the follower's approval is the attached frame (DT3 review)", () => {
  it('the approval_required frame, less its transport fields, is the envelope of the row it held', async () => {
    h.state.approvalOpens = true;
    h.state.approvalDecision = { decided: 'denied' };
    h.state.script = [[save], 'Not saved.'];
    const events = await turn(app, { message: 'Save the plan' });
    const frame = events.find(e => e.type === 'approval_required');
    expect(frame, 'no approval was put to the person').toBeTruthy();
    // Less its transport fields: what the frame carries beyond the envelope.
    const carried: Record<string, unknown> = { ...frame! };
    delete carried.type;
    delete carried.round;
    const held = h.state.approvalRequests[0] as { toolUseId: string; command: string; params: Record<string, unknown>; tier: string; check?: unknown };
    expect(carried).toEqual(
      approvalRequiredEnvelope({ runId: 'run_test', toolUseId: held.toolUseId, command: held.command, params: held.params, tier: held.tier as never, check: held.check }),
    );
  });
});

/* DT3 review (finding 4.3): a run stopped while its person's approved action
   was being carried out. The governed-action route claimed the approval
   before executing (claimApproval); the waiting turn, aborted, must not
   record "nobody decided, so this action did not run" — a person approved
   it, and the action's own audit record says whether it completed. Nor is it
   counted as a step a person did not authorise. */
describe('a run stopped while its approved action was being carried out (DT3 review)', () => {
  it('the step says a person approved it as the run stopped, and is not "not authorised"', async () => {
    h.state.approvalOpens = true;
    h.state.onWake = () => {
      h.state.onWake = null;
      h.state.approvalClaimed = true;
      h.state.stop!('admin_cancelled');
    };
    h.state.script = [[save], 'never reached'];
    const events = await turn(app, { message: 'Save the plan' });
    const result = events.find(e => e.type === 'tool_result' && e.name === 'save_document_to_vault');
    expect(result?.status).toBe('cancelled');
    expect(String(result?.message)).toMatch(
      /was ended because the run was stopped after a person approved it; the action's own audit record says whether it completed\./,
    );
    expect(String(result?.message)).not.toMatch(/authorisation|did not run/i);
    expect(h.state.handlerCalls.save_document_to_vault, 'the turn ran the action itself').toBeUndefined();
    const end = events.find(e => e.type === 'timeline' && e.event?.kind === 'end');
    expect(JSON.stringify(end ?? {})).not.toMatch(/not authorised/);
  });

  it('a stop with no claim still says nobody decided', async () => {
    h.state.approvalOpens = true;
    h.state.onWake = () => {
      h.state.onWake = null;
      h.state.stop!('admin_cancelled');
    };
    h.state.script = [[save], 'never reached'];
    const events = await turn(app, { message: 'Save the plan' });
    const result = events.find(e => e.type === 'tool_result' && e.name === 'save_document_to_vault');
    expect(String(result?.message)).toMatch(/did not run: it needs a person's authorisation \(the run was stopped\)\./);
  });
});

/* DT3 review (finding 4.3, continued): the approval window closing is the
   waiting turn's own deny. It used to win over an approval its person had
   just claimed: the turn recorded "Nobody authorised this within the time
   allowed, so it did not run" while the governed-action route was carrying the
   action out under that person's signature. The deny now matches no claimed
   approval (run-control.ts recordApprovalDecision), and the turn waits for the
   decision the claim will write. */
describe('the approval window closes on an approval its person has claimed (DT3 review)', () => {
  it("the turn waits for the person's decision and takes its result; it never says nobody authorised it", async () => {
    h.state.approvalOpens = true;
    h.state.approvalDecisionLands = false;
    h.state.onWake = () => {
      // Claimed as the window was closing; the decision lands a few ticks after it closed.
      h.state.approvalClaimed = true;
      if (h.state.clockOffset > MAX_PAUSE_MS + 15_000) {
        h.state.onWake = null;
        h.state.approvalDecision = { decided: 'approved', result: { success: true, documentId: 'doc_1' } };
      }
    };
    h.state.script = [[save], 'Saved.'];
    const events = await turn(app, { message: 'Save the plan' });
    const result = events.find(e => e.type === 'tool_result' && e.name === 'save_document_to_vault');
    expect(result?.status).toBe('success');
    expect(JSON.stringify(events)).not.toMatch(/Nobody authorised this within the time allowed/);
    expect(h.state.handlerCalls.save_document_to_vault, 'the turn ran the action itself').toBeUndefined();
  });

  it('a claim whose decision never comes is said as approved and unconfirmed, never "nobody authorised", and the turn goes on', async () => {
    h.state.approvalOpens = true;
    h.state.approvalDecisionLands = false;
    h.state.onWake = () => {
      h.state.approvalClaimed = true;
    };
    h.state.script = [[save], 'Done.'];
    const events = await turn(app, { message: 'Save the plan' });
    const result = events.find(e => e.type === 'tool_result' && e.name === 'save_document_to_vault');
    expect(String(result?.message)).toMatch(/was ended because a person approved it as the approval window closed and its result did not reach this turn; the action's own audit record says whether it completed\./);
    expect(JSON.stringify(events)).not.toMatch(/Nobody authorised this within the time allowed/);
    const end = events.find(e => e.type === 'timeline' && e.event?.kind === 'end');
    expect(JSON.stringify(end ?? {})).not.toMatch(/not authorised/);
    expect(h.state.post.stoppedReason).toBe('no_more_tools');
  });

  it('an approval nobody claimed is still denied when the window closes', async () => {
    h.state.approvalOpens = true;
    h.state.script = [[save], 'Not saved.'];
    const events = await turn(app, { message: 'Save the plan' });
    const result = events.find(e => e.type === 'tool_result' && e.name === 'save_document_to_vault');
    expect(String(result?.message)).toMatch(/nobody decided in time/);
  });
});
