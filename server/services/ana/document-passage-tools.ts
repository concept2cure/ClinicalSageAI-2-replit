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
import { requireDocumentAccess, withCaughtErrors, type RegisterFn } from './document-tools-shared.js';
import { catalogScope } from './catalog-scope.js';
import type { PassageCoverage, PassageHit } from '../vault/document-passage-search.js';

/**
 * Below the classic per-result 8,000-character cut (P-24). This handler fits
 * its body and says what it left out; aggregate round budgeting is separate.
 */
export const PASSAGE_RESULT_BUDGET = 7500;
const PASSAGE_METADATA_BUDGET = 1000;

type PassageDetail = 'full' | 'no_context_text' | 'locator_only';
type ModelCoverage = PassageCoverage & { failureReasonsOmitted?: true };

/** Keep counts/unknowns intact; diagnostic text must not consume the evidence budget. */
function modelCoverage(coverage: PassageCoverage | null): ModelCoverage | null {
  if (!coverage || JSON.stringify(coverage.failureReasons ?? []).length <= PASSAGE_METADATA_BUDGET) return coverage;
  return { ...coverage, failureReasons: [], failureReasonsOmitted: true };
}

function modelCoverageNote(coverage: ModelCoverage | null): string {
  return 'Within the current actor’s accessible source scope: ' + coverageNote(coverage) +
    (coverage?.failureReasonsOmitted ? ' Detailed indexing failure reasons were omitted to fit this result.' : '');
}

/** Last guard follows the caught-error wrapper, covering every return branch. */
function boundPassageResult(result: string): string {
  if (result.length <= PASSAGE_RESULT_BUDGET) return result;
  let unavailable = false;
  try { unavailable = (JSON.parse(result) as { unavailable?: unknown } | null)?.unavailable === true; }
  catch { /* Defensive non-JSON wrapper output is omitted too. */ }
  return JSON.stringify({ ok: false, code: 'PASSAGE_RESULT_TOO_LARGE', resultOmitted: true,
    ...(unavailable ? { unavailable: true } : {}),
    message: 'The passage-search response could not be shown intact within this result. ' +
      'Do not treat this omitted response as evidence absence. Use a narrower query or ' +
      'search_project_documents and read_project_document in the current source scope.' });
}

/** One passage as the model reads it, at a level of detail. */
function modelPassage(hit: PassageHit, detail: PassageDetail): Record<string, unknown> {
  const { text, context: given, ...meta } = hit;
  // A hit with no context recorded was not expanded; say so rather than assume.
  const context: PassageHit['context'] = given ?? { status: 'unavailable', reason: 'not_expanded' };
  if (context.status !== 'available') {
    return detail === 'locator_only' ? { ...meta, textOmitted: true, context } : { ...meta, text, context };
  }
  const { text: contextText, ...reference } = context;
  if (detail === 'full') {
    // The hit is inside the context; sending it twice would only cost budget.
    const base = reference.reference.span.start;
    const hitWithinText = hit.hitSpan ? { start: hit.hitSpan.start - base, end: hit.hitSpan.end - base } : null;
    return { ...meta, context: { ...reference, text: contextText, hitWithinText } };
  }
  const shortened = { ...reference, textOmitted: true };
  return detail === 'no_context_text'
    ? { ...meta, text, context: shortened }
    : { ...meta, textOmitted: true, context: shortened };
}

/**
 * The passages that fit the budget, most relevant first. Lowest-ranked first,
 * each pass finished before the next: drop surrounding text, then the hit's
 * own text, then whole passages. A locator that cannot fit is omitted whole.
 */
function fitPassages(
  hits: PassageHit[],
  render: (passages: Record<string, unknown>[], levels: PassageDetail[], omitted: number) => string,
): string {
  const levels: PassageDetail[] = hits.map(() => 'full');
  let kept = hits.length;
  // Each render carries its own note, so what is measured is what is sent.
  const out = () => render(hits.slice(0, kept).map((h, i) => modelPassage(h, levels[i])), levels.slice(0, kept), hits.length - kept);
  let result = out();
  for (const step of ['no_context_text', 'locator_only'] as const) {
    for (let i = kept - 1; i >= 0 && result.length > PASSAGE_RESULT_BUDGET; i--) {
      levels[i] = step;
      result = out();
    }
  }
  while (result.length > PASSAGE_RESULT_BUDGET && kept > 0) {
    kept--;
    result = out();
  }
  return result;
}

