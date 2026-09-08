import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/services/working-memory.js', () => ({
  getLatestWorkingMemoryByThread: vi.fn(),
  // Semantic working-memory recall defaults off, so these tests exercise the
  // unchanged recency path (getLatestWorkingMemoryByThread).
  isSemanticWorkingMemoryEnabled: vi.fn(() => false),
  searchWorkingMemorySemantic: vi.fn(async () => []),
}));

vi.mock('../../server/services/client-intelligence-memory.js', () => ({
  searchMemoryEntriesSemantic: vi.fn(),
  searchProjectMemoryEntriesSemantic: vi.fn(),
}));

import { buildMemoryContextForChat } from '../../server/services/memory-context-assembler';
import { getLatestWorkingMemoryByThread } from '../../server/services/working-memory.js';
import {
  searchMemoryEntriesSemantic,
  searchProjectMemoryEntriesSemantic,
} from '../../server/services/client-intelligence-memory.js';

const mockWorkingMemory = vi.mocked(getLatestWorkingMemoryByThread);
const mockClientSearch = vi.mocked(searchMemoryEntriesSemantic);
const mockProjectSearch = vi.mocked(searchProjectMemoryEntriesSemantic);

/**
 * The fixtures below carry absolute createdAt dates (2026-03-01, 2026-03-08),
 * and structured forgetting in memory-orchestrator.shouldRemember drops a
 * non-critical, unverified atom older than maxAgeDays measured from Date.now().
 * Against the real clock those atoms simply age out: this suite passed while
 * they were within the window and would start failing once they were not,
 * with nothing changed in the code.
 *
 * Freezing Date (only Date) fixes their age at what the fixtures intend. The
 * deliberately stale 2024-01-01 atoms further down stay stale, which is what
 * they are there to prove.
 */
const NOW = new Date('2026-03-15T00:00:00.000Z');

describe('MemoryContextAssembler', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkingMemory.mockResolvedValue('Objective: finalize Module 3 overview');
    mockClientSearch.mockResolvedValue({ entries: [], totalCount: 0, query: 'q' });
    mockProjectSearch.mockResolvedValue({ entries: [], totalCount: 0, query: 'q' });
  });

  it('assembles working + client + project memory with metadata diagnostics', async () => {
    mockClientSearch.mockResolvedValue({
      entries: [
        {
          id: 101,
          title: 'Client preference for concise risk summaries',
          content: 'Stakeholder asks for one-page risk summary with severity buckets.',
          similarity: 0.92,
          sourceDocumentName: 'communications_playbook.pdf',
          sourceDocumentType: 'pdf',
          sourcePageOrSection: 'p.12',
          confidenceScore: 0.88,
          importanceLevel: 'high',
          isVerifiedByUser: true,
          extractedBy: 'ai',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-10T00:00:00.000Z'),
        } as any,
      ],
      totalCount: 1,
      query: 'risk summary',
    });

    mockProjectSearch.mockResolvedValue({
      entries: [
        {
          id: 301,
          title: 'M3 section status',
          content: 'The key gap is missing comparison to predicate endpoints.',
          similarity: 0.83,
          sourceDocumentName: 'm3_gap_notes.docx',
          sourceDocumentType: 'docx',
          confidenceScore: 0.81,
          importanceLevel: 'medium',
          isVerifiedByUser: false,
          extractedBy: 'manual',
          createdAt: new Date('2026-03-08T00:00:00.000Z'),
          updatedAt: new Date('2026-03-08T00:00:00.000Z'),
        } as any,
      ],
      totalCount: 1,
      query: 'risk summary',
    });

    const result = await buildMemoryContextForChat({
      threadId: 'thread-123',
      organizationId: 77,
      projectId: 88,
      query: 'risk summary',
      limitPerLayer: 4,
      maxChars: 3500,
    });

    expect(result.memoryBlock).toContain('PERSISTENT MEMORY CONTEXT');
    expect(result.memoryBlock).toContain('Working Memory');
    expect(result.memoryBlock).toContain('Project Memory (semantic matches)');
    expect(result.memoryBlock).toContain('Client Memory (semantic matches)');
    expect(result.atoms.some(a => a.layer === 'working_memory')).toBe(true);
    expect(result.atoms.some(a => a.metadata?.source?.documentName === 'communications_playbook.pdf')).toBe(true);
    expect(result.diagnostics.droppedByForgetting).toBe(0);
    expect(result.diagnostics.droppedByDeduplication).toBe(0);
  });

  it('applies structured forgetting to stale, unverified, low-importance memory', async () => {
    mockWorkingMemory.mockResolvedValue(null);
    mockClientSearch.mockResolvedValue({
      entries: [
        {
          id: 201,
          title: 'Legacy preference',
          content: 'Outdated filing format preference from years ago.',
          similarity: 0.8,
          confidenceScore: 0.75,
          importanceLevel: 'low',
          isVerifiedByUser: false,
          extractedBy: 'ai',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        } as any,
      ],
      totalCount: 1,
      query: 'legacy',
    });

    const result = await buildMemoryContextForChat({
      threadId: 'thread-2',
      organizationId: 7,
      query: 'legacy',
      maxAgeDays: 30,
    });

    expect(result.atoms).toHaveLength(0);
    expect(result.memoryBlock).toBe('');
    expect(result.diagnostics.droppedByForgetting).toBe(1);
  });

  it('retains stale but verified memory entries and reports trimming', async () => {
    mockClientSearch.mockResolvedValue({
      entries: [
        {
          id: 202,
          title: 'Verified evergreen policy',
          content: 'A'.repeat(2200),
          similarity: 0.7,
          confidenceScore: 0.95,
          importanceLevel: 'medium',
          isVerifiedByUser: true,
          extractedBy: 'manual',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        } as any,
      ],
      totalCount: 1,
      query: 'policy',
    });

    const result = await buildMemoryContextForChat({
      threadId: 'thread-3',
      organizationId: 8,
      query: 'policy',
      maxChars: 1000,
      maxAgeDays: 30,
    });

    expect(result.atoms.some(a => a.id === 202)).toBe(true);
    expect(result.diagnostics.droppedByForgetting).toBe(0);
    // The assembler pre-trims each atom's content to 400 chars inside
    // renderSemanticLayer (memory-context-assembler.ts:363-366), so a
    // single 2,200-char atom produces a memoryBlock well under maxChars
    // and the global trimContent(...) at line 381 is a no-op. The
    // diagnostics.trimmed flag reflects only the final-pass trim, not
    // per-atom truncation — so it stays false here.
    expect(result.diagnostics.trimmed).toBe(false);
    expect(result.memoryBlock.length).toBeLessThanOrEqual(1000);
  });
});
