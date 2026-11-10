/**
 * One definition per primitive (D0 guard 2).
 *
 * WHY THIS EXISTS
 * The v2 stylesheets are all global under `.c2c-v2`, at the same specificity, so
 * when two sheets both define `.c2c-v2 .pj-card` their properties merge and the
 * one imported last wins each property it names. Vite keeps every lazily loaded
 * surface chunk's CSS in <head> for the session, so "imported last" depends on
 * which surfaces the person happened to open first. The D0 spec
 * (.design/claude-convergence/D0.md §1.7) measured the result on Submission
 * Center: a card with `padding: 16px 18px` from project-home-v2.css and a grey
 * `.pj-card-h` band from journey-v2.css, a header band floating inset inside a
 * padded card. `.rd-chip` had three definitions (10px, inline-flex, 10.5px
 * uppercase), the answer lead two, `.pj-seclbl` two, `.btn.sm` two that
 * disagreed (26px tall in one, padding only in the other).
 *
 * Neither CI gate sees this. `ci:check-css-selector-shadowing` compares rules
 * within one file, and `ci:check-shell-css-collisions` only flags selectors with
 * no shell root; every one of these is correctly `.c2c-v2`-prefixed.
 *
 * WHAT IS PINNED
 * Each canonical primitive below, written unscoped (`.c2c-v2 <sel>`, or a bare
 * `<sel>`, alone or inside an `:is()` / `:where()` list, in any state such as
 * `:hover` or `::placeholder`, inside `@media` or not), has declarations in
 * exactly one stylesheet: app-v2.css, or journey-v2.css for the `.de` drawer
 * family and `.de-toast` (D0 spec §4.6). Nested rules are expanded, so
 * `.c2c-v2 { .rd-chip { … } }` counts as `.c2c-v2 .rd-chip`.
 *
 * Not counted, by design:
 *   - descendant-scoped owner overrides (`.pj .pj-tags .rd-chip`, `.cl-foot .btn`,
 *     `.adm-access .btn.small`): they reach only their owner's markup;
 *   - compounds that name a further class (`.btn.ghost`, `.btn.rv-approve`): a
 *     variant or an owner hook, not the primitive's own rule;
 *   - the dark pair `.c2c-v2.dark <sel>`;
 *   - `surface-text-ramp.css`, which is generated and restates other sheets'
 *     selectors by design, to set the `--text-*` ramp and nothing else.
 *
 * `.btn.sm` is a retired alias of `.btn.small` (D0 spec §4.2.4). It may live in
 * at most one sheet, app-v2.css, until the retired-name ratchet takes it to zero
 * uses and D0-6 deletes it.
 *
 * Red before D0-2 (the primitives), green after. The red run is filed at
 * docs/evidence/DESIGN/D0/red/foundationsOneDefinition.txt.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = resolve(__dirname, '../styles');
/* Generated (scripts/design/generate-surface-text-ramp.mjs): restates selectors to set --text-* only. */
const SKIP = new Set(['surface-text-ramp.css']);
const APP = 'app-v2.css';
const JOURNEY = 'journey-v2.css';

/** The canonical primitive → the one stylesheet that defines it (D0 spec §4.6.2). */
const CANONICAL: Record<string, string> = {
  '.btn': APP,
  '.pj-card': APP,
  '.pj-card-h': APP,
  '.rd-chip': APP,
  '.al-lead': APP,
  '.al-k': APP,
  '.ph-title': APP,
  '.seg': APP,
  '.tab': APP,
  '.reg-tbl th': APP,
  '.c2c-input': APP,
  '.c2c-empty-state': APP,
  '.de': JOURNEY,
  '.de-toast': JOURNEY,
  '.pj-seclbl': APP,
};

/** Retired aliases: at most one definition, in this sheet, until D0-6 removes them. */
const RETIRED_ALIASES: Record<string, string> = {
  '.btn.sm': APP,
};

