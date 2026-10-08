/** The real mounted stream stops local-only work without inventing a human control. */
import type { Request, Response } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunHandle } from '../../../services/ana/run-control.js';
import type { TurnOutcome, TurnRecordBody } from '../../../services/ana/turn-record.js';

type GatewayInput = { signal?: AbortSignal; onStream?: (text: string, metadata?: unknown) => void };
const io = vi.hoisted(() => ({
  gateway: vi.fn(),
  baseGateway: null as null | ((request: GatewayInput) => Promise<unknown>),
  request: null as Request | null,
  response: null as Response | null,
  signal: null as AbortSignal | null,
  beginEntered: null as null | (() => void),
  beginGate: null as null | Promise<void>,
  localAbort: vi.fn(),
  internalStop: vi.fn(),
  humanControl: vi.fn(),
  records: [] as Array<{ outcome: TurnOutcome; body: TurnRecordBody | undefined }>,
  recordReady: null as null | (() => void),
}));
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async importOriginal => {
  const shared = (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>());
  const gateway = shared.ensureGateway();
  io.baseGateway = gateway.route;
  return { ...shared, ensureGateway: () => ({ ...gateway, route: io.gateway }) };
});
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async importOriginal => {
  const original = await importOriginal<typeof import('../../../services/ana/run-control.js')>();
  const control = (await harnessModule()).mocks.runControl(original);
  return {
    ...control,
    beginRun: async () => {
      io.beginEntered?.();
      if (io.beginGate) await io.beginGate;
      return control.beginRun();
    },
    localOnlyRunHandle: () => {
      const handle = original.localOnlyRunHandle() as RunHandle & { abortLocally: () => void };
      return { ...handle, abortLocally: () => { io.localAbort(); handle.abortLocally(); } };
    },
    stopRunInternally: io.internalStop,
    applyControl: io.humanControl,
  };
});
vi.mock('../../../services/ana/turn-record.js', async importOriginal => {
  const original = await importOriginal<typeof import('../../../services/ana/turn-record.js')>();
  return {
    ...original,
    writeTurnRecordSafely: async (...args: Parameters<typeof original.writeTurnRecordSafely>) => {
      const [, recorder, outcome] = args;
      io.records.push({ outcome, body: recorder?.seal(outcome).body });
      io.recordReady?.();
      return { status: 'not_recorded', reason: 'This test captures the real sealed record without persistence.' };
    },
  };
});
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
import { harness as h, resetHarness, streamApp, turn } from './support/stream-route-harness.js';

