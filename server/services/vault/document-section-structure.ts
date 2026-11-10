/**
 * Section structure of a vault document's extracted text — the headings a
 * passage sits under, written onto every chunk (section_title,
 * section_hierarchy, chunk_type) so a retrieved statistic can be cited by the
 * section and the table it belongs to, not only by its page.
 *
 * vault.document_chunks has carried those three columns since the table was
 * created (migrations/20260905b_vault_document_chunks.sql); the writer never
 * filled them, so every passage reached the RAG reader with sectionTitle NULL.
 *
 * ── What is a heading ──────────────────────────────────────────────────────
 * One line of extracted text, read on its own:
 *
 *   • A numbered section: a section number at the start of the line, then a
 *     title. The number is digits and dots, with single capital-letter
 *     segments for the CTD's lettered parts — "2.7.3", "3.2.S.4.2",
 *     "3.2.P.5.1", "11.4.1" (ICH E3) — and its depth is its segment count.
 *     The number is followed by a space or a tab, optionally after one period;
 *     "1)" and "1:" are list markers. The title starts with a capital letter,
 *     does not end in . , ; : ! or ?, holds no tab (pdf-parse and the
 *     spreadsheet renderer write a tab between table cells), no dot leader,
 *     and is not half numbers; the line is at most 120 characters. A
 *     one-segment number ("1.", "9") also needs a title-cased title — every
 *     word but minor ones capitalised — because a bare number at a line start
 *     is far more often a list item or a table row, and a top-level heading
 *     resets the whole path below it.
 *   • A table or figure caption: "Table 14.2.1 …", "Figure 3: …", or the
 *     label alone ("Table 11-3"), at the start of a line of at most 160
 *     characters, with the same title rules.
 *
 * A run of three or more heading lines with nothing between them but blank
 * lines and bare page numbers is a table of contents or a list of tables, not
 * structure — unless each line is a subsection of the one before it ("3.2.S",
 * "3.2.S.1", "3.2.S.1.1"), which is how a section opens straight into its
 * first subsection. A run ends where a number repeats: the contents list is
 * over and the first section it listed has begun.
 *
 * The number is split from its title by parseHeading
 * (server/import/docx-to-authoring.ts), the section-code grammar the Word
 * import already files sections under. What this module adds is the decision
 * that a line of extracted text is a heading at all, which a Word heading
 * style answers there and nothing answers here.
 *
 * ── What a chunk is given (sectionsForChunks) ──────────────────────────────
 *   • section_hierarchy — the numbered headings in force at the chunk's first
 *     character, outermost first, each as written ("2.7 Clinical Summary",
 *     "2.7.3 Summary of Clinical Efficacy"). Ancestors are found by number, so
 *     "12.2.1" after "11.4" is not filed under 11.4.
 *   • chunk_type — 'TABLE' when tab-separated rows of two or more cells (at
 *     least two rows) hold at least half of the chunk's non-blank characters;
 *     otherwise 'TEXT', the column's default. The vocabulary is the column's
 *     own (db/migrations/_legacy/042_gcc_evidence_vault.sql: TEXT, TABLE,
 *     FIGURE, HEADING).
 *   • section_title — the last entry of that path, except that a TABLE chunk
 *     whose nearest heading is a table caption is named by the caption, which
 *     is then appended to the path: the statistic is cited as the table, and
 *     the table stays filed under its section. A caption never names a TEXT
 *     chunk: where a table ends is not in the text, so narrative after it
 *     stays under its section. A figure caption names nothing — a figure has
 *     no text to chunk — and ends the reach of the table caption before it.
 *
 * Nothing is inferred beyond the text. A chunk before the first heading, or in
 * a document with none these rules recognise, has a NULL section and a NULL
 * path, which is true. Pure and deterministic.
 */

import { parseHeading } from '../../import/docx-to-authoring.js';
import { pageForOffset, type PageSpan } from '../ocr/page-offsets.js';

export type DocumentHeadingKind = 'section' | 'table' | 'figure';

/** One heading line, as the line alone determines it. */
export interface DocumentHeadingLine {
  kind: DocumentHeadingKind;
  /** The section number ("3.2.P.5.1") or the caption's number ("14.2.1", "11-3"). */
  number: string;
  /** The title after the number, whitespace collapsed; '' for a bare caption label. */
  title: string;
  /** The line as written, whitespace collapsed: what a chunk stores. */
  label: string;
  /** Segments in a section number ("3.2.S.4.2" is 5); 0 for a caption. */
  depth: number;
}

