/**
 * Document analysis — structure parsing, in-document search, and section-level
 * (clause-aware) comparison.
 *
 * This is the analytical core that lets AnA actually review client documents:
 *   - parseDocumentStructure: detect the heading/section/clause outline and a
 *     table of contents from extracted document text (headings by markdown,
 *     decimal numbering, Article/Section/Clause prefixes, or ALL-CAPS lines);
 *   - searchDocument: a "grep within the document" — find a literal or regex
 *     query and report each hit with its line number and the section it falls
 *     under;
 *   - diffDocumentStructure: compare two versions at the section/clause level
 *     (added / removed / modified / unchanged sections), reusing the existing
 *     line-level LCS diff for the body of modified sections.
 *
 * Pure and deterministic. Heading detection is heuristic (documented below); it
 * never invents structure — a line that doesn't match a heading pattern is body
 * text.
 */

import { diffText, type DiffResult } from './versionDiffService';

export interface Heading {
  level: number;
  /** Section number such as "2.3" when present, else null. */
  number: string | null;
  title: string;
  /** 1-based line where the heading occurs. */
  line: number;
}

export interface DocumentSection {
  number: string | null;
  title: string;
  level: number;
  startLine: number;
  endLine: number;
  text: string;
}

export interface DocumentStructure {
  headings: Heading[];
  sections: DocumentSection[];
  /** Flat table of contents (heading level + numbering + title). */
  toc: Array<{ level: number; number: string | null; title: string; line: number }>;
  counts: { headings: number; sections: number; tables: number; figures: number; lines: number };
}

const PREAMBLE_TITLE = '(preamble)';

