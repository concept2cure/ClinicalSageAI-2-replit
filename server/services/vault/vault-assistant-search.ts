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

export async function searchVaultForAssistant(
  db: Queryable,
  p: { organizationId: number; programId: string | null; query: string; limit: number; catalogEnabled: boolean },
): Promise<AssistantSearchResult> {
  const text = await searchVaultDocuments(db, {
    organizationId: p.organizationId,
    programId: p.programId,
    q: p.query,
    limit: p.limit,
    offset: 0,
    includeSuperseded: false,
    match: 'any',
  });
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
    return { hits: [...hits.values()], textMatches: text.total, semantic: { available: false, reason: 'catalog_off' } };
  }
  const { searchCatalog, CatalogSearchUnavailableError } = await import('./document-catalog-search.js');
  try {
    const result = await searchCatalog(p.organizationId, p.query, { limit: p.limit, programId: p.programId });
    for (const c of result.hits) {
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
    return {
      hits: [...hits.values()].slice(0, p.limit),
      textMatches: text.total,
      semantic: { available: true, searchedCount: result.searchedCount, unsearchableCount: result.unsearchableCount },
    };
  } catch (err) {
    if (!(err instanceof CatalogSearchUnavailableError)) throw err;
    return {
      hits: [...hits.values()],
      textMatches: text.total,
      semantic: { available: false, reason: 'no_embedding_provider' },
    };
  }
}
