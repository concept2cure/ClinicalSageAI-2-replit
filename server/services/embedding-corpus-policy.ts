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
 *
 * ── THE MODEL ACTUALLY WRITTEN, PER LANE (P1-54 round 2, 2026-10-01) ─────────
 * ADR-0014 §1.5, amended 2026-10-01: every organisation embeds through the
 * self-hosted lane, BAAI/bge-m3, whatever it elected for generation. bge-m3
 * emits 1024 values; the corpora below are 1536 and 3072 wide. The seam
 * (ai-gateway/embeddings/embedding-provider.ts) asks the model for its own
 * width and zero-pads to the corpus width, which leaves cosine and L2 between
 * padded vectors unchanged. That holds only while every vector in a column
 * comes from one model, so:
 *   - `model` below stays the name the runtime's callers ask for (and the one
 *     the OpenAI lane writes); `writtenEmbedding(corpus, lane)` says what a lane
 *     actually stores, so a reader can tell;
 *   - a corpus holding vectors from another model is re-embedded before it is
 *     served. The rows cannot say which model wrote them: the writers record the
 *     name their caller asked for (vault/document-chunking.service.ts
 *     CHUNK_EMBEDDING_MODEL, enhancedEmbeddingService.embedAtom), whichever lane
 *     served it, so a filter on `embedding_model` would separate nothing.
 *     `findVectorsFromAnotherModel` reads the vectors instead, and the readiness
 *     probe (server/startup/ana-readiness-state.ts) refuses to report search
 *     ready while it finds any.
 */

import { runWithSystemTenantScope, runWithTenantScope } from '../db/tenantStore';

export type EmbeddingModel =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002';

