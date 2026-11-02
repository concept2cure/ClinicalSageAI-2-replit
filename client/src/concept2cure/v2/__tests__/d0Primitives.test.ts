/**
 * D0 primitives: review fixes 1, 5, 10, 11 and 16 (docs/evidence/DESIGN/D0/review/README.md),
 * pinned in the stylesheet rules that decide them, because jsdom applies no stylesheet. The
 * evidence, red and green, and the inventory each table below comes from, are in
 * docs/evidence/DESIGN/D0/D0-11-primitives/.
 *
 * - Fix 1. The empty state's regulation line was `--text-400`, which D0.md §3 allows only on
 *   `--bg-000`. And six bare rules, `.c2c-v2 .tone-ok|ai|warn|idle|dim|err`, gave a chip's fill to
 *   any element wearing a tone class: they painted the empty state until `1d789b516`, and in them
 *   `tone-ai` meant a colour the chip's own `tone-ai` does not. They are gone. The chip keeps all
 *   six tones in its own rules, and each element that showed a fill or colour only the bare rules
 *   gave it keeps that fill or colour by name, with the values the bare rule had.
 * - Fix 5. `.sp-primary` was a second orange primary: its own chrome, and a hover that lifted it.
 *   It is the canonical primary now, and the retired-name ratchet keeps its uses from rising.
 * - Fix 10. Admin redefined `.btn` and the segmented control under `.adm-access`, and won on load
 *   order. Only its small-button size is left; its segment item is aliased onto the canonical one.
 * - Fix 11. A card header did not wrap, so a long subtitle crushed the title.
 * - Fix 16. Two lines under the 12px floor, and a dead off-palette chip tone.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rules } from './_cssRules';

/** The v2 stylesheets: this folder, or a copy of it (the evidence's mutants point the test at one). */
const STYLES = process.env.D0_PRIMITIVES_STYLES ?? resolve(__dirname, '../styles');
const uncommented = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const sheet = (name: string) => uncommented(resolve(STYLES, name));

const APP = rules(sheet('app-v2.css'));
const APP_FLAT = APP.filter((r) => r.media === null);

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

/** Every selector a list selects, expanded, scope kept. */
const full = (list: string) => splitTop(list).flatMap(expand);

/** The subject compound of one selector: what follows its last top-level combinator. */
function subject(sel: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) start = i + 1;
  }
  return sel.slice(start).trim();
}

/** Every compound of one selector, split on its top-level combinators. */
function compounds(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** The classes a compound requires, outside `:not()`: `.a.b:not(.c):hover` → a, b. */
const classesOf = (compound: string) =>
  [...compound.replace(/:not\([^)]*\)/g, '').matchAll(/\.([\w-]+)/g)].map((m) => m[1]);

/** The value a rule's body gives `prop` (the last one, as the cascade reads it). */
function decl(body: string, prop: string): string | undefined {
  let value: string | undefined;
  for (const d of body.split(';')) {
    const at = d.indexOf(':');
    if (at > 0 && d.slice(0, at).trim() === prop) value = d.slice(at + 1).trim().replace(/\s+/g, ' ');
  }
  return value;
}
const props = (body: string) => body.split(';').map((d) => d.split(':')[0].trim()).filter(Boolean);

/** Every innermost block of every v2 stylesheet, nesting and @media seen through, read as text. */
interface Block { sheet: string; prelude: string; body: string }
function blocksOf(name: string, css: string): Block[] {
  const out: Block[] = [];
  const re = /([^{}]*)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const prelude = m[1].slice(m[1].lastIndexOf(';') + 1).trim().replace(/\s+/g, ' ');
    if (prelude && !prelude.startsWith('@') && !/^(from|to|[\d.]+%)\b/.test(prelude)) out.push({ sheet: name, prelude, body: m[2] });
  }
  return out;
}
/* surface-text-ramp.css is generated and restates other sheets' selectors to set `--text-*` only. */
const SHEETS = readdirSync(STYLES).filter((n) => n.endsWith('.css') && n !== 'surface-text-ramp.css');
const BLOCKS: Block[] = SHEETS.flatMap((n) => blocksOf(n, sheet(n)));

/** Blocks in `name` whose expanded selectors include exactly `sel` (scope kept). */
const ruleFor = (name: string, sel: string) => BLOCKS.filter((b) => b.sheet === name && full(b.prelude).includes(sel));

