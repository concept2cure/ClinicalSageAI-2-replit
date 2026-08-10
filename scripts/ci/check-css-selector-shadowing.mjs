#!/usr/bin/env node
/**
 * CSS selector shadowing gate.
 *
 * ── The bug this exists for ─────────────────────────────────────────────────
 * `authoring-v2.css` defined `.ed-prov` twice at the same nesting level: once
 * as a new inline band, and — 50 lines further down, already there — as a
 * per-block hover tooltip carrying `opacity:0; position:absolute;
 * pointer-events:none`. Equal specificity, later rule wins, so the band
 * rendered invisible in the product.
 *
 * Nothing caught it. Every jsdom test passed, because jsdom applies no
 * stylesheet: the DOM was correct and unseeable. Typecheck, lint, the token
 * cascade and the design-system gate are all blind to it too — the tokens
 * resolved fine, they were just resolving on a rule that never won. Confirmed
 * against real Chromium: computed opacity 0, position absolute.
 *
 * So this is a shape no other guard in the repo can see, and one a reviewer
 * cannot reliably catch by eye in a 200-line generated stylesheet.
 *
 * ── What is flagged, and what deliberately is not ────────────────────────────
 * FLAGGED: the same resolved selector path, written twice in one file, with
 * NO at-rule (@media / @supports / @container) anywhere in either's ancestry.
 * Two unconditional rules for the same selector always shadow — one of them
 * is dead weight at best and a silent override at worst.
 *
 * NOT FLAGGED: a redefinition under @media or @supports. That is the entire
 * point of a media query, and three legitimate ones exist today —
 * `.rbm-board`, `.pd`, `.pd-heat` — each a responsive override. A gate that
 * failed on those would be demanding worse CSS, which this repo has made the
 * mistake of shipping once already (see the basename-duplication gate replaced
 * in 07b1569). Measured before the bar was set: 1 unconditional duplicate in
 * the whole surface, and it was the bug above.
 *
 * Comments are stripped with a character state machine, not a regex. A
 * `/\*[\s\S]*?\*​/` pattern opened a false comment on a `/*` inside prose
 * earlier in this repo's history and hid 273 lines of a file from a different
 * guard; that is not repeated here.
 *
 * Exit codes: 0 = clean, 1 = shadowing found.
 * Usage:
 *   node scripts/ci/check-css-selector-shadowing.mjs           # gate
 *   node scripts/ci/check-css-selector-shadowing.mjs --json    # machine output
 *   node scripts/ci/check-css-selector-shadowing.mjs --all     # include conditional dupes (report only)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const SCAN_ROOTS = [path.join(ROOT, 'client', 'src', 'concept2cure')];

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const showAll = args.includes('--all');

/**
 * Strip CSS comments without a regex.
 *
 * Tracks string state so a `/*` inside a quoted value (a content: string, a
 * data URI) cannot open a comment and swallow the rest of the file. Replaces
 * comment bodies with spaces so every byte offset — and therefore every line
 * number this tool reports — stays exactly where it was.
 */
export function stripCssComments(src) {
  let out = '';
  let i = 0;
  let quote = null; // "'" | '"' | null

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (quote) {
      out += c;
      if (c === '\\') {
        // Escape: copy the escaped character verbatim, it cannot close a string.
        if (i + 1 < src.length) out += src[i + 1];
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }

    if (c === '/' && next === '*') {
      // Consume to the closing */, emitting whitespace so offsets hold.
      let j = i + 2;
      while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) j += 1;
      const end = Math.min(j + 2, src.length);
      for (let k = i; k < end; k += 1) out += src[k] === '\n' ? '\n' : ' ';
      i = end;
      continue;
    }

    out += c;
    i += 1;
  }
  return out;
}

/** Collapse whitespace so `.a  >  .b` and `.a > .b` compare equal. */
function normalizeSelector(sel) {
  return sel.replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1').trim();
}

/**
 * Every style rule in a stylesheet, with its resolved path and whether any
 * ancestor block was an at-rule.
 *
 * Returns [{ selector, path, line, conditional }].
 */
