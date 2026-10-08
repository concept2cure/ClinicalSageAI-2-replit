/** Parent holds use the actual run signal even while a database read is pending. */
import { setImmediate } from 'node:timers';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  mode: 'person' as 'person' | 'manual',
  readGate: null as Promise<string | null> | null,
  wakeGate: null as Promise<void> | null,
  readEntered: null as (() => void) | null,
  wakeEntered: null as (() => void) | null,
  readBlocked: false,
  drains: 0,
}));
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async original => (await harnessModule()).mocks.shared(await original<Record<string, unknown>>()));
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async original => {
  const harness = await harnessModule();
  const control = harness.mocks.runControl(await original<typeof import('../../../services/ana/run-control.js')>());
  return {
    ...control,
    beginRun: async () => {
      const run = await control.beginRun();
      return {
        ...run,
        handle: {
          ...run.handle,
          wake: async (ms: number) => {
            if (!io.wakeGate) return run.handle.wake(ms);
            harness.harness.state.wakes.push(ms);
            io.wakeEntered?.();
            await io.wakeGate;
          },
        },
      };
    },
    readStatus: async () => {
      const due = io.mode === 'person' || harness.harness.state.holdForPersonCalls > 0;
      if (io.readGate && due && !io.readBlocked) {
        io.readBlocked = true;
        io.readEntered?.();
        return io.readGate;
      }
      return control.readStatus();
    },
    consumeInterjections: async () => {
      io.drains++;
      return control.consumeInterjections();
    },
  };
});
vi.mock('../../../services/ana-ri/orchestrator.js', async () => (await harnessModule()).mocks.orchestrator());
vi.mock('../../../services/ana-ri/chat-context-builder.js', async original =>
  (await harnessModule()).mocks.chatContextBuilder(await original<Record<string, unknown>>()),
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
import { describeToolPlan } from '../../../services/ana/agentic-loop.js';
import { harness as h, resetHarness, streamApp, turn, type SseEvent, type ToolUse } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const screens: ToolUse = { id: 'tu_1', name: 'list_app_screens', input: {} };
const literature: ToolUse = { id: 'tu_2', name: 'search_literature', input: { query: 'endpoint' } };
const modes = ['person', 'manual'] as const;
const checkpoint = () => new Promise<void>(resolve => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function startTurn() {
  const state: { done: boolean; events: SseEvent[]; error?: unknown } = { done: false, events: [] };
  const reader = turn(app, { message: 'compare the endpoints', ...(io.mode === 'manual' ? { run_policy: 'manual' } : {}) })
    .then(events => { state.done = true; state.events = events; }, error => { state.done = true; state.error = error; });
  return { state, reader };
}

function stopRun() {
  h.state.forced = 'cancelled';
  expect(h.state.cancel).toBeTypeOf('function');
  h.state.cancel!();
}

function expectStopped(events: SseEvent[]) {
  expect(events.filter(event => event.type === 'cancelled')).toHaveLength(1);
  expect(events.filter(event => event.type === 'resumed' || event.type === 'hold_expired')).toEqual([]);
  expect(events.find(event => event.type === 'done')?.stoppedReason).toBe('cancelled');
  expect(h.state.gatewayCalls).toBe(io.mode === 'manual' ? 2 : 1);
  expect(h.state.handlerCalls).toEqual(io.mode === 'manual' ? { list_app_screens: 1 } : {});
  expect(h.state.resumeAbandoned).toBe(0);
  expect(h.state.endHeldCalls).toBe(0);
  if (io.mode === 'manual') {
    const next = [describeToolPlan([literature])[0].label];
    expect(events.find(event => event.type === 'done')?.pendingSteps).toEqual(next);
    expect(h.state.post.policyHolds).toEqual([
      expect.objectContaining({ round: 2, reason: 'manual', next, outcome: 'stopped' }),
    ]);
    const record = h.state.post.turnRecorder.seal('stopped').body;
    expect(record.steps.filter((step: { status: string }) => step.status === 'not_run')).toEqual([
      expect.objectContaining({ round: 2, tool: 'search_literature', result: null, error: expect.stringMatching(/stopped while AnA waited/) }),
    ]);
  }
}

const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});
beforeEach(() => {
  resetHarness();
  Object.assign(io, { mode: 'person', readGate: null, wakeGate: null, readEntered: null, wakeEntered: null, readBlocked: false, drains: 0 });
});
afterEach(() => vi.restoreAllMocks());