/** Detect whether a single line is a heading; returns its level/number/title or null. */
export function detectHeading(line: string): { level: number; number: string | null; title: string } | null {
  const t = line.trim();
  if (!t) return null;

  // Markdown ATX headings.
  const md = /^(#{1,6})\s+(.+?)\s*#*$/.exec(t);
  if (md) return { level: md[1].length, number: null, title: md[2].trim() };

  // Decimal-numbered headings: "1 Title", "1. Title", "2.3.1 Title".
  const num = /^(\d+(?:\.\d+)*)\.?\s+(\S.{0,118})$/.exec(t);
  if (num && !/[.:;]$/.test(num[2])) {
    return { level: num[1].split('.').length, number: num[1], title: num[2].trim() };
  }

  // Article / Section / Clause / Part / Appendix / Schedule / Exhibit N.
  const art = /^(article|section|clause|part|appendix|schedule|exhibit)\s+([0-9]+(?:\.[0-9]+)*|[ivxlcdm]+)\b[.:)]?\s*(.*)$/i.exec(t);
  if (art) {
    const title = (art[3] && art[3].trim().length > 0) ? art[3].trim() : `${capitalize(art[1])} ${art[2]}`;
    return { level: art[2].includes('.') ? art[2].split('.').length : 1, number: art[2], title };
  }

  // ALL-CAPS standalone heading line (e.g. "BACKGROUND", "STATEMENT OF FACTS").
  if (/^[A-Z0-9][A-Z0-9 ,&/()'’-]{2,78}$/.test(t) && /[A-Z]{2,}/.test(t) && !/[.]$/.test(t)) {
    return { level: 1, number: null, title: t };
  }

  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Parse the heading/section outline and a table of contents from document text. */
export function parseDocumentStructure(text: string): DocumentStructure {
  const lines = text.split('\n');
  const headings: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const h = detectHeading(lines[i]);
    if (h) headings.push({ ...h, line: i + 1 });
  }

  const sections: DocumentSection[] = [];
  // Preamble: any content before the first heading.
  const firstHeadingLine = headings.length > 0 ? headings[0].line : lines.length + 1;
  if (firstHeadingLine > 1) {
    const body = lines.slice(0, firstHeadingLine - 1).join('\n');
    if (body.trim().length > 0) {
      sections.push({ number: null, title: PREAMBLE_TITLE, level: 0, startLine: 1, endLine: firstHeadingLine - 1, text: body });
    }
  }
  for (let h = 0; h < headings.length; h++) {
    const start = headings[h].line;
    const end = h + 1 < headings.length ? headings[h + 1].line - 1 : lines.length;
    sections.push({
      number: headings[h].number,
      title: headings[h].title,
      level: headings[h].level,
      startLine: start,
      endLine: end,
      text: lines.slice(start, end).join('\n'),
    });
  }

  const tables = (text.match(/\bTable\s+\d+/gi) || []).length;
  const figures = (text.match(/\bFigure\s+\d+/gi) || []).length;

  return {
    headings,
    sections,
    toc: headings.map(h => ({ level: h.level, number: h.number, title: h.title, line: h.line })),
    counts: { headings: headings.length, sections: sections.length, tables, figures, lines: lines.length },
  };
}

export interface SearchMatch {
  line: number;
  text: string;
  /** Title of the section the match falls under, or null if before any heading. */
  section: string | null;
}

export interface SearchResult {
  query: string;
  isRegex: boolean;
  totalMatches: number;
  matches: SearchMatch[];
  truncated: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Search within a document ("grep"). `query` is a literal string unless
 * `regex` is set. Each match reports its line and the section it belongs to.
 */
export function searchDocument(
  text: string,
  query: string,
  options: { regex?: boolean; caseSensitive?: boolean; maxResults?: number } = {},
): SearchResult {
  if (!query) throw new Error('query must be a non-empty string');
  const maxResults = options.maxResults ?? 200;
  const flags = options.caseSensitive ? 'g' : 'gi';
  const pattern = options.regex ? query : escapeRegExp(query);
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (e: any) {
    const err = new Error(`invalid regex: ${e.message}`);
    (err as { cause?: unknown }).cause = e;
    throw err;
  }

  const lines = text.split('\n');
  // Track which section each line is under.
  const matches: SearchMatch[] = [];
  let currentSection: string | null = null;
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = detectHeading(lines[i]);
    if (h) currentSection = h.title;
    re.lastIndex = 0;
    const found = (lines[i].match(re) || []).length;
    if (found > 0) {
      total += found;
      if (matches.length < maxResults) {
        matches.push({ line: i + 1, text: lines[i].trim(), section: currentSection });
      }
    }
  }

  return {
    query,
    isRegex: !!options.regex,
    totalMatches: total,
    matches,
    truncated: matches.length < total ? true : false,
  };
}

export type SectionChangeStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface SectionChange {
  title: string;
  number: string | null;
  status: SectionChangeStatus;
  additions: number;
  deletions: number;
}

export interface StructureDiff {
  summary: { added: number; removed: number; modified: number; unchanged: number };
  sections: SectionChange[];
  /** Flat line-level diff of the whole documents, for completeness. */
  flat: DiffResult;
}

function normalizeKey(s: DocumentSection): string {
  return `${s.number ?? ''}|${s.title.trim().toLowerCase()}`;
}
function normalizeBody(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

/**
 * Compare two documents at the section/clause level: which sections were added,
 * removed, or modified, and by how much. Modified sections carry a line-level
 * addition/deletion count from the existing LCS diff.
 */
export function diffDocumentStructure(oldText: string, newText: string): StructureDiff {
  const oldStruct = parseDocumentStructure(oldText);
  const newStruct = parseDocumentStructure(newText);
  const oldByKey = new Map(oldStruct.sections.map(s => [normalizeKey(s), s]));
  const newByKey = new Map(newStruct.sections.map(s => [normalizeKey(s), s]));

  const sections: SectionChange[] = [];
  const summary = { added: 0, removed: 0, modified: 0, unchanged: 0 };

  // Removed or modified/unchanged (iterate old, preserving order).
  for (const s of oldStruct.sections) {
    const key = normalizeKey(s);
    const match = newByKey.get(key);
    if (!match) {
      summary.removed++;
      sections.push({ title: s.title, number: s.number, status: 'removed', additions: 0, deletions: s.text.split('\n').length });
    } else if (normalizeBody(s.text) === normalizeBody(match.text)) {
      summary.unchanged++;
      sections.push({ title: s.title, number: s.number, status: 'unchanged', additions: 0, deletions: 0 });
    } else {
      const d = diffText(s.text, match.text);
      summary.modified++;
      sections.push({ title: match.title, number: match.number, status: 'modified', additions: d.additions, deletions: d.deletions });
    }
  }
  // Added (in new, not in old).
  for (const s of newStruct.sections) {
    if (!oldByKey.has(normalizeKey(s))) {
      summary.added++;
      sections.push({ title: s.title, number: s.number, status: 'added', additions: s.text.split('\n').length, deletions: 0 });
    }
  }

  return { summary, sections, flat: diffText(oldText, newText) };
}
