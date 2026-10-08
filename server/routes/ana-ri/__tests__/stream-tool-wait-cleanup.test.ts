/** The mounted stream releases settled tool wait listeners without weakening Stop. */
import { getEventListeners } from 'node:events';
import { setImmediate } from 'node:timers';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (input: Record<string, unknown>, context?: { signal?: AbortSignal }) => Promise<string>;
type Telemetry = { toolName: string; status: string; errorMessage?: string };
const io = vi.hoisted(() => ({
  handlers: {} as Record<string, Handler>, signal: null as AbortSignal | null,
  listenerCounts: [] as number[], telemetry: [] as Telemetry[],
  onSettled: null as ((entry: Telemetry) => void) | null,
  honorAbort: false, rejectedGatewayCalls: 0,
}));
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async original => {
  const shared = (await harnessModule()).mocks.shared(await original<Record<string, unknown>>());
  const gateway = shared.ensureGateway();
  return {
    ...shared,
    ensureGateway: () => ({
      ...gateway,
      route: async (input: { signal?: AbortSignal }) => {
        io.signal = input.signal ?? null;
        io.listenerCounts.push(input.signal ? getEventListeners(input.signal, 'abort').length : 0);
        if (io.honorAbort && input.signal?.aborted) {
          io.rejectedGatewayCalls++;
          throw new GatewayAbortedError('pre_call');
        }
        return gateway.route(input);
      },
    }),
  };
});
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => {
  const executor = (await harnessModule()).mocks.toolExecutor();
  return { ...executor, getToolHandler: (name: string) => io.handlers[name] ?? executor.getToolHandler(name) };
});
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async original =>
  (await harnessModule()).mocks.runControl(await original<typeof import('../../../services/ana/run-control.js')>()),
);
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
vi.mock('../../../services/toolRegistry.js', () => ({
  logToolRun: async (entry: Telemetry) => { io.telemetry.push(entry); io.onSettled?.(entry); },
}));
vi.mock('../../../services/ana-ri/relational-profile-service.js', async () => (await harnessModule()).mocks.relationalProfile());
vi.mock('../../../services/ana/tool-telemetry.js', async () => (await harnessModule()).mocks.toolTelemetry());
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());

import { mountStreamRoute } from '../stream.js';
import { GatewayAbortedError } from '../../../services/ai-gateway/gateway.js';
import { harness as h, resetHarness, streamApp, turn, type ToolUse } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const tool = (id: string, name = 'list_app_screens', input: Record<string, unknown> = {}): ToolUse => ({ id, name, input });
const checkpoint = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});
beforeEach(() => {
  resetHarness();
  Object.assign(io, {
    handlers: {}, signal: null, listenerCounts: [], telemetry: [], onSettled: null,
    honorAbort: false, rejectedGatewayCalls: 0,
  });
});

describe('SSE completed tool wait lifetime', () => {
  it('returns to its listener baseline after twelve successful tools before the next model call', async () => {
    const handler = vi.fn(async (input: Record<string, unknown>) => JSON.stringify({ evidence: `Evidence ${input.index}` }));
    io.handlers.list_app_screens = handler;
    h.state.script = [Array.from({ length: 12 }, (_, index) => tool(`success-${index}`, 'list_app_screens', { index })), 'Compared.'];
    const events = await turn(app, { message: 'compare the evidence' });
    expect(io.signal?.aborted).toBe(false);
    expect(handler).toHaveBeenCalledTimes(12);
    expect(io.telemetry).toHaveLength(12);
    expect(io.telemetry.every(entry => entry.status === 'success')).toBe(true);
    expect(events.filter(event => event.type === 'tool_result')).toHaveLength(12);
    expect(events.find(event => event.type === 'done')?.stoppedReason).toBe('no_more_tools');
    expect(io.listenerCounts).toEqual([0, 0]);
    expect(getEventListeners(io.signal!, 'abort')).toHaveLength(0);
    for (let index = 0; index < 12; index++) expect(JSON.stringify(h.state.requests[1].messages)).toContain(`Evidence ${index}`);
  });
});

describe('SSE failed tool wait lifetime', () => {
  it('cleans a throwing handler and retains its genuine error in telemetry and the turn record', async () => {
    io.handlers.list_app_screens = async () => { throw new Error('Lookup failed.'); };
    h.state.script = [[tool('failed')], 'The lookup failed.'];
    const events = await turn(app, { message: 'compare the evidence' });
    expect(io.telemetry).toEqual([expect.objectContaining({ toolName: 'list_app_screens', status: 'error', errorMessage: 'Lookup failed.' })]);
    const record = h.state.post.turnRecorder.seal('answered').body;
    expect(record.steps).toEqual([expect.objectContaining({ tool: 'list_app_screens', status: 'error', error: 'Lookup failed.' })]);
    expect(events.find(event => event.type === 'done')?.stoppedReason).toBe('no_more_tools');
    expect(JSON.stringify(h.state.requests[1].messages)).toContain('Lookup failed.');
    expect(io.signal?.aborted).toBe(false);
    expect(io.listenerCounts).toEqual([0, 0]);
    expect(getEventListeners(io.signal!, 'abort')).toHaveLength(0);
  });
});

