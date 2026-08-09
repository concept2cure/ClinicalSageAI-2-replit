/**
 * enhancedEmbeddingService carries source identity on retrieved atoms.
 *
 * searchHybrid / searchSimilar historically returned {id, content, title, …}
 * and DROPPED source_id / source_type — so a retrieved chunk could not be
 * resolved back to its cre_evidence_sources.id, which is the prerequisite for
 * automated span-level source attribution (Phase 2/3). These pin the additive
 * fix: both methods now attach sourceId/sourceType via a best-effort lookup,
 * WITHOUT touching the (quirk-laden) search queries themselves.
 *
 * The pool is a stub keyed on SQL so no Postgres / pgvector is needed; embed is
 * stubbed so no embedding provider is called.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnhancedEmbeddingService } from '../enhancedEmbeddingService';

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

function makeService(query: QueryFn): EnhancedEmbeddingService {
  const svc = new EnhancedEmbeddingService({ query } as any);
  // Stub the embedding call so no provider is hit and the search proceeds.
  (svc as any).embed = vi.fn(async () => ({
    embedding: [0.1, 0.2, 0.3],
    text: 'q',
    model: 'text-embedding-3-small',
    tokenCount: 1,
    cached: true,
  }));
  return svc;
}

const HYBRID_ROWS = [
  { id: 'atom-1', content: 'c1', title: 't1', combined_score: '0.9', semantic_score: '0.8', keyword_score: '0.5' },
  { id: 'atom-2', content: 'c2', title: 't2', combined_score: '0.7', semantic_score: '0.6', keyword_score: '0.4' },
];

const isEnrichment = (sql: string) => /source_id,\s*source_type\s+FROM\s+lumen_data_atoms/i.test(sql);

describe('enhancedEmbeddingService source-identity enrichment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searchHybrid attaches sourceId/sourceType from the enrichment lookup', async () => {
    const svc = makeService(async (sql) => {
      if (/search_atoms_hybrid/.test(sql)) return { rows: HYBRID_ROWS };
      if (isEnrichment(sql)) {
        return {
          rows: [
            { id: 'atom-1', source_id: 'artifact-abc', source_type: 'data_room_upload' },
            // atom-2 deliberately absent → must resolve to null, not undefined
          ],
        };
      }
      return { rows: [] };
    });

    const out = await svc.searchHybrid('q', 5);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'atom-1', content: 'c1', sourceId: 'artifact-abc', sourceType: 'data_room_upload' });
    // Search fields are preserved untouched.
    expect(out[0].score).toBeCloseTo(0.9);
    // An atom with no enrichment row is null (not undefined, not omitted).
    expect(out[1]).toMatchObject({ id: 'atom-2', sourceId: null, sourceType: null });
  });

  it('searchHybrid degrades to null source identity if enrichment fails — search is unaffected', async () => {
    const svc = makeService(async (sql) => {
      if (/search_atoms_hybrid/.test(sql)) return { rows: HYBRID_ROWS };
      if (isEnrichment(sql)) throw new Error('lumen_data_atoms unavailable');
      return { rows: [] };
    });

    const out = await svc.searchHybrid('q', 5);

    expect(out).toHaveLength(2); // retrieval still returns its rows
    expect(out.every((r) => r.sourceId === null && r.sourceType === null)).toBe(true);
  });

  it('searchSimilar attaches sourceId/sourceType too', async () => {
    const svc = makeService(async (sql) => {
      if (isEnrichment(sql)) {
        return { rows: [{ id: 'atom-3', source_id: 'cre_source:42', source_type: 'chat_upload' }] };
      }
      // The searchSimilar main query (direct lumen_data_atoms select).
      return { rows: [{ id: 'atom-3', content: 'c3', title: 't3', similarity: '0.95', atom_type: 'finding' }] };
    });

    const out = await svc.searchSimilar('q', 5, 0.7, 'org-uuid-1');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'atom-3',
      atomType: 'finding',
      sourceId: 'cre_source:42',
      sourceType: 'chat_upload',
    });
  });
});