/** A heading in place in the extracted text. */
export interface DocumentHeading extends DocumentHeadingLine {
  /** Half-open span of the heading line (trimmed) in the text. */
  charStart: number;
  charEnd: number;
  /** The page it is on, from verified page spans; null when they are absent. */
  page: number | null;
}

/** vault.document_chunks.chunk_type values this writer uses. */
export type VaultChunkType = 'TEXT' | 'TABLE';

export interface ChunkSection {
  chunkType: VaultChunkType;
  sectionTitle: string | null;
  /** Outermost first; null when the chunk is in no section. */
  sectionHierarchy: string[] | null;
}

const MAX_SECTION_LINE = 120;
const MAX_CAPTION_LINE = 160;
/** At or above this many consecutive heading lines, a run is a contents list. */
const CONTENTS_RUN = 3;
/** Digits and dots, with CTD letter segments after the first: 2.7.3, 3.2.S.4.2, 11.4.1. */
const SECTION_NUMBER = /^[1-9]\d?(?:\.(?:\d{1,3}|[A-Z]))*$/;
const CAPTION =
  /^(Table|TABLE|Figure|FIGURE)[ \t]+([A-Z]?\d+(?:[.-]\d+)*[a-zA-Z]?)(?:(?:[ \t]*[:.–—-][ \t]*|[ \t]+)(.*))?$/;
const CONTINUED = /^\((?:continued|cont(?:'d|\.)?)\)$/i;
const DOT_LEADER = /(?:\.\s?){3,}|…/;
const PAGE_NUMBER_LINE = /^\d{1,4}$/;
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or',
  'over', 'per', 'the', 'to', 'under', 'versus', 'via', 'vs', 'vs.', 'with', 'within', 'without',
]);

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** The title, collapsed, when it reads as a heading's title; otherwise null. */
function headingTitle(raw: string): string | null {
  if (raw.includes('\t')) return null;
  const title = collapse(raw);
  if (!/^\p{Lu}/u.test(title)) return null;
  if (/[.,;:!?]$/.test(title) || DOT_LEADER.test(title)) return null;
  const words = title.split(' ');
  const numbers = words.filter(w => /\d/.test(w) && !/\p{L}/u.test(w)).length;
  if (numbers > 0 && numbers * 2 >= words.length) return null;
  return title;
}

/** Every word that starts with a letter is capitalised, minor words after the first excepted. */
function isTitleCase(title: string): boolean {
  return title.split(' ').every((word, i) =>
    !/^\p{L}/u.test(word) || (i > 0 && MINOR_WORDS.has(word.toLowerCase())) || /^\p{Lu}/u.test(word));
}

function sectionLine(line: string): DocumentHeadingLine | null {
  if (line.length > MAX_SECTION_LINE || !/^[1-9]/.test(line)) return null;
  const { code } = parseHeading(line);
  if (!code || !SECTION_NUMBER.test(code) || !line.startsWith(code)) return null;
  const separator = /^\.?[ \t]+/.exec(line.slice(code.length));
  if (!separator) return null;
  const title = headingTitle(line.slice(code.length + separator[0].length));
  if (!title) return null;
  const depth = code.split('.').length;
  if (depth === 1 && !isTitleCase(title)) return null;
  return { kind: 'section', number: code, title, label: collapse(line), depth };
}

function captionLine(line: string): DocumentHeadingLine | null {
  if (line.length > MAX_CAPTION_LINE) return null;
  const m = CAPTION.exec(line);
  if (!m) return null;
  const rest = collapse(m[3] ?? '');
  const title = rest === '' || CONTINUED.test(rest) ? rest : headingTitle(m[3]);
  if (title === null) return null;
  const kind = m[1].toLowerCase() === 'table' ? 'table' : 'figure';
  return { kind, number: m[2], title, label: collapse(line), depth: 0 };
}

/** Whether one line of extracted text is a heading, and which. */
export function detectHeadingLine(line: string): DocumentHeadingLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return sectionLine(trimmed) ?? captionLine(trimmed);
}

