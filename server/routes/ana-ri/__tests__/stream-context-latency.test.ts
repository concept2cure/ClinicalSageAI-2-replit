/** The real stream route overlaps independent context reads after conversation admission. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  prefetch: vi.fn(),
  memory: vi.fn(),
  toolPolicy: vi.fn(),
  drive: vi.fn(),
  answer: vi.fn(),
  release: vi.fn(),
  outcomes: [] as string[],
  operations: [] as string[],
  failAt: '' as string,
}));
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async importOriginal =>
  (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => {
  const real = (await harnessModule()).mocks.toolExecutor();
  return { ...real, getToolHandler: (name: string) => name === 'answer_intelligence_question' ? io.answer : real.getToolHandler(name) };
});
vi.mock('../../../services/ana/governed-toolset.js', () => ({ governedToolsetFor: io.toolPolicy }));
vi.mock('../../../services/ana-ri/live-drive.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../services/ana-ri/live-drive.js')>()),
  resolveDriveState: io.drive,
}));
vi.mock('../../../services/ana/run-control.js', async importOriginal => ({
  ...(await harnessModule()).mocks.runControl(await importOriginal<typeof import('../../../services/ana/run-control.js')>()),
  releaseLocalRun: io.release,
}));
vi.mock('../../../services/ana/turn-record.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/turn-record.js')>();
  return { ...real, writeTurnRecordSafely: (...args: Parameters<typeof real.writeTurnRecordSafely>) => {
    io.outcomes.push(args[2]);
    return real.writeTurnRecordSafely(...args);
  } };
});
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
  io.outcomes.length = 0;
  io.toolPolicy.mockReset().mockImplementation(() => Object.keys(h.handlers).map(name => ({
    name, description: name, input_schema: { type: 'object', properties: {} },
  })));
  io.drive.mockReset().mockResolvedValue({ requested: false, enabled: false, mode: 'assist' });
  io.answer.mockReset();
  io.release.mockReset();
  io.prefetch.mockReset().mockResolvedValue({ contextAvailabilityBlock: 'Scoped context retained.' });
  io.memory.mockReset().mockImplementation(async () => {
    io.operations.push('memory');
    return memoryResult;
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('direct intelligence answers avoid unused model-turn reads', () => {
  const prefix = '[INTELLIGENCE_ANSWER]';
  const payload = { session_id: 'interview-1', answer: 'Recorded evidence.' };
  const direct = (message = prefix + JSON.stringify(payload)) => turn(app, {
    message, project_id: 'program-uuid', live_drive: true, drive_mode: 'demo',
  });

  function expectDirectCleanup(outcome: string) {
    expect(io.toolPolicy).not.toHaveBeenCalled();
    expect(io.drive).not.toHaveBeenCalled();
    expect(io.prefetch).not.toHaveBeenCalled();
    expect(io.memory).not.toHaveBeenCalled();
    expect(h.state.gatewayCalls).toBe(0);
    expect(io.outcomes).toEqual([outcome]);
    expect(io.release).toHaveBeenCalledExactlyOnceWith('run_test');
    expect(h.state.endRuns).toEqual([{
      status: outcome === 'failed' ? 'failed' : 'finished',
      stoppedReason: outcome === 'failed' ? 'error' : 'no_more_tools',
    }]);
  }

  it('keeps the next question, session, direct handler scope and turn record', async () => {
    io.answer.mockResolvedValue(JSON.stringify({
      status: 'intelligence_question', session_id: 'interview-1', flowState: { node: 2 },
      question: { node: { question: 'Which evidence?', guidance: 'Use the recorded source.' } },
    }));
    const events = await direct();
    expect(io.answer).toHaveBeenCalledExactlyOnceWith(payload, {
      organizationId: 7, userId: 3, projectId: null, projectRef: 'program-uuid',
    });
    expect(events.find(e => e.type === 'intelligence_question')).toMatchObject({ sessionId: 'interview-1', flowState: { node: 2 } });
    expect(events.find(e => e.type === 'text')?.content).toBe('**Which evidence?**\n\nUse the recorded source.');
    expect(events.filter(e => e.type === 'done')).toHaveLength(1);
    expect(events.filter(e => e.type === 'post_done')).toHaveLength(1);
    expectDirectCleanup('answered');
  });

  it('keeps interview completion and its summary', async () => {
    io.answer.mockResolvedValue(JSON.stringify({
      status: 'intelligence_flow_complete', session_id: 'interview-1',
      completion: { summary: 'Interview complete.' }, flowState: { complete: true },
    }));
    const events = await direct();
    expect(events.find(e => e.type === 'intelligence_flow_complete')).toMatchObject({ sessionId: 'interview-1', completion: { summary: 'Interview complete.' } });
    expect(events.find(e => e.type === 'text')?.content).toBe('Interview complete.');
    expectDirectCleanup('answered');
  });

  it.each(['refused', 'throws', 'non-json'])('keeps %s handler failure honest without unused reads', async failure => {
    if (failure === 'throws') io.answer.mockRejectedValue(new Error('Interview unavailable.'));
    else io.answer.mockResolvedValue(failure === 'refused' ? JSON.stringify({ error: 'LAUNCH_SCOPE' }) : 'not-json');
    const events = await direct();
    expect(events.some(e => e.type === 'text' && String(e.content).startsWith('Error'))).toBe(true);
    expect(io.answer).toHaveBeenCalledTimes(1);
    expect(events.filter(e => e.type === 'post_done')).toHaveLength(1);
    expectDirectCleanup('failed');
  });

  it('handles malformed input without calling a handler or admitting unused reads', async () => {
    const events = await direct(prefix + '{');
    expect(events.some(e => e.type === 'text' && String(e.content).startsWith('Error processing intelligence answer:'))).toBe(true);
    expect(io.answer).not.toHaveBeenCalled();
    expectDirectCleanup('failed');
  });

  it('still starts both model-turn reads while optional route prefetch is pending', async () => {
    const started = deferred<void>();
    const prefetch = deferred<Record<string, unknown>>();
    const tools = Object.keys(h.handlers).map(name => ({ name, description: name, input_schema: { type: 'object', properties: {} } }));
    const policy = deferred<typeof tools>();
    const drive = deferred<{ requested: boolean; enabled: boolean; mode: string }>();
    io.toolPolicy.mockReturnValue(policy.promise);
    io.drive.mockReturnValue(drive.promise);
    io.prefetch.mockImplementation(() => { started.resolve(); return prefetch.promise; });
    const pending = ask();
    try {
      await started.promise;
      expect(io.toolPolicy).toHaveBeenCalledTimes(1);
      expect(io.toolPolicy.mock.calls[0]?.[1]).toBe(7);
      expect(io.drive).toHaveBeenCalledExactlyOnceWith(false, 7, { driveMode: undefined });
      expect(h.state.gatewayCalls).toBe(0);
    } finally {
      policy.resolve(tools);
      drive.resolve({ requested: false, enabled: false, mode: 'assist' });
      prefetch.resolve({});
      await pending;
    }
    expect(h.state.gatewayCalls).toBe(1);
    expect(io.answer).not.toHaveBeenCalled();
  });
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
