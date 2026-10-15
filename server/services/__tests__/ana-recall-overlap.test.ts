import type { Request } from 'express';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ prefix: vi.fn(), relational: vi.fn(), access: vi.fn(), memory: vi.fn(), history: vi.fn() }));
vi.mock('../lumen-context-builder.js', () => ({ getIntelligencePrefix: h.prefix, buildSectionSpecificPrompt: () => '' }));
vi.mock('../ana-ri/relational-profile-service.js', () => ({ loadRelationalOverlay: h.relational }));
vi.mock('../ana-ri/orchestrator.js', () => ({ prefetchProjectIntelligence: async () => null, preloadRIMContext: async () => '' }));
vi.mock('../ana-ri/index.js', () => ({ orchestrate: () => ({ systemPrompt: 'AnA instructions', detectedIntent: { lens: 'general', confidence: 1 }, detectedSubmissionType: undefined }) }));
vi.mock('../intelligence/learning-loop-service.js', () => ({ getFeedbackSummary: async () => ({ totalFeedback: 0 }) }));
vi.mock('../external-intelligence/index.js', () => ({ buildExternalIntelBlock: async () => '' }));
vi.mock('../ana/session-briefing.js', () => ({ getSessionBriefing: async () => ({ block: '' }) }));
vi.mock('../ana/deadline-radar.js', () => ({ getDeadlineRadar: async () => ({}), buildDeadlineRadarBlock: () => '' }));
vi.mock('../ana/contradiction-watch.js', () => ({ getOpenContradictionsForOrg: async () => [], buildContradictionWatchBlock: () => '' }));
vi.mock('../decision-lifecycle-service.js', () => ({ decisionLifecycleService: { getDecisionContext: () => [] } }));
vi.mock('../memory-context-assembler.js', () => ({ buildMemoryContextForChat: h.memory }));
vi.mock('../chat-thread-helpers.js', () => ({ resolveAccessibleThread: h.access, getThreadMessages: h.history }));
vi.mock('../ana-ri/context-enrichment.js', () => ({ enrichContextForChat: async () => ({ block: '', sources: [] }) }));
vi.mock('../ana-ri/governed-context-envelope.js', () => ({ buildGovernedContextEnvelope: async () => ({ hasMeaningfulContext: false }) }));
vi.mock('../account-canon.js', () => ({ resolveAccountContext: async () => null, formatResolvedContextForPrompt: () => '' }));
import { buildChatContext } from '../ana-ri/chat-context-builder';

beforeAll(async () => { await import('../account-canon.js'); await import('../ana-ri/governed-context-envelope.js'); });
beforeEach(() => { h.prefix.mockReset().mockResolvedValue('Client intelligence'); h.relational.mockReset().mockResolvedValue(''); h.access.mockReset().mockResolvedValue({ id: 'verified' }); h.history.mockReset().mockResolvedValue([]); h.memory.mockReset().mockImplementation(async ({ threadId }) => ({ memoryBlock: threadId === 'secret' ? 'PRIVATE SUMMARY' : 'Memory context', atoms: [], diagnostics: null })); });
const req = { tenantId: 7, userId: 9, body: { message: 'Review the project', project_id: 42 } } as unknown as Request;

async function heldPrefetch(check: () => void) {
  let release!: (value: string) => void;
  let started!: () => void;
  const running = new Promise<void>(resolve => { started = resolve; });
  h.relational.mockImplementation(() => { started(); return new Promise<string>(resolve => { release = resolve; }); });
  const pending = buildChatContext(req);
  await running;
  try { check(); } finally { release('Preferences'); await pending; }
  return pending;
}

describe('independent intelligence recall overlaps route prefetch', () => {
  it('starts scoped intelligence recall before optional prefetch settles and retains its result', async () => {
    const context = await heldPrefetch(() => { expect(h.prefix).toHaveBeenCalledWith(7, 42); });
    expect(context.messages[0].content).toContain('Client intelligence');
    expect(context.messages[0].content).toContain('Memory context');
    expect(context.messages.at(-1)).toMatchObject({ role: 'user', content: 'Review the project' });
    expect(h.prefix).toHaveBeenCalledTimes(1);
  });

  it('handles an early recall rejection while prefetch is pending', async () => {
    h.prefix.mockRejectedValue(new Error('recall unavailable'));
    const context = await heldPrefetch(() => { expect(h.prefix).toHaveBeenCalledTimes(1); });
    expect(context.messages[0].content).toContain('AnA instructions');
    expect(context.messages[0].content).toContain('Memory context');
  });
});


describe('conversation memory uses verified thread access', () => {
  const threaded = { ...req, body: { ...req.body, thread_id: 'secret' } } as Request;
  it('uses the verified ID for memory and history, with one access check', async () => {
    await buildChatContext(threaded);
    expect(h.memory).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'verified' }));
    expect(h.history).toHaveBeenCalledWith('verified');
    expect(h.access).toHaveBeenCalledExactlyOnceWith('secret', 7, 9);
  });
  it.each([null, new Error('access lookup failed')])('excludes unverified private summary when access is unavailable: %s', async result => {
    if (result instanceof Error) h.access.mockRejectedValue(result);
    else h.access.mockResolvedValue(result);
    const context = await buildChatContext(threaded);
    expect(h.memory).toHaveBeenCalledWith(expect.objectContaining({ threadId: '' }));
    expect(JSON.stringify(context.messages)).not.toContain('PRIVATE SUMMARY');
    expect(h.history).not.toHaveBeenCalled();
  });
  it('waits for access before reading private memory', async () => {
    let release!: (value: { id: string }) => void;
    h.access.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = buildChatContext(threaded);
    await vi.waitFor(() => expect(h.relational).toHaveBeenCalled());
    try { expect(h.memory).not.toHaveBeenCalled(); } finally { release({ id: 'verified' }); await pending; }
  });
});
