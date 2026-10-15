import { describe, it, expect } from 'vitest';
import {
  CORPUS_POLICY,
  SELF_HOSTED_EMBEDDING_MODEL,
  assertModelMatchesCorpus,
  findVectorsFromAnotherModel,
  getPolicyForCorpus,
  getPolicyForTable,
  listCorpora,
  writtenEmbedding,
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
      // The vault writer (vault/document-chunking.service.ts, corrected
      // 2026-09-18 from the deleted layout-aware-ingestion) and reader
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

// ─────────────────────────────────────────────────────────────────────────────
// What each lane writes (ADR-0014 §1.5, amended 2026-10-01; P1-54 round 2).
//
// Every organisation embeds through the self-hosted lane: BAAI/bge-m3, whose
// 1024 values are zero-padded to the corpus width. A reader must be able to tell
// which model wrote a column, so the policy names it per lane rather than only
// the OpenAI model the runtime's callers name.

describe('the model each lane writes into a corpus', () => {
  it('the self-hosted lane writes BAAI/bge-m3, native width 1024', () => {
    expect(SELF_HOSTED_EMBEDDING_MODEL).toEqual({ model: 'BAAI/bge-m3', nativeDimensions: 1024 });
  });

  it('through the self-hosted lane every corpus holds bge-m3, stored at the corpus width, zero-padded', () => {
    expect(writtenEmbedding('vaultDocumentChunks', 'local')).toEqual({
      corpus: 'vaultDocumentChunks',
      lane: 'local',
      model: 'BAAI/bge-m3',
      nativeDimensions: 1024,
      storedDimensions: 1536,
      zeroPadded: true,
    });
    expect(writtenEmbedding('documentVectors', 'local')).toMatchObject({
      model: 'BAAI/bge-m3',
      nativeDimensions: 1024,
      storedDimensions: 3072,
      zeroPadded: true,
    });
    for (const policy of CORPUS_POLICY) {
      expect(writtenEmbedding(policy.corpus, 'local').model).toBe('BAAI/bge-m3');
    }
  });

  it('through the OpenAI lane a corpus holds the model its callers name, at its own width', () => {
    expect(writtenEmbedding('ragChunks', 'openai')).toEqual({
      corpus: 'ragChunks',
      lane: 'openai',
      model: 'text-embedding-3-small',
      nativeDimensions: 1536,
      storedDimensions: 1536,
      zeroPadded: false,
    });
    expect(writtenEmbedding('documentVectors', 'openai')).toMatchObject({
      model: 'text-embedding-3-large',
      storedDimensions: 3072,
      zeroPadded: false,
    });
  });

  it('every corpus names the vector column its rows are written to', () => {
    for (const policy of CORPUS_POLICY) expect(policy.column).toMatch(/^[a-z_][a-z0-9_]*$/);
  });

  it('registers lumen_data_atoms, the corpus the embedding runtime itself writes (embedAtom)', () => {
    expect(getPolicyForTable('lumen_data_atoms')).toMatchObject({ dimensions: 1536, model: 'text-embedding-3-small' });
  });
});

describe('findVectorsFromAnotherModel: the check the readiness probe uses', () => {
  // The rows do not say which model wrote them: the writers record the model
  // name their caller asked for (vault/document-chunking.service.ts,
  // enhancedEmbeddingService.embedAtom), whichever lane served it. So the check
  // reads the vectors. A bge-m3 vector padded to 1536 is zero from position
  // 1025 on; one written by any 1536- or 3072-wide model is not.
  type Call = { text: string; params?: unknown[] };

  function fakeDb(counts: Record<string, number>, absent: string[] = []) {
    const calls: Call[] = [];
    return {
      calls,
      query: async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (/FROM public\.organizations/.test(text)) return { rows: [{ id: 7, uuid: '00000000-0000-4000-8000-000000000007' }] };
        if (/to_regclass/.test(text)) {
          return { rows: [{ present: !absent.some(t => String(params?.[0]).endsWith(t)) }] };
        }
        const table = Object.keys(counts).find(t => text.includes(t.split('.').map(p => `"${p}"`).join('.')));
        return { rows: [{ rows: table ? counts[table] : 0 }] };
      },
    };
  }

  it('reads, past the model\'s 1024 values, whether anything is not zero, in every corpus table', async () => {
    const db = fakeDb({});
    const report = await findVectorsFromAnotherModel(db);
    expect(report).toMatchObject({ model: 'BAAI/bge-m3', nativeDimensions: 1024, findings: [] });
    const scans = db.calls.filter(c => /count\(\*\)/.test(c.text));
    // Every corpus, in the platform scope and in each organization's.
    expect(scans).toHaveLength(CORPUS_POLICY.length * 2);
    expect(scans[0].text).toContain('[1025:]');
    expect(scans.find(c => c.text.includes('"vault"."document_chunks"'))?.text).toContain('"embedding"');
  });

  it('names each corpus holding vectors the self-hosted model did not write, and who could see them', async () => {
    const db = fakeDb({ 'vault.document_chunks': 4 });
    const report = await findVectorsFromAnotherModel(db);
    expect(report.findings).toEqual([
      { corpus: 'vaultDocumentChunks', table: 'vault.document_chunks', rows: 4, scopes: ['platform', 'organization 7'] },
    ]);
  });

  it('a corpus whose table this database does not have holds nothing, and is reported as absent', async () => {
    const db = fakeDb({}, ['biostat_knowledge_nodes']);
    const report = await findVectorsFromAnotherModel(db);
    expect(report.absent).toEqual(['biostat_knowledge_nodes']);
    expect(report.examined).not.toContain('biostat_knowledge_nodes');
    expect(db.calls.some(c => c.text.includes('"biostat_knowledge_nodes"'))).toBe(false);
  });

  it('a query that fails is an error, never an empty finding', async () => {
    const db = {
      query: async (text: string) => {
        if (/count\(\*\)/.test(text)) throw new Error('permission denied for table rag_chunks');
        if (/to_regclass/.test(text)) return { rows: [{ present: true }] };
        return { rows: [] };
      },
    };
    await expect(findVectorsFromAnotherModel(db)).rejects.toThrow(/permission denied/);
  });
});
