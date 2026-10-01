/**
 * Reading the authoring store for AnA: an outline of every authoring document
 * in one program, one section's text in windows, and a search over the
 * program's sections.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The editor sends AnA the open document's id and section code, and until now
 * there was nothing she could call to read either (D2 survey, 2026-10-01,
 * docs/evidence/D2-ANA-DOCUMENT-AWARENESS/2026-10-01/0-survey-critic-and-plan.md
 * §2.1). The authoring routes cannot stand in: `GET /docs/:docId/sections`
 * returns every section's full content with no limit, which for an IND is the
 * whole dossier in one response, and `GET /docs` joins sections with no tenant
 * predicate (authoring.router.ts:1315). This module copies neither.
 *
 * ── Scope: tenant AND program, in every statement ───────────────────────────
 * Every query filters on `tenant_id` and on `authoring_documents.
 * client_program_id`. A conversation belongs to one project, so AnA reads that
 * project's documents and nothing else of the organization: an id from another
 * program is simply not found. The section queries share one FROM/WHERE
 * fragment (SCOPED_SECTIONS) so no section read can be written without it.
 *
 * Reads are not checked against per-document roles (`decideAuthoringPermission`
 * 'view'), because no authoring read route checks them either — the routes are
 * tenant-scoped only (survey §1.4). The program scope here is narrower than the
 * routes, not wider. If per-document read permission is ever enforced on the
 * routes, it belongs here too.
 *
 * Neither table has a soft-delete column (db/migrations/20260725_authoring_
 * document_loop_tables.sql and every later ALTER, checked 2026-10-01): a
 * deleted document is a DELETE that cascades to its sections, so there is no
 * deleted row to exclude. A deleted PROGRAM is excluded upstream, by
 * resolveOpenProgram, which only admits live programs.
 *
 * ── Pending tracked changes are labelled, never settled ─────────────────────
 * Stored content can carry the editor's `<ins>` / `<del>` suggestion marks. A
 * model that read them as plain text would treat a proposal nobody accepted as
 * what the document says. They are parsed by the same parser the exports use
 * (sectionContentToBlocks), so the model and the exported redline agree on
 * what is pending, and rendered as
 *
 *     ⟦proposed insertion by <author>: …⟧      ⟦proposed deletion by <author>: …⟧
 *
 * The delimiters are U+27E6 / U+27E7, and the property this module keeps is
 * that EVERY character of proposed text the model receives sits between them:
 *   - neither character can occur in content: any ⟦ or ⟧ in the stored text, a
 *     figure's alt text or an author's name is replaced with [ or ], so a
 *     bracket in a proposal (`[1]]`) cannot end its label early and settled
 *     text cannot open one;
 *   - a window or snippet that starts inside a proposal re-opens it
 *     (`⟦(continued) proposed insertion by X: `) and one that stops inside a
 *     proposal closes it (`…(continues)⟧`), so the second window of a long
 *     insertion does not begin with unlabelled proposed text;
 *   - a figure inside `<ins>`/`<del>` is labelled too. The block parser does not
 *     carry suggestion state onto image blocks, so figureProposals reads it
 *     from the markup itself.
 * A cut never falls inside a label's own words: a window that would end there
 * ends before the label, and one asked to start there starts at the
 * proposal's text, re-opened.
 *
 * ── Sizes ────────────────────────────────────────────────────────────────────
 * The outline carries no content, only each section's length and a SHA-256 of
 * its stored content computed in SQL. The hash and `updatedAt` are the base a
 * later proposal is checked against. A section is read in windows of at most
 * READ_MAX_CHARS characters, and the tool layer shrinks a window further until
 * its serialized result fits its budget (authoring-read-tools.ts RESULT_BUDGET
 * says why that is 5000). Offsets count characters of the rendered text,
 * labels included, so `nextOffset` is exactly where the delivered text stops.
 *
 * @module server/services/authoring/authoring-read
 */

import { parse, HTMLElement, type Node } from 'node-html-parser';
import { compareSectionCode } from '../../../shared/regulatory/section-code';
import { MAX_LIST_DEPTH, contentLooksLikeHtml, sectionContentToBlocks } from '../../export/authoring-section-content';
import type { ContentBlock, InlineRun, TableCell } from '../../export/authoring-section-content';

/** Anything with pg's `query` — the app pool, a client, or a test double. */
export interface AuthoringReadQueryable { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> }

export type ReadOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'not_found' | 'bad_input'; message: string };

/** `programId` is the regulatory_programs UUID, already resolved and checked against the tenant. */
export interface ProgramScope { tenantId: number; programId: string }

export interface OutlineDocument {
  id: string; title: string; module: string | null; productCode: string | null;
  status: string; updatedAt: string | null; sectionCount: number;
}

