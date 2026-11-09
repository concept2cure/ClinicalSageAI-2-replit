/**
 * The design-system README's four claims, held as ratchets (D0 review fix 14,
 * docs/evidence/DESIGN/D0/review/README.md).
 *
 * WHY THIS EXISTS
 * `design-system/README.md` said four things the v2 stylesheets did not do:
 * "no text below 12px", "nothing moves on hover", "every transition names
 * var(--ease)" and "never Title Case". A rule a document states and no check
 * holds is a suggestion. The README now says where each one stands, and this
 * test makes each count only fall: a new 11px label, a hover lift, an
 * ease-less transition or a `text-transform: capitalize` fails here, and every
 * one removed lowers the baseline in the same commit.
 *
 * HOW A CASE IS COUNTED (comments stripped, every `*.css` in v2/styles)
 * - small type: a `font-size` literal of 9 to 11.5px;
 * - hover motion: a rule whose selector holds `:hover` and whose block declares `transform`;
 * - ease-less transition: a `transition` that names `var(--dur)` and not `var(--ease)`;
 * - Title Case: `text-transform: capitalize`.
 *
 * The baselines were measured with exactly this rule at 37f520f3be
 * (2026-11-09). The review's own counts (1,219 / 39 / 116 / 25) were taken at
 * bfa9c6869 and have since fallen. Its failing run (one planted case of each
 * kind) is filed at docs/evidence/DESIGN/D0/D0-12-readme-claims/.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = resolve(__dirname, '../styles');

export interface ClaimCounts { smallType: number; hoverMotion: number; easelessTransition: number; titleCase: number }

/** Counts each claim's exceptions in a set of stylesheets (name → text). */
export function countClaims(sheets: Record<string, string>): ClaimCounts {
  const c: ClaimCounts = { smallType: 0, hoverMotion: 0, easelessTransition: 0, titleCase: 0 };
  for (const raw of Object.values(sheets)) {
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const m of css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) {
      const px = parseFloat(m[1]);
      if (px >= 9 && px < 12) c.smallType += 1;
    }
    for (const m of css.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)) {
      if (/(^|[;\s])transform\s*:/.test(m[2])) c.hoverMotion += 1;
    }
    for (const m of css.matchAll(/transition\s*:([^;}]*)/g)) {
      if (/var\(--dur\)/.test(m[1]) && !/var\(--ease\)/.test(m[1])) c.easelessTransition += 1;
    }
    c.titleCase += css.match(/text-transform\s*:\s*capitalize/g)?.length ?? 0;
  }
  return c;
}

/** Measured at 37f520f3be, 2026-11-09. May only fall: lower each in the commit that removes cases. */
const BASELINE: ClaimCounts = { smallType: 1200, hoverMotion: 38, easelessTransition: 110, titleCase: 25 };

const WHAT: Record<keyof ClaimCounts, string> = {
  smallType: 'text below the 12px floor (use --fs-caption or larger)',
  hoverMotion: 'a hover that moves (a hover changes fill, edge or ink only)',
  easelessTransition: 'a transition without var(--ease)',
  titleCase: 'text-transform: capitalize (sentence case everywhere)',
};

const sheets = Object.fromEntries(
  readdirSync(STYLES).filter((n) => n.endsWith('.css')).map((n) => [n, readFileSync(join(STYLES, n), 'utf8')]),
);

describe('the design-system README claims, held as ratchets (D0 review fix 14)', () => {
  it('counts each kind as the README states it', () => {
    expect(Object.keys(sheets).length).toBeGreaterThan(20);
    const probe = countClaims({
      'p.css': `/* font-size: 10px; text-transform: capitalize */
        .a{font-size:11px} .b{font-size:12px} .c{font-size:9.5px}
        .d:hover{transform:translateY(-1px)} .e:hover{background:red} .f:hover{color:red; transform: none}
        .g{transition: color var(--dur) var(--ease)} .h{transition: color var(--dur)}
        .i{text-transform: capitalize}`,
    });
    expect(probe).toEqual({ smallType: 2, hoverMotion: 2, easelessTransition: 1, titleCase: 1 });
  });

  it.each(Object.keys(BASELINE) as Array<keyof ClaimCounts>)('%s never rises above its baseline', (kind) => {
    const now = countClaims(sheets)[kind];
    expect(now, `New ${WHAT[kind]}: ${now} against a baseline of ${BASELINE[kind]}.`).toBeLessThanOrEqual(BASELINE[kind]);
  });
});
