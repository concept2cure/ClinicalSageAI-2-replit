/** The real stream route overlaps independent context reads after conversation admission. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  prefetch: vi.fn(),
  memory: vi.fn(),
  operations: [] as string[],
  failAt: '' as string,
}));
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
vi.mock('../../../services/ana-ri/chat-context-builder.js', async importOriginal => ({
  ...(await harnessModule()).mocks.chatContextBuilder(await importOriginal<Record<string, unknown>>()),
  prefetchRouteIntelligenceContext: io.prefetch,
}));
vi.mock('../../../services/lumen-context-builder.js', async () => (await harnessModule()).mocks.lumen());
vi.mock('../../../services/memory-context-assembler.js', () => ({ buildMemoryContextForChat: io.memory }));
vi.mock('../../../services/ana-ri/context-enrichment.js', async () => (await harnessModule()).mocks.enrichment());
vi.mock('../../../services/chat-thread-helpers.js', async () => ({
  ...(await harnessModule()).mocks.chatThreads(),
  getOrCreateThread: async () => {
    io.operations.push('resolve');
    if (io.failAt === 'resolve') throw new Error('thread unavailable');
    return 'thread-owned';
  },
  getThreadMessages: async () => {
    io.operations.push('history');
    if (io.failAt === 'history') throw new Error('history unavailable');
    return [];
  },
  saveChatMessage: async () => {
    io.operations.push('save');
    if (io.failAt === 'save') throw new Error('save unavailable');
    return 41;
  },
}));
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

const app = streamApp(mountStreamRoute);
const ask = () => turn(app, { message: 'Compare the evidence.', thread_id: 'thread-owned', project_id: 33 });
const memoryResult = { memoryBlock: 'Scoped memory retained.', atoms: [], diagnostics: null };
const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});
beforeEach(() => {
  resetHarness();
  io.operations.length = 0;
  io.failAt = '';
  io.prefetch.mockReset().mockResolvedValue({ contextAvailabilityBlock: 'Scoped context retained.' });
  io.memory.mockReset().mockImplementation(async () => {
    io.operations.push('memory');
    return memoryResult;
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

function modelInput() {
  return JSON.stringify(h.state.requests[0]?.messages ?? []);
}

describe('memory startup on the client streaming door', () => {
  it('starts admitted memory before optional route prefetch finishes and waits for both before the model', async () => {
    const started = deferred<void>();
    const prefetch = deferred<Record<string, unknown>>();
    const memory = deferred<typeof memoryResult>();
    io.prefetch.mockImplementation(() => {
      started.resolve();
      return prefetch.promise;
    });
    io.memory.mockImplementation(() => {
      io.operations.push('memory');
      return memory.promise;
    });
    const pending = ask();
    try {
      await started.promise;
      expect(io.memory).toHaveBeenCalledTimes(1);
      expect(io.operations).toEqual(['resolve', 'history', 'save', 'memory']);
      expect(io.memory).toHaveBeenCalledWith({
        threadId: 'thread-owned', organizationId: 7, projectId: 33,
        query: 'Compare the evidence.', limitPerLayer: 4, maxChars: 3500,
      });
      expect(h.state.gatewayCalls).toBe(0);
      memory.resolve(memoryResult);
      expect(h.state.gatewayCalls).toBe(0);
    } finally {
      memory.resolve(memoryResult);
      prefetch.resolve({ contextAvailabilityBlock: 'Scoped context retained.' });
      await pending;
    }
    expect(h.state.gatewayCalls).toBe(1);
    expect(modelInput()).toContain(memoryResult.memoryBlock);
    expect(modelInput()).toContain('Scoped context retained.');
  });

  it('awaits slow memory when optional route context has already returned', async () => {
    const memory = deferred<typeof memoryResult>();
    const started = deferred<void>();
    io.memory.mockImplementation(() => { started.resolve(); return memory.promise; });
    const pending = ask();
    try {
      await started.promise;
      expect(h.state.gatewayCalls).toBe(0);
    } finally {
      memory.resolve(memoryResult);
      await pending;
    }
    expect(modelInput()).toContain(memoryResult.memoryBlock);
  });

  it.each(['resolve', 'history', 'save'])('does not start memory or optional context when conversation %s fails', async stage => {
    io.failAt = stage;
    const events = await ask();
    expect(events.some(event => event.type === 'error')).toBe(true);
    expect(io.memory).not.toHaveBeenCalled();
    expect(io.prefetch).not.toHaveBeenCalled();
    expect(h.state.gatewayCalls).toBe(0);
  });

  it('handles an early memory rejection while optional context is pending', async () => {
    const started = deferred<void>();
    const prefetch = deferred<Record<string, unknown>>();
    io.prefetch.mockImplementation(() => { started.resolve(); return prefetch.promise; });
    io.memory.mockRejectedValue(new Error('private memory endpoint failed'));
    const pending = ask();
    try {
      await started.promise;
      await Promise.resolve();
      expect(h.state.gatewayCalls).toBe(0);
    } finally {
      prefetch.resolve({ contextAvailabilityBlock: 'Scoped context retained.' });
      await pending;
    }
    expect(h.state.gatewayCalls).toBe(1);
    expect(modelInput()).toContain('Scoped context retained.');
    expect(modelInput()).not.toContain('private memory endpoint failed');
    expect(modelInput()).not.toContain(memoryResult.memoryBlock);
  });
});