export interface CorpusPolicy {
  /** Logical name of the corpus (matches the Drizzle export name where applicable). */
  corpus: string;
  /** Backing table in shared/schema.ts. */
  table: string;
  /** The pgvector column the corpus's embeddings are written to. */
  column: string;
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
 *   4. Embed through the canonical runtime from runtime callers — never
 *      openai.embeddings.create directly:
 *
 *          import { getEmbeddingService } from './enhancedEmbeddingService';
 *          import { getPolicyForCorpus } from './embedding-corpus-policy';
 *          const svc = getEmbeddingService(pool);
 *          await svc.embed(text, getPolicyForCorpus('<corpus name>').model);
 *
 * ── CORRECTED 2026-09-11 (WO-15 finding 8) ──────────────────────────────────
 * Step 4 used to read "Use embeddingService.embedForCorpus(text, '<corpus
 * name>')". THAT METHOD DOES NOT EXIST — `embedForCorpus` appears nowhere in
 * the repository except in the sentence instructing people to call it. The
 * canonical runtime is EnhancedEmbeddingService and its method is `embed(text,
 * model)`, reached via `getEmbeddingService(pool)`.
 *
 * Also not true as written: enhancedEmbeddingService.ts does not import this
 * file, so the policy below is not consulted by the runtime it is written for.
 * A caller picks the model itself and this table is documentation, not
 * enforcement. Stated plainly rather than left implied, because a policy
 * everyone believes is enforced is worse than one everyone knows is advisory.
 *
 * One consequence of that disconnection, recorded and not fixed here: the
 * `EmbeddingModel` union is declared independently in BOTH files, with
 * identical members. The example above type-checks only because the two happen
 * to agree structurally. Making this file the single declaration is the right
 * change and is larger than a comment correction, so it is named rather than
 * quietly done.
 */
export const CORPUS_POLICY: readonly CorpusPolicy[] = [
  {
    corpus: 'documentVectors',
    table: 'document_vectors',
    column: 'embedding',
    dimensions: 3072,
    model: 'text-embedding-3-large',
    purpose: 'Primary document corpus — high-precision retrieval over full eCTD/CER/510(k) bodies',
  },
  {
    corpus: 'ragChunks',
    table: 'rag_chunks',
    column: 'embedding',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Hot-path chunked retrieval for AnA chat and AnA-RI orchestrator',
  },
  {
    corpus: 'knowledgeEntries',
    table: 'knowledge_entries',
    column: 'embedding',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Knowledge atoms (rejection patterns, guidance excerpts, regulatory decisions)',
  },
  {
    corpus: 'clientMemoryEntries',
    table: 'client_memory_entries',
    column: 'embedding',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Per-tenant persistent memory atoms with importance + verification flags',
  },
  {
    corpus: 'projectMemoryEntries',
    table: 'project_memory_entries',
    column: 'embedding',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Per-project memory entries scoped to a single submission/program',
  },
  {
    corpus: 'accountCanonItems',
    table: 'account_canon_items',
    column: 'embedding',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Canonicalized account-level items (products, indications, regulatory bodies)',
  },
  {
    corpus: 'biostatKnowledgeNodes',
    table: 'biostat_knowledge_nodes',
    column: 'embedding',
    dimensions: 1536,
    model: 'text-embedding-3-small',
    purpose: 'Biostatistics knowledge graph — endpoints, study designs, statistical methods',
  },
  {
    corpus: 'vaultDocumentChunks',
    table: 'vault.document_chunks',
    column: 'embedding',
    dimensions: 1536,
    // The active writer (vault/document-chunking.service.ts:110,
    // CHUNK_EMBEDDING_MODEL) and the reader
    // (advancedRAGPipeline.searchVaultSimilar) both use text-embedding-3-small;
    // only the column DEFAULT is the legacy ada-002, which the writer overrides.
    // Registered as 3-small to match what the index is actually built and
    // queried with — both are 1536d, so no re-vectorize.
    //
    // Corrected 2026-09-18: this named layout-aware-ingestion.ts as the active
    // writer. That module was unreachable — its only importer,
    // enhanced-ingestion-pipeline.ts, was itself unimported — and both were
    // deleted. The registration is unchanged because the REAL writer
    // independently uses 3-small, but the attribution was wrong, and the
    // attribution is the evidence this entry rests on.
    model: 'text-embedding-3-small',
    purpose: 'Vault document chunks — semantic similarity search over indexed vault PDFs/DOCX',
  },
  {
    corpus: 'lumenDataAtoms',
    table: 'lumen_data_atoms',
    column: 'embedding',
    dimensions: 1536,
    // Added 2026-10-01 (P1-54 round 2): the corpus the embedding runtime itself
    // writes (enhancedEmbeddingService.embedAtom / embedAllPendingAtoms, its
    // default model) and searches (searchSemantic / searchHybrid). It was not
    // registered, so nothing that reads this table could check it.
    model: 'text-embedding-3-small',
    purpose: 'Retrieval atoms — the knowledge base the embedding runtime embeds and searches',
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

// ─────────────────────────────────────────────────────────────────────────────
// What each lane writes (ADR-0014 §1.5, amended 2026-10-01).

/**
 * The model the self-hosted lane serves and writes into every corpus, and its
 * own width. The seam defaults EMBEDDING_LOCAL_MODEL and
 * EMBEDDING_LOCAL_NATIVE_DIMENSIONS to these; terraform/stack serves the same
 * model (tests/boot_contract.tftest.hcl reads this line), and the readiness
 * probe refuses a lane that answers as anything else.
 */
export const SELF_HOSTED_EMBEDDING_MODEL = { model: 'BAAI/bge-m3', nativeDimensions: 1024 } as const;

/** The embedding lanes (EMBEDDING_PROVIDER): OpenAI, or the self-hosted server. */
export type EmbeddingLane = 'openai' | 'local';

export interface WrittenEmbedding {
  corpus: string;
  lane: EmbeddingLane;
  /** The model whose vectors the corpus holds when this lane writes it. */
  model: string;
  /** How many values that model emits. */
  nativeDimensions: number;
  /** The column's width. */
  storedDimensions: number;
  /** Stored wider than emitted: the values past `nativeDimensions` are zero. */
  zeroPadded: boolean;
}

/** What a corpus holds when `lane` writes it. Throws for an unregistered corpus. */
export function writtenEmbedding(corpus: string, lane: EmbeddingLane): WrittenEmbedding {
  const policy = getPolicyForCorpus(corpus);
  if (lane === 'local') {
    return {
      corpus,
      lane,
      model: SELF_HOSTED_EMBEDDING_MODEL.model,
      nativeDimensions: SELF_HOSTED_EMBEDDING_MODEL.nativeDimensions,
      storedDimensions: policy.dimensions,
      zeroPadded: SELF_HOSTED_EMBEDDING_MODEL.nativeDimensions < policy.dimensions,
    };
  }
  return {
    corpus,
    lane,
    model: policy.model,
    nativeDimensions: policy.dimensions,
    storedDimensions: policy.dimensions,
    zeroPadded: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A corpus written by another model (the check the readiness probe uses).

/** What the check needs of a database handle: `pg.Pool` satisfies it. */
export interface CorpusQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface ForeignVectorFinding {
  corpus: string;
  table: string;
  /** The most rows any one scope saw. */
  rows: number;
  /** Who saw them: 'platform', or 'organization <id>'. */
  scopes: string[];
}

export interface ForeignVectorReport {
  model: string;
  nativeDimensions: number;
  /** Corpus tables this database has, which were read. */
  examined: string[];
  /** Corpus tables this database does not have (they hold nothing). */
  absent: string[];
  findings: ForeignVectorFinding[];
}

const CHECK_CALLER = 'embedding-corpus-policy:vectors-from-another-model';

const PLAIN_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** `schema.table` → `"schema"."table"`; a bare name is in `public`. Policy constants only. */
function qualifiedIdentifier(name: string): string {
  const parts = name.includes('.') ? name.split('.') : ['public', name];
  if (parts.length !== 2 || !parts.every(p => PLAIN_IDENTIFIER.test(p))) {
    throw new Error(`embedding-corpus-policy: "${name}" is not a plain identifier`);
  }
  return parts.map(p => `"${p}"`).join('.');
}

/**
 * Rows of a corpus whose vector carries a value past the self-hosted model's
 * width: a padded bge-m3 vector is zero there, one any wider model wrote is not.
 * Built from the policy's constants (validated identifiers), never from input.
 */
function foreignVectorCountSql(policy: CorpusPolicy, nativeDimensions: number): string {
  if (!PLAIN_IDENTIFIER.test(policy.column) || !Number.isInteger(nativeDimensions)) {
    throw new Error(`embedding-corpus-policy: "${policy.column}" is not a plain identifier`);
  }
  const table = qualifiedIdentifier(policy.table);
  const column = `"${policy.column}"`;
  return (
    `SELECT count(*)::int AS rows FROM ${table} AS t ` +
    `WHERE t.${column} IS NOT NULL ` +
    `AND EXISTS (SELECT 1 FROM unnest((t.${column}::real[])[${nativeDimensions + 1}:]) AS v(x) WHERE v.x <> 0)`
  );
}

/**
 * Which corpora hold vectors the self-hosted model did not write.
 *
 * Reads every registered corpus table in the platform scope and then in each
 * organization's own scope, because neither sees everything under RLS: the
 * platform scope sees a public corpus whole but no Vault chunk at all
 * (vault.document_chunks resolves the tenant from the organization's UUID), and
 * an organization sees only its own rows, not the platform's. Proof against
 * PostgreSQL as the runtime role: __tests__/embedding-corpus-policy.dbtest.ts.
 *
 * Decides by content, for the reason in this file's header: the rows' own
 * `embedding_model` names what was asked for, not what served it. A vector
 * whose values past position 1024 are all zero is indistinguishable from a
 * padded bge-m3 one; another 1024-wide model behind the address is the seam's
 * and the probe's to refuse (embedding-provider.ts).
 *
 * Every scan is a full read of the table's vector column, per scope. With no
 * tenant data yet (ADR-0014 §1.5) that is nothing; it grows with the corpora
 * (P1-54 round 2 evidence, residuals).
 *
 * Throws when a query fails: a corpus that could not be read is not clean.
 */
export async function findVectorsFromAnotherModel(db: CorpusQueryable): Promise<ForeignVectorReport> {
  const { model, nativeDimensions } = SELF_HOSTED_EMBEDDING_MODEL;

  const { examined, absent, organizations } = await runWithSystemTenantScope(CHECK_CALLER, async () => {
    const present: string[] = [];
    const missing: string[] = [];
    for (const policy of CORPUS_POLICY) {
      const found = await db.query('SELECT to_regclass($1) IS NOT NULL AS present', [
        qualifiedIdentifier(policy.table).replace(/"/g, ''),
      ]);
      (found.rows[0]?.present === true ? present : missing).push(policy.table);
    }
    const orgs = await db.query('SELECT id, uuid::text AS uuid FROM public.organizations ORDER BY id');
    return {
      examined: present,
      absent: missing,
      organizations: orgs.rows.map(r => ({ id: Number(r.id), uuid: r.uuid == null ? null : String(r.uuid) })),
    };
  });

  const corpora = CORPUS_POLICY.filter(policy => examined.includes(policy.table));
  const scopes: Array<{ label: string; run: <T>(fn: () => Promise<T>) => Promise<T> }> = [
    { label: 'platform', run: fn => runWithSystemTenantScope(CHECK_CALLER, fn) },
    ...organizations.map(o => ({
      label: `organization ${o.id}`,
      run: <T>(fn: () => Promise<T>) =>
        runWithTenantScope({ tenantId: String(o.id), orgUuid: o.uuid, role: null, source: 'job', caller: CHECK_CALLER }, fn),
    })),
  ];

  const byTable = new Map<string, ForeignVectorFinding>();
  for (const scope of scopes) {
    for (const policy of corpora) {
      const result = await scope.run(() => db.query(foreignVectorCountSql(policy, nativeDimensions)));
      const rows = Number(result.rows[0]?.rows ?? 0);
      if (rows <= 0) continue;
      const finding = byTable.get(policy.table) ?? { corpus: policy.corpus, table: policy.table, rows: 0, scopes: [] };
      finding.rows = Math.max(finding.rows, rows);
      finding.scopes.push(scope.label);
      byTable.set(policy.table, finding);
    }
  }

  return { model, nativeDimensions, examined, absent, findings: [...byTable.values()] };
}