export interface OutlineSection {
  id: string; docId: string; code: string | null; title: string | null;
  /** Dotted segments of the code (3.2.S.1.1 → 5); 1 for a code that is not numbered. */
  depth: number;
  orderIndex: number; updatedAt: string | null;
  /** Characters of stored content, markup included. */
  length: number;
  /** SHA-256 (hex) of the stored content, as Postgres computes it. */
  sha256: string;
  /** Has text once tags, &nbsp; and whitespace are removed. A figure-only section reads as undrafted. */
  drafted: boolean;
  /** Carries `<ins>` or `<del>` tags: suggestions nobody has accepted or rejected yet. */
  pendingChanges: boolean;
}

/**
 * One page of the outline walk. The walk visits each document's entry and then
 * that document's sections, so documents are paged exactly as sections are: a
 * program with hundreds of documents never puts them all on one page.
 */
export interface OutlinePage {
  programId: string;
  /** Documents whose entry falls on this page, in walk order. */
  documents: OutlineDocument[];
  /** The document this page's first sections belong to, when its own entry was on an earlier page. */
  continuingDocument: OutlineDocument | null;
  sections: OutlineSection[];
  /** Documents in the program (or the one document asked for). */
  documentCount: number;
  /** Documents whose entry comes after this page: exactly how many are still to be listed. */
  documentsAfterPage: number;
  totalSections: number; nextCursor: string | null;
}

/** Which section a result is about, and where it lives. */
export interface SectionIdentity { docId: string; docTitle: string; sectionId: string; code: string | null; title: string | null }

/** A section's identity and the version read: `sha256` of the STORED content, the value the outline reports. */
export interface SectionVersion extends SectionIdentity { updatedAt: string | null; sha256: string }

export interface SectionWindow extends SectionVersion {
  totalChars: number;
  /** Where this window starts in the rendered text (moved off a label if one was asked for inside it). */
  offset: number;
  /** Where the next window starts — exactly where this one's text stopped — or null at the end. */
  nextOffset: number | null;
  text: string;
}

export interface SectionSearchHit extends SectionIdentity { snippet: string }

export interface SectionSearch {
  query: string; hits: SectionSearchHit[]; offset: number;
  /** The offset of the next page of hits, or null when this page holds the last. */
  nextOffset: number | null;
  /** Sections that matched and were ranked (all of them unless scanCapped). */
  totalMatches: number;
  /** More than SEARCH_SCAN_MAX sections matched; only that many were ranked. */
  scanCapped: boolean;
  /** Not every match is on this page: another page follows, or the scan was capped. */
  truncated: boolean;
}

export const OUTLINE_DEFAULT_LIMIT = 200;
export const OUTLINE_MAX_LIMIT = 500;
/** The widest window. 4000 characters plus a result's ids, titles and hash stay under the tool's 5000 budget for ordinary prose. */
export const READ_MAX_CHARS = 4000;
/**
 * Hits per search page. Six worst-case hits (titles at the clip, a full snippet
 * with a re-opened label, each in a different document) serialize to about
 * 4200 characters, inside the tool's 5000 budget; the tool still measures and
 * cuts if escapes push a page over.
 */
export const SEARCH_DEFAULT_LIMIT = 5;
export const SEARCH_MAX_LIMIT = 6;
/**
 * Matches ranked per search. Ranking is in CTD order, which only JS knows
 * (compareSectionCode), so the matching sections' keys — no content — are
 * fetched and sorted here. Past this many the result says the scan was capped.
 */
export const SEARCH_SCAN_MAX = 1000;
const SNIPPET_CHARS = 200;
const QUERY_MIN = 2;
const QUERY_MAX = 200;
const AUTHOR_MAX = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opens a proposal label. Never occurs in rendered content (see escapeDelimiters). */
export const PROPOSAL_OPEN = '⟦';
/** Closes a proposal label. */
export const PROPOSAL_CLOSE = '⟧';
/** How a window that stops inside a proposal closes it. */
const PROPOSAL_CONTINUES = `…(continues)${PROPOSAL_CLOSE}`;

// ── SQL ──────────────────────────────────────────────────────────────────────

/**
 * The program's sections. Every section statement starts from this, with $1
 * the tenant and $2 the program. The join carries the tenant too, matching the
 * composite foreign key (doc_id, tenant_id).
 */
const SCOPED_SECTIONS = `
  FROM authoring_sections s
  JOIN authoring_documents d ON d.id = s.doc_id AND d.tenant_id = s.tenant_id
 WHERE s.tenant_id = $1 AND d.client_program_id = $2`;

const STORED = `COALESCE(s.content, '')`;
const SHA256_SQL = `encode(sha256(convert_to(${STORED}, 'UTF8')), 'hex')`;
const DRAFTED_SQL = `length(regexp_replace(regexp_replace(${STORED}, '<[^>]*>', '', 'g'), '&nbsp;|\\s', '', 'g')) > 0`;
/**
 * An `<ins` or `<del` TAG in any case — followed by whitespace, `>` or `/`.
 * `LIKE '%<ins%'` was case-sensitive (an `<INS>` read as no pending change)
 * and also matched prose such as `<insulin>` or `<input>`.
 */
