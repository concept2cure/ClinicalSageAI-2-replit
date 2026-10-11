import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingMemorySemanticHit } from '../working-memory';
import type {
  searchMemoryEntriesSemantic,
  searchProjectMemoryEntriesSemantic,
} from '../client-intelligence-memory';
import type { MemoryContextAssemblerResult } from '../memory-context-assembler';

type ClientResult = Awaited<ReturnType<typeof searchMemoryEntriesSemantic>>;
type ProjectResult = Awaited<ReturnType<typeof searchProjectMemoryEntriesSemantic>>;

const sources = vi.hoisted(() => ({
  latest: vi.fn<() => Promise<string | null>>(),
  semantic: vi.fn<() => Promise<WorkingMemorySemanticHit[]>>(),
  enabled: vi.fn(() => false),
  client: vi.fn<() => Promise<ClientResult>>(),
  project: vi.fn<() => Promise<ProjectResult>>(),
}));

vi.mock('../working-memory', () => ({
  getLatestWorkingMemoryByThread: sources.latest,
  searchWorkingMemorySemantic: sources.semantic,
  isSemanticWorkingMemoryEnabled: sources.enabled,
}));
vi.mock('../client-intelligence-memory', () => ({
  searchMemoryEntriesSemantic: sources.client,
  searchProjectMemoryEntriesSemantic: sources.project,
}));

import { buildMemoryContextForChat } from '../memory-context-assembler';

