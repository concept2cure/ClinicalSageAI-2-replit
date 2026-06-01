import { describe, it, expect } from 'vitest';
import {
  CORPUS_POLICY,
  assertModelMatchesCorpus,
  getPolicyForCorpus,
  getPolicyForTable,
  listCorpora,
} from '../embedding-corpus-policy';

describe('embedding-corpus-policy', () => {
  it('has every corpus mapped to a model with matching dimensions', () => {
    for (const policy of CORPUS_POLICY) {
      if (policy.dimensions === 1536) {
        // Both small and ada are 1536d — corpus stays compatible if either is allowed.
        expect(['text-embedding-3-small', 'text-embedding-ada-002']).toContain(policy.model);
      } else if (policy.dimensions === 3072) {
        expect(policy.model).toBe('text-embedding-3-large');
      } else {
        throw new Error(`Unexpected dimension ${policy.dimensions} for ${policy.corpus}`);
      }
    }
  });

  it('has unique corpus names and unique table names', () => {
    const corpora = CORPUS_POLICY.map(p => p.corpus);
    const tables = CORPUS_POLICY.map(p => p.table);
    expect(new Set(corpora).size).toBe(corpora.length);
    expect(new Set(tables).size).toBe(tables.length);
  });

  it('has at least one entry per known table', () => {
    // Spot-check the known tables that the audit explicitly called out.
    expect(getPolicyForTable('document_vectors')?.dimensions).toBe(3072);
    expect(getPolicyForTable('rag_chunks')?.dimensions).toBe(1536);
    expect(getPolicyForTable('client_memory_entries')?.dimensions).toBe(1536);
    expect(getPolicyForTable('project_memory_entries')?.dimensions).toBe(1536);
  });

  it('throws a helpful error for an unregistered corpus', () => {
    expect(() => getPolicyForCorpus('nonexistent')).toThrow(
      /No embedding corpus policy registered for "nonexistent"/
    );
  });

  it('lists every known corpus', () => {
    const all = listCorpora();
    expect(all.length).toBeGreaterThanOrEqual(7);
    expect(all.map(c => c.corpus)).toContain('documentVectors');
    expect(all.map(c => c.corpus)).toContain('ragChunks');
  });

  describe('assertModelMatchesCorpus', () => {
    it('passes when model matches corpus policy', () => {
      expect(() =>
        assertModelMatchesCorpus('ragChunks', 'text-embedding-3-small')
      ).not.toThrow();
      expect(() =>
        assertModelMatchesCorpus('documentVectors', 'text-embedding-3-large')
      ).not.toThrow();
    });

    it('throws when querying 3072d corpus with 1536d model (dimension mismatch)', () => {
      expect(() =>
        assertModelMatchesCorpus('documentVectors', 'text-embedding-3-small')
      ).toThrow(/policy requires text-embedding-3-large/);
    });

    it('throws when querying 1536d corpus with 3072d model', () => {
      expect(() =>
        assertModelMatchesCorpus('ragChunks', 'text-embedding-3-large')
      ).toThrow(/policy requires text-embedding-3-small/);
    });

    it('throws when querying ragChunks with the legacy ada model (silent retrieval miss)', () => {
      // Same-dimension mismatch is the dangerous case: ada-002 has the
      // same dimensions as 3-small, so the insert would succeed, but
      // retrieval results would be silently incorrect because the
      // embedding spaces differ.
      expect(() =>
        assertModelMatchesCorpus('ragChunks', 'text-embedding-ada-002')
      ).toThrow(/silent retrieval misses/);
    });

    it('passes for vaultDocumentChunks with 3-small (active writer + reader model)', () => {
      // The vault writer (layout-aware-ingestion) and reader
      // (advancedRAGPipeline.searchVaultSimilar) both use text-embedding-3-small;
      // only the column default is the legacy ada-002, which the writer
      // overrides. Policy is registered as 3-small to match the live index.
      expect(() =>
        assertModelMatchesCorpus('vaultDocumentChunks', 'text-embedding-3-small')
      ).not.toThrow();
    });

    it('throws when querying vaultDocumentChunks with ada-002 (silent retrieval miss)', () => {
      // ada-002 shares 3-small's 1536 dimensions, so this is the dangerous
      // same-dimension mismatch: the query succeeds but reads a different
      // embedding space than the index was built with.
      expect(() =>
        assertModelMatchesCorpus('vaultDocumentChunks', 'text-embedding-ada-002')
      ).toThrow(/silent retrieval misses/);
    });
  });
});
