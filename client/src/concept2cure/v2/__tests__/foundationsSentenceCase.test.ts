/**
 * Sentence case everywhere: no stylesheet uppercases text (D0 guard 1).
 *
 * WHY THIS EXISTS
 * docs/design/ONE_DESIGN_PLAN.md §2 (binding) makes the product sentence case
 * everywhere, and retires the uppercase coloured eyebrow ("CMC — MODULE 3
 * OPERATING SYSTEM", "PROJECT — COLLABORATION"). The D0 spec
 * (.design/claude-convergence/D0.md §1.16, §3) counted the cause: more than 300
 * `text-transform: uppercase` declarations across the v2 stylesheets, plus two
 * in the design system's own type classes. One of those two, `.small`, leaked
 * into every `btn small` button ("+ DEPLOY A SKILL", "TURN ONE OFF HERE") only
 * because the class names collided.
 *
 * CSS capitals hide the real casing from the people who write the copy. The
 * project name was uppercased by CSS in Submission Center's answer lead; an
 * acronym and an ordinary word look the same on screen. So the rule is: the
 * text is written in the case it is read in. Content that must read in capitals
 * (an agency acronym, a code such as "QM-") is authored in capitals in its TSX,
 * never produced by a stylesheet.
 *
 * WHAT IS PINNED
 * No `text-transform: uppercase` in any `client/src/concept2cure/v2/styles/*.css`
 * or in `design-system/colors_and_type.css`. Comments are stripped first, so
 * prose that names the property is not read as a declaration.
 *
 * THE ALLOWLIST
 * It maps a rule's selector to the written reason the casing is the data's job,
 * and it starts empty (D0 spec §4.3). An entry without a reason is refused: an
 * unexplained exception is the thing an allowlist exists to prevent.
 *
 * Red before D0-3 (the sentence-case sweep), green after. The red run is filed at
 * docs/evidence/DESIGN/D0/red/foundationsSentenceCase.txt.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = resolve(__dirname, '../styles');
const DESIGN_SYSTEM = resolve(__dirname, '../../../../../design-system/colors_and_type.css');

/** selector → why its capitals are the data’s job. Started empty (D0 spec §4.3). */
const ALLOWLIST: Record<string, string> = {
  '.c2c-v2 .rd-chip::first-letter':
    'Capitalises one letter, not the text: it is how the D0 chip (spec §4.2.10) turns a printed value ' +
    '("planning") into sentence case ("Planning"), and §7.6 measures it. No chip leads with a lower-case ' +
    'brand form (eCTD, eSTAR). It leaves when the owners map every raw enum to a label (spec §4.7, chip row).',
};

const UPPERCASE = /text-transform\s*:\s*uppercase\b/gi;

/** Comments become spaces, newlines kept, so offsets and line numbers still hold. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
}

/** The selector of the innermost block that holds `at`. */
function selectorAt(css: string, at: number): string {
  let depth = 0;
  let i = at;
  for (; i >= 0; i--) {
    if (css[i] === '}') depth++;
    else if (css[i] === '{') {
      if (depth === 0) break;
      depth--;
    }
  }
  if (i < 0) return '(no block)';
  const start = Math.max(css.lastIndexOf('}', i - 1), css.lastIndexOf('{', i - 1), css.lastIndexOf(';', i - 1)) + 1;
  return css.slice(start, i).replace(/\s+/g, ' ').trim();
}

interface Hit {
  file: string;
  line: number;
  selector: string;
}

function uppercaseHits(label: string, raw: string): Hit[] {
  const css = stripComments(raw);
  const out: Hit[] = [];
  for (const m of css.matchAll(UPPERCASE)) {
    const at = m.index ?? 0;
    out.push({ file: label, line: css.slice(0, at).split('\n').length, selector: selectorAt(css, at) });
  }
  return out;
}

function sheets(): { label: string; css: string }[] {
  const v2 = readdirSync(STYLES)
    .filter((n) => n.endsWith('.css'))
    .sort()
    .map((n) => ({ label: `v2/styles/${n}`, css: readFileSync(join(STYLES, n), 'utf8') }));
  return [...v2, { label: 'design-system/colors_and_type.css', css: readFileSync(DESIGN_SYSTEM, 'utf8') }];
}

describe('sentence case: no stylesheet uppercases text (ONE_DESIGN_PLAN §2, D0 guard 1)', () => {
  it('reads the stylesheets it guards', () => {
    const labels = sheets().map((s) => s.label);
    expect(labels).toContain('v2/styles/app-v2.css');
    expect(labels).toContain('design-system/colors_and_type.css');
  });

  it('every allowlist entry carries a written reason', () => {
    const bare = Object.entries(ALLOWLIST)
      .filter(([, why]) => why.trim().length < 12)
      .map(([sel]) => sel);
    expect(bare, 'an allowlisted selector needs the reason its casing is the data’s job').toEqual([]);
  });

  it('no `text-transform: uppercase` in v2/styles/*.css or design-system/colors_and_type.css', () => {
    const hits = sheets()
      .flatMap((s) => uppercaseHits(s.label, s.css))
      .filter((h) => !(h.selector in ALLOWLIST));
    const report = hits.map((h) => `${h.file}:${h.line}  ${h.selector}`);
    expect(
      report,
      `${hits.length} uppercase declaration(s). Write the text in the case it is read in; ` +
        'capitals that are the data’s job are authored in the TSX (D0 spec §4.3).',
    ).toEqual([]);
  });
});
