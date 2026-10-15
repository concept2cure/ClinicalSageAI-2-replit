/**
 * The assistant's Vault search: AnA's search_project_documents and the
 * connector's c2c_search_vault_documents, one implementation (D2, 2026-10-01;
 * docs/evidence/D2/2026-10-01-vault-search-no-key/).
 *
 * Founder direction, 2026-10-01: "Vault search should not depend on an OpenAI
 * key or a Claude key or any key." So the text arm always runs: the ranked
 * Postgres full-text search the Vault surface gives users (vault-search.ts),
 * matching any of the question's words. The meaning arm, the catalog's
 * comprehension records by embedding (document-catalog-search.ts), is added
 * when the organisation's catalog is on and an embedding provider answers. Its
 * absence narrows the search and is reported; it never empties it.
 */
import { searchVaultDocuments } from './vault-search.js';
import { getCurrentAccessibleProgramScope, requireProgramScopeStillCurrent } from '../c2c/current-program-access.js';
import type { AdmittedAnaSourceReadScope } from '../ana/source-read-scope.js';
import { assertRetrievalScope, pinRetrievalReadScope, verifyRetrievalSources, withRetrievalReadScope, type RetrievalSourceIdentity } from './retrieval-source-access.js';
import { AnaProjectScopeError } from '../ana/project-scope-admission.js';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export interface AssistantSearchHit {
  documentId: string;
  title: string;
  fileName: string | null;
  program: { id: string; name: string | null };
  ctdSection: string | null;
  folderId: string | null;
  placementStatus: string | null;
  /** A body excerpt around the match (text arm only). */
  snippet: string | null;
  /** 'text': the query's words appear. 'meaning': the catalog's semantic index matched. */
  matchedBy: Array<'text' | 'meaning'>;
  documentKind?: string | null;
  purpose?: string | null;
  summary?: string | null;
  keyData?: unknown;
  similarity?: number;
}

export interface AssistantSearchResult {
  hits: AssistantSearchHit[];
  /** Current documents whose text matched any query word, before the limit. */
  textMatches: number;
  semantic:
    | { available: true; searchedCount: number; unsearchableCount: number }
    | { available: false; reason: 'catalog_off' | 'no_embedding_provider' };
}

interface AssistantSearchParams {
  organizationId: number; userId: number; programId: string | null; query: string; limit: number;
  catalogEnabled: boolean; allowedProgramIds?: readonly string[]; sourceReadScope?: AdmittedAnaSourceReadScope;
}
function pinAssistantSearchParams(p: AssistantSearchParams): AssistantSearchParams {
  return Object.freeze({ ...p, allowedProgramIds: p.allowedProgramIds ? Object.freeze([...p.allowedProgramIds]) : undefined });
}
function requireMatchingSourceActor(scope: AdmittedAnaSourceReadScope | undefined, p: AssistantSearchParams): void {
  if (!scope) return;
  assertRetrievalScope(scope, p.organizationId, p.programId);
  if (scope.userId !== p.userId) throw new AnaProjectScopeError(403, 'ANA_SOURCE_SCOPE_MISMATCH', 'The requested actor does not match the source scope.');
}

export async function searchVaultForAssistant(
  db: Queryable,
  p: AssistantSearchParams,
): Promise<AssistantSearchResult> {
  p = pinAssistantSearchParams(p);
  const scope = p.sourceReadScope ? pinRetrievalReadScope(p.sourceReadScope) : undefined;
  requireMatchingSourceActor(scope, p);
  const identity = { organizationId: p.organizationId, userId: p.userId, programId: p.programId };
  const programScope = await getCurrentAccessibleProgramScope(db, identity);
  const textSearch = (executor: Queryable) => searchVaultDocuments(executor, {
    organizationId: p.organizationId,
    userId: p.userId,
    programId: p.programId,
    q: p.query,
    limit: p.limit,
    offset: 0,
    includeSuperseded: false,
    match: 'any',
    allowedProgramIds: scope?.accessibleProgramIds ?? p.allowedProgramIds,
  }, executor === db ? programScope : undefined);
  const text = scope ? await withRetrievalReadScope(scope, textSearch) : await textSearch(db);
  const identities: RetrievalSourceIdentity[] = scope ? text.results.map(r => ({ documentId: r.id, programId: r.program.id, contentHash: r.contentHash ?? '' })) : [];
  const finish = async (result: AssistantSearchResult): Promise<AssistantSearchResult> => {
    if (scope) await withRetrievalReadScope(scope, async q => {
      await verifyRetrievalSources(q, scope, identities);
      const current = await textSearch(q);
      if (current.total !== text.total || JSON.stringify(current.results) !== JSON.stringify(text.results)) {
        throw new AnaProjectScopeError(409, 'ANA_SOURCE_CHANGED', 'Source access or identity changed during retrieval. Search again before using these sources.');
      }
    });
    await requireProgramScopeStillCurrent(db, identity, programScope);
    return result;
  };
  const hits = new Map<string, AssistantSearchHit>();
  for (const r of text.results) {
    hits.set(r.id, {
      documentId: r.id,
      title: r.title,
      fileName: r.fileName,
      program: r.program,
      ctdSection: r.ctdSection,
      folderId: r.folderId,
      placementStatus: r.placementStatus,
      snippet: r.snippet,
      matchedBy: ['text'],
    });
  }

  if (!p.catalogEnabled) {
    return finish({ hits: [...hits.values()], textMatches: text.total, semantic: { available: false, reason: 'catalog_off' } });
  }
  const { searchCatalog, CatalogSearchUnavailableError } = await import('./document-catalog-search.js');
  try {
    const result = await searchCatalog(db, p.organizationId, p.query, { userId: p.userId, limit: p.limit, programId: p.programId,
      allowedProgramIds: scope?.accessibleProgramIds ?? p.allowedProgramIds, sourceReadScope: scope }, programScope);
    for (const c of result.hits) {
      if (scope) identities.push({ documentId: c.documentId, programId: c.programId, contentHash: c.contentHash ?? '' });
      const recorded = {
        documentKind: c.documentKind,
        purpose: c.purpose,
        summary: c.summary,
        keyData: c.keyData,
        similarity: c.similarity,
      };
      const prior = hits.get(c.documentId);
      hits.set(
        c.documentId,
        prior
          ? { ...prior, ...recorded, matchedBy: ['text', 'meaning'] }
          : {
              documentId: c.documentId,
              title: c.documentTitle,
              fileName: c.fileName,
              program: { id: c.programId, name: c.programName },
              ctdSection: c.ctdSection,
              folderId: c.folderId,
              placementStatus: c.placementStatus,
              snippet: null,
              ...recorded,
              matchedBy: ['meaning'],
            },
      );
    }
    return finish({
      hits: [...hits.values()].slice(0, p.limit),
      textMatches: text.total,
      semantic: { available: true, searchedCount: result.searchedCount, unsearchableCount: result.unsearchableCount },
    });
  } catch (err) {
    if (!(err instanceof CatalogSearchUnavailableError)) throw err;
    return finish({
      hits: [...hits.values()],
      textMatches: text.total,
      semantic: { available: false, reason: 'no_embedding_provider' },
    });
  }
}
