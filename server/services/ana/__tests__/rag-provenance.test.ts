/**
 * Provenance retrofit on the RAG path (project_knowledge_search). The ragRouter
 * is mocked so the suite is hermetic. Asserts the tool returns structured
 * passages plus a project_corpus provenance envelope, with relevance mapped to
 * a confidence level and a document-keyed citation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../ragRouter', () => ({
  ragRouter: {
    retrieve: vi.fn(async () => ({
      documents: [
        {
          id: 'row1',
          documentId: 'doc-42',
          chunkId: 'chunk-7',
          title: 'Protocol v3',
          content: 'The primary endpoint is overall survival at 24 months.',
          compressedContent: 'primary endpoint is overall survival at 24 months',
          atomType: 'document',
          finalScore: 0.91,
          pageNumber: 12,
          locator: 'Section 9.1',
        },
      ],
    })),
  },
}));

import { getToolHandler } from '../AnaToolExecutor';

describe('project_knowledge_search — RAG provenance', () => {
  beforeEach(() => vi.clearAllMocks());

  const ctx = { projectId: 1, organizationUuid: 'org-uuid' } as any;

  it('returns structured passages with a project_corpus provenance envelope', async () => {
    const out = JSON.parse(await getToolHandler('project_knowledge_search')!({ query: 'primary endpoint' }, ctx));
    expect(out.source).toMatch(/Project knowledge corpus/);
    expect(out.resultCount).toBe(1);
    expect(out.passages[0].text).toMatch(/overall survival/);
    expect(out.passages[0].locator).toBe('Section 9.1');

    expect(out.provenance).toHaveLength(1);
    const p = out.provenance[0];
    expect(p.sourceId).toBe('project_corpus');
    expect(p.sourceType).toBe('curated_corpus');
    expect(p.confidence).toBe('high'); // 0.91 → high
    expect(p.citation.identifier).toBe('doc-42');
    expect(p.citation.title).toContain('Section 9.1');
    expect(p.lineageObjectType).toBe('retrieval_chunk');
  });

  it('still degrades gracefully without an active project (no provenance)', async () => {
    const out = await getToolHandler('project_knowledge_search')!({ query: 'x' }, {} as any);
    expect(out).toMatch(/No active project/);
  });
});
