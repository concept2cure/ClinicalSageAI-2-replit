/**
 * AnA's read-only tools over the authoring store: the outline of the open
 * project's authoring documents, one section's text, and a search.
 *
 * The editor tells AnA which document and section are open, and until these
 * tools there was nothing she could call to read them, or any other section of
 * the dossier (D2 survey 2026-10-01, docs/evidence/D2-ANA-DOCUMENT-AWARENESS/).
 * Everything these tools decide about the store lives in
 * services/authoring/authoring-read.ts; this file is the model-facing contract.
 *
 * ── Scope ────────────────────────────────────────────────────────────────────
 * The program comes from the tool context — the open project — resolved by the
 * same resolveOpenProgram the draft tool and the Vault catalog tools use. It is
 * never an input: a conversation belongs to one project, and a model that could
 * name a program could read any project of the organization. With no open
 * project every tool refuses verbatim. An id from another program or tenant is
 * "not found in this project", in the same words as an id that does not exist,
 * so a refusal says nothing about another project's records.
 *
 * ── Two shapes these results must never take ───────────────────────────────
 *   - A top-level `status: 'generated'` with content is treated by the stream as
 *     a draft to persist and show as an artifact (stream.ts 2388-2418). No
 *     result here has a top-level `status` at all.
 *   - An input named like model prose (governed-write-tools FREE_TEXT_FIELD)
 *     puts a tool under the approved-drafting-model gate. These read; their
 *     inputs are ids, a cursor, numbers and a search query.
 *
 * ── Size: every result fits 5000 characters, serialized ──────────────────────
 * A result over 8000 characters is cut in its middle before the model reads it
 * (agentic-loop.ts capToolResultForModel), and a ROUND whose results total
 * over 24000 has every result squeezed to an even share
 * (budgetToolResultsForModel, stream.ts 2441). A model walking a dossier calls
 * read_authoring_section several times in parallel, so each result is held to
 * RESULT_BUDGET = 5000 as JSON.stringify produces it — escapes counted — which
 * lets four parallel reads (20000) pass the round untouched with room left for
 * a fifth small result. Every handler measures what it built and shrinks the
 * page (fewer outline entries, a shorter window, fewer hits) rather than let
 * the cap cut it, because a cut result loses text from the middle with
 * nothing to say so, and the cursor or offset it carries would then skip what
 * was cut. Titles and names are clipped so one long title cannot crowd out
 * the content.
 *
 * Handlers are registered through the injected `register`, so this module
 * imports only types from the executor and adds no import cycle.
 *
 * @module server/services/ana/authoring-read-tools
 */

import type { AnaTool } from '../ai-gateway/types';
import type { ToolContext } from './AnaToolExecutor.js';
import type { RegisterFn } from './document-tools-shared.js';
import { resolveOpenProgram } from '../c2c/program-access';
import { createScopedLogger } from '../../utils/logger';
import {
  PROPOSAL_CLOSE as CLOSE,
  PROPOSAL_OPEN as OPEN,
  READ_MAX_CHARS,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_SCAN_MAX,
  loadSection,
  outlineForProgram,
  searchSections,
  sectionWindow,
  type AuthoringReadQueryable,
  type OutlineDocument,
  type OutlinePage,
  type OutlineSection,
  type ProgramScope,
  type ReadOutcome,
  type SectionSearch,
  type SectionWindow,
} from '../authoring/authoring-read';

const logger = createScopedLogger('authoring-read-tools');

/** The refusal, verbatim, when no project is open. */
export const AUTHORING_READ_NO_PROJECT = (tool: string): string =>
  `${tool} needs an open project — AnA reads authoring documents only from the project this conversation is in. ` +
  'Open or select a project, then ask again.';

/** The most any one result may weigh, serialized. See "Size" above. */
const RESULT_BUDGET = 5000;
/** Outline entries (documents and sections) per page as the model sees it, and the most it may ask for. */
const OUTLINE_TOOL_DEFAULT = 15;
const OUTLINE_TOOL_MAX = 40;
const TITLE_MAX = 120;
const HIT_TITLE_MAX = 80;
const FIELD_MAX = 60;

const VAULT_POINTER =
  'This is the authoring store (documents being written in the editor). Files in the project Vault — uploaded or ' +
  'filed PDFs and Word files — are listed with list_project_documents and read with read_project_document.';

