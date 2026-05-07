/**
 * Embedding corpus policy.
 *
 * Closes the "no canonical router policy for 1536d / 3072d vector spaces"
 * gap from DATA_KNOWLEDGE_MEMORY_LAYER_AUDIT.md.
 *
 * The platform stores embeddings in seven pgvector-backed tables; six are
 * 1536d and one is 3072d. Picking the wrong model for a corpus produces a
 * dimension-mismatch error at insert time and silent retrieval misses
 * when the same query is embedded with a different model than the index.
 *
 * Rather than chase down every call site (~10 places call openai.embeddings
 * directly today), this module declares the canonical policy as data, and
 * server/services/enhancedEmbeddingService.ts is the single approved
 * runtime that consults it. New corpora go in the table below; the CI
 * gate scripts/ci/check-embedding-runtime-canonicality.mjs prevents new
 * direct callers from bypassing the runtime.
 *
 * @compliance ICH E6(R2) data integrity — the same query against the same
 *             corpus yields a reproducible result set.
 */

export type EmbeddingModel =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002';

export interface CorpusPolicy {
  /** Logical name of the corpus (matches the Drizzle export name where applicable). */
  corpus: string;
  /** Backing table in shared/schema.ts. */
  table: string;
  /** Vector dimension declared on the column. */
  dimensions: 1536 | 3072;
  /** Model that MUST be used to embed both writes and queries. */
  model: EmbeddingModel;
  /** One-line purpose of this corpus, for documentation. */
  purpose: string;
}

/**
 * The single source of truth for which model goes with which corpus.
 *
 * Adding a new corpus:
 *   1. Add the pgvector column to shared/schema.ts.
 *   2. Add an entry here matching the column dimensions to the chosen model.
 *   3. Migrate via db:push.
 *   4. Use embeddingService.embedForCorpus(text, '<corpus name>') from
 *      runtime callers — never openai.embeddings.create directly.
 */
export const CORPUS_POLICY: readonly CorpusPolicy[] = [
  {
    corpus: 'documentVectors',
    table: 'document_vectors',
    dimensions: 3072,
    model: 'text-embedding-3-large',
    purpose: 'Primary document corpus — high-precision retrieval over full eCTD/CER/510(k) bodies',
  },
  {
    corpus: 'ragChunks',
    table: 'rag_chunks',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Hot-path chunked retrieval for AnA chat and AnA-RI orchestrator',
  },
  {
    corpus: 'knowledgeEntries',
    table: 'knowledge_entries',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Knowledge atoms (rejection patterns, guidance excerpts, regulatory decisions)',
  },
  {
    corpus: 'clientMemoryEntries',
    table: 'client_memory_entries',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Per-tenant persistent memory atoms with importance + verification flags',
  },
  {
    corpus: 'projectMemoryEntries',
    table: 'project_memory_entries',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Per-project memory entries scoped to a single submission/program',
  },
  {
    corpus: 'accountCanonItems',
    table: 'account_canon_items',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Canonicalized account-level items (products, indications, regulatory bodies)',
  },
  {
    corpus: 'biostatKnowledgeNodes',
    table: 'biostat_knowledge_nodes',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Biostatistics knowledge graph — endpoints, study designs, statistical methods',
  },
] as const;

const POLICY_BY_CORPUS = new Map<string, CorpusPolicy>(
  CORPUS_POLICY.map(entry => [entry.corpus, entry])
);

const POLICY_BY_TABLE = new Map<string, CorpusPolicy>(
  CORPUS_POLICY.map(entry => [entry.table, entry])
);

/**
 * Look up the canonical policy for a corpus by its logical name.
 * Throws if no policy exists — never silently default, because that's
 * how dimension-mismatch bugs reach prod.
 */
export function getPolicyForCorpus(corpus: string): CorpusPolicy {
  const entry = POLICY_BY_CORPUS.get(corpus);
  if (!entry) {
    throw new Error(
      `No embedding corpus policy registered for "${corpus}". ` +
        `Add an entry to CORPUS_POLICY in server/services/embedding-corpus-policy.ts. ` +
        `Known corpora: ${Array.from(POLICY_BY_CORPUS.keys()).join(', ')}`
    );
  }
  return entry;
}

/** Same lookup, by Postgres table name. Useful for diagnostics. */
export function getPolicyForTable(table: string): CorpusPolicy | undefined {
  return POLICY_BY_TABLE.get(table);
}

/**
 * Validate that an embedding produced by a given model is compatible with
 * a target corpus. Cheap guard for callers that compose corpora.
 */
export function assertModelMatchesCorpus(
  corpus: string,
  model: EmbeddingModel
): void {
  const policy = getPolicyForCorpus(corpus);
  if (policy.model !== model) {
    throw new Error(
      `Embedding model mismatch for corpus "${corpus}": ` +
        `policy requires ${policy.model} (${policy.dimensions}d), got ${model}. ` +
        'Querying with a different model than the index was built with produces ' +
        'silent retrieval misses, not just dimension errors.'
    );
  }
}

/** All registered corpora. Useful for inventory / CI inspection. */
export function listCorpora(): readonly CorpusPolicy[] {
  return CORPUS_POLICY;
}
