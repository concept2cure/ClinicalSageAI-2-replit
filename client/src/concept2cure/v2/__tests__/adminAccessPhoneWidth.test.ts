/**
 * The admin console at a phone's width, pinned in the stylesheet rules that decide it, because jsdom does no
 * layout. Measured in the running app at 390 px on 2026-11-12
 * (docs/evidence/HUMAN-TEST/CLICK-THROUGH/2026-11-12-phone-dark/): the whole page scrolled 429 px sideways.
 *
 * - Under 1100 px the members layout became one column written `1fr`. That is `minmax(auto, 1fr)`: the column is at
 *   least as wide as its content, and the members table's seven columns come to about 700 px, so the column, the
 *   section and the member's drawer were all 819 px wide in a 390 px page.
 * - The six tabs sat in a row that could not scroll: each was squeezed until its label broke over three lines, and the
 *   last still ran past the right edge.
 * - The table had nowhere to scroll (`overflow: hidden`), so with the column held to the page it would have been
 *   squeezed to nothing instead. At a phone's width it scrolls inside its own box, at a width its columns can read.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rules } from './_cssRules';

const CSS = readFileSync(resolve(__dirname, '../styles/admin-access.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const RULES = rules(CSS);
const maxWidth = (media: string | null) => Number(/max-width:\s*(\d+)px/.exec(media ?? '')?.[1] ?? NaN);
const decl = (body: string, prop: string) => body.split(';').map((d) => d.split(':')).filter(([k]) => k?.trim() === prop).map(([, ...v]) => v.join(':').trim()).pop();
const narrow = (selector: string) => RULES.filter((r) => r.media && maxWidth(r.media) >= 390 && r.selector.split(',').map((s) => s.trim()).includes(selector));

describe('the admin console at 390 px', () => {
  it('the one-column members layout cannot be wider than the page', () => {
    const cols = narrow('.adm-access .adm-members-layout').map((r) => decl(r.body, 'grid-template-columns')).filter(Boolean);
    expect(cols.length, 'no narrow rule sets the members layout\'s columns').toBeGreaterThan(0);
    for (const c of cols) expect(c, '`1fr` alone lets the column grow to its content').toMatch(/^minmax\(0(px)?,\s*1fr\)$/);
  });

  it('the row of tabs scrolls inside its own box, and a tab keeps its label on one line', () => {
    expect(narrow('.adm-access .adm-tabs').some((r) => decl(r.body, 'overflow-x') === 'auto'), 'six tabs ran past the right edge').toBe(true);
    // A scrolling box has no minimum height, so in the page's column it shrank to its padding and hid its tabs.
    expect(narrow('.adm-access .adm-tabs').some((r) => decl(r.body, 'flex-shrink') === '0'), 'the scrolling row can shrink to nothing').toBe(true);
    const tab = narrow('.adm-access .adm-tab');
    expect(tab.some((r) => decl(r.body, 'white-space') === 'nowrap'), '"Roles + scopes" broke over three lines').toBe(true);
    expect(tab.some((r) => /^0 0 auto$/.test(decl(r.body, 'flex') ?? '')), 'a tab was squeezed, not scrolled to').toBe(true);
  });

  it('the members table scrolls inside its own box, and its rows keep a width their columns can read', () => {
    const table = narrow('.adm-access .ctable');
    expect(table.some((r) => decl(r.body, 'overflow-x') === 'auto'), 'the table has nowhere to scroll').toBe(true);
    const rows = RULES.filter((r) => r.media && maxWidth(r.media) >= 390 && /\.adm-access \.ctable-(head|row)/.test(r.selector));
    const min = rows.map((r) => parseInt(decl(r.body, 'min-width') ?? '', 10)).filter((n) => !Number.isNaN(n));
    expect(Math.max(0, ...min), 'rows squeezed to the page have unreadable columns').toBeGreaterThanOrEqual(600);
  });
});
