/**
 * The memory block AnA reads does not present a stored confidence_score as a
 * probability.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * renderSemanticLayer appended " | confidence: NN%" from each entry's
 * confidence_score. No writer of client/project memory measures one: the
 * extractors stamped rule constants or a model's self-report, and the column
 * defaults to 0.8 for any writer that leaves it out. AnA was told "confidence:
 * 100%" about an "Ingested: X" atom for a document nobody had read.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../working-memory', async importOriginal => ({
  ...(await importOriginal<typeof import('../working-memory')>()),
  getLatestWorkingMemoryByThread: vi.fn(async () => null),
}));
vi.mock('../client-intelligence-memory', () => ({
  searchMemoryEntriesSemantic: vi.fn(async () => ({
    entries: [{
      id: 1, category: 'history', title: 'Ingested: deck.pdf', content: 'Document "deck.pdf" was ingested.',
      similarity: 0.9, sourceDocumentName: 'deck.pdf', confidenceScore: 1, importanceLevel: 'low',
      isVerifiedByUser: false, extractedBy: 'ai', createdAt: new Date(), updatedAt: new Date(),
    }],
    totalCount: 1, query: 'deck',
  })),
  searchProjectMemoryEntriesSemantic: vi.fn(async () => ({
    entries: [{
      id: 2, category: 'risk', title: 'Study 001 Risk/Safety Signals', content: 'Key risks include hepatotoxicity.',
      similarity: 0.8, sourceDocumentName: 'protocol.pdf', confidenceScore: 0.75, importanceLevel: 'high',
      isVerifiedByUser: false, extractedBy: 'ai', createdAt: new Date(), updatedAt: new Date(),
    }],
    totalCount: 1, query: 'deck',
  })),
}));
vi.mock('../../db', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) }, db: {} }));

import { buildMemoryContextForChat } from '../memory-context-assembler';

// Since cc1607c3a3 (isolated project recall) an open project reads its own memory only; the
// organization's client memory is read when no project is open. Each layer is held to the rule here.
describe('memory block', () => {
  it('cites a project atom without a confidence percentage, and leaves the organization layer out', async () => {
    const { memoryBlock } = await buildMemoryContextForChat({
      threadId: 't1', organizationId: 9, projectId: 4, query: 'deck',
    });
    expect(memoryBlock).toContain('"Study 001 Risk/Safety Signals"');
    expect(memoryBlock, 'an open project read the organization-wide memory').not.toContain('"Ingested: deck.pdf"');
    expect(memoryBlock, 'a stored rule constant was presented as a probability').not.toMatch(/confidence/i);
  });

  it('cites an organization atom without a confidence percentage when no project is open', async () => {
    const { memoryBlock } = await buildMemoryContextForChat({ threadId: 't1', organizationId: 9, query: 'deck' });
    expect(memoryBlock).toContain('"Ingested: deck.pdf"');
    expect(memoryBlock, 'a stored rule constant was presented as a probability').not.toMatch(/confidence/i);
  });
});