/** Comments become spaces, newlines kept, so line numbers still hold. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
}

/** Split a selector list on its top-level commas. */
function splitTopLevel(list: string): string[] {
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
  return out.map((s) => s.trim()).filter(Boolean);
}

/** `.c2c-v2 :is(.a, .b):hover` → `.c2c-v2 .a:hover`, `.c2c-v2 .b:hover` (also `:where`). */
function expandIs(sel: string): string[] {
  const m = /:(?:is|where)\(/.exec(sel);
  if (!m) return [sel];
  const open = m.index + m[0].length;
  let depth = 1;
  let i = open;
  for (; i < sel.length && depth > 0; i++) {
    if (sel[i] === '(') depth++;
    else if (sel[i] === ')') depth--;
  }
  const before = sel.slice(0, m.index);
  const after = sel.slice(i);
  return splitTopLevel(sel.slice(open, i - 1)).flatMap((alt) => expandIs(before + alt + after));
}

function normalise(sel: string): string {
  return sel.replace(/\s+/g, ' ').replace(/\s*([>+~])\s*/g, ' $1 ').trim();
}

interface Frame {
  kind: 'rule' | 'at' | 'skip';
  selectors: string[];
  line: number;
  declares: boolean;
}

interface Rule {
  line: number;
  selectors: string[];
}

/** The open string's quote after `ch`: opened by a quote, closed by the same quote unless escaped. */
function nextQuote(quote: string | null, ch: string, prev: string | undefined): string | null {
  if (!quote) return ch;
  return ch === quote && prev !== '\\' ? null : quote;
}

/**
 * Every rule that carries at least one declaration, with its selectors fully
 * expanded: CSS nesting resolved against the parent (implicit descendant, or
 * `&`), `@media` / `@supports` / `@container` / `@layer` seen through, and
 * `:is()` / `:where()` lists flattened. `@keyframes` and `@font-face` are skipped.
 */
interface ParseState {
  stack: Frame[];
  all: Frame[];
  line: number;
}

function pushFrame(st: ParseState, kind: Frame['kind'], selectors: string[] = []): void {
  const f: Frame = { kind, selectors, line: st.line, declares: false };
  st.stack.push(f);
  if (kind === 'rule') st.all.push(f);
}

/** A `{` opens a rule, a seen-through conditional group, or a block whose contents are skipped. */
function openBlock(st: ParseState, prelude: string): void {
  if (st.stack.some((f) => f.kind === 'skip')) return pushFrame(st, 'skip');
  const parent = [...st.stack].reverse().find((f) => f.kind === 'rule');
  if (prelude.startsWith('@')) {
    if (!/^@(media|supports|container|layer)\b/i.test(prelude)) return pushFrame(st, 'skip');
    /* A conditional group inside a rule: its bare declarations belong to that rule. */
    return parent ? pushFrame(st, 'rule', parent.selectors) : pushFrame(st, 'at');
  }
  const own = splitTopLevel(prelude);
  const selectors = parent
    ? parent.selectors.flatMap((p) => own.map((s) => (s.includes('&') ? s.split('&').join(p) : `${p} ${s}`)))
    : own;
  pushFrame(st, 'rule', selectors);
}

/** A `;` or `}` ends a statement: a declaration marks its rule as declaring; `}` also closes the block. */
function endStatement(st: ParseState, ch: string, statement: string): void {
  const t = st.stack[st.stack.length - 1];
  if (t && t.kind === 'rule' && statement.includes(':')) t.declares = true;
  if (ch === '}') st.stack.pop();
}

/**
 * Every rule that carries at least one declaration, with its selectors fully
 * expanded: CSS nesting resolved against the parent (implicit descendant, or
 * `&`), `@media` / `@supports` / `@container` / `@layer` seen through, and
 * `:is()` / `:where()` lists flattened. `@keyframes` and `@font-face` are skipped.
 */
function declaringRules(raw: string): Rule[] {
  const css = stripComments(raw);
  const st: ParseState = { stack: [], all: [], line: 1 };
  let buf = '';
  let parens = 0;
  let quote: string | null = null;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '\n') st.line++;
    if (quote || ch === '"' || ch === "'") {
      /* Inside a string, or opening one: nothing in it is structure. */
      quote = nextQuote(quote, ch, css[i - 1]);
      buf += ch;
      continue;
    }
    parens += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    if (parens > 0 || (ch !== '{' && ch !== ';' && ch !== '}')) {
      buf += ch;
      continue;
    }
    if (ch === '{') openBlock(st, buf.trim());
    else endStatement(st, ch, buf);
    buf = '';
  }
  return st.all
    .filter((f) => f.declares)
    .map((f) => ({ line: f.line, selectors: f.selectors.flatMap(expandIs).map(normalise) }));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The primitive itself, unscoped: `.c2c-v2 <sel>` or bare `<sel>`, plus only pseudo-classes or -elements. */