export function parseRules(src) {
  const text = stripCssComments(src);
  const rules = [];
  const stack = [];
  let buf = '';
  let line = 1;
  let bufStartLine = 1;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];

    if (c === '\n') line += 1;

    if (c === '{') {
      const prelude = buf.trim();
      const isAtRule = prelude.startsWith('@');
      const frame = { prelude, isAtRule, line: bufStartLine };

      if (!isAtRule && prelude.length > 0) {
        const ancestors = stack.filter((f) => !f.isAtRule).map((f) => normalizeSelector(f.prelude));
        const selector = normalizeSelector(prelude);
        rules.push({
          selector,
          path: [...ancestors, selector].join(' | '),
          line: bufStartLine,
          conditional: stack.some((f) => f.isAtRule),
        });
      }

      stack.push(frame);
      buf = '';
      bufStartLine = line;
      continue;
    }

    if (c === '}') {
      stack.pop();
      buf = '';
      bufStartLine = line;
      continue;
    }

    if (c === ';') {
      // A declaration, or a block-less at-statement (@import, @charset).
      buf = '';
      bufStartLine = line;
      continue;
    }

    if (buf === '' && /\s/.test(c)) {
      bufStartLine = line;
      continue;
    }
    buf += c;
  }

  return rules;
}

/** Selector paths defined more than once in one file. */
export function findShadowing(src, { includeConditional = false } = {}) {
  const byPath = new Map();
  for (const r of parseRules(src)) {
    if (!includeConditional && r.conditional) continue;
    if (!byPath.has(r.path)) byPath.set(r.path, []);
    byPath.get(r.path).push(r);
  }
  return [...byPath.entries()]
    .filter(([, occ]) => occ.length > 1)
    .map(([p, occ]) => ({ path: p, lines: occ.map((o) => o.line), conditional: occ.some((o) => o.conditional) }));
}

/* ── Self-checks ─────────────────────────────────────────────────────────────
   A gate that cannot be shown to fire is worth nothing. Each case below is a
   shape this tool got wrong, or could plausibly get wrong, at some point. */
function selfCheck() {
  const cases = [
    {
      name: 'catches the real bug — same class twice, both unconditional',
      css: `.c2c-v2 { .ed-prov{padding:10px;} .ed-tree{color:red;} .ed-prov{opacity:0;} }`,
      expect: (f) => f.length === 1 && f[0].path === '.c2c-v2 | .ed-prov',
    },
    {
      name: 'allows a media-query override — that is what media queries are for',
      css: `.c2c-v2 { .pd{display:grid;} @media (max-width:900px){ .pd{display:block;} } }`,
      expect: (f) => f.length === 0,
    },
    {
      name: 'a rule AFTER a media block closes is unconditional again',
      css: `.c2c-v2 { .a{color:red;} @media screen { .b{color:blue;} } .a{color:green;} }`,
      expect: (f) => f.length === 1 && f[0].path === '.c2c-v2 | .a',
    },
    {
      name: 'different ancestors are different selectors, not a duplicate',
      css: `.x { .foo{color:red;} } .y { .foo{color:blue;} }`,
      expect: (f) => f.length === 0,
    },
    {
      name: 'attribute variants of one class are distinct selectors',
      css: `.c2c-v2 { .dot[data-s="a"]{color:red;} .dot[data-s="b"]{color:blue;} }`,
      expect: (f) => f.length === 0,
    },
    {
      name: 'whitespace differences do not hide a duplicate',
      css: `.c2c-v2 { .a > .b{color:red;} .a>.b{color:blue;} }`,
      expect: (f) => f.length === 1,
    },
    {
      // The failure that hid 273 lines from a different guard in this repo.
      name: 'a /* inside a quoted string does not open a comment',
      css: `.c2c-v2 { .a::before{content:"/*";} .z{color:red;} .a::before{content:"x";} }`,
      expect: (f) => f.length === 1 && f[0].path === '.c2c-v2 | .a::before',
    },
    {
      name: 'a commented-out rule is not counted as a definition',
      css: `.c2c-v2 { .a{color:red;} /* .a{color:blue;} */ }`,
      expect: (f) => f.length === 0,
    },
    {
      name: 'declarations are never mistaken for selectors',
      css: `.c2c-v2 { .a{background:url(x);color:red;} }`,
      expect: (f) => f.length === 0,
    },
    {
      name: 'reported line numbers survive comment stripping',
      css: `.c2c-v2 {\n  .a{color:red;}\n  /* a comment\n     spanning lines */\n  .a{color:blue;}\n}`,
      expect: (f) => f.length === 1 && f[0].lines[0] === 2 && f[0].lines[1] === 5,
    },
  ];

  const failed = [];
  for (const c of cases) {
    let ok = false;
    try {
      ok = c.expect(findShadowing(c.css));
    } catch (err) {
      ok = false;
    }
    if (!ok) failed.push(c.name);
  }
  return failed;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walk(p, acc);
    } else if (e.name.endsWith('.css')) {
      acc.push(p);
    }
  }
  return acc;
}