function configure(mode: 'person' | 'manual') {
  io.mode = mode;
  h.state.script = mode === 'manual' ? [[screens], [literature], 'Done.'] : [[screens], 'Done.'];
  h.state.statuses = mode === 'manual' ? ['running'] : ['paused', 'running'];
  h.state.afterManualHold = ['paused', 'running'];
}

describe('Stop interrupts parent hold reads through the production route', () => {
  it.each(modes)('%s hold ends before its pending read, and ignores a later stale paused result', async mode => {
    configure(mode);
    const read = deferred<string | null>();
    const readEntered = deferred<void>();
    const wake = deferred<void>();
    Object.assign(io, { readGate: read.promise, readEntered: () => readEntered.resolve(), wakeGate: wake.promise });
    const pending = startTurn();
    try {
      await readEntered.promise;
      const drainsBeforeStop = io.drains;
      stopRun();
      await vi.waitFor(() => expect(pending.state.done, 'Stop waited for the database status read').toBe(true), { timeout: 1_000 });
      expect(pending.state.error).toBeUndefined();
      expectStopped(pending.state.events);
      expect(h.state.wakes).toEqual([]);
      expect(io.drains, 'canceled hold consumed queued instructions').toBe(drainsBeforeStop);
      read.resolve('paused');
      await checkpoint();
      expect(h.state.wakes).toEqual([]);
      expect(io.drains).toBe(drainsBeforeStop);
      expectStopped(pending.state.events);
    } finally {
      h.state.forced = 'cancelled';
      read.resolve('paused');
      wake.resolve();
      await pending.reader;
    }
  });
});

describe('Stop interrupts parent hold wakes through the production route', () => {
  it.each(modes)('%s hold ends while the 5 s wake remains unresolved', async mode => {
    configure(mode);
    const wake = deferred<void>();
    const wakeEntered = deferred<void>();
    Object.assign(io, { wakeGate: wake.promise, wakeEntered: () => wakeEntered.resolve() });
    const pending = startTurn();
    try {
      await wakeEntered.promise;
      const drainsBeforeStop = io.drains;
      stopRun();
      await vi.waitFor(() => expect(pending.state.done, 'Stop waited for the hold wake ceiling').toBe(true), { timeout: 1_000 });
      expect(pending.state.error).toBeUndefined();
      expectStopped(pending.state.events);
      expect(h.state.wakes).toEqual([5_000]);
      expect(io.drains, 'canceled hold consumed queued instructions').toBe(drainsBeforeStop);
    } finally {
      h.state.forced = 'cancelled';
      wake.resolve();
      await pending.reader;
    }
  });
});

describe('normal Continue still answers a parent hold', () => {
  it.each(modes)('%s hold resumes and runs the intended step', async mode => {
    configure(mode);
    const pending = startTurn();
    await pending.reader;
    expect(pending.state.error).toBeUndefined();
    expect(pending.state.events.filter(event => event.type === 'paused')).toHaveLength(1);
    expect(pending.state.events.filter(event => event.type === 'resumed')).toHaveLength(1);
    expect(pending.state.events.filter(event => event.type === 'cancelled' || event.type === 'hold_expired')).toEqual([]);
    expect(pending.state.events.find(event => event.type === 'done')?.stoppedReason).toBe('no_more_tools');
    expect(h.state.handlerCalls).toEqual(mode === 'manual' ? { list_app_screens: 1, search_literature: 1 } : { list_app_screens: 1 });
    expect(h.state.gatewayCalls).toBe(mode === 'manual' ? 3 : 2);
  });
});
