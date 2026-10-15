/**
 * Manual and Auto through the real stream route (row 74, slice S4).
 *
 * The run policy is a request field (`run_policy`) the stream reads in exactly
 * five places: the round budget, the loop's stop directive, the hold's expiry,
 * the checkpoint, and the turn's ending (done frame, metadata, record). Each
 * case here is a promise the policy makes to the person, driven through the
 * route with the run row, the model and the tools scripted at their seams and
 * everything between them real (support/stream-route-harness.ts):
 *
 *   Manual  (2) she runs the step the message asked for, then stops before the
 *               next one, says what it is, and runs it only when the person
 *               says Run this step;
 *           (3) "Do this instead" REPLACES the step: it never runs, the model
 *               is told it was redirected, and the steer rides the same call;
 *           (4) a hold nobody answers ENDS the turn — never resumes it — with
 *               the steps it did not run named, on the wire and in the record;
 *           (5) a turn that cannot hold fails closed where she would have
 *               asked, with a warning — it never runs on as if it were Auto.
 *   Auto    (6) an approval nobody answers ends the turn with a closing
 *               answer; the time and round ceilings end it the same way.
 *   Absent  every case has its no-policy twin: today's effort-bounded turn,
 *           unchanged, so no door that sends nothing changes cost silently.
 *
 * Auto never approves anything: the approval gate itself is pinned by
 * auto-never-approves.test.ts; here the gated write's handler is never called.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async importOriginal =>
  (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async importOriginal =>
  (await harnessModule()).mocks.runControl(await importOriginal<typeof import('../../../services/ana/run-control.js')>()),
);
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
import { describeToolPlan } from '../../../services/ana/agentic-loop.js';
import { AUTO_ACTIVE_MS, AUTO_MAX_ROUNDS } from '@shared/ana/run-control-limits';
import {
  harness as h,
  resetHarness,
  streamApp,
  turn as streamTurn,
  type SseEvent,
  type ToolUse,
} from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);

const turn = (runPolicy?: unknown, extra: Record<string, unknown> = {}): Promise<SseEvent[]> =>
  streamTurn(app, { message: 'compare the endpoints', ...(runPolicy === undefined ? {} : { run_policy: runPolicy }), ...extra });

const screens = (id = 'tu_1', input: Record<string, unknown> = {}): ToolUse => ({ id, name: 'list_app_screens', input });
const pubmed: ToolUse = { id: 'tu_2', name: 'search_literature', input: { query: 'endpoint' } };
const save: ToolUse = { id: 'tu_s', name: 'save_document_to_vault', input: { title: 'Plan', content: 'x' } };
const labelOf = (c: ToolUse) => describeToolPlan([c])[0].label;
const TWO_ROUNDS = () => [[screens()], [pubmed], 'The endpoints compared.'];

const ofType = (events: SseEvent[], type: string) => events.filter(e => e.type === type);
const one = (events: SseEvent[], type: string) => {
  const found = ofType(events, type);
  expect(found, `expected exactly one ${type} frame`).toHaveLength(1);
  return found[0];
};
const HOLD_FRAMES = new Set(['paused', 'resumed', 'cancelled', 'hold_expired']);
const holdFrames = (events: SseEvent[]) => events.filter(e => HOLD_FRAMES.has(e.type));
/** The turn record as post-processing received it, sealed so its steps and warnings can be read. */
const record = () => h.state.post.turnRecorder.seal('answered').body;

const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => {
  process.env.ENTITLEMENTS_ENFORCE = 'off';
});
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});

