/**
 * Working-memory recall MODE is observable — a pilot can finally be measured.
 *
 * WHAT WENT WRONG
 * layerOutcomes.workingMemory reported 'ok' identically for a semantic hit and
 * for the recency fallback. ENABLE_SEMANTIC_WORKING_MEMORY could be turned on
 * in an environment and produce NO evidence it was actually recalling
 * semantically — including the silent state where the flag is on but every
 * semantic search clears nothing (missing embeddings, un-migrated column) and
 * recency quietly answers every turn. The repo's own rule is benchmark before
 * enabling by default; a mode you cannot observe cannot be benchmarked.
 *
 * Asserts the four modes end-to-end: assembler diagnostics → recordAnaTurn →
 * the rendered Prometheus family.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const wm = vi.hoisted(() => ({
  getLatestWorkingMemoryByThread: vi.fn(async () => null as string | null),
  searchWorkingMemorySemantic: vi.fn(async () => [] as Array<Record<string, unknown>>),
}));

vi.mock('../working-memory', async importOriginal => {
  const original = await importOriginal<typeof import('../working-memory')>();
  return {
    ...original, // the real flag reader — the test drives it through the env var
    getLatestWorkingMemoryByThread: wm.getLatestWorkingMemoryByThread,
    searchWorkingMemorySemantic: wm.searchWorkingMemorySemantic,
  };
});
vi.mock('../client-intelligence-memory', () => ({
  searchMemoryEntriesSemantic: vi.fn(async () => ({ entries: [], totalCount: 0, query: '' })),
  searchProjectMemoryEntriesSemantic: vi.fn(async () => ({ entries: [], totalCount: 0, query: '' })),
}));
vi.mock('../../db', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) }, db: {} }));

import { buildMemoryContextForChat } from '../memory-context-assembler';
import {
  recordAnaTurn,
  renderAnaRiMetrics,
  resetAnaRiMetrics,
} from '../ana-ri-metrics';

const INPUT = {
  threadId: 'thread_mode',
  organizationId: 9,
  query: 'What did we decide about the stability arm?',
};

const originalFlag = process.env.ENABLE_SEMANTIC_WORKING_MEMORY;

beforeEach(() => {
  wm.getLatestWorkingMemoryByThread.mockReset().mockResolvedValue(null);
  wm.searchWorkingMemorySemantic.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  if (originalFlag === undefined) delete process.env.ENABLE_SEMANTIC_WORKING_MEMORY;
  else process.env.ENABLE_SEMANTIC_WORKING_MEMORY = originalFlag;
});

describe('the assembler names how working memory was recalled', () => {
  it("'semantic' when the flag is on and similarity recall serves the summary", async () => {
    process.env.ENABLE_SEMANTIC_WORKING_MEMORY = 'true';
    wm.searchWorkingMemorySemantic.mockResolvedValue([
      { id: 5, summary: 'Semantic hit', similarity: 0.9, generatedAt: new Date() },
    ]);

    const result = await buildMemoryContextForChat(INPUT);

    expect(result.diagnostics.workingMemoryMode).toBe('semantic');
    expect(result.diagnostics.layerOutcomes?.workingMemory).toBe('ok');
  });

  it("'recency_fallback' when the flag is ON but semantic clears nothing — the state a pilot must see", async () => {
    process.env.ENABLE_SEMANTIC_WORKING_MEMORY = 'true';
    wm.getLatestWorkingMemoryByThread.mockResolvedValue('Recency summary');

    const result = await buildMemoryContextForChat(INPUT);

    expect(result.diagnostics.workingMemoryMode).toBe('recency_fallback');
    // The blind spot this field exists to close: the layer outcome alone
    // still says 'ok', exactly as it did for the semantic hit above.
    expect(result.diagnostics.layerOutcomes?.workingMemory).toBe('ok');
  });

  it("'recency' when the flag is off and the default path answers", async () => {
    delete process.env.ENABLE_SEMANTIC_WORKING_MEMORY;
    wm.getLatestWorkingMemoryByThread.mockResolvedValue('Recency summary');

    const result = await buildMemoryContextForChat(INPUT);

    expect(result.diagnostics.workingMemoryMode).toBe('recency');
    expect(wm.searchWorkingMemorySemantic).not.toHaveBeenCalled();
  });

  it("'none' when nothing is recalled at all", async () => {
    delete process.env.ENABLE_SEMANTIC_WORKING_MEMORY;

    const result = await buildMemoryContextForChat(INPUT);

    expect(result.diagnostics.workingMemoryMode).toBe('none');
    expect(result.diagnostics.layerOutcomes?.workingMemory).toBe('empty');
  });
});

describe('the mode reaches Prometheus', () => {
  it('recordAnaTurn counts modes and the rendered family carries them', () => {
    resetAnaRiMetrics();
    recordAnaTurn({ route: 'stream', memory: { workingMemoryMode: 'semantic' } });
    recordAnaTurn({ route: 'stream', memory: { workingMemoryMode: 'recency_fallback' } });
    recordAnaTurn({ route: 'stream', memory: { workingMemoryMode: 'recency_fallback' } });
    recordAnaTurn({ route: 'chat', memory: { workingMemoryMode: 'none' } });

    const rendered = renderAnaRiMetrics().join('\n');
    expect(rendered).toContain('ana_ri_working_memory_mode_total{mode="semantic"} 1');
    expect(rendered).toContain('ana_ri_working_memory_mode_total{mode="recency_fallback"} 2');
    expect(rendered).toContain('ana_ri_working_memory_mode_total{mode="recency"} 0');
    expect(rendered).toContain('ana_ri_working_memory_mode_total{mode="none"} 1');
    resetAnaRiMetrics();
  });

  it('the stream route hands the mode from diagnostics to recordAnaTurn (source contract)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('server/routes/ana-ri/stream.ts', 'utf8');
    expect(src).toMatch(/workingMemoryMode:\s*streamMemoryDiag\.workingMemoryMode/);
  });
});
