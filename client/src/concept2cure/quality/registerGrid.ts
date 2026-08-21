/**
 * How wide a register row has to be before its columns stop lying.
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * `SopRegister` and `ChangeControl` both lay a row out as a grid of seven fixed
 * tracks and one flexible one — the document title. The fixed tracks and gaps
 * come to 848px. A v2 surface is not given the 1440px window: the shell spends
 * 264px on nav and 380px on the AnA rail, so the column is 796px and the row's
 * content box is 738.
 *
 * 848 does not fit in 738, so `minmax(0, 1fr)` did what it was asked and
 * resolved the title track to **0px**. Every row rendered without its title,
 * and `.qms-table`'s `overflow: hidden` — there for the border radius — clipped
 * the two rightmost columns off the end. A register that shows neither the name
 * of the document nor its next review date is not a register.
 *
 * The answer is the one the layout gate recommends: contain it. The table
 * scrolls, the row carries a minimum so every row is the same width and the
 * columns line up, and the title keeps a floor it can actually be read in.
 *
 * Which columns a governed register should shed on a narrow pane is a design
 * question and is deliberately NOT answered here. This only stops the table
 * from answering it by deleting the title.
 *
 * The minimum is derived from the grid string rather than written next to it,
 * because a hand-kept second number is a number that goes stale the first time
 * a column is resized.
 *
 * @module concept2cure/quality/registerGrid
 */

/** `.qms-thead, .qms-row { gap }` in app.css. */
export const REGISTER_GAP = 10;
/** `.qms-thead, .qms-row { padding: 9px 14px }` in app.css — the horizontal half. */
export const REGISTER_PAD_X = 14;
/** What a title column needs to be worth having. */
export const TITLE_FLOOR = 160;

const FIXED_PX = /^(\d+(?:\.\d+)?)px$/;

/** Split a track list on its top-level spaces, so `minmax(0, 1fr)` stays whole. */
function tracksOf(grid: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of grid) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ' ' && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * The smallest width at which every track in `grid` gets what it asked for and
 * each flexible track still gets `titleFloor`.
 *
 * @param grid the same string passed to `gridTemplateColumns`
 * @param titleFloor per-flexible-track minimum
 */
export function registerRowMinWidth(grid: string, titleFloor: number = TITLE_FLOOR): number {
  const tracks = tracksOf(grid);
  let fixed = 0;
  let flexible = 0;
  for (const t of tracks) {
    const m = FIXED_PX.exec(t);
    if (m) fixed += Number(m[1]);
    else flexible += 1;
  }
  return fixed + flexible * titleFloor + Math.max(tracks.length - 1, 0) * REGISTER_GAP + REGISTER_PAD_X * 2;
}
