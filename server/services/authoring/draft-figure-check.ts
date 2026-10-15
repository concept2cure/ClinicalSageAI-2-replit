/**
 * Each figure in an AnA-drafted section, checked against the sources it cites
 * (D2, Data Room catalog S5a, 2026-10-08;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * Before: a draft saved with its source references recorded WHICH documents
 * were cited and nothing about what the text said of them. A sample size, a
 * response rate or a hazard ratio the model wrote was stored and shown exactly
 * like one the cited CSR states, and the record said "not claim-level support"
 * and left it there. ICH E3's rule for a CSR — every number agrees with its
 * table — had no counterpart for a drafted section.
 *
 * Now, deterministically and at save: every figure the clinical-figure reader
 * finds in the section (figuresIn: percentages, p-values, ratios, intervals,
 * n, counts, doses, durations) is looked for in the text of the cited
 * excerpts, standing with its own measure (figureFoundAt, the same rule AnA's
 * answer check uses). A figure that is there is `found`, with the document,
 * its content hash and the offset where it stands. A figure that is not is
 * `unverified`: kept in the record and shown to the person, never silently
 * accepted and never corrected by the check (CLAUDE.md Rule 2: the engine
 * says whether the number is in the source; it does not supply one).
 *
 * Pure: the caller loads the excerpts the save already verified.
 */
import { figureFoundAt, figuresIn, indexNumbers, type FigureKind } from '../ana/answer-check-figures.js';
import { canonNumber, numbersInText } from '../ana/answer-check-sources.js';

/** One cited excerpt, as the save verified it: the excerpt starts at character 0 of the document's text. */
export interface CitedExcerpt {
  documentId: string;
  contentHash: string;
  text: string;
}

export interface FigureFinding {
  /** The figure as the section writes it ("47%", "HR 0.62", "n = 212"). */
  text: string;
  kind: FigureKind;
  status: 'found' | 'unverified';
  /**
   * Where it stands in the cited source; present only when found. `offset` is
   * the character in the document's text, or null when the reader's position
   * could not be confirmed there (a link before it shifts the reader's count):
   * the document is named, a position that might be wrong is not.
   */
  source?: { documentId: string; contentHash: string; offset: number | null };
}

export interface SectionFigureCheck {
  /** Figures the reader found in the section. */
  checked: number;
  found: number;
  unverified: number;
  /** At most FINDINGS_KEPT, unverified first; `truncated` says when more were checked. */
  figures: FigureFinding[];
  truncated: boolean;
}

/** How many findings one section keeps in the record (the counts are always complete). */
export const FINDINGS_KEPT = 100;

const NUMBER_AT = /^-?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)/;

/** The reader's position, kept only when the original text holds that number there. */
function confirmedOffset(text: string, seen: { pos: number; value: string }): number | null {
  const raw = NUMBER_AT.exec(text.slice(seen.pos).replace(/^[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/, '-'));
  return raw && canonNumber(raw[0]) === seen.value ? seen.pos : null;
}

/** The excerpt numbers, indexed per source, so a figure names the source that holds it. */
function indexExcerpts(excerpts: CitedExcerpt[]) {
  return excerpts.map((e) => ({ excerpt: e, index: indexNumbers(numbersInText(e.text, '', e.documentId, false)) }));
}

/** Check every figure of a section's readable text against the cited excerpts. */
export function checkSectionFigures(sectionText: string, excerpts: CitedExcerpt[]): SectionFigureCheck {
  const indexed = indexExcerpts(excerpts);
  const findings: FigureFinding[] = [];
  for (const fig of figuresIn(sectionText)) {
    let finding: FigureFinding = { text: fig.text, kind: fig.kind, status: 'unverified' };
    for (const { excerpt, index } of indexed) {
      const seen = figureFoundAt(fig, index);
      if (!seen) continue;
      finding = {
        text: fig.text, kind: fig.kind, status: 'found',
        source: { documentId: excerpt.documentId, contentHash: excerpt.contentHash, offset: confirmedOffset(excerpt.text, seen) },
      };
      break;
    }
    findings.push(finding);
  }
  const unverified = findings.filter((f) => f.status === 'unverified');
  const found = findings.filter((f) => f.status === 'found');
  const kept = [...unverified, ...found];
  return {
    checked: findings.length,
    found: found.length,
    unverified: unverified.length,
    figures: kept.slice(0, FINDINGS_KEPT),
    truncated: kept.length > FINDINGS_KEPT,
  };
}

/** A found figure at its place in the stored section content (the span-lineage coordinate space). */
export interface FigureSpan {
  charStart: number;
  charEnd: number;
  spanText: string;
  vaultDocumentId: string;
  contentHash: string;
  sourceLocator: string | null;
}

/** Whether position `i` of HTML `content` is inside a tag (`<...>`). */
function insideTag(content: string, i: number): boolean {
  return content.lastIndexOf('<', i) > content.lastIndexOf('>', i);
}

/** The next occurrence of `needle` in text (not inside a tag) at or after `from`, or -1. */
function nextInText(content: string, needle: string, from: number): number {
  for (let i = content.indexOf(needle, from); i !== -1; i = content.indexOf(needle, i + 1)) {
    if (!insideTag(content, i)) return i;
  }
  return -1;
}

/**
 * Each found figure of a section's check, placed in the stored content (S5c):
 * the span the lineage records. A figure is placed only where its text stands
 * literally in the content's text (not in a tag, an attribute or split by
 * markup), and a repeated figure takes its occurrences in document order. One
 * that cannot be placed is left out: the provenance still records it as found,
 * and the lineage claims no characters it cannot point at.
 */
export function figureSpansInContent(content: string, check: SectionFigureCheck | undefined): FigureSpan[] {
  if (!check || !content) return [];
  const cursor = new Map<string, number>();
  const spans: FigureSpan[] = [];
  for (const f of check.figures) {
    if (f.status !== 'found' || !f.source || !f.text || /[<>]/.test(f.text)) continue;
    const at = nextInText(content, f.text, cursor.get(f.text) ?? 0);
    if (at === -1) continue;
    cursor.set(f.text, at + f.text.length);
    spans.push({
      charStart: at,
      charEnd: at + f.text.length,
      spanText: f.text,
      vaultDocumentId: f.source.documentId,
      contentHash: f.source.contentHash,
      sourceLocator: f.source.offset === null ? null : `offset:${f.source.offset}`,
    });
  }
  return spans;
}
