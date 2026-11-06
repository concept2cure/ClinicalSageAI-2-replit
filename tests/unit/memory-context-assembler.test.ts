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

import { buildMemoryContextForChat, type MemoryContextAssemblerResult } from '../../server/services/memory-context-assembler';
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

function memoryHit(id: number, title: string, content: string, fields: Record<string, unknown> = {}) {
  return {
    id, title, content, similarity: 0.9, importanceLevel: 'high',
    isVerifiedByUser: true, createdAt: NOW, updatedAt: NOW, ...fields,
  } as any;
}

function expectBoundedBlock(result: MemoryContextAssemblerResult, maxChars: number, trimmed: boolean) {
  expect(result.diagnostics.appliedMaxChars).toBe(maxChars);
  expect(result.memoryBlock.length).toBeLessThanOrEqual(maxChars);
  expect(result.memoryBlock).toContain('--- PERSISTENT MEMORY CONTEXT ---');
  expect(result.memoryBlock.trimEnd().endsWith('--- END PERSISTENT MEMORY CONTEXT ---')).toBe(true);
  expect(result.diagnostics.trimmed).toBe(trimmed);
  if (trimmed) {
    // Pin the meaning, not one particular sentence chosen for the notice.
    expect(result.memoryBlock).toMatch(/incomplete|omitt|withheld|not (?:all|included|shown)/i);
    expect(result.memoryBlock).toMatch(/budget|limit|fit|space/i);
  }
}

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

  // Since cc1607c3a3 (isolated project recall) a project's context holds working and
  // project memory and never the organization-wide client layer; that layer is recalled
  // only when no project is selected.
  it('assembles working + project memory for a project, and client memory only without one, with metadata diagnostics', async () => {
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
    expect(result.memoryBlock).not.toContain('Client Memory (semantic matches)');
    expect(mockClientSearch).not.toHaveBeenCalled();
    expect(result.atoms.some(a => a.layer === 'working_memory')).toBe(true);
    expect(result.atoms.some(a => a.metadata?.source?.documentName === 'm3_gap_notes.docx')).toBe(true);
    expect(result.atoms.some(a => a.metadata?.source?.documentName === 'communications_playbook.pdf')).toBe(false);
    expect(result.diagnostics.droppedByForgetting).toBe(0);
    expect(result.diagnostics.droppedByDeduplication).toBe(0);

    const organizationWide = await buildMemoryContextForChat({
      threadId: 'thread-123',
      organizationId: 77,
      query: 'risk summary',
      limitPerLayer: 4,
      maxChars: 3500,
    });
    expect(organizationWide.memoryBlock).toContain('Working Memory');
    expect(organizationWide.memoryBlock).toContain('Client Memory (semantic matches)');
    expect(organizationWide.memoryBlock).not.toContain('Project Memory (semantic matches)');
    expect(organizationWide.atoms.some(a => a.metadata?.source?.documentName === 'communications_playbook.pdf')).toBe(true);
    expect(organizationWide.diagnostics.droppedByForgetting).toBe(0);
    expect(organizationWide.diagnostics.droppedByDeduplication).toBe(0);
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
    // Verification prevents forgetting; it does not make a record fit the
    // prompt. Keep the ranked candidate, omit its entire body, and say so.
    expect(result.memoryBlock).not.toContain('A'.repeat(80));
    expect(result.read).toEqual([{ layer: 'working_memory', title: 'Latest Working Memory Summary' }]);
    expectBoundedBlock(result, 1000, true);
  });

  describe.each([
    { mode: 'project', projectId: 88, layer: 'project_memory' as const },
    { mode: 'client', projectId: undefined, layer: 'client_memory' as const },
  ])('$mode memory reaches the model only as complete records', ({ projectId, layer }) => {
    const input = { threadId: 'thread-complete-records', organizationId: 77, projectId, query: 'release', maxChars: 1000 };

    function recall(entries: ReturnType<typeof memoryHit>[]) {
      const search = projectId === undefined ? mockClientSearch : mockProjectSearch;
      search.mockResolvedValue({ entries, totalCount: entries.length, query: input.query });
    }

    beforeEach(() => {
      mockWorkingMemory.mockResolvedValue(null);
    });

    it('retains exclusions after character 400 when the complete record fits', async () => {
      const content = 'Use the agreed release process. ' + 'Supporting detail remains recorded. '.repeat(15) +
        'Exclusions: do not release the package before independent review is signed off.';
      recall([memoryHit(401, 'Qualified release', content, { sourceDocumentName: 'Release decision.md' })]);

      const result = await buildMemoryContextForChat({ ...input, maxChars: 3500 });

      expect(content.indexOf('Exclusions:')).toBeGreaterThan(400);
      expect(result.memoryBlock).toContain(content);
      expect(result.read).toEqual([{ layer, title: 'Qualified release', documentName: 'Release decision.md' }]);
      expectBoundedBlock(result, 3500, false);
    });

    it('keeps both complete records when their differing exclusions follow a shared long prefix', async () => {
      const shared = 'The release decision follows the agreed review procedure. '.repeat(10);
      const first = `${shared}Exclusions: do not include the pediatric cohort.`;
      const second = `${shared}Exclusions: do not include the renal impairment cohort.`;
      recall([
        memoryHit(402, 'Review decision', first, { sourceDocumentName: 'Decision A.md', similarity: 0.95 }),
        memoryHit(403, 'Review decision', second, { sourceDocumentName: 'Decision B.md', similarity: 0.85 }),
      ]);

      const result = await buildMemoryContextForChat({ ...input, maxChars: 3500 });

      expect(shared.length).toBeGreaterThan(400);
      expect(result.memoryBlock).toContain(first);
      expect(result.memoryBlock).toContain(second);
      expect(result.diagnostics.droppedByDeduplication).toBe(0);
      expect(result.read).toEqual([
        { layer, title: 'Review decision', documentName: 'Decision A.md' },
        { layer, title: 'Review decision', documentName: 'Decision B.md' },
      ]);
      expectBoundedBlock(result, 3500, false);
    });

    it('omits the whole qualified record when its wrapper and body exceed the global budget', async () => {
      const affirmative = 'Approve release of the qualified package.';
      const content = `${affirmative} ` + 'Supporting detail remains recorded. '.repeat(23) +
        'Exclusions: do not release until the independent review has signed off.';
      recall([memoryHit(404, 'Qualified release', content)]);

      const result = await buildMemoryContextForChat(input);

      // The body alone fits; the complete labelled record and block do not.
      expect(content.length).toBeLessThan(1000);
      expect(content.length).toBeGreaterThan(800);
      expect(result.atoms.map(atom => atom.id)).toEqual([404]);
      expect(result.memoryBlock).not.toContain(affirmative);
      expect(result.memoryBlock).not.toContain('Supporting detail remains recorded.');
      expect(result.read).toEqual([]);
      expectBoundedBlock(result, 1000, true);
    });

    it('admits a complete record at exactly 1000 rendered characters and omits it at 1001', async () => {
      const title = 'Exact-budget decision';
      const documentName = 'Boundary review.md';
      const probe = 'A short probe of the public record framing.';
      const setRecord = (content: string) => recall([
        memoryHit(413, title, content, { sourceDocumentName: documentName }),
      ]);
      setRecord(probe);
      const framed = await buildMemoryContextForChat(input);
      expect(framed.memoryBlock).toContain(probe);
      expectBoundedBlock(framed, 1000, false);

      // Measure the public framing, including its source label and delimiter,
      // without reaching into the packer's implementation or private helpers.
      const bodyBudget = 1000 - (framed.memoryBlock.length - probe.length);
      const opening = 'Consider the proposed release only after review. ';
      const qualification = ' Exclusions: do not release before the independent reviewer signs off.';
      const content = opening + 'D'.repeat(bodyBudget - opening.length - qualification.length) + qualification;
      setRecord(content);
      const exact = await buildMemoryContextForChat(input);

      expect(exact.memoryBlock.length).toBe(1000);
      expect(exact.memoryBlock).toContain(content);
      expect(exact.read).toEqual([{ layer, title, documentName }]);
      expectBoundedBlock(exact, 1000, false);

      setRecord(`${content}!`);
      const over = await buildMemoryContextForChat(input);
      expect(over.atoms.map(atom => atom.id)).toEqual([413]);
      expect(over.memoryBlock).not.toContain(opening);
      expect(over.memoryBlock).not.toContain(qualification);
      expect(over.read).toEqual([]);
      expectBoundedBlock(over, 1000, true);
    });

    it('skips an oversized working record and still admits a later smaller semantic record', async () => {
      const working = 'Approve the working proposal. ' + 'Historical detail. '.repeat(200) +
        'Exclusions: approval is conditional on the signed review.';
      const content = 'Retain the signed review requirement for every release.';
      mockWorkingMemory.mockResolvedValue(working);
      recall([memoryHit(405, 'Release condition', content)]);

      const result = await buildMemoryContextForChat(input);

      expect(result.atoms.some(atom => atom.layer === 'working_memory')).toBe(true);
      expect(result.memoryBlock).not.toContain('Approve the working proposal.');
      expect(result.memoryBlock).toContain(content);
      expect(result.read).toEqual([{ layer, title: 'Release condition' }]);
      expectBoundedBlock(result, 1000, true);
    });

    it.each(['title', 'category', 'sourceDocumentName'] as const)(
      'accounts for the complete %s label before admitting a record', async field => {
        const oversizedLabel = 'source-label-overflow-'.repeat(70);
        const omittedContent = 'This tiny body still requires its complete source label.';
        recall([
          memoryHit(406, 'Oversized label', omittedContent, { [field]: oversizedLabel, similarity: 0.95 }),
          memoryHit(407, 'Compact source', 'Keep the complete compact record.', { sourceDocumentName: 'Notes.md', similarity: 0.85 }),
        ]);

        const result = await buildMemoryContextForChat(input);

        expect(result.atoms).toHaveLength(2);
        expect(result.memoryBlock).not.toContain('source-label-overflow-');
        expect(result.memoryBlock).not.toContain(omittedContent);
        expect(result.memoryBlock).toContain('Keep the complete compact record.');
        expect(result.read).toEqual([{ layer, title: 'Compact source', documentName: 'Notes.md' }]);
        expectBoundedBlock(result, 1000, true);
      }
    );

    it('reports only admitted records when their source-label openings collide', async () => {
      const commonTitle = 'Shared approval record '.repeat(6);
      const firstTitle = `${commonTitle}A`;
      const omittedTitle = `${commonTitle}B`;
      recall([
        memoryHit(408, firstTitle, 'The first decision is complete.', { sourceDocumentName: 'First.md', similarity: 0.95 }),
        memoryHit(409, omittedTitle, 'Approve the second decision. ' + 'Conditional detail. '.repeat(100) +
          'Exclusions: the second decision is not approved for release.', { sourceDocumentName: 'Second.md', similarity: 0.9 }),
        memoryHit(410, 'Later compact decision', 'The later decision also fits.', { similarity: 0.85 }),
      ]);

      const result = await buildMemoryContextForChat(input);

      expect(commonTitle.length).toBeGreaterThan(80);
      expect(result.memoryBlock).toContain('The first decision is complete.');
      expect(result.memoryBlock).toContain('The later decision also fits.');
      expect(result.memoryBlock).not.toContain('Approve the second decision.');
      expect(result.read).toEqual([
        { layer, title: firstTitle, documentName: 'First.md' },
        { layer, title: 'Later compact decision' },
      ]);
      expectBoundedBlock(result, 1000, true);
    });

    it.each([
      { requested: undefined, applied: 3500 },
      { requested: 100, applied: 1000 },
      { requested: 20_000, applied: 12_000 },
    ])('preserves the existing $applied character limit for request $requested', async ({ requested, applied }) => {
      recall([
        memoryHit(411, 'Oversized history', 'Do not quote an incomplete history. '.repeat(500), { similarity: 0.95 }),
        memoryHit(412, 'Short remembered condition', 'Check the signed decision before release.', { similarity: 0.85 }),
      ]);

      const result = await buildMemoryContextForChat({ ...input, maxChars: requested });

      expect(result.memoryBlock).not.toContain('Do not quote an incomplete history.');
      expect(result.memoryBlock).toContain('Check the signed decision before release.');
      expect(result.read).toEqual([{ layer, title: 'Short remembered condition' }]);
      expectBoundedBlock(result, applied, true);
    });
  });
});
