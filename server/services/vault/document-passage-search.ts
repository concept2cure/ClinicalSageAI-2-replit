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

import type { RequestSqlClient } from '../../db/requestDb.js';
import { assertVerifiedProgramScope, getCurrentAccessibleProgramScope, ProgramReadAccessError, requireProgramScopeStillCurrent, type CurrentAccessibleProgramScope } from '../c2c/current-program-access.js';
import { vaultDataEligibleSql } from '../document-data-disposition/eligibility.js';
import { supersededSql } from './vault-version-family.js';
import type { AdmittedAnaSourceReadScope } from '../ana/source-read-scope.js';
import { assertRetrievalScope, pinRetrievalReadScope, verifyRetrievalSources, withRetrievalReadScope, type RetrievalQueryable } from './retrieval-source-access.js';

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
  /**
   * Why the failures failed, de-duplicated and bounded.
   *
   * `chunk_error` has been recorded on every indexing failure since the ledger
   * existed and read by nothing, so a document whose passages could not be
   * built was indistinguishable from one nobody had got to yet — to AnA and to
   * an operator alike. A count of failures with no reason is a number that
   * cannot be acted on.
   */
  failureReasons: string[];
  /**
   * Files the client attached in chat that are OUTSIDE this index entirely.
   *
   * The corpus is `vault.document_chunks`, whose `document_id` carries a hard
   * foreign key to `vault.documents` — so an upload that has not been filed
   * into the vault cannot be in it, however long it has existed. Its text does
   * reach a retrieval corpus, as ONE `lumen_data_atoms` row holding a bounded
   * prefix of the file, which is not the same capability and cannot cite a
   * page.
   *
   * Without this figure the coverage line said "All N document(s) are in the
   * passage index" while the very file the question was about sat outside it,
   * and a miss read as an exhaustive search. Null when the uploads could not be
   * counted — unknown, never zero.
   */
  unfiledUploads: number | null;
  /** True when there are more unfiled uploads than the bounded count probed. */
  unfiledUploadsMore: boolean;
}

export interface PassageSearchResult {
  hits: PassageHit[];
  /** Null when the chunking ledger could not be read — unknown, not zero. */
  coverage: PassageCoverage | null;
  /**
   * How the hits were ranked: 'text' when the query could not be embedded (no
   * key, or egress refused) and the text index answered alone; 'meaning_and_text'
   * when the embedding arm ran too. Null when nothing was returned to rank.
   */
  ranking: 'text' | 'meaning_and_text' | null;
}

/**
 * What fraction of the org's documents have passages in the corpus.
 *
 * Never guessed: a figure defaulting to zero understates the corpus and one
 * defaulting to "all" overstates it, and either would be read as fact. When the
 * ledger cannot be read the caller gets null and says the coverage is unknown —
 * which is true, and which still lets the search itself run.
 */
/** How many unfiled uploads the coverage line probes for before saying "more". */
const UNFILED_UPLOAD_PROBE = 20;

async function readUnfiledUploadCoverage(db: RetrievalQueryable, organizationId: number, userId: number, programId: string | null, scope?: AdmittedAnaSourceReadScope): Promise<Pick<PassageCoverage, 'unfiledUploads' | 'unfiledUploadsMore'>> {
  try {
    const { listChatUploads, listChatUploadsInReadScope } = await import('./document-catalog.service.js');
    const page = scope ? await listChatUploadsInReadScope(db, scope, { limit: UNFILED_UPLOAD_PROBE })
      : await listChatUploads(db, organizationId, { userId, programId, limit: UNFILED_UPLOAD_PROBE });
    return { unfiledUploads: page.uploads.length, unfiledUploadsMore: page.hasMore };
  } catch {
    return { unfiledUploads: null, unfiledUploadsMore: false };
  }
}

function ledgerCount(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
    throw new Error('The passage index ledger could not be verified.');
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('The passage index ledger could not be verified.');
  return count;
}

function recordedCoverage(r: Record<string, any>, uploads: Pick<PassageCoverage, 'unfiledUploads' | 'unfiledUploadsMore'>): PassageCoverage {
  const counts = ['total', 'indexed', 'pending', 'failed'].map(key => ledgerCount(r[key]));
  if (counts[1] + counts[2] + counts[3] > counts[0]) throw new Error('The passage index ledger could not be verified.');
  return { ...uploads, total: counts[0], indexed: counts[1], pending: counts[2], failed: counts[3],
    failureReasons: Array.isArray(r.failure_reasons) ? r.failure_reasons.filter((reason): reason is string => typeof reason === 'string' && reason.length > 0) : [] };
}

function requireMatchingPassageSourceActor(scope: AdmittedAnaSourceReadScope | undefined, organizationId: number, userId: number, programId: string | null): void {
  if (!scope) return;
  assertRetrievalScope(scope, organizationId, programId);
  if (scope.userId !== userId) throw new ProgramReadAccessError(403, 'PROJECT_SCOPE_UNVERIFIED', 'The requested actor does not match the source scope.');
}