const PENDING_SQL = `(${STORED} ~* '<(ins|del)[\\s>/]')`;
/**
 * Content with tags removed, the common entities decoded and whitespace runs
 * collapsed, for search. Without the collapse a phrase that runs from settled
 * into proposed text (`dose is <ins>raised`) became `dose is  raised` and a
 * search for the phrase found nothing.
 */
const PLAIN_SQL =
  `regexp_replace(replace(replace(replace(replace(regexp_replace(${STORED}, '<[^>]*>', ' ', 'g'), ` +
  `'&nbsp;', ' '), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '\\s+', ' ', 'g')`;

// ── Small helpers ────────────────────────────────────────────────────────────

const NUMBERED_CODE = /^[mM]?\d+(\.[0-9A-Za-z]+)*$/;

/** Outline depth from a section code: 2.5 → 2, 3.2.S.1.1 → 5, anything unnumbered → 1. */
export function sectionDepth(code: string | null | undefined): number {
  const c = String(code ?? '').trim();
  return NUMBERED_CODE.test(c) ? c.split('.').length : 1;
}

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function iso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && v) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? v : new Date(t).toISOString();
  }
  return null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : String(v));
/** A code as a sort key: blank is no code, and sorts with null after every coded section. */
const codeKey = (v: unknown): string | null => str(v)?.trim() || null;
const notFound = (what: string): ReadOutcome<never> => ({ ok: false, code: 'not_found', message: `${what} was not found in this project.` });
const badInput = (message: string): ReadOutcome<never> => ({ ok: false, code: 'bad_input', message });

// ── Rendering stored content as text a model can read ───────────────────────

interface Proposal { kind: 'insertion' | 'deletion'; author: string }
/** A stretch of rendered text; `proposal` set when it is pending, unaccepted change. */
interface Piece { text: string; proposal?: Proposal }

/** One proposal's place in the rendered text. Its label runs labelStart..bodyStart; its close is the one character at bodyEnd. */
export interface ProposalSpan extends Proposal { labelStart: number; bodyStart: number; bodyEnd: number }

export interface RenderedSection {
  text: string;
  spans: ProposalSpan[];
}

/** The label delimiters never appear in content: a stored ⟦ or ⟧ becomes [ or ]. */
function escapeDelimiters(t: string): string {
  return t.replace(/⟦/g, '[').replace(/⟧/g, ']');
}

function authorName(raw: string | null | undefined): string {
  const a = escapeDelimiters(String(raw ?? '')).replace(/\s+/g, ' ').trim();
  if (!a) return 'an unnamed author';
  return a.length > AUTHOR_MAX ? `${a.slice(0, AUTHOR_MAX - 1)}…` : a;
}

function openLabel(p: Proposal, continued: boolean): string {
  return `${PROPOSAL_OPEN}${continued ? '(continued) ' : ''}proposed ${p.kind} by ${p.author}: `;
}

function runText(r: InlineRun): string {
  let t = r.text;
  if (r.citationSourceId) t = `[citation: ${t.trim() || r.citationSourceId}${r.citationLocator ? `, ${r.citationLocator}` : ''}]`;
  if (r.footnote) t += ` [footnote: ${r.footnote}]`;
  return escapeDelimiters(t);
}

/** Inline runs as pieces, each pending change one proposal with who proposed it. */
function runsPieces(runs: InlineRun[]): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < runs.length; ) {
    const r = runs[i];
    if (!r.suggestion) {
      out.push({ text: runText(r) });
      i++;
      continue;
    }
    // Adjacent runs of one change (bold and plain inside one insertion) are one proposal.
    let j = i;
    let text = '';
    while (j < runs.length && runs[j].suggestion === r.suggestion && runs[j].suggestionAuthor === r.suggestionAuthor) {
      text += runText(runs[j]);
      j++;
    }
    out.push({ text, proposal: { kind: r.suggestion, author: authorName(r.suggestionAuthor) } });
    i = j;
  }
  return out;
}

/** Trim the outer whitespace of a line — settled text only; a proposal's text is shown as proposed. */
function trimPieces(pieces: Piece[]): Piece[] {
  const out = pieces.filter((p) => p.text.length > 0).map((p) => ({ ...p }));
  while (out.length && !out[0].proposal) {
    out[0].text = out[0].text.replace(/^\s+/, '');
    if (out[0].text) break;
    out.shift();
  }
  while (out.length && !out[out.length - 1].proposal) {
    const last = out[out.length - 1];
    last.text = last.text.replace(/\s+$/, '');
    if (last.text) break;
    out.pop();
  }
  return out;
}

/** Hands out, in document order, whether each figure sits inside a pending change. */
type FigureProposals = (src: string) => Proposal | undefined;
type Mark = { kind: Proposal['kind']; author?: string };

/** The parser's applyMark rule: an ins/del sets the kind, and its author when it names one. */
function markOf(tag: string, el: HTMLElement, mark: Mark | undefined): Mark | undefined {
  if (tag !== 'ins' && tag !== 'del') return mark;
  return { kind: tag === 'ins' ? 'insertion' : 'deletion', author: el.getAttribute('data-author-name') || mark?.author };
}

