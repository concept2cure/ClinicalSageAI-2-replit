/**
 * D0 focus: review fixes 7, 12 and 13 (docs/evidence/DESIGN/D0/review/README.md), pinned in the
 * stylesheet rules that decide them, because jsdom paints no ring. The evidence, red and green, is
 * in docs/evidence/DESIGN/D0/D0-10-focus/.
 *
 * - Fix 7. The tab row and the segmented track scroll (`overflow-x: auto`, which clips both axes),
 *   and the global ring is drawn 2px outside a button, so a focused tab or segment showed only
 *   slivers of it. Each item now draws the same ring 2px inside its edge, the form `.crumb-proj`
 *   already uses. The items are read from the two primitives, so an item added to either is held
 *   to the same rule.
 * - Fix 12. In dark the active segment had `box-shadow: none`: no ring, and a fill 1.21:1 on its
 *   track. It keeps the hairline ring light has (D0.md §3).
 * - Fix 13. Forced colours repaint a border in one system colour and drop box-shadow, so a field
 *   whose focus was a border colour and a halo showed no focus there. `outline: 2px solid
 *   transparent` paints nothing in normal colours and is repainted as a visible ring in forced
 *   colours. A composer draws its focus on its container, so the container takes that outline
 *   and its text area keeps none: one ring.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rules, type CssRule } from './_cssRules';

/** The v2 stylesheets: this folder, or a copy of it (the evidence's mutants point the test at one). */
const STYLES = process.env.D0_FOCUS_STYLES ?? resolve(__dirname, '../styles');
const uncommented = (name: string) => readFileSync(resolve(STYLES, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const APP = rules(uncommented('app-v2.css')).filter((r) => r.media === null);

/** Split a selector list on its top-level commas. */
function splitTop(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

/** One selector with every `:is()` / `:where()` expanded: `.c2c-v2 :is(.a, .b):hover` → two. */
function expand(sel: string): string[] {
  const m = /:(?:is|where)\(/.exec(sel);
  if (!m) return [sel];
  const open = m.index + m[0].length;
  let depth = 1;
  let i = open;
  for (; i < sel.length && depth > 0; i++) {
    if (sel[i] === '(') depth++;
    else if (sel[i] === ')') depth--;
  }
  return splitTop(sel.slice(open, i - 1)).flatMap((alt) => expand(sel.slice(0, m.index) + alt + sel.slice(i)));
}

/** Every selector a list selects, expanded, scope kept: `.c2c-v2 .seg-b.on`, `.c2c-v2.dark .seg-b.on`. */
const full = (list: string) => splitTop(list).flatMap(expand);
/** The same without the `.c2c-v2 ` scope: `.seg-b:focus-visible`. */
const subjects = (list: string) => full(list).map((s) => s.replace(/^\.c2c-v2 /, ''));

const outranks = (a: number[], b: number[]) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

/** Specificity of one selector, [ids, classes + attributes + pseudo-classes, types]: `:is()`,
 *  `:not()` and `:has()` count their most specific argument, and `:where()` counts nothing. */
function specificity(sel: string): number[] {
  const total = [0, 0, 0];
  let rest = '';
  for (let i = 0; i < sel.length; i++) {
    const m = /^:(is|where|not|has)\(/.exec(sel.slice(i));
    if (!m) {
      rest += sel[i];
      continue;
    }
    let depth = 1;
    let j = i + m[0].length;
    for (; j < sel.length && depth > 0; j++) {
      if (sel[j] === '(') depth++;
      else if (sel[j] === ')') depth--;
    }
    if (m[1] !== 'where') {
      const best = splitTop(sel.slice(i + m[0].length, j - 1)).map(specificity).reduce((a, b) => (outranks(b, a) ? b : a), [0, 0, 0]);
      best.forEach((n, k) => { total[k] += n; });
    }
    rest += ' ';
    i = j - 1;
  }
  const attrs = rest.match(/\[[^\]]*\]/g) ?? [];
  const s = rest.replace(/\[[^\]]*\]/g, ' ').replace(/::[\w-]+/g, ' ');
  total[0] += (s.match(/#[\w-]+/g) ?? []).length;
  total[1] += attrs.length + (s.match(/\.[\w-]+|:[\w-]+/g) ?? []).length;
  total[2] += (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return total;
}

/** The value a rule's body gives `prop` (the last one, as the cascade reads it). */
function decl(body: string, prop: string): string | undefined {
  let value: string | undefined;
  for (const d of body.split(';')) {
    const at = d.indexOf(':');
    if (at > 0 && d.slice(0, at).trim() === prop) value = d.slice(at + 1).trim().replace(/\s+/g, ' ');
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

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `.tab` in a compound, in a state: `.tab:focus-visible`, `.x .tab.on:focus`, not `.tab-body:focus`. */
const inState = (cls: string, state: string) => new RegExp(`(^|[^\\w-])${esc(cls)}(?![\\w-])[^\\s>+~]*${state}$`);
const setsOutline = (body: string) => /(^|;)\s*outline(-[a-z]+)?\s*:/.test(body);
const isRule = (b: Block, r: CssRule | undefined) => !!r && b.sheet === 'app-v2.css' && b.prelude === r.selector;
const GLOBAL_RING = '.c2c-v2 button:focus-visible';

describe('fix 7: a focused tab or segment shows its whole ring inside a scrolling row', () => {
  /** The items as their own primitives define them: the 36px tab and the 28px segment. */
  const primitive = (item: string, height: string) =>
    APP.find((r) => subjects(r.selector).includes(item) && decl(r.body, 'height') === height);
  const TAB = primitive('.tab', '36px');
  const SEG = primitive('.seg-b', '28px');
  const ITEMS = [TAB, SEG].flatMap((r) => (r ? subjects(r.selector) : []));
  const INSET = APP.filter((r) => decl(r.body, 'outline-offset') !== undefined && ITEMS.some((i) => subjects(r.selector).includes(`${i}:focus-visible`)));

  // D7-A1 (2026-11-09) retired `.sc-ws`: Submission Center's tabs are `.tab` now, so five of the review's six remain.
  it('reads the items from the tab and segmented primitives: the five of the review\'s six still in use', () => {
    expect(ITEMS).toEqual(expect.arrayContaining(['.tab', '.reg-tab', '.cc-tab', '.seg-b', '.ml-seg-btn']));
    expect(ITEMS).not.toContain('.sc-ws');
  });

  it.each(ITEMS)('%s:focus-visible draws the ring 2px inside its edge, where the scroller cannot clip it', (item) => {
    const rule = APP.filter((r) => subjects(r.selector).includes(`${item}:focus-visible`) && decl(r.body, 'outline-offset') !== undefined);
    expect(rule.map((r) => r.selector), `rules that set ${item}'s focus offset`).toHaveLength(1);
    expect(decl(rule[0].body, 'outline-offset')).toBe('-2px');
  });

  it('moves the global ring inward and keeps it: one rule, offset only, outranking the global ring', () => {
    expect(INSET.map((r) => r.selector), 'one inset rule for every item').toHaveLength(1);
    const [rule] = INSET;
    expect(rule.body.split(';').map((d) => d.split(':')[0].trim()).filter(Boolean)).toEqual(['outline-offset']);
    const global = APP.filter((r) => r.selector === GLOBAL_RING);
    expect(decl(global[global.length - 1]?.body ?? '', 'outline')).toBe('2px solid var(--accent-200)');
    const weaker = splitTop(rule.selector).filter((s) => !outranks(specificity(s), specificity(GLOBAL_RING)));
    expect(weaker, `outranked by ${GLOBAL_RING}`).toEqual([]);
  });

  it('no other rule, in any v2 stylesheet, sets an outline on these items in focus', () => {
    const others = BLOCKS.filter((b) => setsOutline(b.body) && !isRule(b, INSET[0]))
      .filter((b) => subjects(b.prelude).some((s) => ITEMS.some((i) => inState(i, ':focus(-visible)?').test(s))))
      .map((b) => `${b.sheet}: ${b.prelude}`);
    expect(others).toEqual([]);
  });
});

describe('fix 12: the active segment has a ring in dark, as in light', () => {
  const ACTIVE = (scope: string) => APP.find((r) => full(r.selector).includes(`${scope} .seg-b.on`) && decl(r.body, 'box-shadow') !== undefined);
  const LIGHT = ACTIVE('.c2c-v2');
  const DARK = ACTIVE('.c2c-v2.dark');

  it('light: --bg-000 with the hairline ring (unchanged)', () => {
    expect(decl(LIGHT?.body ?? '', 'background')).toBe('var(--bg-000)');
    expect(decl(LIGHT?.body ?? '', 'box-shadow')).toMatch(/(^|,) ?0 0 0 1px var\(--border\)$/);
  });

  it('dark: --bg-200 with a 1px --border-strong ring, not box-shadow: none', () => {
    expect(decl(DARK?.body ?? '', 'background')).toBe('var(--bg-200)');
    expect(decl(DARK?.body ?? '', 'box-shadow')).toBe('0 0 0 1px var(--border-strong)');
  });

  it('dark covers every item and active state light does', () => {
    const lightSet = full(LIGHT?.selector ?? '').map((s) => s.replace(/^\.c2c-v2 /, '.c2c-v2.dark ')).sort();
    expect(full(DARK?.selector ?? '').sort()).toEqual(lightSet);
    expect(lightSet.length).toBeGreaterThanOrEqual(10);
  });

  it('no other rule, in any v2 stylesheet, sets a shadow on an active segment', () => {
    const ACTIVE_STATE = '(\\.on|\\[data-on\\]|\\[aria-(pressed|selected|checked)="true"\\])[^\\s>+~]*';
    const others = BLOCKS.filter((b) => decl(b.body, 'box-shadow') !== undefined && !isRule(b, LIGHT) && !isRule(b, DARK))
      .filter((b) => subjects(b.prelude).some((s) => ['.seg-b', '.ml-seg-btn'].some((i) => new RegExp(`(^|[^\\w-])${esc(i)}(?![\\w-])[^\\s>+~]*${ACTIVE_STATE}$`).test(s))))
      .map((b) => `${b.sheet}: ${b.prelude}`);
    expect(others).toEqual([]);
  });
});

describe('fix 13: in forced colours a focused field or composer still shows one ring', () => {
  const FIELDS = ['.c2c-input', '.de-input', '.de-select', '.de-textarea'];
  const FOCUS = APP.filter((r) => FIELDS.some((f) => subjects(r.selector).includes(`${f}:focus`)) && setsOutline(r.body));

  it.each(FIELDS)('%s in focus: the border and halo, and a transparent outline in place of outline: none', (f) => {
    const rule = APP.filter((r) => subjects(r.selector).includes(`${f}:focus`) && subjects(r.selector).includes(`${f}:focus-visible`) && setsOutline(r.body));
    expect(rule.map((r) => r.selector), `rules that set ${f}'s focus outline`).toHaveLength(1);
    expect(decl(rule[0].body, 'outline')).toBe('2px solid transparent');
    expect(decl(rule[0].body, 'border-color')).toBe('var(--border-focus)');
    expect(decl(rule[0].body, 'box-shadow')).toBe('0 0 0 3px var(--accent-000)');
    const weaker = splitTop(rule[0].selector).filter((s) => !outranks(specificity(s), specificity('.c2c-v2 textarea:focus-visible')));
    expect(weaker, 'outranked by the global field ring').toEqual([]);
  });

  it('no other rule, in any v2 stylesheet, sets these fields’ outline in focus', () => {
    const others = BLOCKS.filter((b) => setsOutline(b.body) && !isRule(b, FOCUS[0]))
      .filter((b) => subjects(b.prelude).some((s) => FIELDS.some((f) => inState(f, ':focus(-visible)?').test(s))))
      .map((b) => `${b.sheet}: ${b.prelude}`);
    expect(FOCUS).toHaveLength(1);
    expect(others).toEqual([]);
  });

  const COMPOSERS = ['.landing-composer', '.pj-composer', '.ct-composer'];
  const TEXT_AREAS = ['.landing-input', '.pj-composer textarea', '.ct-composer textarea'];

  it('a composer in focus: its border, and a transparent outline; no halo', () => {
    const rule = APP.filter((r) => COMPOSERS.every((c) => subjects(r.selector).includes(`${c}:focus-within`)));
    expect(rule.map((r) => r.selector)).toHaveLength(1);
    expect(decl(rule[0].body, 'border-color')).toBe('var(--border-focus)');
    expect(decl(rule[0].body, 'outline')).toBe('2px solid transparent');
    expect(decl(rule[0].body, 'box-shadow')).toBeUndefined();
  });

  it.each(TEXT_AREAS)('%s keeps no outline of its own in focus, so its composer shows one ring, not two', (t) => {
    const focus = APP.filter((r) => subjects(r.selector).includes(`${t}:focus-visible`) && setsOutline(r.body));
    expect(focus.map((r) => r.selector)).toHaveLength(1);
    expect(decl(focus[0].body, 'outline')).toBe('none');
  });

  it('no other rule, in any v2 stylesheet, sets a composer’s outline', () => {
    const others = BLOCKS.filter((b) => setsOutline(b.body) && !(b.sheet === 'app-v2.css' && COMPOSERS.every((c) => subjects(b.prelude).includes(`${c}:focus-within`))))
      .filter((b) => subjects(b.prelude).some((s) => COMPOSERS.some((c) => new RegExp(`(^|[^\\w-])${esc(c)}(?![\\w-])[^\\s>+~]*$`).test(s))))
      .map((b) => `${b.sheet}: ${b.prelude}`);
    expect(others).toEqual([]);
  });
});