const app = streamApp(router => {
  router.use((req, res, next) => { io.request = req; io.response = res; next(); });
  mountStreamRoute(router);
});
const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});
beforeEach(() => {
  resetHarness();
  Object.assign(io, {
    request: null, response: null, signal: null, records: [], recordReady: null,
    beginEntered: null, beginGate: null,
  });
  io.localAbort.mockReset();
  io.humanControl.mockReset();
  io.internalStop.mockReset().mockImplementation(async () => { h.state.stops++; h.state.cancel?.(); });
  io.gateway.mockReset().mockImplementation((request: GatewayInput) => {
    io.signal = request.signal ?? null;
    return io.baseGateway!(request);
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

/** A provider that waits for work or the actual signal the route supplies. */
function startPendingGateway() {
  const started = deferred();
  const work = deferred();
  const record = deferred();
  io.recordReady = record.resolve;
  io.gateway.mockImplementation(async (request: GatewayInput) => {
    io.signal = request.signal ?? null;
    started.resolve();
    let aborted!: () => void;
    try {
      await new Promise<void>((resolve, reject) => {
        aborted = () => reject(new Error('Provider generation aborted.'));
        if (request.signal?.aborted) { aborted(); return; }
        request.signal?.addEventListener('abort', aborted, { once: true });
        work.promise.then(resolve, reject);
      });
      return await io.baseGateway!(request);
    } finally {
      request.signal?.removeEventListener('abort', aborted);
    }
  });
  // A destroyed response rejects its HTTP reader. That is expected here;
  // the signal and sealed record are asserted through the real route instead.
  const reader = turn(app, { message: 'Compare the evidence.' }).then(() => undefined, () => undefined);
  return { started: started.promise, record: record.promise, release: work.resolve, reader };
}

describe('local-only stream disconnect', () => {
  it('aborts pending generation once after a dropped response without inventing a human cancel', async () => {
    h.state.beginRunThrows = true;
    const pending = startPendingGateway();
    try {
      await pending.started;
      const closed = new Promise<void>(resolve => io.response!.once('close', resolve));
      io.response!.destroy();
      await closed;
      io.response!.emit('close');
      expect(io.signal?.aborted).toBe(true);
      expect(io.localAbort).toHaveBeenCalledTimes(1);
      expect(io.internalStop).not.toHaveBeenCalled();
      expect(io.humanControl).not.toHaveBeenCalled();
      await pending.record;
      expect(io.records[0].outcome).toBe('stopped');
      expect(io.records[0].body?.turn.runId).toBeNull();
      expect(io.records[0].body?.controls).toEqual([]);
      expect(io.records[0].body?.warnings.join(' ')).toContain('connection dropped');
      expect(io.records[0].body?.warnings.join(' ')).not.toMatch(/person cancelled|user cancelled/i);
      expect(h.state.endRuns).toEqual([]);
    } finally {
      pending.release();
      await pending.reader;
    }
  });

  it('ignores ordinary request completion and keeps its heartbeat active while generation waits', async () => {
    h.state.beginRunThrows = true;
    const clearTimer = vi.spyOn(globalThis, 'clearInterval');
    const pending = startPendingGateway();
    try {
      await pending.started;
      expect(io.request?.aborted).toBe(false);
      const clearedBefore = clearTimer.mock.calls.length;
      io.request!.emit('close');
      expect(io.signal?.aborted).toBe(false);
      expect(io.localAbort).not.toHaveBeenCalled();
      expect(clearTimer.mock.calls).toHaveLength(clearedBefore);
    } finally {
      pending.release();
      await pending.reader;
    }
  });

  it('also aborts when an interrupted incoming request closes', async () => {
    h.state.beginRunThrows = true;
    const pending = startPendingGateway();
    try {
      await pending.started;
      Object.defineProperty(io.request, 'aborted', { value: true, configurable: true });
      io.request!.emit('close');
      expect(io.signal?.aborted).toBe(true);
      expect(io.localAbort).toHaveBeenCalledTimes(1);
      await pending.record;
    } finally {
      pending.release();
      await pending.reader;
    }
  });
});

describe('disconnect while opening the run', () => {
  it.each([true, false])('settles an already-dropped response when beginRun resumes (local-only=%s)', async localOnly => {
    h.state.beginRunThrows = localOnly;
    const entered = deferred();
    const proceed = deferred();
    io.beginEntered = entered.resolve;
    io.beginGate = proceed.promise;
    const pending = startPendingGateway();
    try {
      await entered.promise;
      const closed = new Promise<void>(resolve => io.response!.once('close', resolve));
      io.response!.destroy();
      await closed;
      expect(io.response?.destroyed).toBe(true);
      expect(io.response?.writableEnded).toBe(false);
      proceed.resolve();
      await pending.started;
      expect(io.signal?.aborted).toBe(true);
      io.response!.emit('close');
      expect(io.humanControl).not.toHaveBeenCalled();
      if (localOnly) {
        expect(io.localAbort).toHaveBeenCalledTimes(1);
        expect(io.internalStop).not.toHaveBeenCalled();
      } else {
        expect(io.localAbort).not.toHaveBeenCalled();
        expect(io.internalStop).toHaveBeenCalledTimes(1);
        expect(io.internalStop).toHaveBeenCalledWith(expect.anything(), 'run_test', 'client_disconnected', 7);
      }
      await pending.record;
      expect(io.records[0].outcome).toBe('stopped');
      expect(io.records[0].body?.controls).toEqual([]);
      if (localOnly) {
        expect(io.records[0].body?.turn.runId).toBeNull();
        expect(io.records[0].body?.warnings.join(' ')).toContain('connection dropped');
        expect(io.records[0].body?.warnings.join(' ')).not.toMatch(/person cancelled|user cancelled/i);
      }
      expect(h.state.endRuns).toEqual([]);
    } finally {
      proceed.resolve();
      pending.release();
      await pending.reader;
    }
  });
});

describe('completed and durable stream lifecycle', () => {
  it.each([true, false])('does not abort a normally completed response (local-only=%s)', async localOnly => {
    h.state.beginRunThrows = localOnly;
    await turn(app, { message: 'Compare the evidence.' });
    expect(io.response?.writableEnded).toBe(true);
    io.response!.emit('close');
    io.request!.emit('close');
    expect(io.signal?.aborted).toBe(false);
    expect(io.localAbort).not.toHaveBeenCalled();
    expect(io.internalStop).not.toHaveBeenCalled();
    if (!localOnly) expect(h.state.endRuns).toEqual([{ status: 'finished', stoppedReason: 'no_more_tools' }]);
  });

  it('keeps a durable disconnect distinct from a human control and settles it once', async () => {
    const pending = startPendingGateway();
    try {
      await pending.started;
      const closed = new Promise<void>(resolve => io.response!.once('close', resolve));
      io.response!.destroy();
      await closed;
      io.response!.emit('close');
      expect(io.signal?.aborted).toBe(true);
      expect(io.localAbort).not.toHaveBeenCalled();
      expect(io.internalStop).toHaveBeenCalledTimes(1);
      expect(io.internalStop).toHaveBeenCalledWith(expect.anything(), 'run_test', 'client_disconnected', 7);
      expect(io.humanControl).not.toHaveBeenCalled();
      await pending.record;
      expect(io.records[0].body?.controls).toEqual([]);
      expect(h.state.endRuns).toEqual([]);
    } finally {
      pending.release();
      await pending.reader;
    }
  });
});