/** Whether `number` is a subsection of `ancestor` ("2.7.3.1" of "2.7"). */
function isWithin(ancestor: string, number: string): boolean {
  return number.startsWith(`${ancestor}.`);
}

/** A run of headings that opens a section into its subsections, one inside the next. */
function descends(run: DocumentHeading[]): boolean {
  return run.every((h, i) => h.kind === 'section' && (i === 0 || isWithin(run[i - 1].number, h.number)));
}

/** The run's headings that are structure: a contents list's are not. */
function structuralHeadings(run: DocumentHeading[]): DocumentHeading[] {
  const kept: DocumentHeading[] = [];
  let part: DocumentHeading[] = [];
  const close = () => {
    if (part.length < CONTENTS_RUN || descends(part)) kept.push(...part);
    part = [];
  };
  for (const h of run) {
    // A number that repeats inside a run: the contents list ended, and the
    // first section it listed begins here.
    if (part.some(p => p.kind === h.kind && p.number === h.number)) close();
    part.push(h);
  }
  close();
  return kept;
}

/**
 * Every heading in the extracted text, in order, with its exact span and its
 * page when the page spans were verified (ocr/page-offsets.ts).
 */
export function detectDocumentHeadings(text: string, pageSpans?: PageSpan[] | null): DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  let run: DocumentHeading[] = [];
  let pos = 0;
  while (pos <= text.length) {
    const newline = text.indexOf('\n', pos);
    const end = newline === -1 ? text.length : newline;
    const raw = text.slice(pos, end);
    const line = raw.trim();
    if (line && !PAGE_NUMBER_LINE.test(line)) {
      const heading = detectHeadingLine(line);
      if (heading) {
        const charStart = pos + (raw.length - raw.trimStart().length);
        run.push({ ...heading, charStart, charEnd: charStart + line.length, page: pageForOffset(pageSpans, charStart) });
      } else {
        headings.push(...structuralHeadings(run));
        run = [];
      }
    }
    if (newline === -1) break;
    pos = newline + 1;
  }
  headings.push(...structuralHeadings(run));
  return headings;
}

/**
 * 'TABLE' when tab-separated rows (two or more cells, at least two rows) hold
 * at least half of the chunk's non-blank characters; heading lines count as
 * neither. Otherwise 'TEXT'.
 */
export function chunkTypeOf(chunkText: string): VaultChunkType {
  let rows = 0;
  let rowChars = 0;
  let chars = 0;
  for (const raw of chunkText.split('\n')) {
    const line = raw.trim();
    if (!line || detectHeadingLine(line)) continue;
    chars += line.length;
    if (line.split('\t').filter(cell => cell.trim()).length >= 2) {
      rows++;
      rowChars += line.length;
    }
  }
  return rows >= 2 && rowChars * 2 >= chars ? 'TABLE' : 'TEXT';
}

/**
 * The section each chunk sits in, from where it starts in `text`. `chunks`
 * are spans over `text` (document-chunking.service's chunkExtractedText).
 */
export function sectionsForChunks(
  text: string,
  chunks: ReadonlyArray<{ charStart: number; charEnd: number }>,
): ChunkSection[] {
  // The numbered path in force after each heading, so a chunk's is one lookup.
  const states: Array<{ at: number; path: DocumentHeading[]; last: DocumentHeading }> = [];
  let path: DocumentHeading[] = [];
  for (const h of detectDocumentHeadings(text)) {
    if (h.kind === 'section') path = [...path.filter(a => isWithin(a.number, h.number)), h];
    states.push({ at: h.charStart, path, last: h });
  }
  const stateAt = (offset: number) => {
    let lo = 0;
    let hi = states.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (states[mid].at <= offset) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found === -1 ? null : states[found];
  };

  return chunks.map(c => {
    const chunkType = chunkTypeOf(text.slice(c.charStart, c.charEnd));
    const state = stateAt(c.charStart);
    const sections = state ? state.path.map(h => h.label) : [];
    if (chunkType === 'TABLE' && state?.last.kind === 'table') {
      return { chunkType, sectionTitle: state.last.label, sectionHierarchy: [...sections, state.last.label] };
    }
    return {
      chunkType,
      sectionTitle: sections.length > 0 ? sections[sections.length - 1] : null,
      sectionHierarchy: sections.length > 0 ? sections : null,
    };
  });
}