beforeEach(() => {
  resetHarness();
  h.state.script = TWO_ROUNDS();
  const realNow = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + h.state.clockOffset);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('(1) the done frame says which policy the turn ran under', () => {
  it.each([
    ['auto', 'auto'],
    ['manual', 'manual'],
    ['AUTO', null],
    ['', null],
    [undefined, null],
  ])('run_policy %j → runPolicy %j', async (sent, expected) => {
    h.state.afterManualHold = ['paused', 'running'];
    const done = one(await turn(sent), 'done');
    expect(done.runPolicy).toBe(expected);
    expect(h.state.post.runPolicy ?? null).toBe(expected);
  });
});

describe('(2) Manual stops before each further step, and runs it on Run this step', () => {
  it('runs round 1 unheld, holds before round 2 naming the step, then runs it', async () => {
    h.state.afterManualHold = ['paused', 'paused', 'running'];
    const events = await turn('manual');

    expect(h.state.holdForPersonCalls, 'held before round 1, or not before round 2').toBe(1);
    expect(holdFrames(events)).toEqual([
      { type: 'paused', round: 2, reason: 'manual', next: [labelOf(pubmed)] },
      { type: 'resumed', round: 2 },
    ]);
    expect(h.state.handlerCalls).toEqual({ list_app_screens: 1, search_literature: 1 });
    const done = one(events, 'done');
    expect(done.stoppedReason).toBe('no_more_tools');
    expect(done.pendingSteps).toBeUndefined();
    expect(h.state.post.policyHolds).toEqual([
      { round: 2, reason: 'manual', next: [labelOf(pubmed)], outcome: 'continued', at: expect.any(String) },
    ]);
  });

  it('does not hold before a step that already goes to a person', async () => {
    h.state.script = [[screens()], [save], 'Asked for the save.'];
    await turn('manual');
    expect(h.state.holdForPersonCalls).toBe(0);
    expect(h.state.handlerCalls.save_document_to_vault).toBeUndefined();
  });

  it('does not hold while a demonstration drives', async () => {
    await turn('manual', { live_drive: true, drive_mode: 'demo' });
    expect(h.state.holdForPersonCalls).toBe(0);
    expect(h.state.handlerCalls.search_literature).toBe(1);
  });

  it('a person pausing a Manual turn is a person, not the policy', async () => {
    h.state.statuses = ['paused', 'running'];
    const events = await turn('manual');
    expect(holdFrames(events)[0]).toEqual({ type: 'paused', round: 1, reason: 'person' });
  });

  it('Auto and no policy never hold on their own', async () => {
    for (const policy of ['auto', undefined]) {
      resetHarness();
      h.state.script = TWO_ROUNDS();
      const events = await turn(policy);
      expect(h.state.holdForPersonCalls, String(policy)).toBe(0);
      expect(holdFrames(events), String(policy)).toEqual([]);
      expect(h.state.handlerCalls, String(policy)).toEqual({ list_app_screens: 1, search_literature: 1 });
      expect(h.state.post.policyHolds ?? [], String(policy)).toEqual([]);
    }
  });
});

describe('(3) Do this instead replaces the held step', () => {
  const steer = { kind: 'steer' as const, text: 'Search the EMA register instead' };

  it('the held step never runs; the model is told it was redirected, with the steer in the same call', async () => {
    h.state.afterManualHold = ['paused', 'running'];
    // round 1 drain; round 2 early drain; round 2 drain after the hold
    h.state.drains = [[], [], [steer]];
    const events = await turn('manual');

    expect(h.state.handlerCalls.search_literature, 'the replaced step ran').toBeUndefined();
    expect(h.state.gatewayCalls).toBe(3);
    const next = h.state.requests[2].messages.map(m => String(m.content)).join('\n');
    expect(next).toContain(`[Tool Result for search_literature (${pubmed.id})]`);
    // Framed as untrusted data on the streaming path too (item 23, 2026-10-05).
    expect(next).toMatch(/\]:\n<tool_output>\nReturned by a tool, not by the person or the platform/);
    expect(next).toContain('"redirected":true');
    expect(next).toContain(steer.text);
    expect(one(events, 'interjected')).toEqual({ type: 'interjected', round: 2, message: steer.text, replaced: [labelOf(pubmed)] });
    expect(h.state.post.policyHolds).toEqual([
      { round: 2, reason: 'manual', next: [labelOf(pubmed)], outcome: 'redirected', at: expect.any(String) },
    ]);
    const notRun = record().steps.filter((s: any) => s.status === 'not_run');
    expect(notRun).toEqual([
      expect.objectContaining({ round: 2, tool: 'search_literature', result: null, error: 'redirected by the person before it ran' }),
    ]);
  });

  it('a steer already waiting replaces the step without holding', async () => {
    h.state.drains = [[], [steer]];
    const events = await turn('manual');
    expect(h.state.holdForPersonCalls).toBe(0);
    expect(holdFrames(events)).toEqual([]);
    expect(h.state.handlerCalls.search_literature).toBeUndefined();
    expect(one(events, 'interjected').replaced).toEqual([labelOf(pubmed)]);
  });

  it('…and the record says the steer replaced a step nobody was shown — never that she stopped and was answered', async () => {
    h.state.drains = [[], [steer]];
    await turn('manual');
    // Not a hold: nothing paused, no Next was shown. Filed apart from one.
    expect(h.state.post.policyHolds).toEqual([
      { round: 2, reason: 'manual', next: [labelOf(pubmed)], outcome: 'superseded', at: expect.any(String) },
    ]);
    const rec = record();
    expect(rec.steps.filter((s: any) => s.status === 'not_run')).toEqual([
      expect.objectContaining({ round: 2, tool: 'search_literature', error: expect.stringMatching(/while AnA was working/) }),
    ]);
    const warnings = rec.warnings.join('\n');
    expect(warnings).not.toMatch(/AnA stopped before round 2/);
    expect(warnings).toMatch(/before it was shown/);
  });

  it('under Auto the same steer does not replace anything: it applies after the step', async () => {
    h.state.drains = [[], [steer]];
    const events = await turn('auto');
    expect(h.state.handlerCalls.search_literature).toBe(1);
    expect(one(events, 'interjected').replaced).toBeUndefined();
  });
});