export const LIST_AUTHORING_OUTLINE: AnaTool = {
  name: 'list_authoring_outline',
  description:
    'List the authoring documents of the open project and their sections in CTD order, as one walk: each document, ' +
    'then its sections. For each section its id, code, title, depth, last update, stored length, whether it is ' +
    'drafted, whether tracked changes are pending, and a sha256 of its stored text. No section text — read a section ' +
    'with read_authoring_section. Read-only, and scoped to the open project; another project\'s documents are never ' +
    'listed. Paged: when nextCursor is not null, call again with cursor set to it to continue; documentsNotYetListed ' +
    'says how many documents later pages hold. Pass document_id to walk one document. ' + VAULT_POINTER,
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'string', description: 'Optional: an authoring document id from a previous outline, to list only it and its sections.' },
      cursor: { type: 'string', description: 'The nextCursor of the previous page. Omit for the first page.' },
      limit: { type: 'number', description: `Entries (documents and sections) per page (default ${OUTLINE_TOOL_DEFAULT}, max ${OUTLINE_TOOL_MAX}); a page is also cut to fit the result size.` },
    },
    required: [],
  },
};

export const READ_AUTHORING_SECTION: AnaTool = {
  name: 'read_authoring_section',
  description:
    'Read one section of an authoring document in the open project as plain text, by section_id from ' +
    'list_authoring_outline or search_authoring_sections. Headings, lists and table rows are kept. Tracked changes ' +
    `nobody has accepted or rejected are labelled ${OPEN}proposed insertion by <author>: …${CLOSE} and ` +
    `${OPEN}proposed deletion by <author>: …${CLOSE}; the characters ${OPEN} and ${CLOSE} never occur in document text, so ` +
    'everything between them is part of the proposal. A proposed insertion is NOT yet in the document: never quote it ' +
    'as what the document says. A proposed deletion is text still in the current document, which someone has proposed ' +
    `removing. A window that starts or stops inside a proposal re-opens it as ${OPEN}(continued) proposed … and closes ` +
    `it with …(continues)${CLOSE}. Windowed: up to ${READ_MAX_CHARS} characters from offset, fewer when the text needs ` +
    'escaping; when nextOffset is a number, call again with that offset to read on — it is exactly where this text ' +
    'stopped. Returns updatedAt and sha256 of the stored content — the version you read. Read-only, and scoped to the ' +
    'open project; another project\'s section is not found. ' + VAULT_POINTER,
  input_schema: {
    type: 'object',
    properties: {
      section_id: { type: 'string', description: 'The section id (UUID) from list_authoring_outline or search_authoring_sections.' },
      offset: { type: 'number', description: 'Character offset into the section\'s text (default 0); use the previous nextOffset to read on.' },
      max_chars: { type: 'number', description: `Characters to return (default and max ${READ_MAX_CHARS}).` },
    },
    required: ['section_id'],
  },
};

export const SEARCH_AUTHORING_SECTIONS: AnaTool = {
  name: 'search_authoring_sections',
  description:
    'Search the authoring documents of the open project for a word or phrase in section titles, codes and text ' +
    '(case-insensitive and literal: % and _ are ordinary characters). Returns the matching sections in CTD order with ' +
    `their document, section id, code and a short snippet, ${SEARCH_DEFAULT_LIMIT} per page by default and at most ` +
    `${SEARCH_MAX_LIMIT}; totalMatches counts them all, and when nextOffset is a number call again with offset set to ` +
    'it for the next page. Proposed changes in a snippet are labelled as in read_authoring_section. Read a hit in ' +
    'full with read_authoring_section. Read-only, and scoped to the open project. ' + VAULT_POINTER +
    ' search_project_documents searches the Vault.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The word or phrase to find (2–200 characters).' },
      limit: { type: 'number', description: `Most hits per page (default ${SEARCH_DEFAULT_LIMIT}, max ${SEARCH_MAX_LIMIT}).` },
      offset: { type: 'number', description: 'The nextOffset of the previous page. Omit for the first page.' },
    },
    required: ['query'],
  },
};

export const AUTHORING_READ_TOOLS: readonly AnaTool[] = [
  LIST_AUTHORING_OUTLINE,
  READ_AUTHORING_SECTION,
  SEARCH_AUTHORING_SECTIONS,
];

// ── Handlers ─────────────────────────────────────────────────────────────────

