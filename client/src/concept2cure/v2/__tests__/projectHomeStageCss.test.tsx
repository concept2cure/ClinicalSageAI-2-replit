/**
 * The project page's new classes are its own.
 *
 * Slice F2 wrapped Evidence and Submit in a `.pj-stage` column. journey-v2.css
 * already owns `.pj-stage` for the Program journey's stage cells
 * (BiopharmaJourney.tsx). Both rules are global under `.c2c-v2` with the same
 * specificity, so their properties merged: each journey cell became a 20px-gap
 * column and could shrink below its 104px minimum, and the two project tabs
 * picked up the journey's `flex:1` and `padding:0 4px`. Neither
 * ci:check-css-selector-shadowing nor ci:check-shell-css-collisions saw it,
 * because neither rule fully shadows the other.
 *
 * This reads the project page's filing-spine block of project-home-v2.css and
 * checks that no class it defines is also defined by another v2 stylesheet.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = resolve(__dirname, '../styles');
const OWN = 'project-home-v2.css';
/* The generated text ramp restates other sheets' selectors by design. */
const SKIP = new Set([OWN, 'surface-text-ramp.css']);
const MARKER = /Project home: the filing['’]s five tabs/;

/** The classes a block of CSS defines rules for (selector side only). */
function definedClasses(css: string): Set<string> {
  const out = new Set<string>();
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of noComments.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const c of m[1].matchAll(/\.([A-Za-z_][\w-]*)/g)) out.add(c[1]);
  }
  return out;
}

describe('the filing spine’s project-page classes', () => {
  const own = readFileSync(join(STYLES, OWN), 'utf8');
  const named = own.search(MARKER);
  /* From the opening of the comment that names the block. */
  const at = named < 0 ? -1 : own.lastIndexOf('/*', named);

  it('the block is found', () => {
    expect(at, `${MARKER} in ${OWN}`).toBeGreaterThan(-1);
  });

  it('defines no class another v2 stylesheet already defines', () => {
    /* Shared context classes the block only scopes under, never defines. */
    const scopes = new Set(['c2c-v2', 'pj-lmod', 'pj-lmod-t']);
    const mine = [...definedClasses(own.slice(at))].filter((c) => !scopes.has(c));
    const clashes: string[] = [];
    for (const f of readdirSync(STYLES).filter((n) => n.endsWith('.css') && !SKIP.has(n))) {
      const theirs = definedClasses(readFileSync(join(STYLES, f), 'utf8'));
      for (const c of mine) if (theirs.has(c)) clashes.push(`.${c} (also ${f})`);
    }
    expect(clashes).toEqual([]);
    expect(mine, 'the Evidence and Submit wrapper').toContain('pj-stagebody');
  });
});