const TONES = ['ok', 'ai', 'warn', 'idle', 'dim', 'err'];
const BARE_TONE = new RegExp(`^\\.tone-(${TONES.join('|')})(:[\\w-]+(\\([^)]*\\))?)*$`);

describe('fix 1: the empty state, and tone fills that belong to their owners', () => {
  it('the regulation line is --text-300, in its one rule', () => {
    const lines = BLOCKS.filter((b) => full(b.prelude).some((s) => classesOf(subject(s)).includes('c2c-empty-reg')) && decl(b.body, 'color'));
    expect(lines.map((b) => `${b.sheet}: ${b.prelude}`)).toEqual(['app-v2.css: .c2c-v2 .c2c-empty-state .c2c-empty-reg']);
    expect(decl(lines[0].body, 'color')).toBe('var(--text-300)');
  });

  it('no v2 stylesheet has a rule whose subject is a tone class alone', () => {
    const bare = BLOCKS.filter((b) => full(b.prelude).some((s) => BARE_TONE.test(subject(s)))).map((b) => `${b.sheet}: ${b.prelude}`);
    expect(bare).toEqual([]);
  });

  /* The chip's own tones (D0 block). `dim` was the one the chip took from a bare rule. */
  const CHIP: Record<string, [string, string]> = {
    ok: ['var(--success-muted)', 'var(--success)'],
    warn: ['var(--warning-muted)', 'var(--warning)'],
    err: ['var(--error-muted)', 'var(--error)'],
    ai: ['var(--bg-100)', 'var(--text-200)'],
    idle: ['var(--bg-100)', 'var(--text-200)'],
    dim: ['var(--bg-100)', 'var(--text-400)'],
  };
  it.each(Object.entries(CHIP))('the chip draws tone-%s from its own rule in app-v2.css', (tone, [bg, fg]) => {
    const own = APP_FLAT.filter((r) => full(r.selector).includes(`.c2c-v2 .rd-chip.tone-${tone}`) && decl(r.body, 'background'));
    expect(own.map((r) => r.selector), `rules for .rd-chip.tone-${tone}`).toHaveLength(1);
    expect([decl(own[0].body, 'background'), decl(own[0].body, 'color')]).toEqual([bg, fg]);
  });

  /* Each element that showed a fill or colour only a bare rule gave it (tone-cascade-b391bfad2.txt),
     with that rule's values, in the sheet that holds the element's other tones. */
  const KEPT: [string, string, Record<string, string>][] = [
    ['.cro-pipe-n.tone-ok', 'misc-surfaces-v2.css', { background: 'var(--success-muted)' }],
    ['.cro-pipe-n.tone-warn', 'misc-surfaces-v2.css', { background: 'var(--warning-muted)' }],
    ['.cro-pipe-n.tone-idle', 'misc-surfaces-v2.css', { background: 'var(--idle-muted)' }],
    ['.cro-pipe-n.tone-ai', 'misc-surfaces-v2.css', { background: 'var(--ai-muted)' }],
    ['.hf-mit.tone-ok', 'coverage-v2.css', { background: 'var(--success-muted)' }],
    ['.hf-mit.tone-err', 'coverage-v2.css', { background: 'var(--error-muted)' }],
    ['.hf-mit.tone-idle', 'coverage-v2.css', { background: 'var(--idle-muted)' }],
    ['.hf-gate.tone-idle', 'coverage-v2.css', { background: 'var(--idle-muted)', color: 'var(--text-300)' }],
    ['.hf-el-dot.tone-idle', 'coverage-v2.css', { background: 'var(--idle-muted)', color: 'var(--text-300)' }],
    ['.rv-wf-tag.tone-err', 'coverage-v2.css', { background: 'var(--error-muted)', color: 'var(--error)' }],
    ['.dr2-find.tone-idle', 'coverage-v2.css', { background: 'var(--idle-muted)', color: 'var(--text-300)' }],
    /* mdx/app.css is outside D0's paths; the dot's fill is currentColor (mdx/app.css .eng-blocker-dot). */
    ['.eng-blocker-dot.tone-err', 'app-v2.css', { color: 'var(--error)' }],
    ['.eng-blocker-dot.tone-warn', 'app-v2.css', { color: 'var(--warning)' }],
  ];
  it.each(KEPT)('%s keeps what the bare rule showed, in %s', (sel, name, want) => {
    const own = ruleFor(name, `.c2c-v2 ${sel}`);
    for (const [prop, value] of Object.entries(want)) {
      const last = own.filter((b) => decl(b.body, prop) !== undefined).at(-1);
      expect(last && decl(last.body, prop), `${sel} ${prop}`).toBe(value);
    }
  });

  it('the two the review names already have theirs: .sc-verdict.tone-warn and .pdev-sev-dot.tone-warn', () => {
    const verdict = ruleFor('submission-v2.css', '.c2c-v2 .sc-verdict.tone-warn');
    expect(verdict.map((b) => [decl(b.body, 'background'), decl(b.body, 'color')])).toEqual([
      ['color-mix(in srgb, var(--warning) 10%, transparent)', 'var(--warning)'],
    ]);
    const pdev = blocksOf('pdev/app.css', uncommented(resolve(__dirname, '../../pdev/app.css')))
      .filter((b) => full(b.prelude).includes('.pdev-sev-dot.tone-warn'));
    expect(pdev.map((b) => decl(b.body, 'background'))).toEqual(['var(--warning)']);
  });

  it('nothing styles an error-toned empty state: a failure renders ErrorState', () => {
    const dead = BLOCKS.filter((b) => full(b.prelude).some((s) => compounds(s).some((part) => {
      const c = classesOf(part);
      return c.includes('c2c-empty-state') && c.includes('tone-error');
    }))).map((b) => `${b.sheet}: ${b.prelude}`);
    expect(dead).toEqual([]);
    const source = readFileSync(resolve(__dirname, '../dataConnect.tsx'), 'utf8');
    expect(source).toMatch(/if \(tone === 'error'\) \{\s*return \(\s*<ErrorState/);
    expect(source).not.toMatch(/c2c-empty-state[^"'`]*tone-/);
  });
});

describe('fix 5: .sp-primary is the canonical primary', () => {
  /** The canonical button rules, each found by a member it must hold and a value it sets. */
  const canon = (member: string, prop: string, value: string | null, media: string | null = null) =>
    APP.filter((r) => r.media === media && full(r.selector).includes(member) && (value === null ? decl(r.body, prop) !== undefined : decl(r.body, prop) === value));
  const LISTS: [string, ReturnType<typeof canon>][] = [
    ['the base (32px)', canon('.c2c-v2 .btn', 'height', '32px')],
    ['the icon (16px)', canon('.c2c-v2 .btn svg', 'width', '16px')],
    ['the fill', canon('.c2c-v2 .btn.primary', 'background', 'var(--accent-strong)')],
    ['the fill on hover', canon('.c2c-v2 .btn.primary:hover', 'background', null)],
    ['the coarse-pointer height', canon('.c2c-v2 .btn', 'min-height', '44px', '@media (pointer: coarse)')],
  ];
  it.each(LISTS)('%s lists .sp-primary', (_name, found) => {
    expect(found, 'one canonical rule').toHaveLength(1);
    const members = full(found[0].selector);
    expect(members.some((s) => /^\.c2c-v2 \.sp-primary(?![\w-])/.test(s))).toBe(true);
  });

  it('no other sheet gives .sp-primary chrome: it keeps its row layout, and its grey disabled state', () => {
    const own = BLOCKS.filter((b) => b.sheet !== 'app-v2.css' && splitTop(b.prelude).some((s) => /^\.c2c-v2 \.sp-primary(?![\w-])/.test(s)));
    const resting = own.filter((b) => splitTop(b.prelude).every((s) => s === '.c2c-v2 .sp-primary'));
    expect(resting.map((b) => `${b.sheet}: ${b.prelude}`)).toEqual(['journey-v2.css: .c2c-v2 .sp-primary']);
    expect(props(resting[0].body).sort()).toEqual(['flex-shrink', 'white-space']);
    const states = own.filter((b) => !resting.includes(b));
    expect(states.flatMap((b) => splitTop(b.prelude))).toEqual(['.c2c-v2 .sp-primary:disabled', '.c2c-v2 .sp-primary:disabled:hover']);
    /* Grey, and without the canonical primary's orange border, so a disabled primary is not orange. */
    expect([decl(states[0].body, 'background'), decl(states[0].body, 'border-color')]).toEqual(['var(--bg-200)', 'transparent']);
  });

  it('nothing moves it on hover, in any sheet', () => {
    const lifts = BLOCKS.filter((b) => full(b.prelude).some((s) => /\.sp-primary(?![\w-])[^\s>+~]*:hover/.test(subject(s))) && /(^|;)\s*transform\s*:/.test(b.body))
      .map((b) => `${b.sheet}: ${b.prelude}`);
    expect(lifts).toEqual([]);
  });

  it('the retired-name ratchet holds its uses', () => {
    const ratchet = readFileSync(resolve(__dirname, 'foundationsRetiredRatchet.test.ts'), 'utf8');
    expect(ratchet).toMatch(/cls\('sp-primary', \d+\)/);
  });
});

describe('fix 10: admin uses the canonical button and segmented control', () => {
  const ADMIN = BLOCKS.filter((b) => b.sheet === 'admin-access.css');

  it('of its button rules, only the small size is left', () => {
    const buttons = ADMIN.filter((b) => full(b.prelude).some((s) => classesOf(subject(s)).includes('btn')));
    expect(buttons.map((b) => b.prelude)).toEqual(['.adm-access .btn.small']);
    expect(props(buttons[0].body).sort()).toEqual(['font-size', 'padding']);
  });

  it('it draws no segmented chrome: only the header row places the track', () => {
    const segs = ADMIN.filter((b) => full(b.prelude).some((s) => classesOf(subject(s)).some((c) => c === 'seg' || c === 'seg-btn')));
    expect(segs.map((b) => `${b.prelude} { ${props(b.body).join('; ')} }`)).toEqual(['.adm-access .section-head .seg { margin-left }']);
  });

  /** The segmented item rules in app-v2.css, each found by `.seg-b` and what it sets. */
  const item = (member: string, prop: string, value: string) =>
    APP_FLAT.filter((r) => full(r.selector).includes(member) && decl(r.body, prop) === value);
  const ITEM_RULES: [string, string, string, string][] = [
    ['the 28px item', '.c2c-v2 .seg-b', 'height', '28px'],
    ['hover', '.c2c-v2 .seg-b:hover', 'color', 'var(--text-100)'],
    ['the active item', '.c2c-v2 .seg-b.on', 'background', 'var(--bg-000)'],
    ['the dark active item', '.c2c-v2.dark .seg-b.on', 'background', 'var(--bg-200)'],
    ['the inset focus ring', '.c2c-v2 .seg-b:focus-visible', 'outline-offset', '-2px'],
  ];
  it.each(ITEM_RULES)("%s covers admin's .seg-btn, scoped to admin", (_name, member, prop, value) => {
    const found = item(member, prop, value);
    expect(found, 'one canonical rule').toHaveLength(1);
    const admin = member.replace('.seg-b', '.adm-access .seg-btn');
    const alias = full(found[0].selector).filter((s) => s.includes('.seg-btn'));
    expect(alias.length, `${admin} in ${found[0].selector}`).toBeGreaterThan(0);
    /* Scoped: an unscoped .seg-btn would reach mdx's segmented buttons, which render inside .c2c-v2. */
    expect(alias.every((s) => s.includes('.adm-access .seg-btn'))).toBe(true);
    expect(alias).toContain(admin);
  });
});

describe('fix 11: a card header wraps, so a long subtitle drops below the title', () => {
  it('.pj-card-h has flex-wrap: wrap, in its one rule', () => {
    const header = BLOCKS.filter((b) => full(b.prelude).some((s) => subject(s) === '.pj-card-h') && decl(b.body, 'flex-wrap'));
    expect(header.map((b) => `${b.sheet}: ${b.prelude}`)).toEqual(['app-v2.css: .c2c-v2 .pj-card-h']);
    expect(decl(header[0].body, 'flex-wrap')).toBe('wrap');
  });
});

describe('fix 16: nothing here under the 12px floor, and no dead chip tone', () => {
  const SIZED: [string, string, string][] = [
    ['journey-v2.css', '.c2c-v2 .de-err', 'the form error line'],
    ['app-v2.css', '.c2c-v2 .c2c-error-ref', 'the support handle line'],
    ['app-v2.css', '.c2c-v2 .c2c-error-ref code', 'the support handle'],
  ];
  it.each(SIZED)('%s %s (%s) is var(--fs-caption)', (name, sel) => {
    const sized = ruleFor(name, sel).filter((b) => decl(b.body, 'font-size') !== undefined);
    expect(sized.map((b) => decl(b.body, 'font-size'))).toEqual(['var(--fs-caption)']);
  });

  it('no stylesheet names .rd-chip.tone-flight', () => {
    expect(BLOCKS.filter((b) => /\.tone-flight(?![\w-])/.test(b.prelude)).map((b) => `${b.sheet}: ${b.prelude}`)).toEqual([]);
  });
});