const BASELINE_PATH = path.join(__dirname, 'css-selector-shadowing-baseline.json');

/**
 * The known-shadowed pairs, as `file::selector-path`.
 *
 * An explicit list rather than a count. A bare number would let someone retire
 * one entry and introduce another without the gate noticing — the point here
 * is that NO NEW selector starts silently shadowing, not that the total holds
 * steady. Fixing one means deleting its line, which is the only edit direction
 * this file should ever see.
 *
 * These 24 predate the gate. Each may be a genuine bug or a deliberate
 * later-wins override; telling them apart needs per-case design judgement, so
 * they are recorded rather than guessed at.
 */
function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { entries: new Set(), missing: true };
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  return { entries: new Set(parsed.knownShadowed ?? []), missing: false };
}

function main() {
  const selfCheckFailures = selfCheck();
  if (selfCheckFailures.length > 0) {
    console.error('[css-shadowing] SELF-CHECK FAILED — the gate is not trustworthy:');
    for (const f of selfCheckFailures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }

  const files = SCAN_ROOTS.filter((d) => fs.existsSync(d)).flatMap((d) => walk(d));
  const found = [];
  const conditional = [];

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    for (const v of findShadowing(src)) found.push({ file: rel, key: `${rel}::${v.path}`, ...v });
    if (showAll) {
      for (const v of findShadowing(src, { includeConditional: true })) {
        if (v.conditional) conditional.push({ file: rel, ...v });
      }
    }
  }

  if (args.includes('--write-baseline')) {
    const payload = {
      _comment:
        'Selectors defined twice unconditionally in one file. Editable only DOWNWARD, by a human: ' +
        'delete a line when the shadowing is fixed. Never append — a new entry means a new silent override.',
      knownShadowed: found.map((v) => v.key).sort(),
    };
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`[css-shadowing] wrote baseline with ${found.length} entries.`);
    process.exit(0);
  }

  const { entries: baseline, missing } = loadBaseline();
  const newly = found.filter((v) => !baseline.has(v.key));
  const stale = [...baseline].filter((k) => !found.some((v) => v.key === k));

  if (jsonOut) {
    console.log(JSON.stringify({ files: files.length, found: found.length, newly, stale, conditional }, null, 2));
    process.exit(newly.length > 0 ? 1 : 0);
  }

  if (showAll && conditional.length > 0) {
    console.log(`[css-shadowing] ${conditional.length} conditional redefinition(s) — allowed, listed for context:`);
    for (const v of conditional) console.log(`  · ${v.file}  ${v.path}  lines ${v.lines.join(', ')}`);
    console.log('');
  }

  if (missing) {
    console.error(`[css-shadowing] baseline missing at ${path.relative(ROOT, BASELINE_PATH)}.`);
    console.error('  Run with --write-baseline to record the current state.');
    process.exit(1);
  }

  if (stale.length > 0) {
    console.log(`[css-shadowing] ${stale.length} baseline entr(y/ies) no longer shadowed — delete these lines:`);
    for (const k of stale) console.log(`  · ${k}`);
    console.log('');
  }

  if (newly.length === 0) {
    console.log(
      `[css-shadowing] OK — ${files.length} stylesheets, ${found.length} known shadowed selector(s), 0 new.`,
    );
    process.exit(0);
  }

  console.error(`[css-shadowing] ${newly.length} NEW shadowed selector(s):\n`);
  for (const v of newly) {
    console.error(`  ✗ ${v.file}`);
    console.error(`      ${v.path}`);
    console.error(`      defined at lines ${v.lines.join(' and ')} — the later one wins, silently.`);
    console.error('      Rename one, or scope the override under @media if it is meant to be conditional.\n');
  }
  console.error('  This is invisible to jsdom tests: the DOM is right and the pixels are not.');
  process.exit(1);
}

main();