export async function getPassageCoverage(
  db: RequestSqlClient,
  organizationId: number,
  opts: { userId: number; programId?: string | null; allowedProgramIds?: readonly string[]; sourceReadScope?: AdmittedAnaSourceReadScope },
  verifiedScope?: CurrentAccessibleProgramScope,
): Promise<PassageCoverage> {
  opts = Object.freeze({ ...opts, allowedProgramIds: opts.allowedProgramIds ? Object.freeze([...opts.allowedProgramIds]) : undefined });
  const programId = opts.programId ?? null;
  const sourceReadScope = opts.sourceReadScope ? pinRetrievalReadScope(opts.sourceReadScope) : undefined;
  const requestedPrograms = opts.allowedProgramIds ? [...opts.allowedProgramIds] : undefined;
  requireMatchingPassageSourceActor(sourceReadScope, organizationId, opts.userId, programId);
  const identity = { organizationId, userId: opts.userId, programId };
  if (verifiedScope) assertVerifiedProgramScope(db, identity, verifiedScope);
  const programScope = verifiedScope ?? await getCurrentAccessibleProgramScope(db, identity);
  if (sourceReadScope) await withRetrievalReadScope(sourceReadScope, async () => undefined);
  const narrowed = sourceReadScope?.accessibleProgramIds ?? requestedPrograms;
  const allowedProgramIds = narrowed === undefined ? programScope.programIds : programScope.programIds.filter(id => narrowed.includes(id));
  const params: unknown[] = [organizationId, programId, allowedProgramIds];
  const allowed = 'AND d.program_id = ANY($3::uuid[])';
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE c.chunk_status = 'chunked' AND COALESCE(c.chunk_count, 0) > 0)::int AS indexed,
            COUNT(*) FILTER (WHERE c.chunk_status IS NULL OR c.chunk_status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE c.chunk_status = 'chunk_failed')::int AS failed,
            -- The distinct reasons, capped: five identical provider timeouts are
            -- one fact, and an unbounded list would put a wall of text where a
            -- diagnosis belongs.
            (ARRAY_AGG(DISTINCT c.chunk_error) FILTER (
               WHERE c.chunk_status = 'chunk_failed' AND c.chunk_error IS NOT NULL
             ))[1:3] AS failure_reasons
       FROM vault.documents d
       JOIN regulatory_programs p ON p.id = d.program_id AND p.deleted_at IS NULL
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id AND c.content_hash = d.content_hash
      WHERE p.organization_id = $1 AND d.organization_id = $1 AND d.deleted_at IS NULL AND ${vaultDataEligibleSql('d')}
        AND NOT ${supersededSql('d')}
        AND ($2::uuid IS NULL OR d.program_id = $2::uuid) ${allowed}`,
    params,
  );
  if (rows.length !== 1) throw new Error('The passage index ledger could not be verified.');
  /* The uploads outside the corpus, through the one definition of "the chat
     uploads this organization currently has". Bounded — the coverage line needs
     to say THAT files sit outside the index and roughly how many, not to
     enumerate them — and independently fault-tolerant, because a coverage
     figure that fails the whole search would be a worse answer than a partial
     one. */
  const coverage = recordedCoverage(rows[0] ?? {}, await readUnfiledUploadCoverage(db, organizationId, opts.userId, programId, sourceReadScope));
  await requireProgramScopeStillCurrent(db, identity, programScope);
  if (sourceReadScope) await withRetrievalReadScope(sourceReadScope, async () => undefined);
  return coverage;
}

/* Coverage is context for the answer, not the answer. A ledger read that
   fails must not take the search down with it — but it must not quietly
   become "all indexed" either, so it becomes null and the caller says so. */
async function coverageOrUnknown(db: RequestSqlClient, identity: { organizationId: number; userId: number; programId: string | null }, opts: PassageSearchOptions, programScope: CurrentAccessibleProgramScope): Promise<PassageCoverage | null> {
  try {
    return await getPassageCoverage(db, identity.organizationId, { ...opts, userId: identity.userId, programId: identity.programId }, programScope);
  } catch (error) {
    if (error instanceof ProgramReadAccessError) throw error;
    return null;
  }
}

/** How retrieval ranked what it returned (see PassageSearchResult.ranking). */
function rankingOf(documents: Array<{ lexicalOnly?: boolean }>): PassageSearchResult['ranking'] {
  if (documents.length === 0) return null;
  return documents.every(d => d.lexicalOnly) ? 'text' : 'meaning_and_text';
}

export interface PassageSearchOptions {
  limit?: number;
  /**
   * One program's passages only: the open project (PF-10 S7). Pushed into the
   * vault SQL, so a passage of the open project that ranks below another
   * project's is still found; null = the actor's verified accessible library.
   */
  programId?: string | null;
  allowedProgramIds?: readonly string[];
  sourceReadScope?: AdmittedAnaSourceReadScope;
}

function pinPassageSearchOptions(opts: PassageSearchOptions): PassageSearchOptions {
  return Object.freeze({ ...opts, allowedProgramIds: opts.allowedProgramIds ? Object.freeze([...opts.allowedProgramIds]) : undefined });
}

function hasNoSearchablePassages(allowedProgramIds: readonly string[], coverage: PassageCoverage | null): boolean {
  return allowedProgramIds.length === 0 || (coverage !== null && coverage.total > 0 && coverage.indexed === 0);
}

type PassageSearchArgs = { organizationId: number; userId: number; organizationUuid: string | null | undefined; query: string };

async function preparePassageSearch(db: RequestSqlClient, args: PassageSearchArgs, opts: PassageSearchOptions) {
  const query = args.query.trim();
  if (query.length < 3) throw new PassageSearchUnavailableError('the query must be at least 3 characters.');
  if (!args.organizationUuid || !UUID_RE.test(args.organizationUuid)) {
    throw new PassageSearchUnavailableError('no organization identity is on this request, so the vault cannot be searched for one tenant. Nothing was searched — this is not an empty result.');
  }
  const programId = opts.programId ?? null;
  const identity = { organizationId: args.organizationId, userId: args.userId, programId };
  const scope = opts.sourceReadScope ? pinRetrievalReadScope(opts.sourceReadScope) : undefined;
  const requestedPrograms = opts.allowedProgramIds ? [...opts.allowedProgramIds] : undefined;
  requireMatchingPassageSourceActor(scope, args.organizationId, args.userId, programId);
  const programScope = await getCurrentAccessibleProgramScope(db, identity);
  const { rows } = await db.query('SELECT id FROM organizations WHERE id=$1 AND uuid=$2::uuid', [args.organizationId, args.organizationUuid]);
  if (rows.length !== 1 || Number(rows[0].id) !== args.organizationId) throw new PassageSearchUnavailableError('the organization identity could not be verified. Nothing was searched.');
  if (scope) await withRetrievalReadScope(scope, async () => undefined);
  return { query, organizationUuid: args.organizationUuid, programId, scope, identity, programScope,
    admittedOpts: { ...opts, sourceReadScope: scope, allowedProgramIds: programScope.programIds.filter(id => (scope?.accessibleProgramIds ?? requestedPrograms)?.includes(id) ?? true) } };
}

function passageFilters(programId: string | null, allowedProgramIds?: readonly string[]) {
  if (!programId && allowedProgramIds === undefined) return undefined;
  return { ...(programId ? { programId } : {}), ...(allowedProgramIds !== undefined ? { allowedProgramIds } : {}) };
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
  db: RequestSqlClient,
  args: PassageSearchArgs,
  opts: PassageSearchOptions = {},
): Promise<PassageSearchResult> {
  args = Object.freeze({ ...args });
  opts = pinPassageSearchOptions(opts);
  const limit = Math.min(25, Math.max(1, opts.limit ?? 8));
  const { query, organizationUuid, programId, scope, admittedOpts, identity, programScope } = await preparePassageSearch(db, args, opts);
  let coverage = await coverageOrUnknown(db, identity, admittedOpts, programScope);

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
  if (hasNoSearchablePassages(admittedOpts.allowedProgramIds, coverage)) {
    if (scope) await withRetrievalReadScope(scope, async () => undefined);
    await requireProgramScopeStillCurrent(db, identity, programScope);
    return { hits: [], coverage, ranking: null };
  }

  const { ragRouter } = await import('../ragRouter.js');
  let documents;
  try {
    const ctx = await ragRouter.retrieve({
      query,
      intent: 'regulatory_qa',
      corpus: 'vault',
      organizationUuid,
      limit,
      filters: passageFilters(programId, admittedOpts.allowedProgramIds),
      sourceReadScope: scope,
      vaultRead: { sqlClient: db, ...identity, verifiedScope: programScope },
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
    if (err instanceof ProgramReadAccessError) throw err;
    throw new PassageSearchUnavailableError(
      err instanceof Error ? err.message : String(err),
    );
  }

  if (scope) await withRetrievalReadScope(scope, q => verifyRetrievalSources(q, scope, documents.map(d => ({
    documentId: d.documentId ?? '', programId: d.programId ?? '', contentHash: d.contentHash ?? '',
  }))));
  if (scope) {
    // Ledger/counts were read before asynchronous retrieval. Refresh within
    // the current actor scope; failed ledger reads remain explicitly unknown.
    coverage = await coverageOrUnknown(db, identity, admittedOpts, programScope);
    await withRetrievalReadScope(scope, async () => undefined);
  }

  await requireProgramScopeStillCurrent(db, identity, programScope);
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

  return { hits, coverage, ranking: rankingOf(documents) };
}
