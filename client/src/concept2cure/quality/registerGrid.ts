/**
 * Shared column geometry for the QMS register tables.
 *
 * ── Why a computed minimum, and not `min-width: max-content` ─────────────────
 * The registers are eight columns, seven of them a fixed pixel width. They add
 * up to more than the 738px a surface column gets, so the table has to scroll —
 * see `.qms-table` in app.css for why scrolling beats the `overflow: hidden`
 * that used to clip two columns off the end.
 *
 * Making it scroll is the easy half. The rows also have to agree on where the
 * columns are. `min-width: max-content` on each row does not do that: every row
 * resolves its own max-content, so a row with a long title lays its Type chip
 * out further right than the row above it, and a register whose columns are not
 * columns is worse than one that scrolls.
 *
 * So each row gets the SAME explicit floor, derived here from the same template
 * string that sizes the tracks. One source of truth: change a track width and
 * the floor follows, rather than drifting from a number typed once in a
 * stylesheet.
 *
 * @module concept2cure/quality/registerGrid
 */

/** `gap` in `.qms-thead, .qms-row`. */
const GAP = 10;
/** Left + right of `padding: 9px 14px` on the same rule. */
const PADDING = 28;

/**
 * The narrowest width at which a row still shows every column at its floor.
 *
 * Reads the floor of each track: a bare `<n>px` is its own floor, and
 * `minmax(<n>px, …)` contributes `<n>`. A track with no pixel floor
 * contributes 0, which is correct — it is a track that has agreed to vanish.
 *
 * @param grid a `grid-template-columns` value
 * @returns width in px, including the row's gaps and horizontal padding
 */
export function rowMinWidth(grid: string): number {
  // Split on spaces that are not inside a function's parentheses, so
  // `minmax(0, 1fr)` stays one track rather than becoming two.
  const tracks = grid.trim().split(/\s+(?![^()]*\))/);
  const floors = tracks.map((t) => {
    const minmax = /^minmax\(\s*([\d.]+)px/.exec(t);
    if (minmax) return Number.parseFloat(minmax[1]);
    const fixed = /^([\d.]+)px$/.exec(t);
    return fixed ? Number.parseFloat(fixed[1]) : 0;
  });
  const total = floors.reduce((a, b) => a + b, 0);
  return total + GAP * Math.max(floors.length - 1, 0) + PADDING;
}
