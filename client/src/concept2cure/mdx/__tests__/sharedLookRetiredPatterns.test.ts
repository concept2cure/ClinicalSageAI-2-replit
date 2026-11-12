/**
 * D8 slice 1 (founder decision P-128): the device kit's shared stylesheet carries none of the patterns
 * ONE_DESIGN_PLAN §2 retires that every device screen inherits from it.
 *
 * Walked 2026-11-11 (docs/evidence/HUMAN-TEST/CLICK-THROUGH/2026-11-11/, finding 5): the device screens opened
 * under an uppercase, letter-spaced eyebrow ("WORKSTREAM · CLASS II · 510K · …"), with a row of stat tiles filled
 * red, amber or green by their tone and labelled in uppercase, and with uppercase table headings.
 * §2: sentence case everywhere; no uppercase coloured eyebrow labels; status colour only for meaning.
 *
 * This is a text comparison, as documentsPanelIsStyled.test.ts is: jsdom does not cascade. It pins what the sheet
 * says. What the screens look like is in docs/evidence/DESIGN/D8/slice-1/, from the running app.
 *
 * Nothing a screen shows is removed (P-122): the eyebrow's words, each tile's figure and each tile's tone are all
 * still there. The tone is carried by the figure's colour.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The declarations of the first rule whose selector is exactly this; '' when the sheet has none. */
const rule = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // nosemgrep: detect-non-literal-regexp -- the selector is a literal of this file, escaped
  const found = new RegExp(`(?:^|[},])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  return found ? found[1] : '';
};

/** The four rules every device screen shows on arrival, as the running app showed them (probe of 2026-11-12), each
    with the size it takes. The tile's label took the caption size in slice 1; slice 3 made the tiles a line of
    figures and gave it the canonical register label's size (`.c2c-v2 .reg-kpi-l`), which tilesAreALineOfFigures
    pins too. */
const ON_ARRIVAL: ReadonlyArray<[selector: string, size: string]> = [
  ['.mdx-shell .page-eyebrow', '--fs-caption'],
  ['.mdx-shell .metric-label', '--fs-small'],
  ['.mdx-shell .tbl thead th', '--fs-caption'],
  ['.mdx-shell .ctable-head', '--fs-caption'],
];

describe('the device kit’s shared look (D8 slice 1)', () => {
  it.each(ON_ARRIVAL)('%s is quiet: sentence case, no letter-spacing, %s', (selector, size) => {
    const body = rule(selector);
    expect(body, `${selector} has a rule`).not.toBe('');
    expect(body).not.toMatch(/text-transform:\s*uppercase/);
    expect(body).not.toMatch(/letter-spacing:\s*0\.\d+em/);
    expect(body).toMatch(new RegExp(`font-size:\\s*var\\(${size}\\)`));
  });

  /* The sheet had 43 uppercase rules. Four are what a screen shows on arrival and are gone. One, .eng-blocker-kind,
     styles a code the markup writes in lowercase ("dhf"), so it stays until its markup says "DHF". The other 38
     style states a later slice opens and reads before changing them. The count only goes down. */
  it('has no more uppercase rules than the 39 this slice leaves, and the kept code chip is one of them', () => {
    expect((css.match(/text-transform:\s*uppercase/g) ?? []).length).toBeLessThanOrEqual(39);
    expect(rule('.mdx-shell .eng-blocker-kind')).toMatch(/text-transform:\s*uppercase/);
  });

  it.each(['err', 'warn', 'ok'])('fills no stat tile by its tone (%s)', (tone) => {
    expect(css).not.toMatch(new RegExp(`\\.metric-card\\[data-tone="${tone}"\\]\\s*\\{[^}]*background`));
  });

  it('still says a tile’s tone, on its figure', () => {
    expect(rule('.mdx-shell .metric-card[data-tone="err"] .metric-val')).toMatch(/color:\s*var\(--error\)/);
    expect(rule('.mdx-shell .metric-card[data-tone="warn"] .metric-val')).toMatch(/color:\s*var\(--warning\)/);
  });

  it('keeps the eyebrow, the tile’s label, its figure and its note as rules: nothing a screen shows is unstyled away', () => {
    for (const selector of ['.mdx-shell .page-eyebrow', '.mdx-shell .metric-card', '.mdx-shell .metric-label', '.mdx-shell .metric-val', '.mdx-shell .metric-meta']) {
      const body = rule(selector);
      expect(body, selector).not.toBe('');
      expect(body, selector).not.toMatch(/display:\s*none|visibility:\s*hidden/);
    }
  });
});