describe('(4) a Manual hold nobody answers ends the turn', () => {
  it('hold_expired, no further model call, the step named and not run', async () => {
    h.state.afterManualHold = ['paused'];
    const events = await turn('manual');

    expect(h.state.endHeldCalls).toBe(1);
    expect(h.state.resumeAbandoned, 'Manual silently became Auto').toBe(0);
    expect(h.state.clockOffset).toBeGreaterThanOrEqual(MAX_PAUSE_MS);
    expect(one(events, 'hold_expired')).toEqual({ type: 'hold_expired', round: 2, next: [labelOf(pubmed)] });
    expect(h.state.gatewayCalls, 'a model call followed the expiry').toBe(2);
    expect(h.state.handlerCalls.search_literature).toBeUndefined();

    const done = one(events, 'done');
    expect(done.stoppedReason).toBe('hold_expired');
    expect(done.pendingSteps).toEqual([labelOf(pubmed)]);
    expect(h.state.post).toMatchObject({ stoppedReason: 'hold_expired', pendingSteps: [labelOf(pubmed)] });
    expect(h.state.post.policyHolds).toEqual([
      { round: 2, reason: 'manual', next: [labelOf(pubmed)], outcome: 'expired', at: expect.any(String) },
    ]);
    expect(h.state.endRuns).toEqual([{ status: 'finished', stoppedReason: 'hold_expired' }]);

    const rec = record();
    expect(rec.steps.filter((s: any) => s.status === 'not_run')).toEqual([
      expect.objectContaining({ round: 2, tool: 'search_literature', result: null }),
    ]);
    const warnings = rec.warnings.join('\n');
    expect(warnings).toMatch(/Manual/);
    expect(warnings).toContain(labelOf(pubmed));
  });

  it("a person's own pause in a Manual turn ends it the same way", async () => {
    h.state.statuses = ['paused'];
    const events = await turn('manual');
    expect(h.state.resumeAbandoned).toBe(0);
    expect(h.state.endHeldCalls).toBe(1);
    expect(h.state.handlerCalls).toEqual({});
    const done = one(events, 'done');
    expect(done.stoppedReason).toBe('hold_expired');
    expect(done.pendingSteps).toEqual([labelOf(screens())]);
    // The person paused: no policy hold is claimed for it.
    expect(h.state.post.policyHolds ?? []).toEqual([]);
  });

  it('the same pause under Auto is resumed as abandoned, as today', async () => {
    h.state.statuses = ['paused'];
    const events = await turn('auto');
    expect(h.state.resumeAbandoned).toBe(1);
    expect(h.state.endHeldCalls).toBe(0);
    expect(ofType(events, 'hold_expired')).toEqual([]);
    expect(h.state.handlerCalls.list_app_screens).toBe(1);
  });
});

