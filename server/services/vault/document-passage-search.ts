/**
 * Passage search over the client's own filed documents — the data INSIDE the
 * files, not a summary of them.
 *
 * ── The gap this closes ─────────────────────────────────────────────────────
 * Every vault upload is chunked and embedded into `vault.document_chunks` at
 * ingest, and the legacy backlog was swept into it. The corpus is real, it is
 * tenant-predicated, and `AdvancedRAGPipeline.searchVaultSimilar` reads it
 * well. Nothing AnA can call ever reached it. `project_knowledge_search` looks
 * like the tool for this and is not: it passes an `artifactScope`, which routes
 * retrieval to the project ATOM index (Data Room artifacts), never to the
 * client's uploaded documents. The only readers of the vault corpus were the
 * Cortex query route and the RAG eval harness.
 *
 * So the passages of a client's own evidence were indexed and unreachable —
 * the mirror image of the defect that created them (a reader with no store).
 * AnA could read a whole document end to end, or search the comprehension
 * SUMMARIES she had written (`search_project_documents`), but could not ask
 * "what do these files say about the 6-month assay result" and be handed the
 * sentence that says it.
 *
 * ── What this is ────────────────────────────────────────────────────────────
 * A thin, honest adapter over the canonical retrieval path: `ragRouter` with
 * `corpus: 'vault'`, so corpus selection, tenant predicates, hybrid fusion and
 * reranking policy stay defined in one place. No second SQL path.
 *
 * ── Fails closed ────────────────────────────────────────────────────────────
 * `searchVaultSimilar` RETURNS EMPTY when it has no usable organization uuid —
 * a deliberate refusal, but one indistinguishable from "nothing matched" by
 * the time it reaches a model. So a missing tenant is rejected here, before the
 * call, and a retrieval failure is thrown rather than flattened. Every result
 * also carries what is NOT indexed, because "no passage matched" across a
 * corpus holding a third of the documents is not the same statement as "the
 * evidence does not say that".
 *
 * @module server/services/vault/document-passage-search
 */

import { pool } from '../../db.js';

