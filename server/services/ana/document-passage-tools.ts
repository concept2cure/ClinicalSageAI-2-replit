/**
 * search_document_passages — the sentences inside the client's files.
 *
 * The catalog surface could answer "which file is about X" (the comprehension
 * records) and "read me this file" (the whole text, paged). It could not answer
 * "what do these documents SAY about X", which is what a person usually means
 * when they point at their own evidence. The passage index that answers it has
 * existed since every vault upload started being chunked and embedded — the
 * reader for it lives in AdvancedRAGPipeline, and no tool AnA can call ever
 * reached it. project_knowledge_search looks like the one and is not: it scopes
 * to project ATOMS (Data Room artifacts), never to the client's uploads.
 *
 * So this tool exists to join the two halves, over the canonical retrieval path
 * rather than a second query of its own (see document-passage-search.ts).
 *
 * The honesty rules it carries:
 *   • a miss reports how many documents are NOT in the passage index, because
 *     "no passage matched" across a partly-indexed corpus is not the same claim
 *     as "the evidence does not say that";
 *   • an unavailable index or embedding provider is SAID, never rendered as an
 *     empty result;
 *   • passages are explicitly not a substitute for the full read the catalog
 *     gate requires — they answer a question, they do not comprehend a file.
 *
 * @module server/services/ana/document-passage-tools
 */

import type { ToolContext } from './AnaToolExecutor.js';
import { requireCatalog, withCaughtErrors, type RegisterFn } from './document-tools-shared.js';

/**
 * What sits OUTSIDE this index no matter how complete the vault side is.
 *
 * The corpus is keyed to vault documents. A file the client attached in chat
 * and never filed cannot be in it — its text reaches retrieval only as one
 * bounded-prefix atom, which cannot cite a page and does not hold the rest of
 * the document. Saying "all N documents are indexed" while the file the
 * question is about sits outside was the coverage line's blind spot, and it
 * turned a miss into an exhaustive search.
 */
function outsideIndexNote(c: { unfiledUploads?: number | null; unfiledUploadsMore?: boolean }): string {
  if (c.unfiledUploads == null) {
    return ' Whether the client has chat-attached files outside this index could not be checked.';
  }
  if (c.unfiledUploads === 0) return '';
  const n = `${c.unfiledUploads}${c.unfiledUploadsMore ? '+' : ''}`;
  return (
    ` Separately, ${n} file(s) the client attached in chat are NOT in this index at all — only the ` +
    'opening of each reached the retrieval corpus. Do not treat this search as covering them: open one ' +
    'with read_uploaded_document, or file_chat_upload_to_vault to index all of it, page by page.'
  );
}

/** One line of honest context about what the search could not see. */
function coverageNote(
  c: {
    total: number;
    indexed: number;
    pending: number;
    failed: number;
    failureReasons?: string[];
    unfiledUploads?: number | null;
    unfiledUploadsMore?: boolean;
  } | null,
): string {
  if (!c) {
    return (
      'How much of the vault is in the passage index could not be read, so this result does not say ' +
      'what it did not cover.'
    );
  }
  if (c.total === 0) return `No documents are filed in this vault yet.${outsideIndexNote(c)}`;
  if (c.indexed === 0) {
    /* The index is EMPTY — a different statement from "nothing matched", and a
       very different one from "the embedding provider is unreachable", which is
       what this used to report because the query was embedded before anyone
       checked whether there was anything to search. An empty index almost
       always means the ana.vault_chunking feature is off, so the answer routes
       to a switch instead of to a shrug. */
    return (
      `None of the ${c.total} document(s) in this vault are in the passage index, so nothing was ` +
      'searched — this is not a result about what the documents say. The index is built by the ' +
      'ana.vault_chunking feature; if it is off, say so plainly rather than reporting the content as ' +
      'absent, and read the file itself with read_project_document to answer from it.' +
      outsideIndexNote(c)
    );
  }
  if (c.indexed >= c.total) {
    return `All ${c.total} document(s) are in the passage index.${outsideIndexNote(c)}`;
  }
  const parts: string[] = [`${c.indexed} of ${c.total} document(s) are in the passage index`];
  if (c.pending > 0) parts.push(`${c.pending} not indexed yet`);
  if (c.failed > 0) {
    /* The reason, not just the count. It was recorded on every failure and
       read by nothing, so a document whose passages could not be built looked
       exactly like one nobody had got to — and "N failed" is a number nobody
       can act on. */
    const why = (c.failureReasons ?? []).length ? ` (${(c.failureReasons ?? []).join('; ')})` : '';
    parts.push(`${c.failed} failed to index${why}`);
  }
  return (
    `${parts.join('; ')}. A passage not found here is not evidence the document does not say it — ` +
    'read the file with read_project_document before telling the user it is absent.' +
    outsideIndexNote(c)
  );
}

async function handleSearchDocumentPassages(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireCatalog(ctx, 'search_document_passages');
  if ('refusal' in gate) return JSON.stringify({ error: gate.refusal });
  const { orgId } = gate;

  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (query.length < 3) {
    return JSON.stringify({
      error: 'search_document_passages requires a query of at least 3 characters.',
    });
  }
  const limit =
    typeof input.limit === 'number' && input.limit > 0 ? Math.min(25, Math.floor(input.limit)) : 8;

  const { searchDocumentPassages, PassageSearchUnavailableError } = await import(
    '../vault/document-passage-search.js'
  );
  try {
    const result = await searchDocumentPassages(
      { organizationId: orgId, organizationUuid: ctx?.organizationUuid, query },
      { limit },
    );
    const note = coverageNote(result.coverage);
    return JSON.stringify({
      ok: true,
      query,
      passages: result.hits,
      coverage: result.coverage,
      message:
        result.hits.length === 0
          ? `No passage matched "${query}". ${note}`
          : `${result.hits.length} passage(s). ${note} Quote them with their document title and locator; ` +
            'open the whole file with read_project_document when the answer needs the surrounding context.',
    });
  } catch (err) {
    if (err instanceof PassageSearchUnavailableError) {
      // Unavailable is not "no passages" — say which it is, and route onward.
      return JSON.stringify({
        ok: false,
        unavailable: true,
        error: err.message,
        message:
          'Nothing was searched. Do not report that the documents do not mention it — fall back to ' +
          'search_project_documents and read_project_document.',
      });
    }
    throw err;
  }
}

export function registerDocumentPassageHandlers(register: RegisterFn): void {
  register(
    'search_document_passages',
    withCaughtErrors('search_document_passages', handleSearchDocumentPassages),
  );
}