describe('(5) Manual that cannot hold stops where she would have asked', () => {
  const expectFailedClosed = (events: SseEvent[]) => {
    expect(one(events, 'warning')).toMatchObject({ type: 'warning', code: 'MANUAL_UNAVAILABLE' });
    expect(h.state.handlerCalls, 'the step ran unattended').toEqual({ list_app_screens: 1 });
    expect(h.state.gatewayCalls).toBe(2);
    const done = one(events, 'done');
    expect(done.stoppedReason).toBe('hold_unavailable');
    expect(done.pendingSteps).toEqual([labelOf(pubmed)]);
    expect(done.runPolicy).toBe('manual');
    expect(h.state.post).toMatchObject({ stoppedReason: 'hold_unavailable', pendingSteps: [labelOf(pubmed)] });
    expect(record().steps.filter((s: any) => s.status === 'not_run')).toEqual([
      expect.objectContaining({ round: 2, tool: 'search_literature', result: null }),
    ]);
  };

  it('when the run row could not be opened', async () => {
    h.state.beginRunThrows = true;
    const events = await turn('manual');
    expect(ofType(events, 'run_started')).toEqual([]);
    expectFailedClosed(events);
  });

  it('when the run has no owner who could resume it', async () => {
    h.state.user = { organizationId: 7 };
    const events = await turn('manual');
    expect(h.state.holdForPersonCalls).toBe(0);
    expectFailedClosed(events);
  });

  it('Auto without a run row runs on, as today', async () => {
    h.state.beginRunThrows = true;
    const events = await turn('auto');
    expect(ofType(events, 'warning')).toEqual([]);
    expect(h.state.handlerCalls).toEqual({ list_app_screens: 1, search_literature: 1 });
    expect(one(events, 'done').stoppedReason).toBe('no_more_tools');
  });
});

