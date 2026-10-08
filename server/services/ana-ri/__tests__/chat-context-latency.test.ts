/** Exercise the canonical builder with independent, caller-scoped context reads. */
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  resolve: vi.fn(),
  memory: vi.fn(),
  route: vi.fn(),
  history: vi.fn(),
}));
vi.mock('../../../db.js', () => ({ pool: {} }));
vi.mock('../index.js', () => ({
  orchestrate: vi.fn((input: { _externalIntelBlock?: string }) => ({
    systemPrompt: `Base prompt.${input._externalIntelBlock ?? ''}`, detectedSubmissionType: undefined,
  })),
}));
vi.mock('../orchestrator.js', () => ({
  prefetchProjectIntelligence: vi.fn(async () => null),
  preloadRIMContext: vi.fn(async () => ''),
}));
vi.mock('../../memory-context-assembler.js', () => ({ buildMemoryContextForChat: io.memory }));
vi.mock('../../chat-thread-helpers.js', () => ({
  resolveAccessibleThread: io.resolve,
  getThreadMessages: io.history,
}));
vi.mock('../../lumen-context-builder.js', () => ({
  getIntelligencePrefix: vi.fn(async () => 'Intelligence retained.'),
  buildSectionSpecificPrompt: vi.fn(() => ''),
}));
vi.mock('../context-enrichment.js', () => ({
  enrichContextForChat: vi.fn(async () => ({ block: '', sources: [] })),
}));
vi.mock('../../intelligence/learning-loop-service.js', () => ({
  getFeedbackSummary: vi.fn(async () => ({ totalFeedback: 0 })),
}));
vi.mock('../../decision-lifecycle-service.js', () => ({
  decisionLifecycleService: { getDecisionContext: vi.fn(() => []) },
}));
vi.mock('../mdx-context-resolver.js', () => ({ buildMdxContextBlock: vi.fn() }));
vi.mock('../relational-profile-service.js', () => ({ loadRelationalOverlay: vi.fn(async () => '') }));
vi.mock('../../external-intelligence/index.js', () => ({ buildExternalIntelBlock: io.route }));
vi.mock('../../ana/deadline-radar.js', () => ({
  getDeadlineRadar: vi.fn(async () => ({ overdue: [], dueSoon: [] })),
  buildDeadlineRadarBlock: vi.fn(() => ''),
}));
vi.mock('../../ana/contradiction-watch.js', () => ({
  getOpenContradictionsForOrg: vi.fn(async () => []),
  buildContradictionWatchBlock: vi.fn(() => ''),
}));
vi.mock('../../ana/session-briefing.js', () => ({ getSessionBriefing: vi.fn(async () => ({ block: '' })) }));
vi.mock('../governed-context-envelope.js', () => ({
  buildGovernedContextEnvelope: vi.fn(async () => ({ hasMeaningfulContext: false })),
}));
vi.mock('../../account-canon.js', () => ({
  resolveAccountContext: vi.fn(async () => null),
  formatResolvedContextForPrompt: vi.fn(() => ''),
}));

import { buildChatContext } from '../chat-context-builder.js';

const memoryResult = { memoryBlock: 'Scoped memory retained.', atoms: [], diagnostics: null };
function request(threadId: string | null = 'thread-owned') {
  return {
    tenantId: 7,
    userId: 19,
    body: { message: 'Compare the evidence.', thread_id: threadId, project_id: 33 },
  } as unknown as Request;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  io.resolve.mockReset().mockResolvedValue({ id: 'thread-owned' });
  io.history.mockReset().mockResolvedValue([{ role: 'assistant', content: 'Owned prior turn.' }]);
  io.memory.mockReset().mockResolvedValue(memoryResult);
  io.route.mockReset().mockResolvedValue('Optional route context retained.');
});
afterEach(() => { vi.useRealTimers(); });

