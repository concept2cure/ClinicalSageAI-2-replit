/**
 * What the task board's Analytics tab actually measured.
 *
 * ── The defect this exists for (reporting coverage review, C-8) ─────────────
 * The tab's figures — "Open tasks", "On critical path", "Regulatory impact",
 * "Blocked", "Approvals pending", "By module", "Team productivity" — are
 * computed from `list`, the board's FILTERED rows, and were rendered under
 * those bare labels. So with the module filter on "clinical" and "Assigned to
 * me" selected, "Team productivity" showed one person and read as the team,
 * and "Blocked: 0" read as a clear board rather than as no blocked clinical
 * task of the reader's own. A measurement whose scope is not stated is read as
 * the whole, which is the same silent-cap failure as the run-history window
 * (C-1) and the capped portfolio rollup (C-12), on a surface whose purpose is
 * to answer "where does this stand".
 *
 * `list` also drops cancelled tasks unconditionally, so even with no filter it
 * is a subset of what the board read. That is the right rows to measure — a
 * cancelled task is not open, blocked or on the critical path — but it means
 * `shown === total` is not the unfiltered case, and the sentence has to say so
 * rather than imply the figures cover every card.
 *
 * PURE, and in its own module rather than inside TaskBoard.tsx, so the wording
 * is testable without rendering a board and the 1,993-line surface does not
 * grow.
 *
 * @module client/src/concept2cure/v2/surfaces/taskBoardAnalyticsScope
 */

/** The board's filter controls, as the surface holds them. */
export interface TaskBoardFilters {
  /** `'all'`, or the one project the board is narrowed to. */
  project: string;
  /** `'all'`, or the one module type the board is narrowed to. */
  moduleType: string;
  /** "Assigned to me" is on. */
  mineOnly: boolean;
}

export interface TaskAnalyticsCoverage {
  /** Rows the figures were computed over. */
  shown: number;
  /** Rows the board read, before filtering. */
  total: number;
  filters: TaskBoardFilters;
}

/** The filters in play, in the order the controls appear, or an empty list. */
function activeFilters(f: TaskBoardFilters): string[] {
  const named: string[] = [];
  if (f.project !== 'all') named.push(`project “${f.project}”`);
  if (f.moduleType !== 'all') named.push(`module “${f.moduleType}”`);
  if (f.mineOnly) named.push('assigned to you');
  return named;
}

/**
 * One sentence saying what the figures cover, or null when they cover every
 * card the board read and there is nothing to qualify.
 *
 * Returning null matters as much as the sentence: a note on every load is
 * noise a reader learns to skip, and then it is not there when it counts.
 */
export function taskAnalyticsScope(coverage: TaskAnalyticsCoverage): string | null {
  const { shown, total, filters } = coverage;
  const named = activeFilters(filters);
  const excluded = Math.max(0, total - shown);

  if (named.length === 0) {
    if (excluded === 0) return null;
    // No filter, but `list` still dropped the cancelled cards.
    return `These figures cover ${shown} of the ${total} cards on the board. ` +
      `${excluded} cancelled ${excluded === 1 ? 'card is' : 'cards are'} not counted.`;
  }

  const where = named.length === 1
    ? named[0]
    : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  /* The cancelled cards are not itemised here. With a filter on, the gap
     between `shown` and `total` is the filter AND the cancelled rows together,
     and splitting them would need a second count the board does not take —
     so the sentence gives the pair of numbers and names the filters, and
     claims nothing about how the difference divides. */
  return `These figures cover the ${shown} of ${total} cards this board is ` +
    `filtered to — ${where}. Clear the filters to measure the whole board.`;
}