describe('(6) Auto ends a turn honestly at its ceilings', () => {
  it('an approval nobody answers ends the turn with a closing answer', async () => {
    h.state.script = [[save], 'Nothing was saved.'];
    h.state.approvalOpens = true;
    const events = await turn('auto');
    expect(h.state.handlerCalls.save_document_to_vault, 'the gated write ran').toBeUndefined();
    expect(h.state.approvalDecisionsRecorded).toBe(1);
    expect(h.state.requests[1].toolChoice, 'the closing call still offered tools').toBe('none');
    expect(one(events, 'done').stoppedReason).toBe('approval_timeout');
  });

  it('with no policy, the same unanswered approval is a denial and the turn goes on', async () => {
    h.state.script = [[save], 'Nothing was saved.'];
    h.state.approvalOpens = true;
    const events = await turn(undefined);
    expect(h.state.handlerCalls.save_document_to_vault).toBeUndefined();
    expect(h.state.requests[1].toolChoice).toBeUndefined();
    expect(one(events, 'done').stoppedReason).toBe('no_more_tools');
  });

  it('past 15 minutes of work the next call is the closing answer', async () => {
    h.state.toolMs = AUTO_ACTIVE_MS + 60_000;
    const events = await turn('auto');
    expect(h.state.requests[1].toolChoice).toBe('none');
    expect(h.state.handlerCalls.search_literature).toBeUndefined();
    const done = one(events, 'done');
    expect(done.stoppedReason).toBe('budget_exhausted');
    expect(done.rounds).toBe(1);
  });

  it('time held for a person is not work', async () => {
    // Eight minutes paused at round 1, then a ten-minute step: 18 minutes on
    // the clock, ten of them work.
    h.state.statuses = [...Array(96).fill('paused'), 'running'];
    h.state.toolMs = 10 * 60_000;
    h.state.script = [[screens()], 'Answered.'];
    const events = await turn('auto');
    expect(h.state.requests[1].toolChoice).toBeUndefined();
    expect(one(events, 'done').stoppedReason).toBe('no_more_tools');
  });

  it('with no policy, a long step is not a stop', async () => {
    h.state.toolMs = AUTO_ACTIVE_MS + 60_000;
    const events = await turn(undefined);
    expect(h.state.handlerCalls.search_literature).toBe(1);
    expect(one(events, 'done').stoppedReason).toBe('no_more_tools');
  });

  const novelRounds = (n: number) => [
    ...Array.from({ length: n }, (_, i) => [screens(`tu_${i + 1}`, { page: i + 1 })]),
    'Final answer.',
  ];

  it(`Auto keeps going past the effort ceiling while each round is new, to ${AUTO_MAX_ROUNDS} rounds`, async () => {
    h.state.script = novelRounds(AUTO_MAX_ROUNDS + 5);
    const done = one(await turn('auto'), 'done');
    expect(done.stoppedReason).toBe('max_rounds');
    expect(done.rounds).toBe(AUTO_MAX_ROUNDS);
    expect(h.state.requests.at(-1)?.toolChoice).toBe('none');
  });

  it('with no policy the same turn keeps its effort ceiling (balanced: 6 + 2)', async () => {
    h.state.script = novelRounds(AUTO_MAX_ROUNDS + 5);
    const done = one(await turn(undefined), 'done');
    expect(done.stoppedReason).toBe('max_rounds');
    expect(done.rounds).toBe(8);
  });

  it('Manual keeps the effort ceiling too', async () => {
    h.state.script = novelRounds(AUTO_MAX_ROUNDS + 5);
    h.state.afterManualHold = ['running'];
    const done = one(await turn('manual'), 'done');
    expect(done.rounds).toBe(8);
  });
});

describe('(5b) a Manual hold that did not happen, or lost its run, never runs the step', () => {
  const expectNotRunClosed = (events: SseEvent[]) => {
    expect(h.state.handlerCalls, 'the held step ran with nobody asked').toEqual({ list_app_screens: 1 });
    expect(one(events, 'warning')).toMatchObject({ code: 'MANUAL_UNAVAILABLE' });
    const done = one(events, 'done');
    expect(done.stoppedReason).toBe('hold_unavailable');
    expect(done.pendingSteps).toEqual([labelOf(pubmed)]);
    // Nobody said "run it": no 'continued' hold may be filed.
    expect((h.state.post.policyHolds ?? []).filter((p: any) => p.outcome === 'continued')).toEqual([]);
    expect(record().steps.filter((s: any) => s.status === 'not_run')).toEqual([
      expect.objectContaining({ round: 2, tool: 'search_literature', result: null }),
    ]);
  };

  it.each([['failed'], ['finished'], [null]])(
    'the hold wrote nothing and the row reads %j (not a person\'s pause): fails closed',
    async status => {
      h.state.holdForPersonResult = false;
      // round 1's checkpoint reads 'running'; then the row is no longer live.
      h.state.statuses = ['running', status];
      expectNotRunClosed(await turn('manual'));
    },
  );

  it('the hold could not be written though the row reads running, twice: fails closed, never runs unasked', async () => {
    // A write that matched no running row, then a read that says running: a
    // race (the person paused and resumed in between) or a broken write. She
    // tries once more; failing that, nothing may be taken as a hold.
    h.state.holdForPersonResult = false;
    expectNotRunClosed(await turn('manual'));
    expect(h.state.holdForPersonCalls).toBe(2);
  });

  it('the hold could not be written (holdForPerson threw): fails closed', async () => {
    h.state.holdForPersonThrows = true;
    expectNotRunClosed(await turn('manual'));
  });

  it.each([['failed'], ['finished'], [null]])(
    'held, then the row left the hold as %j — no person answered: fails closed',
    async status => {
      h.state.afterManualHold = ['paused', status];
      expectNotRunClosed(await turn('manual'));
    },
  );

  it("a person's own pause already in place where Manual would hold becomes her hold: Next is shown, and Resume answers it", async () => {
    h.state.holdForPersonResult = false;
    // round 1 reads running; round 2: the person had paused, then resumes.
    h.state.statuses = ['running', 'paused', 'paused', 'running'];
    const events = await turn('manual');
    expect(holdFrames(events)).toEqual([
      { type: 'paused', round: 2, reason: 'manual', next: [labelOf(pubmed)] },
      { type: 'resumed', round: 2 },
    ]);
    expect(h.state.handlerCalls).toEqual({ list_app_screens: 1, search_literature: 1 });
    expect(h.state.post.policyHolds).toEqual([
      { round: 2, reason: 'manual', next: [labelOf(pubmed)], outcome: 'continued', at: expect.any(String) },
    ]);
  });
});