describe('memory startup in the canonical chat context builder', () => {
  it('starts scoped memory while optional route context remains pending and retains both', async () => {
    const started = deferred<void>();
    const route = deferred<string>();
    const memory = deferred<typeof memoryResult>();
    io.route.mockImplementation(() => { started.resolve(); return route.promise; });
    io.memory.mockReturnValue(memory.promise);
    let complete = false;
    const pending = buildChatContext(request()).then(result => { complete = true; return result; });
    try {
      await started.promise;
      expect(io.resolve).toHaveBeenCalledWith('thread-owned', 7, 19);
      expect(io.memory).toHaveBeenCalledTimes(1);
      expect(io.memory).toHaveBeenCalledWith({
        threadId: 'thread-owned', organizationId: 7, projectId: 33,
        query: 'Compare the evidence.', limitPerLayer: 4, maxChars: 3500,
      });
      memory.resolve(memoryResult);
      await Promise.resolve();
      expect(complete).toBe(false);
    } finally {
      memory.resolve(memoryResult);
      route.resolve('Optional route context retained.');
      await pending;
    }
    const context = await pending;
    expect(context.messages[0].content).toContain(memoryResult.memoryBlock);
    expect(context.messages[0].content).toContain('Optional route context retained.');
    expect(context.messages).toContainEqual({ role: 'assistant', content: 'Owned prior turn.' });
    expect(context.messages.at(-1)).toEqual({ role: 'user', content: 'Compare the evidence.' });
  });

  it('never reads a named thread before the caller-scoped admission resolves', async () => {
    const admission = deferred<{ id: string }>();
    const started = deferred<void>();
    io.resolve.mockReturnValue(admission.promise);
    io.route.mockImplementation(async () => { started.resolve(); return ''; });
    const pending = buildChatContext(request());
    try {
      await started.promise;
      expect(io.memory).not.toHaveBeenCalled();
      expect(io.history).not.toHaveBeenCalled();
    } finally {
      admission.resolve({ id: 'canonical-thread-owned' });
      await pending;
    }
    expect(io.memory).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'canonical-thread-owned' }));
    expect(io.history).toHaveBeenCalledWith('canonical-thread-owned');
  });

  it('awaits memory after optional context has completed', async () => {
    const started = deferred<void>();
    const memory = deferred<typeof memoryResult>();
    io.memory.mockImplementation(() => { started.resolve(); return memory.promise; });
    let complete = false;
    const pending = buildChatContext(request()).then(result => { complete = true; return result; });
    try {
      await started.promise;
      await Promise.resolve();
      expect(complete).toBe(false);
    } finally {
      memory.resolve(memoryResult);
      await pending;
    }
    expect((await pending).messages[0].content).toContain(memoryResult.memoryBlock);
  });
});

describe('chat memory admission and latency safeguards', () => {
  it.each(['refused', 'missing', 'unnamed'])('uses no private thread memory when access is %s', async access => {
    if (access === 'refused') io.resolve.mockRejectedValue(new Error('Foreign private thread.'));
    if (access === 'missing') io.resolve.mockResolvedValue(null);
    const context = await buildChatContext(request(access === 'unnamed' ? null : 'thread-foreign'));
    expect(io.memory).toHaveBeenCalledWith(expect.objectContaining({
      threadId: '', organizationId: 7, projectId: 33,
    }));
    expect(io.history).not.toHaveBeenCalled();
    expect(JSON.stringify(context.messages)).not.toContain('Owned prior turn.');
    expect(JSON.stringify(context.messages)).not.toContain('Foreign private thread.');
  });

  it('handles an early memory rejection while route context remains pending', async () => {
    const started = deferred<void>();
    const route = deferred<string>();
    io.route.mockImplementation(() => { started.resolve(); return route.promise; });
    io.memory.mockRejectedValue(new Error('Private memory endpoint failed.'));
    const pending = buildChatContext(request());
    try {
      await started.promise;
      await Promise.resolve();
    } finally {
      route.resolve('Optional route context retained.');
      await pending;
    }
    const prompt = String((await pending).messages[0].content);
    expect(prompt).toContain('Intelligence retained.');
    expect(prompt).not.toContain(memoryResult.memoryBlock);
    expect(prompt).not.toContain('Private memory endpoint failed.');
  });

  it('benchmarks controlled context latency: 180 ms route plus 120 ms memory completes in 180 ms', async () => {
    vi.useFakeTimers();
    io.route.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(''), 180)));
    io.memory.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(memoryResult), 120)));
    const startedAt = Date.now();
    let completedAt: number | undefined;
    const pending = buildChatContext(request()).then(result => {
      completedAt = Date.now();
      return result;
    });
    await vi.advanceTimersByTimeAsync(300);
    const context = await pending;
    expect(completedAt! - startedAt).toBe(180);
    expect(context.messages[0].content).toContain(memoryResult.memoryBlock);
  });
});