type PoolSource = () => AuthoringReadQueryable | Promise<AuthoringReadQueryable>;

const appPool: PoolSource = async () => (await import('../../db.js')).getPool();

const optionalString = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const optionalNumber = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const clip = (s: string | null, max = TITLE_MAX): string | null => (s && s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** A service refusal (not found in this project, a bad cursor) as the tool's error. */
function refusal(outcome: Extract<ReadOutcome<unknown>, { ok: false }>): string {
  return JSON.stringify({ error: outcome.message });
}

function sectionForModel(s: OutlineSection) {
  return {
    id: s.id, docId: s.docId, code: clip(s.code, FIELD_MAX), title: clip(s.title), depth: s.depth, updatedAt: s.updatedAt,
    length: s.length, drafted: s.drafted, pendingChanges: s.pendingChanges, sha256: s.sha256,
  };
}

function documentForModel(d: OutlineDocument) {
  return {
    id: d.id, title: clip(d.title), module: clip(d.module, FIELD_MAX), productCode: clip(d.productCode, FIELD_MAX),
    documentStatus: clip(d.status, FIELD_MAX), updatedAt: d.updatedAt, sectionCount: d.sectionCount,
  };
}

/**
 * A page as the model receives it: the documents whose entry the walk reached
 * on this page, and — when the page opens partway through a document — which
 * document that is, so a page read alone still says where each section lives.
 */
function renderOutline(page: OutlinePage): string {
  const continuing = page.continuingDocument && !page.documents.some((d) => d.id === page.continuingDocument?.id)
    ? page.continuingDocument
    : null;
  return JSON.stringify({
    // The cursor comes first: if anything ever cuts this result, the head survives.
    nextCursor: page.nextCursor,
    totalSections: page.totalSections,
    documentCount: page.documentCount,
    documentsNotYetListed: page.documentsAfterPage,
    ...(continuing ? { continuingDocument: { id: continuing.id, title: clip(continuing.title) } } : {}),
    documents: page.documents.map(documentForModel),
    sections: page.sections.map(sectionForModel),
    ...(page.totalSections === 0 ? { note: 'The open project has no authoring sections yet.' } : {}),
  });
}

async function listOutline(pool: AuthoringReadQueryable, scope: ProgramScope, input: Record<string, unknown>): Promise<string> {
  const documentId = optionalString(input.document_id);
  const cursor = optionalString(input.cursor);
  let limit = Math.min(OUTLINE_TOOL_MAX, Math.max(1, Math.floor(optionalNumber(input.limit) ?? OUTLINE_TOOL_DEFAULT)));
  // A page is cut to fit by asking for fewer entries, so its cursor names the
  // last entry delivered. Every entry is bounded (titles and fields clipped),
  // so one entry always fits and the loop ends: each pass asks for fewer.
  for (;;) {
    const outcome = await outlineForProgram(pool, { ...scope, documentId, cursor, limit });
    if (!outcome.ok) return refusal(outcome);
    const out = renderOutline(outcome.value);
    const entries = outcome.value.documents.length + outcome.value.sections.length;
    if (out.length <= RESULT_BUDGET || entries <= 1) return out;
    limit = Math.max(1, Math.min(entries - 1, Math.floor((entries * RESULT_BUDGET) / out.length)));
  }
}

function renderWindow(w: SectionWindow): string {
  return JSON.stringify({
    sectionId: w.sectionId,
    // The offsets come before the text: if anything ever cuts this result, they survive.
    offset: w.offset,
    nextOffset: w.nextOffset,
    totalChars: w.totalChars,
    code: clip(w.code, FIELD_MAX),
    title: clip(w.title),
    docId: w.docId,
    docTitle: clip(w.docTitle),
    updatedAt: w.updatedAt,
    sha256: w.sha256,
    text: w.text,
    ...(w.nextOffset !== null ? { note: `More text follows: call again with offset ${w.nextOffset}.` } : {}),
  });
}

async function readOne(pool: AuthoringReadQueryable, scope: ProgramScope, input: Record<string, unknown>): Promise<string> {
  const sectionId = optionalString(input.section_id);
  if (!sectionId) return JSON.stringify({ error: 'section_id is required: take it from list_authoring_outline or search_authoring_sections.' });
  const loaded = await loadSection(pool, { ...scope, sectionId });
  if (!loaded.ok) return refusal(loaded);
  // Quotes, backslashes and newlines grow when serialized, so a full window of
  // such text can overrun the budget. The window shrinks until the result fits;
  // nextOffset is computed from the window actually delivered, so nothing the
  // shrink left out is skipped — the next call starts there.
  let maxChars = Math.min(READ_MAX_CHARS, Math.max(1, Math.floor(optionalNumber(input.max_chars) ?? READ_MAX_CHARS)));
  for (;;) {
    const out = renderWindow(sectionWindow(loaded.value, optionalNumber(input.offset), maxChars));
    if (out.length <= RESULT_BUDGET || maxChars <= 1) return out;
    maxChars = Math.max(1, Math.min(maxChars - 1, maxChars - (out.length - RESULT_BUDGET)));
  }
}

function renderSearch(r: SectionSearch, hitCount: number): string {
  const hits = r.hits.slice(0, hitCount);
  const cut = hitCount < r.hits.length;
  const nextOffset = cut ? r.offset + hits.length : r.nextOffset;
  // Each document's title once, not on every hit: six hits in one document would otherwise carry it six times.
  const documents = [...new Map(hits.map((h) => [h.docId, clip(h.docTitle)])).entries()].map(([id, title]) => ({ id, title }));
  return JSON.stringify({
    query: r.query,
    offset: r.offset,
    nextOffset,
    totalMatches: r.totalMatches,
    truncated: cut || r.truncated,
    ...(r.scanCapped
      ? { note: `More than ${SEARCH_SCAN_MAX} sections matched; only the first ${SEARCH_SCAN_MAX} were ranked. Narrow the query.` }
      : {}),
    documents,
    hits: hits.map((h) => ({ docId: h.docId, sectionId: h.sectionId, code: clip(h.code, FIELD_MAX), title: clip(h.title, HIT_TITLE_MAX), snippet: h.snippet })),
  });
}

async function search(pool: AuthoringReadQueryable, scope: ProgramScope, input: Record<string, unknown>): Promise<string> {
  const outcome = await searchSections(pool, {
    ...scope, query: String(input.query ?? ''), limit: optionalNumber(input.limit), offset: optionalNumber(input.offset),
  });
  if (!outcome.ok) return refusal(outcome);
  // SEARCH_MAX_LIMIT hits fit the budget for ordinary text; a page of
  // escape-heavy snippets drops hits from its end, and nextOffset then points
  // at the first hit dropped.
  for (let n = outcome.value.hits.length; ; n--) {
    const out = renderSearch(outcome.value, n);
    if (out.length <= RESULT_BUDGET || n <= 1) return out;
  }
}

type Body = (pool: AuthoringReadQueryable, scope: ProgramScope, input: Record<string, unknown>) => Promise<string>;

/** The shared preamble: tenant, open program, then the body; a failure never reaches the model as driver text. */
function scoped(name: string, body: Body, poolOf: PoolSource) {
  return async (input: Record<string, unknown>, ctx?: ToolContext): Promise<string> => {
    if (!ctx?.organizationId) return JSON.stringify({ error: `${name} requires an organization context.` });
    try {
      const pool = await poolOf();
      const programId = await resolveOpenProgram(pool, {
        organizationId: ctx.organizationId, projectId: ctx.projectId ?? null, projectRef: ctx.projectRef ?? null,
      });
      if (!programId) return JSON.stringify({ error: AUTHORING_READ_NO_PROJECT(name) });
      return await body(pool, { tenantId: Number(ctx.organizationId), programId }, input ?? {});
    } catch (err) {
      // The driver's message names tables and columns; it goes to the log. The
      // model is told the read failed, never that the project is empty.
      logger.error(`${name} failed`, { err: err instanceof Error ? err.message : String(err) });
      return JSON.stringify({ error: `${name} failed: the authoring documents could not be read just now. Say so; do not report them as empty.` });
    }
  };
}

/** Register the three handlers on the executor's registry (or a test's). */
export function registerAuthoringReadHandlers(register: RegisterFn, options: { pool?: PoolSource } = {}): void {
  const poolOf = options.pool ?? appPool;
  register('list_authoring_outline', scoped('list_authoring_outline', listOutline, poolOf));
  register('read_authoring_section', scoped('read_authoring_section', readOne, poolOf));
  register('search_authoring_sections', scoped('search_authoring_sections', search, poolOf));
}
