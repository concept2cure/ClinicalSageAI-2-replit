/**
 * Semantic search over the document catalog — "which of the client's files
 * speaks to X?", answered from the comprehension records AnA has written.
 *
 * Searches ONLY current cataloged versions: the embedding indexes the recorded
 * description (kind + purpose + summary + legacy key data). A matching record
 * is not a context-verified scientific fact. Uncataloged documents are absent by
 * construction — discovery of those is list_project_documents' job, and the
 * caller is told how many exist so absence is never mistaken for "no such
 * file".
 *
 * Fails closed, never empty-on-error: an unreachable embedding provider or a
 * database without pgvector throws a CatalogSearchUnavailableError naming the
 * reason. Returning [] for those states would render "nothing matched" over
 * "we could not look", which is the exact dishonesty the catalog exists to
 * stop.
 */

import { pool } from '../../db.js';
import { assertVerifiedProgramScope, getCurrentAccessibleProgramScope, requireProgramScopeStillCurrent, type CurrentAccessibleProgramScope } from '../c2c/current-program-access.js';
import { queryCatalogMeaningIndex } from './document-catalog-search-query.js';
import { missingVectorIndex } from './vector-index-availability.js';
import type { AdmittedAnaSourceReadScope } from '../ana/source-read-scope.js';
import { assertRetrievalScope, pinRetrievalReadScope, withRetrievalReadScope } from './retrieval-source-access.js';

export type CatalogSearchQueryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
export interface CatalogSearchOptions {
  limit?: number;
  minSimilarity?: number;
  programId?: string | null;
  /** Server-admitted scope. Empty means search no programmes. */
  allowedProgramIds?: readonly string[];
  /** Existing trusted executor; callers stamp tenant context when necessary. */
  db?: CatalogSearchQueryable;
  sourceReadScope?: AdmittedAnaSourceReadScope;
}

export class CatalogSearchUnavailableError extends Error {
  constructor(reason: string) {
    super(`Semantic catalog search is unavailable: ${reason}`);
    this.name = 'CatalogSearchUnavailableError';
  }
}

export interface CatalogSearchHit {
  originalFileAvailable: boolean;
  documentId: string;
  contentHash?: string;
  programId: string;
  programName: string | null;
  fileName: string;
  documentTitle: string;
  documentKind: string | null;
  purpose: string | null;
  summary: string | null;
  /**
   * The figures AnA recorded from the document after reading it — study ids,
   * doses, endpoints, batch numbers, dates, as the text stated them. It was
   * written, embedded into the very vector this search matches on, and then
   * left out of the result: a hit said "this file is about X" and made the
   * reader open the file again for the numbers it had already extracted.
   */
  keyData: unknown;
  folderId: string | null;
  ctdSection: string | null;
  placementStatus: string;
  similarity: number;
}

export interface CatalogSearchResult {
  hits: CatalogSearchHit[];
  /** Current cataloged versions searched (embedding present). */
  searchedCount: number;
  /** Current versions NOT searchable yet (uncataloged / failed / unembedded). */
  unsearchableCount: number;
}

/** The query as a pgvector literal; a provider failure is the search being unavailable. */
async function embedQuery(db: CatalogSearchQueryable, query: string): Promise<string> {
  try {
    const { getEmbeddingService } = await import('../enhancedEmbeddingService.js');
    const { embedding } = await getEmbeddingService(db as any).embed(query, 'text-embedding-3-small');
    return `[${embedding.join(',')}]`;
  } catch (err) {
    throw new CatalogSearchUnavailableError(
      `the embedding provider could not embed the query (${err instanceof Error ? err.message : 'unknown error'})`,
    );
  }
}

/**
 * Cosine search over vault.document_catalog.embedding, org-checked through
 * regulatory_programs like every other vault read.
 */