describe('SSE a completed wait beside an active tool', () => {
  it('removes only the completed listener, then stops the active wait and observes its late rejection', async () => {
    const started = deferred<void>();
    const quickSettled = deferred<void>();
    const work = deferred<string>();
    io.handlers.list_app_screens = async () => JSON.stringify({ evidence: 'Quick evidence.' });
    io.handlers.search_literature = async (_input, context) => {
      expect(context?.signal).toBe(io.signal);
      started.resolve();
      return work.promise;
    };
    io.onSettled = entry => { if (entry.toolName === 'list_app_screens') quickSettled.resolve(); };
    h.state.script = [[tool('quick'), tool('pending', 'search_literature', { query: 'endpoint' })]];
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);
    const reader = turn(app, { message: 'compare the evidence' });
    try {
      await Promise.all([started.promise, quickSettled.promise]);
      expect(getEventListeners(io.signal!, 'abort'), 'completed tool kept its cancellation listener').toHaveLength(1);
      h.state.forced = 'cancelled';
      h.state.cancel!();
      const events = await reader;
      expect(h.state.gatewayCalls).toBe(1);
      expect(events.find(event => event.type === 'done')?.stoppedReason).toBe('cancelled');
      expect(h.state.post).toMatchObject({ stopped: true, stoppedReason: 'cancelled' });
      expect(io.telemetry).toEqual([
        expect.objectContaining({ toolName: 'list_app_screens', status: 'success' }),
        expect.objectContaining({ toolName: 'search_literature', status: 'cancelled', errorMessage: undefined }),
      ]);
      const record = h.state.post.turnRecorder.seal('stopped').body;
      expect(record.steps).toEqual([
        expect.objectContaining({ tool: 'list_app_screens', status: 'success' }),
        expect.objectContaining({ tool: 'search_literature', status: 'cancelled' }),
      ]);
      const canceled = events.find(event => event.type === 'tool_result' && event.name === 'search_literature');
      expect(canceled).toMatchObject({ toolUseId: 'pending', status: 'cancelled' });
      expect(JSON.parse(String(canceled!.result))).toMatchObject({ cancelled: true, tool: 'search_literature' });
      expect(JSON.stringify(canceled)).not.toMatch(/undone|reverted|rolled back/i);
      expect(getEventListeners(io.signal!, 'abort')).toHaveLength(0);
      work.reject(new Error('The abandoned handler failed later.'));
      await checkpoint();
      expect(unhandled).toEqual([]);
    } finally {
      h.state.forced = 'cancelled';
      h.state.cancel?.();
      work.resolve('Cleanup.');
      await reader;
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });
});

describe('SSE mid-tool Stop with the production gateway abort contract', () => {
  it('closes as cancelled without entering an aborted follow-up model call or emitting an error', async () => {
    const started = deferred<void>();
    const work = deferred<string>();
    io.honorAbort = true;
    io.handlers.search_literature = async () => { started.resolve(); return work.promise; };
    h.state.script = [[tool('pending', 'search_literature', { query: 'endpoint' })]];
    const reader = turn(app, { message: 'compare the evidence' });
    try {
      await started.promise;
      expect(getEventListeners(io.signal!, 'abort')).toHaveLength(1);
      h.state.forced = 'cancelled';
      h.state.cancel!();
      const events = await reader;
      expect(events.find(event => event.type === 'error'), 'Stop reached the generic error path').toBeUndefined();
      expect(events.find(event => event.type === 'done')?.stoppedReason).toBe('cancelled');
      expect(h.state.post).toMatchObject({ stopped: true, stoppedReason: 'cancelled' });
      expect(h.state.gatewayCalls).toBe(1);
      expect(io.rejectedGatewayCalls).toBe(0);
      expect(io.listenerCounts).toEqual([0]);
      const canceled = events.find(event => event.type === 'tool_result' && event.name === 'search_literature');
      expect(canceled).toMatchObject({ toolUseId: 'pending', status: 'cancelled' });
      expect(JSON.parse(String(canceled!.result))).toMatchObject({ cancelled: true, tool: 'search_literature' });
      expect(JSON.stringify(canceled)).not.toMatch(/undone|reverted|rolled back/i);
      const record = h.state.post.turnRecorder.seal('stopped').body;
      expect(record.steps).toEqual([expect.objectContaining({ tool: 'search_literature', status: 'cancelled' })]);
      expect(io.telemetry).toEqual([expect.objectContaining({ toolName: 'search_literature', status: 'cancelled', errorMessage: undefined })]);
      expect(getEventListeners(io.signal!, 'abort')).toHaveLength(0);
    } finally {
      h.state.forced = 'cancelled';
      h.state.cancel?.();
      work.resolve('Cleanup.');
      await reader;
    }
  });
});
