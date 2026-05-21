import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/services/working-memory.js', () => ({
  getLatestWorkingMemoryByThread: vi.fn(),
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

describe('MemoryContextAssembler', () => {
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
    // The assembler now per-atom-trims content at 400 chars before
    // assembling the memory block, so the 2200-char entry never produces
    // a block longer than ~500 chars. The outer maxChars=1000 cap never
    // fires, but the content IS shorter than the input.
    expect(result.memoryBlock.length).toBeLessThan(2200);
    expect(result.memoryBlock.length).toBeLessThanOrEqual(1000);
  });
});
