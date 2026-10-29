/**
 * The CSR scientific-review map a reviewer builds before approving a CSR.
 *
 * A document recognised as a CSR cannot be approved, signed, frozen, exported
 * or filed until its approving reviewer maps every quantitative result in its
 * saved text to an exact cell of the retained clinical tables
 * (server/services/authoring/csr-scientific-review.ts). The server verified
 * that map and no screen could build one, so a CSR could not be finalised
 * through the product at all (CSR path review, 2026-10-29).
 *
 * This module is the screen's deterministic half. It finds each place a
 * retained cell's exact value appears in a section's saved text, offers the
 * cells it could be, and builds the submission from what the reviewer
 * confirmed. It decides nothing: a figure with several possible cells stays
 * unresolved until the reviewer chooses, and coverage and meaning are the
 * reviewer's attestations. The server re-verifies every byte.
 */
import {
  CSR_SCIENTIFIC_REVIEW_FORMAT, CSR_TABLE_KEYS, isExactNumericalDisplayAt,
  type CsrTableKey, type RetainedScientificRun, type ScientificCellClaim, type ScientificReviewSubmission,
} from '@shared/authoring/csr-scientific-review';

export interface CellRef {
  runId: string; studyId: string; table: CsrTableKey; row: number; column: number;
  value: string; tableTitle: string; header: string; rowLabel: string;
}
export interface FigureOccurrence {
  /** Stable within one saved section: where in the saved text, and what it reads. */
  key: string; sectionId: string; start: number; end: number; display: string;
  /** Every retained cell whose value is exactly this display. */
  candidates: CellRef[];
}
export interface SavedSection { id: string; code: string; title: string | null; content: string | null }

/**
 * Retained cells a figure may be: a value with a digit and no letters ("12",
 * "83.3", "10/12", "<0.001"). The server accepts any cell with a digit, but an
 * arm label such as "LMN-201" is not a reported result, so it is not offered.
 */
export function claimableCells(runs: readonly RetainedScientificRun[]): CellRef[] {
  const cells: CellRef[] = [];
  for (const run of runs) {
    for (const study of run.studies) {
      for (const table of CSR_TABLE_KEYS) {
        const t = study.tables[table];
        if (!t) continue;
        t.rows.forEach((cells_, row) => cells_.forEach((value, column) => {
          if (column >= t.headers.length || typeof value !== 'string' || !/\d/.test(value) || /[A-Za-z]/.test(value)) return;
          cells.push({ runId: run.runId, studyId: study.source.studyId, table, row, column, value,
            tableTitle: t.title, header: t.headers[column] ?? '', rowLabel: cells_[0] ?? '' });
        }));
      }
    }
  }
  return cells;
}

/** Character ranges inside HTML tags and entities: a digit there is markup, not a reported result. */
function markupRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const m of content.matchAll(/<[^>]*>|&#?[a-zA-Z0-9]+;/g)) ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return ranges;
}

/**
 * Each place a retained cell's exact value appears in a section's saved text,
 * outside markup, on the shared number boundaries ("190" is not found inside
 * "1190", nor "12" in "10/12"). A following "%" continues a number under that
 * rule ("12" is not "12%"), except for a cell in a percentage column, whose
 * value the text reports with its unit ("83.3%"). One occurrence per place,
 * with every cell it could be.
 */