function unscoped(sel: string): RegExp {
  return new RegExp(`^(?:\\.c2c-v2 )?${escapeRe(sel)}(?::{1,2}[\\w-]+(?:\\([^()]*\\))?)*$`);
}

const sheets = readdirSync(STYLES)
  .filter((n) => n.endsWith('.css') && !SKIP.has(n))
  .sort()
  .map((n) => ({ name: n, rules: declaringRules(readFileSync(join(STYLES, n), 'utf8')) }));

/** Where `sel` is defined: `file:line selector` per declaring rule, and the set of files. */
function definitions(sel: string): { sites: string[]; files: string[] } {
  const re = unscoped(sel);
  const sites: string[] = [];
  for (const s of sheets) {
    for (const r of s.rules) for (const x of r.selectors) if (re.test(x)) sites.push(`${s.name}:${r.line}  ${x}`);
  }
  const files = [...new Set(sites.map((x) => x.slice(0, x.indexOf(':'))))].sort();
  return { sites, files };
}

describe('one definition per primitive (ONE_DESIGN_PLAN §2, D0 guard 2)', () => {
  it('reads the v2 stylesheets and resolves nesting and :is() lists', () => {
    expect(sheets.map((s) => s.name)).toEqual(expect.arrayContaining([APP, JOURNEY]));
    expect(declaringRules('.c2c-v2 { .x { color: red } }')[0].selectors).toEqual(['.c2c-v2 .x']);
    expect(declaringRules('.c2c-v2 :is(.a, .b):hover { color: red }')[0].selectors).toEqual([
      '.c2c-v2 .a:hover',
      '.c2c-v2 .b:hover',
    ]);
    expect(declaringRules('@media (max-width: 640px) { .c2c-v2 .a { color: red } }')[0].selectors).toEqual(['.c2c-v2 .a']);
    expect(declaringRules('@keyframes k { from { opacity: 0 } }')).toEqual([]);
    expect(unscoped('.btn').test('.c2c-v2 .btn:disabled')).toBe(true);
    expect(unscoped('.btn').test('.c2c-v2 .cl-foot .btn')).toBe(false);
    expect(unscoped('.btn').test('.c2c-v2 .btn.ghost')).toBe(false);
  });

  it.each(Object.entries(CANONICAL))('%s is defined in exactly one stylesheet, %s', (sel, owner) => {
    const { sites, files } = definitions(sel);
    expect(files, `${sel} is declared at:\n  ${sites.join('\n  ') || '(nowhere)'}`).toEqual([owner]);
  });

  it.each(Object.entries(RETIRED_ALIASES))('retired alias %s is defined at most once, in %s', (sel, owner) => {
    const { sites, files } = definitions(sel);
    expect(files.filter((f) => f !== owner), `${sel} is declared at:\n  ${sites.join('\n  ')}`).toEqual([]);
  });
});