const INPUT = { threadId: 'thread-deadline', organizationId: 7, projectId: 33, query: 'risk summary' };
const DEADLINE_MS = 3000;
const EMPTY = { entries: [], totalCount: 0, query: INPUT.query };
const CLIENT = {
  entries: [{ id: 1, title: 'Client preference', content: 'Keep risk summaries concise.', similarity: 0.9 }],
  totalCount: 1,
  query: INPUT.query,
} as ClientResult;
const PROJECT = {
  entries: [{ id: 2, title: 'Project decision', content: 'Retain the stability arm.', similarity: 0.9 }],
  totalCount: 1,
  query: INPUT.query,
} as ProjectResult;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function observeAssembly(input = INPUT) {
  const settled = vi.fn<(result: MemoryContextAssemblerResult) => void>();
  const promise = buildMemoryContextForChat(input);
  void promise.then(settled);
  return { promise, settled };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T00:00:00.000Z'));
  sources.latest.mockReset().mockResolvedValue(null);
  sources.semantic.mockReset().mockResolvedValue([]);
  sources.enabled.mockReset().mockReturnValue(false);
  sources.client.mockReset().mockResolvedValue(EMPTY);
  sources.project.mockReset().mockResolvedValue(EMPTY);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('independent memory layers start together', () => {
  it('starts tenant-scoped client and project searches before recency resolves', async () => {
    const recency = deferred<string | null>();
    sources.latest.mockReturnValue(recency.promise);
    const { promise } = observeAssembly();
    await vi.advanceTimersByTimeAsync(0);

    expect(sources.latest).toHaveBeenCalledWith(INPUT.threadId, INPUT.organizationId);
    expect(sources.client).toHaveBeenCalledWith(null, 7, INPUT.query, { limit: 4, minSimilarity: 0.6 });
    expect(sources.project).toHaveBeenCalledWith(null, 33, 7, INPUT.query, { limit: 4, minSimilarity: 0.6 });
    recency.resolve('Earlier working summary');
    await promise;
  });

  it('returns healthy layers after stalled recency reaches the existing 3s deadline', async () => {
    sources.latest.mockReturnValue(deferred<string | null>().promise);
    sources.client.mockResolvedValue(CLIENT);
    const { promise, settled } = observeAssembly();
    await vi.advanceTimersByTimeAsync(DEADLINE_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toHaveBeenCalledTimes(1);
    const result = await promise;
    expect(result.diagnostics.layerOutcomes).toEqual({ workingMemory: 'timeout', clientMemory: 'ok', projectMemory: 'empty' });
    expect(result.diagnostics.workingMemoryMode).toBe('none');
    expect(result.memoryBlock).toContain('Working Memory unavailable (timeout)');
    expect(result.memoryBlock).toContain('Do not infer that missing memory or prior decisions do not exist');
    expect(result.memoryBlock).toContain('Keep risk summaries concise.');
    expect(result.read).toEqual([{ layer: 'client_memory', title: 'Client preference' }]);
  });

  it('starts independent searches while semantic working memory is pending', async () => {
    sources.enabled.mockReturnValue(true);
    const semantic = deferred<WorkingMemorySemanticHit[]>();
    sources.semantic.mockReturnValue(semantic.promise);
    const { promise } = observeAssembly();
    await vi.advanceTimersByTimeAsync(0);
    expect(sources.client).toHaveBeenCalledTimes(1);
    expect(sources.project).toHaveBeenCalledTimes(1);
    expect(sources.latest).not.toHaveBeenCalled();
    semantic.resolve([{ id: 3, summary: 'Relevant working summary', similarity: 0.95, generatedAt: null }]);
    const result = await promise;
    expect(result.diagnostics.workingMemoryMode).toBe('semantic');
    expect(sources.semantic).toHaveBeenCalledWith(INPUT.threadId, 7, INPUT.query, { limit: 1, minSimilarity: 0.6 });
    expect(sources.latest).not.toHaveBeenCalled();
  });
});

describe('deadlines retain truthful memory availability', () => {
  it('keeps a timeout notice even when every source is unavailable', async () => {
    sources.client.mockReturnValue(deferred<ClientResult>().promise);
    sources.project.mockReturnValue(deferred<ProjectResult>().promise);
    const { promise } = observeAssembly();
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    const result = await promise;
    expect(result.diagnostics.layerOutcomes).toEqual({ workingMemory: 'empty', clientMemory: 'timeout', projectMemory: 'timeout' });
    expect(result.memoryBlock).toContain('Client Memory unavailable (timeout)');
    expect(result.memoryBlock).toContain('Project Memory unavailable (timeout)');
    expect(result.atoms).toEqual([]);
    expect(result.read).toEqual([]);
  });

  it('keeps the unavailability notice ahead of content when the prompt budget trims', async () => {
    sources.latest.mockResolvedValue('Working summary '.repeat(200));
    sources.client.mockReturnValue(deferred<ClientResult>().promise);
    const promise = buildMemoryContextForChat({ ...INPUT, maxChars: 1000 });
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    const result = await promise;
    expect(result.memoryBlock).toContain('Client Memory unavailable (timeout)');
    expect(result.memoryBlock).toContain('Do not infer that missing memory or prior decisions do not exist');
    expect(result.memoryBlock.indexOf('unavailable')).toBeLessThan(result.memoryBlock.indexOf('## Working Memory'));
    expect(result.memoryBlock.length).toBeLessThanOrEqual(1000);
    expect(result.diagnostics.trimmed).toBe(true);
  });

  it('reports rejected reads as errors with a prompt notice, not empty recall', async () => {
    sources.latest.mockRejectedValue(new Error('recency read failed'));
    sources.client.mockRejectedValue(new Error('client read failed'));
    sources.project.mockRejectedValue(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const result = await buildMemoryContextForChat(INPUT);
    expect(result.diagnostics.layerOutcomes).toEqual({ workingMemory: 'error', clientMemory: 'error', projectMemory: 'error' });
    expect(result.memoryBlock).toContain('Working Memory unavailable (error)');
    expect(result.memoryBlock).toContain('Client Memory unavailable (error)');
    expect(result.memoryBlock).toContain('Project Memory unavailable (error)');
    expect(result.read).toEqual([]);
  });

  it('keeps healthy empty recall empty, with no fabricated unavailable source', async () => {
    const result = await buildMemoryContextForChat(INPUT);
    expect(result.memoryBlock).toBe('');
    expect(result.diagnostics.layerOutcomes).toEqual({ workingMemory: 'empty', clientMemory: 'empty', projectMemory: 'empty' });
    expect(result.read).toEqual([]);
  });
});

describe('memory scope and input gates are unchanged', () => {
  it('does not read tenant memory without an organization', async () => {
    sources.enabled.mockReturnValue(true);
    const result = await buildMemoryContextForChat({ ...INPUT, organizationId: undefined });
    expect(sources.latest).not.toHaveBeenCalled();
    expect(sources.semantic).not.toHaveBeenCalled();
    expect(sources.client).not.toHaveBeenCalled();
    expect(sources.project).not.toHaveBeenCalled();
    expect(result.diagnostics.layerOutcomes).toEqual({ workingMemory: 'empty', clientMemory: 'skipped', projectMemory: 'skipped' });
  });

  it('skips only project memory when no project is selected', async () => {
    const result = await buildMemoryContextForChat({ ...INPUT, projectId: undefined });
    expect(sources.client).toHaveBeenCalledTimes(1);
    expect(sources.project).not.toHaveBeenCalled();
    expect(result.diagnostics.layerOutcomes?.projectMemory).toBe('skipped');
    expect(result.memoryBlock).toBe('');
  });

  it('keeps recency recall but skips semantic searches without a query', async () => {
    sources.enabled.mockReturnValue(true);
    sources.latest.mockResolvedValue('Existing working summary');
    const result = await buildMemoryContextForChat({ ...INPUT, query: '  ' });
    expect(sources.latest).toHaveBeenCalledWith(INPUT.threadId, INPUT.organizationId);
    expect(sources.semantic).not.toHaveBeenCalled();
    expect(sources.client).not.toHaveBeenCalled();
    expect(sources.project).not.toHaveBeenCalled();
    expect(result.diagnostics.workingMemoryMode).toBe('recency');
  });
});

describe('semantic working-memory preference and fallback remain bounded', () => {
  beforeEach(() => { sources.enabled.mockReturnValue(true); });

  it('still uses recency when semantic recall times out', async () => {
    sources.semantic.mockReturnValue(deferred<WorkingMemorySemanticHit[]>().promise);
    sources.latest.mockResolvedValue('Recency fallback summary');
    const { promise } = observeAssembly();
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    const result = await promise;
    expect(result.diagnostics.workingMemoryMode).toBe('recency_fallback');
    expect(result.diagnostics.layerOutcomes?.workingMemory).toBe('ok');
    expect(result.memoryBlock).toContain('Recency fallback summary');
  });

  it('does not misreport a timed-out semantic read with empty recency as empty memory', async () => {
    sources.semantic.mockReturnValue(deferred<WorkingMemorySemanticHit[]>().promise);
    const { promise } = observeAssembly();
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    const result = await promise;
    expect(result.diagnostics.layerOutcomes?.workingMemory).toBe('timeout');
    expect(result.diagnostics.workingMemoryMode).toBe('none');
    expect(result.memoryBlock).toContain('Working Memory unavailable (timeout)');
  });

  it('bounds recency fallback too when both working-memory reads stall', async () => {
    sources.semantic.mockReturnValue(deferred<WorkingMemorySemanticHit[]>().promise);
    sources.latest.mockReturnValue(deferred<string | null>().promise);
    const { promise, settled } = observeAssembly();
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    expect(sources.latest).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    expect(settled).toHaveBeenCalledTimes(1);
    expect((await promise).diagnostics.layerOutcomes?.workingMemory).toBe('timeout');
  });

  it('preserves a rejected semantic read as unavailable if recency returns no summary', async () => {
    sources.semantic.mockRejectedValue(new Error('semantic failed'));
    const result = await buildMemoryContextForChat(INPUT);
    expect(result.diagnostics.layerOutcomes?.workingMemory).toBe('error');
    expect(result.memoryBlock).toContain('Working Memory unavailable (error)');
  });
});

describe('settled memory results are stable and timers are cleared', () => {
  it('clears successful deadline timers, preventing false timeout logs', async () => {
    sources.latest.mockResolvedValue('Healthy working summary');
    sources.client.mockResolvedValue(CLIENT);
    sources.project.mockResolvedValue(PROJECT);
    await buildMemoryContextForChat(INPUT);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('ignores a late semantic result while its recency fallback is still pending', async () => {
    sources.enabled.mockReturnValue(true);
    const semantic = deferred<WorkingMemorySemanticHit[]>();
    const recency = deferred<string | null>();
    sources.semantic.mockReturnValue(semantic.promise);
    sources.latest.mockReturnValue(recency.promise);
    const { promise } = observeAssembly();
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    semantic.resolve([{ id: 3, summary: 'Late semantic summary', similarity: 0.99, generatedAt: null }]);
    recency.resolve('Chosen recency summary');
    const result = await promise;
    expect(result.diagnostics.workingMemoryMode).toBe('recency_fallback');
    expect(result.memoryBlock).toContain('Chosen recency summary');
    expect(result.memoryBlock).not.toContain('Late semantic summary');
  });

  it('excludes expired independent sources that finish during the working-memory fallback', async () => {
    sources.enabled.mockReturnValue(true);
    const recency = deferred<string | null>();
    const client = deferred<ClientResult>();
    sources.semantic.mockReturnValue(deferred<WorkingMemorySemanticHit[]>().promise);
    sources.latest.mockReturnValue(recency.promise);
    sources.client.mockReturnValue(client.promise);
    const { promise } = observeAssembly();
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    client.resolve(CLIENT);
    recency.resolve('Fallback working summary');
    const result = await promise;
    expect(result.diagnostics.layerOutcomes?.clientMemory).toBe('timeout');
    expect(result.atoms.some(atom => atom.layer === 'client_memory')).toBe(false);
    expect(result.memoryBlock).not.toContain('Keep risk summaries concise.');
  });

  it('ignores late values and rejections after the final result is returned', async () => {
    const recency = deferred<string | null>();
    const client = deferred<ClientResult>();
    const project = deferred<ProjectResult>();
    sources.latest.mockReturnValue(recency.promise);
    sources.client.mockReturnValue(client.promise);
    sources.project.mockReturnValue(project.promise);
    const { promise, settled } = observeAssembly();
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    expect(settled).toHaveBeenCalledTimes(1);
    const result = await promise;
    const snapshot = JSON.stringify(result);
    recency.resolve('Late working summary');
    client.resolve(CLIENT);
    project.reject(new Error('Late project failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(vi.getTimerCount()).toBe(0);
  });
});