export function figureOccurrences(section: SavedSection, cells: readonly CellRef[]): FigureOccurrence[] {
  const content = section.content ?? '';
  if (!content.trim()) return [];
  const markup = markupRanges(content);
  const inMarkup = (start: number, end: number) => markup.some(([a, b]) => start < b && end > a);
  const byDisplay = new Map<string, CellRef[]>();
  for (const cell of cells) byDisplay.set(cell.value, [...(byDisplay.get(cell.value) ?? []), cell]);
  const found = new Map<string, FigureOccurrence>();
  for (const [display, candidates] of byDisplay) {
    for (let at = content.indexOf(display); at !== -1; at = content.indexOf(display, at + 1)) {
      const end = at + display.length;
      if (inMarkup(at, end)) continue;
      let possible = candidates;
      if (!isExactNumericalDisplayAt(content, at, display)) {
        const percentOfCell = content[end] === '%' && isExactNumericalDisplayAt(content.slice(0, end), at, display);
        possible = percentOfCell ? candidates.filter((c) => c.header.includes('%')) : [];
      }
      if (!possible.length) continue;
      const key = `${section.id}:${at}:${end}`;
      found.set(key, { key, sectionId: section.id, start: at, end, display, candidates: possible });
    }
  }
  return [...found.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

export type Sha256 = (text: string) => Promise<string>;

/** WebCrypto SHA-256 over the UTF-8 bytes, hex: the server's node:crypto digest of the same text. */
export const browserSha256: Sha256 = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export interface ReviewerMap {
  runIds: string[];
  tablesSha256: string;
  sections: readonly SavedSection[];
  /** Occurrence key → the cell the reviewer confirmed, or null for "not a result". Absent: not yet decided. */
  choices: ReadonlyMap<string, CellRef | null>;
  /** Section id → the reviewer's statement of how the section was checked. */
  rationale: ReadonlyMap<string, string>;
  allQuantitativeResultsMapped: boolean;
  populationsMethodsUnitsReviewed: boolean;
}

/** What still stops the map being submitted, in the reviewer's words; empty when it may be. */
export function mapGaps(map: ReviewerMap, occurrences: readonly FigureOccurrence[]): string[] {
  const gaps: string[] = [];
  const label = (s: SavedSection) => `${s.code}${s.title ? ` ${s.title}` : ''}`;
  if (!map.runIds.length) gaps.push('Select the retained analysis run whose tables this CSR reports.');
  for (const s of map.sections) {
    if (!s.content?.trim()) gaps.push(`Section ${label(s)} has no saved text. A CSR is approved only when every section is written.`);
    else if (!map.rationale.get(s.id)?.trim()) gaps.push(`Section ${label(s)} needs your statement of how you checked it.`);
  }
  const undecided = occurrences.filter((o) => !map.choices.has(o.key));
  if (undecided.length) gaps.push(`${undecided.length} ${undecided.length === 1 ? 'figure has' : 'figures have'} no decision yet: choose its table cell, or mark it not a result.`);
  if (![...map.choices.values()].some(Boolean)) gaps.push('No figure is mapped to a table cell. A CSR review needs at least one mapped result.');
  if (!map.allQuantitativeResultsMapped) gaps.push('Confirm that every quantitative result in the saved text is mapped.');
  if (!map.populationsMethodsUnitsReviewed) gaps.push('Confirm that you reviewed the populations, methods and units the results are reported under.');
  return gaps;
}

/** The submission the server verifies, from the reviewer's confirmed map. Refuses while any gap remains. */
export async function buildSubmission(map: ReviewerMap, occurrences: readonly FigureOccurrence[], sha256: Sha256 = browserSha256): Promise<ScientificReviewSubmission> {
  const gaps = mapGaps(map, occurrences);
  if (gaps.length) throw new Error(gaps[0]);
  const sections = [];
  for (const s of map.sections) {
    const content = s.content as string;
    const claims: ScientificCellClaim[] = [];
    for (const o of occurrences.filter((x) => x.sectionId === s.id)) {
      const cell = map.choices.get(o.key);
      if (!cell) continue;
      claims.push({
        id: `${s.id}:${o.start}:${cell.table}:${cell.row}:${cell.column}`.slice(0, 200),
        start: o.start, end: o.end, quoteSha256: await sha256(content.slice(o.start, o.end)),
        runId: cell.runId, studyId: cell.studyId, table: cell.table, row: cell.row, column: cell.column,
        expectedValue: cell.value,
      });
    }
    sections.push({
      sectionId: s.id, contentSha256: await sha256(content),
      assessment: claims.length ? 'mapped-results' as const : 'no-quantitative-results' as const,
      rationale: (map.rationale.get(s.id) as string).trim(), claims,
    });
  }
  return {
    format: CSR_SCIENTIFIC_REVIEW_FORMAT, runIds: [...map.runIds], expectedTablesSha256: map.tablesSha256,
    allQuantitativeResultsMapped: true, populationsMethodsUnitsReviewed: true, sections,
  };
}