/**
 * Which figures are inside `<ins>`/`<del>`. The block parser keeps suggestion
 * state on text runs only, so a figure proposed for insertion came out as an
 * ordinary `[figure: …]` — read as part of the document. This walks the same
 * markup with the same rule as the parser's applyMark (the innermost mark
 * decides the kind; an author is inherited when the inner mark names none)
 * and queues each figure's state per `src`, in document order, which is the
 * order the renderer meets them.
 */
function figureProposals(stored: string | null | undefined): FigureProposals {
  const s = stored ?? '';
  if (!/<img\b/i.test(s) || !/<(ins|del)[\s>/]/i.test(s) || !contentLooksLikeHtml(s)) return () => undefined;
  const queues = new Map<string, Array<Proposal | undefined>>();
  const visit = (node: Node, mark: Mark | undefined): void => {
    if (!(node instanceof HTMLElement)) return;
    const tag = (node.rawTagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style') return;
    const next = markOf(tag, node, mark);
    const src = tag === 'img' ? (node.getAttribute('src') ?? '').trim() : '';
    if (src) queues.set(src, [...(queues.get(src) ?? []), next ? { kind: next.kind, author: authorName(next.author) } : undefined]);
    if (tag !== 'img') for (const child of node.childNodes) visit(child, next);
  };
  for (const child of parse(s).childNodes) visit(child, undefined);
  return (src) => queues.get(src.trim())?.shift();
}

function figurePiece(src: string | undefined, alt: string | undefined, figures: FigureProposals): Piece {
  const text = `[figure${alt ? `: ${escapeDelimiters(alt)}` : ''}]`;
  const proposal = src ? figures(src) : undefined;
  return proposal ? { text, proposal } : { text };
}

function cellPieces(c: TableCell, figures: FigureProposals): Piece[] {
  const parts: Piece[][] = [trimPieces(runsPieces(c.runs)), ...(c.images ?? []).map((im) => [figurePiece(im.src, im.alt, figures)])]
    .filter((p) => p.length > 0);
  return parts.flatMap((p, i) => (i === 0 ? p : [{ text: ' ' }, ...p]));
}

function listMarker(b: ContentBlock, depth: number, counters: number[]): string {
  counters.length = depth + 1;
  if (!b.ordered) return '-';
  counters[depth] = (counters[depth] ?? 0) + 1;
  return `${counters[depth]}.`;
}

function blockPieces(b: ContentBlock, counters: number[], figures: FigureProposals): Piece[] {
  if (b.kind !== 'list-item') counters.length = 0;
  switch (b.kind) {
    case 'heading':
      return [{ text: `${'#'.repeat(b.level ?? 1)} ` }, ...trimPieces(runsPieces(b.runs))];
    case 'list-item': {
      const depth = Math.min(MAX_LIST_DEPTH, Math.max(0, b.depth ?? 0));
      return [{ text: `${'  '.repeat(depth)}${listMarker(b, depth, counters)} ` }, ...trimPieces(runsPieces(b.runs))];
    }
    case 'table': {
      const lines: Piece[][] = [];
      if (b.caption) lines.push([{ text: `Table: ${escapeDelimiters(b.caption)}` }]);
      for (const row of b.rows ?? []) {
        lines.push(row.flatMap((cell, i) => (i === 0 ? cellPieces(cell, figures) : [{ text: ' | ' }, ...cellPieces(cell, figures)])));
      }
      return lines.filter((l) => l.length > 0).flatMap((l, i) => (i === 0 ? l : [{ text: '\n' }, ...l]));
    }
    case 'image':
      return [figurePiece(b.src, b.alt, figures)];
    default:
      return trimPieces(runsPieces(b.runs));
  }
}

/** Lay pieces out as one string, recording where each proposal's label, text and close sit. */
function layout(pieces: Piece[]): RenderedSection {
  let text = '';
  const spans: ProposalSpan[] = [];
  for (const p of pieces) {
    if (!p.text) continue;
    if (!p.proposal) {
      text += p.text;
      continue;
    }
    const labelStart = text.length;
    text += openLabel(p.proposal, false);
    const bodyStart = text.length;
    text += p.text;
    spans.push({ ...p.proposal, labelStart, bodyStart, bodyEnd: text.length });
    text += PROPOSAL_CLOSE;
  }
  return { text, spans };
}

/**
 * A section's stored content as text with its block structure kept: headings
 * as `#`, list items as `-` or `1.`, table rows as ` | `-joined cells, blocks
 * separated by a blank line (list items by a newline), and every pending
 * change inside a ⟦…⟧ label.
 */
export function renderSection(stored: string | null | undefined): RenderedSection {
  const figures = figureProposals(stored);
  const counters: number[] = [];
  const pieces: Piece[] = [];
  let prev: ContentBlock['kind'] | null = null;
  for (const b of sectionContentToBlocks(stored)) {
    if (prev !== null) pieces.push({ text: prev === 'list-item' && b.kind === 'list-item' ? '\n' : '\n\n' });
    pieces.push(...blockPieces(b, counters, figures));
    prev = b.kind;
  }
  return layout(pieces);
}

export function sectionReadableText(stored: string | null | undefined): string {
  return renderSection(stored).text;
}

// ── Windows over rendered text ──────────────────────────────────────────────

/** The proposal whose label, text or close holds position `i`. */
function spanHolding(r: RenderedSection, i: number): ProposalSpan | undefined {
  return r.spans.find((s) => i >= s.labelStart && i <= s.bodyEnd);
}

const isHighSurrogate = (t: string, i: number): boolean => i >= 0 && i < t.length && /[\uD800-\uDBFF]/.test(t[i]);

/**
 * `maxChars` of `r.text` from `offset`, labelled so that every character of
 * proposed text in the result is inside a ⟦…⟧:
 *   - a start inside a label moves to the proposal's text; a start on a close
 *     moves past it (the close alone says nothing);
 *   - an end inside a label (no proposed character reached) moves back before
 *     the label — unless the window starts at that label, when it takes at
 *     least one character of the proposal so a walk always advances;
 *   - an end exactly before a close takes the close too;
 *   - a start inside proposed text re-opens the label, an end inside it closes
 *     it with `…(continues)⟧`.
 * `end` is exactly where the next window starts, so a walk from 0 by `end`
 * delivers every character of `r.text` once, labels and all.
 */
export function windowOf(r: RenderedSection, offset: number, maxChars: number): { start: number; end: number; text: string } {
  const t = r.text;
  const start = windowStart(r, offset);
  if (start >= t.length) return { start: t.length, end: t.length, text: '' };
  const { end, suffix } = windowEnd(r, start, maxChars);
  const open = spanHolding(r, start);
  const prefix = open && start >= open.bodyStart && start < open.bodyEnd ? openLabel(open, true) : '';
  return { start, end, text: prefix + t.slice(start, end) + suffix };
}

/** A start inside a label moves to the proposal's text; a start on a close moves past it (the close alone says nothing). */
function windowStart(r: RenderedSection, offset: number): number {
  const start = Math.min(Math.max(0, Math.floor(offset)), r.text.length);
  const s = spanHolding(r, start);
  if (s && start > s.labelStart && start < s.bodyStart) return s.bodyStart;
  return s && start === s.bodyEnd ? s.bodyEnd + 1 : start;
}

function windowEnd(r: RenderedSection, start: number, maxChars: number): { end: number; suffix: string } {
  const t = r.text;
  let end = Math.min(t.length, start + Math.max(1, Math.floor(maxChars)));
  // Never cut a surrogate pair in half: the window would end in an invalid character.
  if (end < t.length && end > start + 1 && isHighSurrogate(t, end - 1)) end--;
  const cut = r.spans.find((s) => s.labelStart < end && end <= s.bodyEnd);
  if (!cut) return { end, suffix: '' };
  // No proposed character reached: stop before the label, or — when the window begins at it — take one.
  if (end <= cut.bodyStart) end = cut.labelStart > start ? cut.labelStart : cut.bodyStart + 1;
  if (end <= cut.bodyStart) return { end, suffix: '' };
  // Keep a surrogate pair whole inside a proposal too.
  if (end < cut.bodyEnd && isHighSurrogate(t, end - 1)) end = end - 1 > cut.bodyStart ? end - 1 : end + 1;
  // The whole proposal is in: take its close. Otherwise close it as continuing.
  return end >= cut.bodyEnd ? { end: cut.bodyEnd + 1, suffix: '' } : { end, suffix: PROPOSAL_CONTINUES };
}

// ── Outline ─────────────────────────────────────────────────────────────────

interface DocRow { id: string; title: string; module: unknown; product_code: unknown; status: unknown; created_at: unknown; updated_at: unknown }
interface KeyRow { id: string; doc_id: string; code: unknown; title: unknown; order_index: unknown; updated_at: unknown }
interface FactRow { id: string; length: unknown; sha256: unknown; drafted: unknown; pending_changes: unknown }

/**
 * Where an entry sits in the outline walk: its document's age, the document,
 * then the document's own entry (`h`) before its sections, which run by code,
 * then stored order.
 */
interface OutlineKey { t: number; d: string; h?: 1; k: string | null; o: number; i: string }

function compareKeys(a: OutlineKey, b: OutlineKey): number {
  if (a.t !== b.t) return a.t - b.t;
  if (a.d !== b.d) return a.d < b.d ? -1 : 1;
  if (a.h === 1 || b.h === 1) return a.h === b.h ? 0 : a.h === 1 ? -1 : 1;
  const c = compareCodes(a.k, b.k);
  if (c !== 0) return c;
  if (a.o !== b.o) return a.o - b.o;
  return a.i < b.i ? -1 : a.i > b.i ? 1 : 0;
}

/** A section without a code has no place in the CTD order; it follows the coded ones. */
function compareCodes(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return compareSectionCode(a, b);
}

function encodeCursor(k: OutlineKey): string {
  return Buffer.from(JSON.stringify(k), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): OutlineKey | null {
  try {
    const k = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<OutlineKey>;
    const ok =
      typeof k.t === 'number' && typeof k.d === 'string' && (k.h === undefined || k.h === 1) &&
      (k.k === null || typeof k.k === 'string') && typeof k.o === 'number' && typeof k.i === 'string';
    return ok ? (k as OutlineKey) : null;
  } catch {
    return null;
  }
}

async function programDocuments(pool: AuthoringReadQueryable, scope: ProgramScope, documentId?: string): Promise<DocRow[]> {
  const params: unknown[] = [scope.tenantId, scope.programId];
  let sql = `SELECT d.id, d.title, d.module, d.product_code, d.status, d.created_at, d.updated_at
  FROM authoring_documents d
 WHERE d.tenant_id = $1 AND d.client_program_id = $2`;
  if (documentId) {
    params.push(documentId);
    sql += ' AND d.id = $3';
  }
  return (await pool.query(sql, params)).rows as DocRow[];
}

async function sectionKeys(pool: AuthoringReadQueryable, scope: ProgramScope, documentId?: string): Promise<KeyRow[]> {
  const params: unknown[] = [scope.tenantId, scope.programId];
  let sql = `SELECT s.id, s.doc_id, s.code, s.title, s.order_index, s.updated_at${SCOPED_SECTIONS}`;
  if (documentId) {
    params.push(documentId);
    sql += ' AND s.doc_id = $3';
  }
  return (await pool.query(sql, params)).rows as KeyRow[];
}

async function sectionFacts(pool: AuthoringReadQueryable, scope: ProgramScope, ids: string[]): Promise<Map<string, FactRow>> {
  if (ids.length === 0) return new Map();
  const sql =
    `SELECT s.id, COALESCE(length(s.content), 0) AS length, ${SHA256_SQL} AS sha256, ` +
    `${DRAFTED_SQL} AS drafted, ${PENDING_SQL} AS pending_changes${SCOPED_SECTIONS} AND s.id = ANY($3::uuid[])`;
  const { rows } = await pool.query(sql, [scope.tenantId, scope.programId, ids]);
  return new Map((rows as FactRow[]).map((r) => [r.id, r]));
}

function toOutlineSection(r: KeyRow, f: FactRow | undefined): OutlineSection {
  const code = str(r.code);
  return {
    id: r.id, docId: r.doc_id, code, title: str(r.title), depth: sectionDepth(code),
    orderIndex: Number(r.order_index ?? 0), updatedAt: iso(r.updated_at),
    length: Number(f?.length ?? 0), sha256: String(f?.sha256 ?? ''),
    drafted: f?.drafted === true, pendingChanges: f?.pending_changes === true,
  };
}

const docTimeOf = (createdAt: unknown): number => Date.parse(String(iso(createdAt))) || 0;

type Entry = { key: OutlineKey; doc?: DocRow; sec?: KeyRow };

/** Every document and section as one sorted walk, and each document's section count. */
function outlineEntries(docs: DocRow[], keys: KeyRow[]): { entries: Entry[]; counts: Map<string, number> } {
  const docTime = new Map(docs.map((d) => [d.id, docTimeOf(d.created_at)]));
  const entries: Entry[] = docs.map((doc) => ({ key: { t: docTime.get(doc.id) ?? 0, d: doc.id, h: 1, k: null, o: 0, i: doc.id }, doc }));
  const counts = new Map<string, number>();
  for (const sec of keys) {
    const t = docTime.get(sec.doc_id);
    if (t === undefined) continue;
    counts.set(sec.doc_id, (counts.get(sec.doc_id) ?? 0) + 1);
    entries.push({ key: { t, d: sec.doc_id, k: codeKey(sec.code), o: Number(sec.order_index ?? 0), i: sec.id }, sec });
  }
  return { entries: entries.sort((a, b) => compareKeys(a.key, b.key)), counts };
}

/**
 * The program's authoring documents and their sections, without content, as
 * one walk: each document (oldest first) and then its sections in CTD code
 * order (compareSectionCode: 2.5.1 before 2.5.10, 3.2.S before 3.2.P), then
 * stored order. `limit` counts entries of either kind, so a program of many
 * documents pages its documents as it pages sections; an earlier version
 * listed every document on the first page, which for a large program was
 * bigger than a tool result may be.
 *
 * The cursor names the last entry returned by its sort position, not by an
 * offset, so an entry added or deleted between pages neither repeats nor
 * skips anything that stayed put — including the entry the cursor names.
 */
export async function outlineForProgram(
  pool: AuthoringReadQueryable,
  opts: ProgramScope & { documentId?: string; cursor?: string; limit?: number },
): Promise<ReadOutcome<OutlinePage>> {
  if (opts.documentId !== undefined && !UUID_RE.test(opts.documentId)) return notFound(`Document ${opts.documentId}`);
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  if (opts.cursor && !after) return badInput('The cursor is not one this outline issued. Start again without a cursor.');
  const limit = clampInt(opts.limit, OUTLINE_DEFAULT_LIMIT, 1, OUTLINE_MAX_LIMIT);

  const docs = await programDocuments(pool, opts, opts.documentId);
  if (opts.documentId && docs.length === 0) return notFound(`Document ${opts.documentId}`);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const { entries, counts } = outlineEntries(docs, await sectionKeys(pool, opts, opts.documentId));

  const found = after ? entries.findIndex((x) => compareKeys(x.key, after) > 0) : 0;
  const start = found < 0 ? entries.length : found;
  const page = entries.slice(start, start + limit);
  const end = start + page.length;
  const facts = await sectionFacts(pool, opts, page.flatMap((x) => (x.sec ? [x.sec.id] : [])));

  const toDocument = (d: DocRow): OutlineDocument => ({
    id: d.id, title: d.title, module: str(d.module), productCode: str(d.product_code),
    status: String(d.status ?? ''), updatedAt: iso(d.updated_at), sectionCount: counts.get(d.id) ?? 0,
  });
  const firstSec = page[0]?.sec;
  return {
    ok: true,
    value: {
      programId: opts.programId,
      documents: page.flatMap((x) => (x.doc ? [toDocument(x.doc)] : [])),
      continuingDocument: firstSec ? toDocument(byId.get(firstSec.doc_id) as DocRow) : null,
      sections: page.flatMap((x) => (x.sec ? [toOutlineSection(x.sec, facts.get(x.sec.id))] : [])),
      documentCount: docs.length, documentsAfterPage: entries.slice(end).filter((x) => x.doc).length,
      totalSections: entries.length - docs.length,
      nextCursor: end < entries.length && page.length > 0 ? encodeCursor(page[page.length - 1].key) : null,
    },
  };
}

// ── One section, windowed ───────────────────────────────────────────────────

interface ReadRow { id: string; doc_id: string; code: unknown; title: unknown; content: unknown; updated_at: unknown; doc_title: unknown; sha256: unknown }

/** A section loaded and rendered once, to be windowed as often as a caller needs. */
export interface LoadedSection extends SectionVersion { rendered: RenderedSection }

export async function loadSection(
  pool: AuthoringReadQueryable,
  opts: ProgramScope & { sectionId: string },
): Promise<ReadOutcome<LoadedSection>> {
  if (!UUID_RE.test(opts.sectionId)) return notFound(`Section ${opts.sectionId}`);
  const sql =
    `SELECT s.id, s.doc_id, s.code, s.title, s.content, s.updated_at, d.title AS doc_title, ${SHA256_SQL} AS sha256` +
    `${SCOPED_SECTIONS} AND s.id = $3 LIMIT 1`;
  const row = (await pool.query(sql, [opts.tenantId, opts.programId, opts.sectionId])).rows[0] as ReadRow | undefined;
  if (!row) return notFound(`Section ${opts.sectionId}`);
  const identity = { docId: row.doc_id, docTitle: String(row.doc_title ?? ''), sectionId: row.id, code: str(row.code), title: str(row.title) };
  const version = { updatedAt: iso(row.updated_at), sha256: String(row.sha256 ?? '') };
  return { ok: true, value: { ...identity, ...version, rendered: renderSection(str(row.content)) } };
}

/** One window of a loaded section: `maxChars` (at most READ_MAX_CHARS) of its rendered text from `offset`. */
export function sectionWindow(s: LoadedSection, offset?: unknown, maxChars?: unknown): SectionWindow {
  const from = clampInt(offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const w = windowOf(s.rendered, from, clampInt(maxChars, READ_MAX_CHARS, 1, READ_MAX_CHARS));
  const { rendered, ...version } = s;
  const total = rendered.text.length;
  return { ...version, totalChars: total, offset: w.start, nextOffset: w.end < total ? w.end : null, text: w.text };
}

/**
 * One section of the program as readable text, `maxChars` (at most
 * READ_MAX_CHARS) from `offset`. `nextOffset` is where the next window starts,
 * or null at the end. `sha256` is of the STORED content, the same value the
 * outline reports, so it identifies the version read whatever window was taken.
 */
export async function readSection(
  pool: AuthoringReadQueryable,
  opts: ProgramScope & { sectionId: string; offset?: number; maxChars?: number },
): Promise<ReadOutcome<SectionWindow>> {
  const loaded = await loadSection(pool, opts);
  return loaded.ok ? { ok: true, value: sectionWindow(loaded.value, opts.offset, opts.maxChars) } : loaded;
}

// ── Search ──────────────────────────────────────────────────────────────────

interface SearchKeyRow { id: string; doc_id: string; code: unknown; order_index: unknown; doc_created_at: unknown }
interface SearchContentRow { id: string; title: unknown; content: unknown; doc_title: unknown }

/** A LIKE pattern matching `q` literally: `%`, `_` and the escape itself are escaped. */
function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/**
 * Where `q` first occurs in the rendered text, ignoring the labels' own words
 * — so a phrase that runs from settled text into a proposal is still found —
 * and treating any run of whitespace as one space, as the SQL match does.
 */
function locate(r: RenderedSection, q: string): number {
  let content = '';
  const at: number[] = [];
  let k = 0;
  for (let i = 0; i < r.text.length; i++) {
    while (k < r.spans.length && i > r.spans[k].bodyEnd) k++;
    const s = r.spans[k];
    if (s && ((i >= s.labelStart && i < s.bodyStart) || i === s.bodyEnd)) continue;
    content += r.text[i];
    at.push(i);
  }
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const m = new RegExp(words.join('\\s+'), 'i').exec(content);
  return m ? at[m.index] : -1;
}

/** About SNIPPET_CHARS around the first hit, through windowOf so a proposal in it stays labelled. */
function snippetOf(r: RenderedSection, q: string): string {
  const hit = locate(r, q);
  const from = hit < 0 ? 0 : Math.max(0, hit - Math.floor((SNIPPET_CHARS - q.length) / 2));
  const w = windowOf(r, from, SNIPPET_CHARS);
  const body = w.text.replace(/\s+/g, ' ').trim();
  return `${w.start > 0 ? '…' : ''}${body}${w.end < r.text.length ? '…' : ''}`;
}

/**
 * Sections of the program whose title, code or text contains `query`, case
 * insensitively, in CTD order, a page at a time from `offset`, with a snippet
 * around the first hit in the readable text.
 *
 * The order is decided before the page is cut. SQL cannot sort by CTD code
 * (that is compareSectionCode), so the matching sections' keys are fetched
 * without content, at most SEARCH_SCAN_MAX of them, sorted here, and only the
 * page's sections are fetched with content. A plain ILIKE scan: no index
 * serves it, which is acceptable at one program's size; a trigram index would
 * be an additive migration if it ever is not.
 */
export async function searchSections(
  pool: AuthoringReadQueryable,
  opts: ProgramScope & { query: string; limit?: number; offset?: number; scanMax?: number },
): Promise<ReadOutcome<SectionSearch>> {
  const q = String(opts.query ?? '').trim().replace(/\s+/g, ' ');
  if (q.length < QUERY_MIN || q.length > QUERY_MAX) return badInput(`A search needs between ${QUERY_MIN} and ${QUERY_MAX} characters.`);
  const limit = clampInt(opts.limit, SEARCH_DEFAULT_LIMIT, 1, SEARCH_MAX_LIMIT);
  const offset = clampInt(opts.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const scanMax = clampInt(opts.scanMax, SEARCH_SCAN_MAX, 1, SEARCH_SCAN_MAX);
  const keySql =
    `SELECT s.id, s.doc_id, s.code, s.order_index, d.created_at AS doc_created_at` +
    `${SCOPED_SECTIONS}` +
    ` AND (s.title ILIKE $3 ESCAPE '\\' OR s.code ILIKE $3 ESCAPE '\\' OR ${PLAIN_SQL} ILIKE $3 ESCAPE '\\')` +
    ' ORDER BY d.created_at, d.id, s.order_index, s.id LIMIT $4';
  const keyRows = (await pool.query(keySql, [opts.tenantId, opts.programId, containsPattern(q), scanMax + 1])).rows as SearchKeyRow[];
  const scanCapped = keyRows.length > scanMax;
  const ranked = keyRows
    .slice(0, scanMax)
    .map((r) => ({ r, key: { t: docTimeOf(r.doc_created_at), d: r.doc_id, k: codeKey(r.code), o: Number(r.order_index ?? 0), i: r.id } }))
    .sort((a, b) => compareKeys(a.key, b.key));
  const page = ranked.slice(offset, offset + limit);

  const contentSql = `SELECT s.id, s.title, s.content, d.title AS doc_title${SCOPED_SECTIONS} AND s.id = ANY($3::uuid[])`;
  const rows = page.length ? (await pool.query(contentSql, [opts.tenantId, opts.programId, page.map((x) => x.r.id)])).rows : [];
  const content = new Map((rows as SearchContentRow[]).map((r) => [r.id, r]));
  const nextOffset = offset + page.length < ranked.length ? offset + page.length : null;
  return {
    ok: true,
    value: {
      query: q, offset, nextOffset, totalMatches: ranked.length, scanCapped, truncated: nextOffset !== null || scanCapped,
      // A section deleted between the two statements has no content row and is left out.
      hits: page.flatMap(({ r }) => {
        const c = content.get(r.id);
        if (!c) return [];
        const rendered = renderSection(str(c.content));
        const shown = rendered.text ? rendered : layout([{ text: escapeDelimiters(String(c.title ?? '')) }]);
        const identity = { docId: r.doc_id, docTitle: String(c.doc_title ?? ''), sectionId: r.id, code: str(r.code), title: str(c.title) };
        return [{ ...identity, snippet: snippetOf(shown, q) }];
      }),
    },
  };
}