describe('(4b) a Manual hold ended by Stop leaves its step on the record', () => {
  it('Stop at a hold: not run, named on done, and the hold filed as stopped', async () => {
    h.state.afterManualHold = ['paused', 'cancelled'];
    const events = await turn('manual');
    expect(h.state.handlerCalls.search_literature).toBeUndefined();
    expect(ofType(events, 'cancelled')).toHaveLength(1);
    const done = one(events, 'done');
    expect(done.stoppedReason).toBe('cancelled');
    expect(done.pendingSteps).toEqual([labelOf(pubmed)]);
    expect(h.state.post.policyHolds).toEqual([
      { round: 2, reason: 'manual', next: [labelOf(pubmed)], outcome: 'stopped', at: expect.any(String) },
    ]);
    const notRun = record().steps.filter((s: any) => s.status === 'not_run');
    expect(notRun).toEqual([expect.objectContaining({ round: 2, tool: 'search_literature', result: null })]);
    expect(notRun[0].error).toMatch(/stopped while AnA waited/);
  });

  it("a person's pause that expires is filed as the person's pause, not as AnA waiting before her step", async () => {
    h.state.statuses = ['paused'];
    await turn('manual');
    const rec = record();
    const notRun = rec.steps.filter((s: any) => s.status === 'not_run');
    expect(notRun[0].error).toMatch(/paused and nobody resumed it/);
    expect(rec.warnings.join('\n')).toMatch(/the run was paused and nobody resumed it/);
    expect(rec.warnings.join('\n')).not.toMatch(/AnA waited .* before her next step/);
  });
});

describe('(2c) a demonstration the model starts does not switch Manual off', () => {
  afterEach(() => {
    delete h.handlers.start_product_demo;
  });

  it('Manual with Live Drive on (not a demo), round 1 starts a demo: a hold is still due before round 2', async () => {
    h.handlers.start_product_demo = async () => {
      h.state.handlerCalls.start_product_demo = (h.state.handlerCalls.start_product_demo ?? 0) + 1;
      return JSON.stringify({ status: 'demo_ready', driven: true });
    };
    h.state.script = [[{ id: 'tu_d', name: 'start_product_demo', input: {} }], [pubmed], 'Toured.'];
    h.state.afterManualHold = ['paused', 'running'];
    const events = await turn('manual', { live_drive: true });
    expect(h.state.handlerCalls.start_product_demo, 'the demo did not start').toBe(1);
    expect(ofType(events, 'drive_state').some(e => e.promoted === true), 'the turn was not promoted').toBe(true);
    expect(h.state.holdForPersonCalls, 'the promotion switched Manual off').toBe(1);
    expect(holdFrames(events)[0]).toEqual({ type: 'paused', round: 2, reason: 'manual', next: [labelOf(pubmed)] });
  });
});