export class PassageSearchUnavailableError extends Error {
  constructor(reason: string) {
    super(`Passage search is unavailable: ${reason}`);
    this.name = 'PassageSearchUnavailableError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One matched passage, with enough locator to cite it and reopen its file. */
export interface PassageHit {
  documentId: string | null;
  documentTitle: string;
  /** Page / section as the chunker recorded it; null when the format has none. */
  locator: string | null;
  pageNumber: number | null;
  sectionTitle: string | null;
  chunkIndex: number | null;
  text: string;
  similarity: number;
}

/**
 * How much of this organization's vault is actually searchable — read from the
 * chunking ledger on the catalog, not inferred. `indexed + pending + failed`
 * need not equal `total`: a document with no catalog row at all is counted in
 * `total` and in neither of the others, which is itself worth saying.
 */
export interface PassageCoverage {
  total: number;
  indexed: number;
  pending: number;
  failed: number;
}

export interface PassageSearchResult {
  hits: PassageHit[];
  /** Null when the chunking ledger could not be read — unknown, not zero. */
  coverage: PassageCoverage | null;
}

/**
 * What fraction of the org's documents have passages in the corpus.
 *
 * Never guessed: a figure defaulting to zero understates the corpus and one
 * defaulting to "all" overstates it, and either would be read as fact. When the
 * ledger cannot be read the caller gets null and says the coverage is unknown —
 * which is true, and which still lets the search itself run.
 */
export async function getPassageCoverage(organizationId: number): Promise<PassageCoverage> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE c.chunk_status = 'chunked' AND COALESCE(c.chunk_count, 0) > 0)::int AS indexed,
            COUNT(*) FILTER (WHERE c.chunk_status IS NULL OR c.chunk_status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE c.chunk_status = 'chunk_failed')::int AS failed
       FROM vault.documents d
       JOIN regulatory_programs p ON p.id = d.program_id
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id
      WHERE p.organization_id = $1 AND d.deleted_at IS NULL`,
    [organizationId],
  );
  const r = rows[0] ?? {};
  return {
    total: Number(r.total ?? 0),
    indexed: Number(r.indexed ?? 0),
    pending: Number(r.pending ?? 0),
    failed: Number(r.failed ?? 0),
  };
}

export interface PassageSearchOptions {
  limit?: number;
}

/**
 * Search the organization's vault passages, through the one canonical router.
 *
 * `organizationUuid` is the tenant boundary the vault corpus enforces (it
 * resolves uuid → organizations.id → vault.documents.organization_id); the
 * integer id is used only for the coverage figures, which are read through the
 * program join. Both are required: with either missing this would search
 * nothing and report it as "no match", which is the failure mode the whole
 * catalog exists to stop.
 */
export async function searchDocumentPassages(
  args: {
    organizationId: number;
    organizationUuid: string | null | undefined;
    query: string;
  },
  opts: PassageSearchOptions = {},
): Promise<PassageSearchResult> {
  const query = args.query.trim();
  if (query.length < 3) {
    throw new PassageSearchUnavailableError('the query must be at least 3 characters.');
  }
  if (!args.organizationUuid || !UUID_RE.test(args.organizationUuid)) {
    // The pipeline would refuse this by returning [], which reads as "nothing
    // matched". Say what actually happened instead.
    throw new PassageSearchUnavailableError(
      'no organization identity is on this request, so the vault cannot be searched for one tenant. ' +
        'Nothing was searched — this is not an empty result.',
    );
  }
  const limit = Math.min(25, Math.max(1, opts.limit ?? 8));

  /* Coverage is context for the answer, not the answer. A ledger read that
     fails must not take the search down with it — but it must not quietly
     become "all indexed" either, so it becomes null and the caller says so. */
  let coverage: PassageCoverage | null;
  try {
    coverage = await getPassageCoverage(args.organizationId);
  } catch {
    coverage = null;
  }

  /* NOTHING IS INDEXED — answer without embedding anything.
     The two feature flags are independent, and catalog-on/chunking-off is the
     combination most deployments will actually run: cataloging is free at
     ingest, the passage index embeds every upload and is not. In that state a
     search used to embed the query first and then fail at the provider, so the
     tool reported "the embedding provider is unreachable" — infrastructure
     blame for a state that is nothing of the sort, and the opposite of what the
     startup line promises an operator. Even with a healthy provider it was a
     network round trip to search zero rows.
     Checked against `indexed`, not `total`: an organization with no documents
     at all is a different (also honest) message the caller composes from the
     same coverage. */
  if (coverage && coverage.total > 0 && coverage.indexed === 0) {
    return { hits: [], coverage };
  }

  const { ragRouter } = await import('../ragRouter.js');
  let documents;
  try {
    const ctx = await ragRouter.retrieve({
      query,
      intent: 'regulatory_qa',
      corpus: 'vault',
      organizationUuid: args.organizationUuid,
      limit,
      /* Two deliberate departures from the regulatory_qa defaults, both because
         this runs INSIDE an agent turn rather than behind a request a person is
         waiting on once.

         `strategy: 'basic'` instead of 'advanced': advanced is HyDE plus
         multi-query, so every search costs two extra model round trips before
         a single row is read. The agent issues several searches per turn and is
         itself the thing that reads and judges the passages, so paying for a
         model to rewrite the query first buys recall the agent can get by
         asking again in different words.

         `useReranking: false` for the same reason — an LLM-as-judge pass over
         every candidate, per search. Hybrid retrieval and MMR stay on (they are
         SQL and arithmetic), and context expansion stays on because a matched
         sentence without its surrounding clause is how a figure gets quoted out
         of the condition attached to it. */
      strategy: 'basic',
      useReranking: false,
    });
    documents = ctx?.documents ?? [];
  } catch (err) {
    throw new PassageSearchUnavailableError(
      err instanceof Error ? err.message : String(err),
    );
  }

  const hits: PassageHit[] = documents.slice(0, limit).map(d => ({
    documentId: d.documentId ?? null,
    documentTitle: d.title || 'Untitled',
    locator: d.locator ?? null,
    pageNumber: typeof d.pageNumber === 'number' ? d.pageNumber : null,
    sectionTitle: d.sectionTitle ?? null,
    chunkIndex: typeof d.chunkIndex === 'number' ? d.chunkIndex : null,
    text: d.content ?? '',
    similarity: Number(d.finalScore ?? d.initialScore ?? 0),
  }));

  return { hits, coverage };
}
