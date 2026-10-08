/** Settled tools release their wait listeners while the production adapter's run remains live. */
import { getEventListeners } from 'node:events';
import { setImmediate } from 'node:timers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnaGatewayResponse, AnaToolUse, GatewayRequest } from '../../ai-gateway/types.js';
import type { AgenticToolEvent } from '../agentic-tool-dispatch.js';

const gateway = vi.hoisted(() => ({
  responses: [] as AnaGatewayResponse[], calls: [] as GatewayRequest[], listenerCounts: [] as number[],
}));
vi.mock('../../ai-gateway/gateway', () => ({
  getGateway: () => ({
    route: async (request: GatewayRequest) => {
      gateway.calls.push(request);
      gateway.listenerCounts.push(request.signal ? getEventListeners(request.signal, 'abort').length : 0);
      return gateway.responses.shift();
    },
  }),
}));
vi.mock('../tool-authorization.js', async original => {
  const real = await original<typeof import('../tool-authorization.js')>();
  return {
    ...real,
    toolAuthorizationOf: (name: string, input: unknown) =>
      name.startsWith('__test_wait_cleanup') ? { class: 'read' as const } : real.toolAuthorizationOf(name, input),
  };
});

import { executeAgenticLoop, registerToolHandler } from '../AnaToolExecutor.js';

const request: GatewayRequest = {
  taskType: 'chat', organizationId: 7, runId: 'tool_wait_cleanup_test',
  messages: [{ role: 'user', content: 'Compare the evidence.' }], maxTokens: 1024,
};

function reply(toolUses: AnaToolUse[], content = 'Investigating.'): AnaGatewayResponse {
  return {
    content, toolUses, provider: 'anthropic', model: 'test-model', requestId: 'test-request',
    usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, estimatedCostUsd: 0 },
    latencyMs: 0, cached: false, deterministic: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const checkpoint = () => new Promise<void>(resolve => setImmediate(resolve));
beforeEach(() => { gateway.responses = []; gateway.calls = []; gateway.listenerCounts = []; });

describe('non-SSE completed tool wait lifetime', () => {
  it('returns to its listener baseline after twelve successful tools before the next model call', async () => {
    const controller = new AbortController();
    const name = '__test_wait_cleanup_success';
    const handler = vi.fn(async (input: Record<string, unknown>) => `Evidence ${input.index}`);
    registerToolHandler(name, handler);
    const calls = Array.from({ length: 12 }, (_, index) => ({ id: `success-${index}`, name, input: { index } }));
    gateway.responses = [reply(calls), reply([], 'Compared.')];
    const events: AgenticToolEvent[] = [];
    const response = await executeAgenticLoop(request, { signal: controller.signal, onToolEvent: event => events.push(event) });
    expect(controller.signal.aborted).toBe(false);
    expect(handler).toHaveBeenCalledTimes(12);
    expect(response.content).toBe('Compared.');
    expect(response.loop.stoppedReason).toBe('no_more_tools');
    expect(events.filter(event => event.phase === 'end')).toHaveLength(12);
    expect(gateway.listenerCounts).toEqual([0, 0]);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    for (const call of calls) expect(JSON.stringify(gateway.calls[1].messages)).toContain(`Evidence ${call.input.index}`);
  });
});

describe('non-SSE failed tool wait lifetime', () => {
  it('cleans a throwing handler while preserving its error and adaptation guidance', async () => {
    const controller = new AbortController();
    const name = '__test_wait_cleanup_failure';
    registerToolHandler(name, async () => { throw new Error('Lookup failed.'); });
    gateway.responses = [reply([{ id: 'failed', name, input: {} }]), reply([], 'The lookup failed.')];
    const events: AgenticToolEvent[] = [];
    const response = await executeAgenticLoop(request, { signal: controller.signal, onToolEvent: event => events.push(event) });
    const ended = events.find(event => event.phase === 'end');
    expect(ended?.errorMessage).toBe('Lookup failed.');
    expect(JSON.parse(ended!.result!)).toMatchObject({ error: 'Tool execution failed: Lookup failed.', tool: name });
    expect(JSON.stringify(gateway.calls[1].messages)).toContain('Lookup failed.');
    expect(response.content).toBe('The lookup failed.');
    expect(controller.signal.aborted).toBe(false);
    expect(gateway.listenerCounts).toEqual([0, 0]);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });
});

describe('non-SSE a completed wait beside an active tool', () => {
  it('removes only the completed listener, then cancels the active wait and observes its late rejection', async () => {
    const controller = new AbortController();
    const started = deferred<void>();
    const quickSettled = deferred<void>();
    const work = deferred<string>();
    const quick = '__test_wait_cleanup_quick';
    const pending = '__test_wait_cleanup_pending';
    registerToolHandler(quick, async () => 'Quick evidence.');
    registerToolHandler(pending, async (_input, context) => {
      expect(context?.signal).toBe(controller.signal);
      started.resolve();
      return work.promise;
    });
    gateway.responses = [reply([{ id: 'quick', name: quick, input: {} }, { id: 'pending', name: pending, input: {} }])];
    const events: AgenticToolEvent[] = [];
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);
    const run = executeAgenticLoop(request, {
      signal: controller.signal,
      onToolEvent: event => {
        events.push(event);
        if (event.phase === 'end' && event.call.name === quick) quickSettled.resolve();
      },
    });
    try {
      await Promise.all([started.promise, quickSettled.promise]);
      expect(getEventListeners(controller.signal, 'abort'), 'completed tool kept its cancellation listener').toHaveLength(1);
      controller.abort();
      const response = await run;
      expect(response.loop.stoppedReason).toBe('cancelled');
      expect(gateway.calls).toHaveLength(1);
      const ended = events.filter(event => event.phase === 'end');
      expect(ended).toHaveLength(2);
      expect(ended.find(event => event.call.name === quick)?.result).toBe('Quick evidence.');
      const canceled = ended.find(event => event.call.name === pending)!;
      expect(JSON.parse(canceled.result!)).toMatchObject({ cancelled: true, tool: pending });
      expect(canceled.errorMessage).toBeUndefined();
      expect(canceled.result).not.toMatch(/undone|reverted|rolled back/i);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      work.reject(new Error('The abandoned handler failed later.'));
      await checkpoint();
      expect(unhandled).toEqual([]);
    } finally {
      controller.abort();
      work.resolve('Cleanup.');
      await run;
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });
});
