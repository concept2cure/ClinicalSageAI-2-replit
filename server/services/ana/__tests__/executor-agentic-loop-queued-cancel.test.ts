/** Stop must not start handlers still waiting for an agentic tool lane. */
import { setImmediate } from 'node:timers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnaGatewayResponse, AnaToolUse, GatewayRequest } from '../../ai-gateway/types.js';
import type { AgenticToolEvent } from '../agentic-tool-dispatch.js';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const gateway = vi.hoisted(() => ({ responses: [] as AnaGatewayResponse[], calls: [] as GatewayRequest[] }));
vi.mock('../../ai-gateway/gateway', () => ({
  getGateway: () => ({
    route: async (request: GatewayRequest) => {
      gateway.calls.push(request);
      return gateway.responses.shift();
    },
  }),
}));
// As in the neighboring executor suites, probes stand for read-only tools.
// Real tools retain their registered authorization class and scope checks.
vi.mock('../tool-authorization.js', async importOriginal => {
  const real = await importOriginal<typeof import('../tool-authorization.js')>();
  return {
    ...real,
    toolAuthorizationOf: (name: string, input: unknown) =>
      name.startsWith('__test') ? { class: 'read' as const } : real.toolAuthorizationOf(name, input),
  };
});

import { executeAgenticLoop, registerToolHandler } from '../AnaToolExecutor.js';

const request: GatewayRequest = {
  taskType: 'chat', organizationId: 7, runId: 'queued_cancel_test',
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
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => { gateway.responses = []; gateway.calls = []; });

describe('non-SSE cancellation before a queued handler starts', () => {
  it.each([1, 4])('does not start queued work after Stop with %s active lanes', async lanes => {
    const controller = new AbortController();
    const started = deferred<void>();
    const work = deferred<string>();
    const signals: Array<AbortSignal | undefined> = [];
    const blocked = `__test_blocked_${lanes}`;
    const queued = `__test_queued_${lanes}`;
    registerToolHandler(blocked, async (_input, context) => {
      signals.push(context?.signal);
      if (signals.length === lanes) started.resolve();
      return work.promise;
    });
    const queuedHandler = vi.fn(async () => JSON.stringify({ result: 'must not start' }));
    registerToolHandler(queued, queuedHandler);
    const calls = Array.from({ length: lanes + 2 }, (_, index) => ({
      id: `call-${index}`, name: index < lanes ? blocked : queued, input: { index },
    }));
    gateway.responses = [reply(calls), reply([], 'Finished.')];
    const events: AgenticToolEvent[] = [];
    const results: Array<{ name: string; result: string }> = [];
    const run = executeAgenticLoop(request, {
      signal: controller.signal, ...(lanes === 1 ? { toolConcurrency: lanes } : {}),
      toolContext: { organizationId: 7, userId: 3 },
      onToolEvent: event => events.push(event),
      onToolExecution: (name, _input, result) => results.push({ name, result }),
    });
    try {
      await started.promise;
      expect(queuedHandler).not.toHaveBeenCalled();
      expect(signals.every(signal => signal === controller.signal)).toBe(true);
      controller.abort();
      const response = await run;
      // Let an incorrectly orphaned registry wrapper reach its probe too.
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(queuedHandler, 'Stop started a handler that was still queued').not.toHaveBeenCalled();
      expect(response.loop.stoppedReason).toBe('cancelled');
      expect(response.content).toBe('Investigating.');
      expect(gateway.calls).toHaveLength(1);
      expect(results.map(result => result.name)).toEqual(calls.map(call => call.name));
      const ends = events.filter(event => event.phase === 'end');
      expect(ends.map(event => event.call.id)).toEqual(calls.map(call => call.id));
      for (const event of ends) {
        expect(JSON.parse(event.result!)).toMatchObject({ cancelled: true, tool: event.call.name });
        expect(event.errorMessage).toBeUndefined();
        expect(event.result).not.toMatch(/undone|reverted|rolled back/i);
      }
    } finally {
      work.resolve('Finished after the round stopped waiting.');
      await run;
    }
  });
});

describe('an uninterrupted queued tool round', () => {
  it('still runs each handler and carries its result into the next model turn', async () => {
    const handler = vi.fn(async (input: Record<string, unknown>) => `Evidence ${input.index}`);
    registerToolHandler('__test_queued_live', handler);
    const calls = Array.from({ length: 3 }, (_, index) => ({
      id: `live-${index}`, name: '__test_queued_live', input: { index },
    }));
    gateway.responses = [reply(calls), reply([], 'Compared.')];
    const response = await executeAgenticLoop(request, { toolConcurrency: 1 });
    expect(handler).toHaveBeenCalledTimes(3);
    expect(response.loop.stoppedReason).toBe('no_more_tools');
    expect(response.content).toBe('Compared.');
    expect(gateway.calls).toHaveLength(2);
    for (const call of calls) expect(JSON.stringify(gateway.calls[1].messages)).toContain(`Evidence ${call.input.index}`);
  });
});
