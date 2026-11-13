/**
 * D0 at a phone's width: review fixes 2, 3, 4 and 8 (docs/evidence/DESIGN/D0/review/README.md),
 * pinned in the stylesheet rules that decide them, because jsdom does no layout. The evidence,
 * red and green, is in docs/evidence/DESIGN/D0/D0-9-phone-width/.
 *
 * - Fix 2. The page header's text block had `flex: 1 1 420px`. Tasks turned its header into a
 *   column at ≤760px (`.tb .ph{flex-direction:column}`), so the 420px basis became a 420px height
 *   and about 250px of blank space opened under the Tasks header at 390.
 * - Fix 3. D0-2 removed `.pj-card{overflow:hidden}`, and nothing let a wide `.reg-tbl` in a card
 *   scroll, so the table pushed the page sideways at 390. D5-0 had a scroll rule for a work
 *   area's sections only; there is now one rule for both.
 * - Fix 4. The coarse-pointer 16px rule (iOS does not zoom a field at 16px or more) listed
 *   `.c2c-input`, `.de-input` and `.de-select`, not `.de-textarea` or the three composers, which
 *   are 15px. The composers' 15px rule has the same specificity as a rule listing them, so the
 *   16px rule has to come after it: the test checks which rule is LAST, not only that one exists.
 * - Fix 8. The drawer footer gave both buttons `flex: 1 1 0` at ≤640px, 171px each at 390, and
 *   "Log communication" broke over two lines. The label no longer wraps, the ghost button takes
 *   its label's width and the primary the rest, and a footer too wide for one row wraps rather
 *   than running past the screen.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_V2_CSS, rules, type CssRule } from './_cssRules';

const STYLES = resolve(__dirname, '../styles');
const uncommented = (name: string) => readFileSync(resolve(STYLES, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const APP = rules(APP_V2_CSS);
const JOURNEY = rules(uncommented('journey-v2.css'));

/** Split a selector list on its top-level commas. */
function splitTop(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

/** What a selector list selects, without the `.c2c-v2 ` scope, with one `:is()` list expanded:
 *  `.c2c-v2 :is(.a, .b) > .t` → `.a > .t`, `.b > .t`. */
function subjects(list: string): string[] {
  return splitTop(list).flatMap((sel) => {
    const s = sel.replace(/^\.c2c-v2 /, '');
    const m = /^(.*?):is\((.*)\)([^()]*)$/.exec(s);
    return m ? splitTop(m[2]).map((alt) => `${m[1]}${alt}${m[3]}`.trim()) : [s];
  });
}

/** The value a rule's body gives `prop` (the last one, as the cascade reads it). */
function decl(body: string, prop: string): string | undefined {
  let value: string | undefined;
  for (const d of body.split(';')) {
    const at = d.indexOf(':');
    if (at > 0 && d.slice(0, at).trim() === prop) value = d.slice(at + 1).trim();
  }
  return value;
}

/** Every innermost block of every v2 stylesheet, nesting and @media seen through, read as text. */
interface Block { sheet: string; prelude: string; body: string }
const BLOCKS: Block[] = readdirSync(STYLES)
  .filter((n) => n.endsWith('.css'))
  .flatMap((sheet) => {
    const out: Block[] = [];
    const css = uncommented(sheet);
    const re = /([^{}]*)\{([^{}]*)\}/g;
    for (let m = re.exec(css); m; m = re.exec(css)) {
      const prelude = m[1].slice(m[1].lastIndexOf(';') + 1).trim().replace(/\s+/g, ' ');
      if (prelude && !prelude.startsWith('@') && !/^(from|to|[\d.]+%)\b/.test(prelude)) out.push({ sheet, prelude, body: m[2] });
    }
    return out;
  });

const at640 = (r: CssRule) => r.media !== null && /max-width:\s*640px/.test(r.media);
const coarse = (r: CssRule) => r.media !== null && /pointer:\s*coarse/.test(r.media);
const where = (r: CssRule) => `${r.media ?? '(no @media)'} ${r.selector}`;

describe('fix 2: a page header never turns its text block’s width into a height', () => {
  const HEADER = /(^|[\s>+~])\.(ph|sp-head|reg-head|surface-head|pj-head|page-header)$/;

  it('the text block wraps on a 420px floor, with a 0% basis that a column cannot stretch', () => {
    const first = APP.filter((r) => r.media === null && subjects(r.selector).includes('.ph > :first-child'));
    expect(first.map(where)).toHaveLength(1);
    expect(subjects(first[0].selector)).toEqual(expect.arrayContaining(['.sp-head > :first-child', '.reg-head > :first-child', '.pj-head > :first-child']));
    expect(decl(first[0].body, 'flex')).toBe('1 1 0%');
    expect(decl(first[0].body, 'min-width')).toBe('min(420px, 100%)');
  });

  it('no stylesheet turns a page header into a column (Tasks’ ≤760px rule is gone)', () => {
    const columns = BLOCKS.filter((b) => decl(b.body, 'flex-direction') === 'column' && subjects(b.prelude).some((s) => HEADER.test(s)));
    expect(columns.map((b) => `${b.sheet}: ${b.prelude}`)).toEqual([]);
  });
});

describe('fix 3: at phone width a table scrolls inside its card or section, never the page', () => {
  const scrollsTable = (selector: string, body: string) =>
    subjects(selector).some((s) => /(^|[\s>])\.reg-tbl$/.test(s)) && /(^|;)\s*overflow(-x)?\s*:/.test(body);

  /* D0's rule is for a phone. CMC's registers are wider than the page column at a laptop's width too
     (Materials pushed the page 108 px sideways at 1440, Stability 120 px; P-122, D5.md §A.3), so CMC
     has one named exception at every width, kept here beside D0's rule and nowhere else. `display:
     block` changes how a table that fits fills its card, so D0's rule is not widened to every work
     area: a second exception is a D0 decision, named here, never a copy in a work area's sheet. */
  it('two rules scroll a table: D0’s at ≤640px, and CMC’s named exception at every width', () => {
    const scroll = APP.filter((r) => scrollsTable(r.selector, r.body));
    expect(scroll.map(where)).toHaveLength(2);
    const everyWidth = scroll.filter((r) => r.media === null);
    expect(everyWidth.map(where)).toHaveLength(1);
    expect(subjects(everyWidth[0].selector).sort()).toEqual(['[data-work-area="cmc"] .pj-card-b > .reg-tbl', '[data-work-area="cmc"] .pj-sec > .reg-tbl']);
    expect(decl(everyWidth[0].body, 'display')).toBe('block');
    expect(decl(everyWidth[0].body, 'overflow-x')).toBe('auto');
    const [rule] = scroll.filter((r) => r.media !== null);
    expect(at640(rule)).toBe(true);
    expect(decl(rule.body, 'display')).toBe('block');
    expect(decl(rule.body, 'overflow-x')).toBe('auto');
    const parents = subjects(rule.selector).map((s) => /^(.*) > \.reg-tbl$/.exec(s)?.[1]).filter(Boolean);
    expect(parents).toEqual(expect.arrayContaining(['.pj-card', '.pj-card-b', '.reg-card', '[data-work-area] .pj-sec']));
  });

  it('no other stylesheet keeps a second copy', () => {
    const elsewhere = BLOCKS.filter((b) => b.sheet !== 'app-v2.css' && scrollsTable(b.prelude, b.body));
    expect(elsewhere.map((b) => `${b.sheet}: ${b.prelude}`)).toEqual([]);
  });
});

describe('fix 4: on a touch screen every text area is 16px, so iOS does not zoom into it', () => {
  const TEXT_AREAS = ['.de-textarea', '.landing-input', '.pj-composer textarea', '.ct-composer textarea'];
  const sizes = (body: string) => /(^|;)\s*font(-size)?\s*:/.test(body);

  it.each(TEXT_AREAS)('%s: the last rule in app-v2.css that sizes it on a phone is the coarse-pointer 16px rule', (t) => {
    const sizing = APP.filter((r) => (r.media === null || coarse(r)) && subjects(r.selector).includes(t) && sizes(r.body));
    const last = sizing[sizing.length - 1];
    expect(last && coarse(last), `rules that size ${t}, in order:\n  ${sizing.map(where).join('\n  ')}`).toBe(true);
    expect(decl(last.body, 'font-size')).toBe('16px');
    expect(decl(last.body, 'min-height'), 'the size only: .de-textarea keeps its 80px height').toBeUndefined();
  });

  it('nothing outranks it: no scoped rule in any sheet, and no rule in another sheet, sizes these fields', () => {
    const outranking = BLOCKS.filter((b) => sizes(b.body)).flatMap((b) =>
      subjects(b.prelude)
        .filter((s) => TEXT_AREAS.some((t) => (s === t && b.sheet !== 'app-v2.css') || (s !== t && new RegExp(`[\\s>+~]${t.replace(/\./g, '\\.')}$`).test(s))))
        .map((s) => `${b.sheet}: ${s}`));
    expect(outranking).toEqual([]);
  });
});

describe('fix 8: the drawer footer keeps each label on one line at 390', () => {
  const rule = (sel: string, phone: boolean) => JOURNEY.filter((r) => r.selector === sel && (phone ? at640(r) : r.media === null));

  it('a drawer button never breaks its label', () => {
    expect(decl(rule('.c2c-v2 .de-btn', false)[0]?.body ?? '', 'white-space')).toBe('nowrap');
  });

  it('at ≤640px the ghost button is as wide as its label and the primary takes the rest', () => {
    expect(decl(rule('.c2c-v2 .de-f .de-btn.ghost', true)[0]?.body ?? '', 'flex')).toBe('0 0 auto');
    expect(decl(rule('.c2c-v2 .de-f .de-btn.primary', true)[0]?.body ?? '', 'flex')).toBe('1 1 auto');
    expect(decl(rule('.c2c-v2 .de-f .de-btn', true)[0]?.body ?? '', 'min-height')).toBe('44px');
  });

  it('at ≤640px a footer too wide for one row wraps, rather than running past the screen', () => {
    const footer = rule('.c2c-v2 .de-f', true).map((r) => decl(r.body, 'flex-wrap')).filter(Boolean);
    expect(footer).toEqual(['wrap']);
  });
});