export interface CurrentActorCatalogSearchOptions extends Omit<CatalogSearchOptions, 'db'> { userId: number | undefined }
export function searchCatalog(organizationId: number, query: string, opts?: CatalogSearchOptions): Promise<CatalogSearchResult>;
// eslint-disable-next-line no-redeclare -- TypeScript overload declarations share one implementation.
export function searchCatalog(db: CatalogSearchQueryable, organizationId: number, query: string, opts: CurrentActorCatalogSearchOptions, verifiedScope?: CurrentAccessibleProgramScope): Promise<CatalogSearchResult>;
// eslint-disable-next-line no-redeclare -- TypeScript overload declarations share one implementation.
export async function searchCatalog(dbOrOrganizationId: CatalogSearchQueryable | number, orgOrQuery: number | string,
  queryOrOpts: string | CatalogSearchOptions = {}, actorOpts?: CurrentActorCatalogSearchOptions,
  verifiedScope?: CurrentAccessibleProgramScope): Promise<CatalogSearchResult> {
  if (typeof dbOrOrganizationId === 'number') return searchCatalogInSourceScope(dbOrOrganizationId, orgOrQuery as string, queryOrOpts as CatalogSearchOptions);
  const db = dbOrOrganizationId;
  const organizationId = orgOrQuery as number;
  const opts = { ...actorOpts!, allowedProgramIds: actorOpts?.allowedProgramIds?.slice() };
  const identity = { organizationId, userId: opts.userId, programId: opts.programId ?? null };
  if (verifiedScope) assertVerifiedProgramScope(db, identity, verifiedScope);
  const scope = verifiedScope ?? await getCurrentAccessibleProgramScope(db, identity);
  if (scope.programIds.length === 0) {
    await requireProgramScopeStillCurrent(db, identity, scope);
    return { hits: [], searchedCount: 0, unsearchableCount: 0 };
  }
  const found = await searchCatalogInSourceScope(organizationId, queryOrOpts as string, { ...opts, db, allowedProgramIds: opts.allowedProgramIds === undefined ? scope.programIds : scope.programIds.filter(id => opts.allowedProgramIds!.includes(id)) });
  await requireProgramScopeStillCurrent(db, identity, scope);
  return found;
}

async function searchCatalogInSourceScope(
  organizationId: number,
  query: string,
  /** programId: one program's documents only (the open project, PF-10 S7); absent or null = the organization's. */
  opts: CatalogSearchOptions = {},
): Promise<CatalogSearchResult> {
  opts = { ...opts, allowedProgramIds: opts.allowedProgramIds?.slice() };
  const limit = Math.min(25, Math.max(1, opts.limit ?? 8));
  const minSimilarity = opts.minSimilarity ?? 0.15;
  const programId = opts.programId ?? null;
  const scope = opts.sourceReadScope ? pinRetrievalReadScope(opts.sourceReadScope) : undefined;
  if (scope) {
    assertRetrievalScope(scope, organizationId, programId);
    await withRetrievalReadScope(scope, async () => undefined);
  }
  const db = opts.db ?? pool;
  const vectorLiteral = await embedQuery(db, query);
  const run = (executor: CatalogSearchQueryable) => queryCatalogMeaningIndex(executor, { organizationId, programId, vectorLiteral, limit, minSimilarity, allowedProgramIds: scope ? (opts.allowedProgramIds === undefined ? scope.accessibleProgramIds : scope.accessibleProgramIds.filter(id => opts.allowedProgramIds!.includes(id))) : opts.allowedProgramIds });
  try {
    if (!scope) return await run(db);
    const result = await withRetrievalReadScope(scope, async executor => {
      await executor.query('SAVEPOINT catalog_meaning_search');
      try {
        const found = await run(executor);
        await executor.query('RELEASE SAVEPOINT catalog_meaning_search');
        return { found };
      } catch (error) {
        await executor.query('ROLLBACK TO SAVEPOINT catalog_meaning_search');
        await executor.query('RELEASE SAVEPOINT catalog_meaning_search');
        if (!missingVectorIndex(error)) throw error;
        return { unavailable: true as const };
      }
    });
    if (result.found) return result.found;
    throw new CatalogSearchUnavailableError('this database has no pgvector embedding column for the catalog');
  } catch (err) {
    // 42703 = the embedding column does not exist (no pgvector on this
    // database); 42883 = the <=> operator is missing. Both mean the index,
    // not the corpus, is absent — say that.
    if (missingVectorIndex(err)) {
      throw new CatalogSearchUnavailableError(
        'this database has no pgvector embedding column for the catalog',
      );
    }
    throw err;
  }
}