/** What the fitting left out, said plainly, with the exact way to read it. */
function fittingNote(levels: PassageDetail[], omitted: number): string {
  const contextOmitted = levels.filter((l) => l === 'no_context_text').length;
  const textOmitted = levels.filter((l) => l === 'locator_only').length;
  const notes: string[] = [];
  if (contextOmitted + textOmitted > 0) {
    notes.push(`${contextOmitted + textOmitted} passage(s) are shown without their surrounding text` +
      (textOmitted ? ` (${textOmitted} without their own text either)` : '') + ' to fit this result. ' +
      'Read exactly that text with read_project_document: offset = context.reference.span.start, ' +
      'max_chars = context.reference.span.end - context.reference.span.start (or hitSpan for the passage alone).');
  }
  if (omitted > 0) notes.push(`${omitted} ${levels.length ? 'lower-ranked' : 'matched'} passage(s) were left out to fit; ask again with a smaller limit or a narrower query.`);
  return notes.length ? ` ${notes.join(' ')}` : '';
}

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
      'How much of the accessible Vault scope is in the passage index could not be read, so this result does not say ' +
      'what it did not cover.'
    );
  }
  if (c.total === 0) return `No documents with verified access are filed in this scope yet.${outsideIndexNote(c)}`;
  if (c.indexed === 0) {
    /* The index is EMPTY — a different statement from "nothing matched", and a
       very different one from "the embedding provider is unreachable", which is
       what this used to report because the query was embedded before anyone
       checked whether there was anything to search. Every ingest builds the
       index since 2026-10-08, with or without an embedding key, so an empty
       one means the documents predate it: the backfill indexes them. */
    return (
      `None of the ${c.total} document(s) in this vault are in the passage index, so nothing was ` +
      'searched — this is not a result about what the documents say. They were filed before the ' +
      'passage index was built at every upload, and an operator backfill indexes them ' +
      '(scripts/backfill-vault-chunks.mjs). Say so plainly rather than reporting the content as ' +
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
  // Keyless and flag-free (D2, 2026-10-08): the passage index is written at
  // every ingest and searched by text when nothing can embed the query.
  const gate = await requireDocumentAccess(ctx, 'search_document_passages');
  if ('refusal' in gate) return JSON.stringify({ ok: false, error: gate.refusal, code: gate.code });
  const { orgId } = gate;

  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (query.length < 3) {
    return JSON.stringify({
      error: 'search_document_passages requires a query of at least 3 characters.',
    });
  }
  const limit =
    typeof input.limit === 'number' && input.limit > 0 ? Math.min(25, Math.floor(input.limit)) : 8;

  // One open project, or the actor's verified accessible library.
  const scope = await catalogScope(ctx, orgId, null, 'read');
  if ('error' in scope) return JSON.stringify({ ok: false, error: scope.error, code: scope.code });

  const { searchDocumentPassages, PassageSearchUnavailableError } = await import(
    '../vault/document-passage-search.js'
  );
  try {
    const result = await searchDocumentPassages(
      scope.executor,
      { organizationId: orgId, userId:scope.accessibleScope.actor.userId, organizationUuid: ctx?.organizationUuid, query },
      { limit, programId: scope.programId, sourceReadScope: scope.admittedScope },
    );
    const queryOmitted = JSON.stringify(query).length > PASSAGE_METADATA_BUDGET;
    const queryEcho = queryOmitted ? { queryOmitted: true, queryChars: query.length } : { query };
    const coverage = modelCoverage(result.coverage);
    const note = modelCoverageNote(coverage);
    // Ranked by text alone: no embedding provider answered. The model says so
    // rather than implying a meaning-based search ran.
    const ranked = result.ranking === 'text'
      ? ' Ranked by text match (no embedding is configured, so the search matched words, not meaning; ' +
        'try the terms a document would use).'
      : '';
    const scopeNote = { actorFiltered: true, ...(scope.programId ? { programId: scope.programId } : scope.admittedScope.projectId !== null ? { openProject: true, programId: null } : { accessibleProjects: true }) };
    const message = (shown: number, fitted: string) => {
      if (result.hits.length === 0) return queryOmitted
        ? `No passage matched this query (query echo omitted to fit). ${note}`
        : `No passage matched "${query}". ${note}`;
      if (shown === 0) return `This search returned ${result.hits.length} matching passage(s), but none fit with complete source locators.${ranked} ${note} ` +
        'These are omitted matches, not evidence absence. Narrow the query or use search_project_documents and read_project_document.' + fitted;
      return `${shown} passage(s).${ranked} ${note} Quote them with their document title and locator. ` +
          'Where a passage has context.status "available" and context.text, that is the exact surrounding source text ' +
          '(context.hitWithinText marks the passage inside it): quote surrounding wording only from it, never by joining ' +
          'passages yourself. Where it is "unavailable", open the whole file with read_project_document when the answer ' +
          'needs the surrounding context.' + fitted;
    };
    return fitPassages(result.hits, (passages, levels, omitted) => JSON.stringify({
      ok: true, ...queryEcho, scope: scopeNote, passages, ...(omitted ? { omittedPassages: omitted } : {}),
      coverage, ranking: result.ranking,
      message: message(passages.length, fittingNote(levels, omitted)),
    }));
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
  const handler = withCaughtErrors('search_document_passages', handleSearchDocumentPassages, { safeOutcome: true });
  register(
    'search_document_passages',
    async (input, ctx) => boundPassageResult(await handler(input, ctx)),
  );
}
