#!/usr/bin/env node
/**
 * CI Guard: does every class a component renders have a rule behind it in the
 * SHIPPED css?
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `<DocumentsPanel>` shipped for months with no stylesheet at all. Its own
 * docblock said "CSS lives in client/src/concept2cure/mdx/app.css (DOCUMENTS
 * PANEL section)"; there was no such section. All twenty-four of its classes —
 * .docs-panel, .docs-row, .docs-rail, .docs-esig, the lot — were defined in
 * zero of the twenty built CSS chunks, so the vault's document list rendered as
 * bare stacked buttons on five surfaces at once.
 *
 * ── Why the existing gates could not see it ───────────────────────────────────
 * `scripts/visual-qa/check-surface-styling.mjs` asks whether a SURFACE receives
 * the cascade: it renders the captured markup twice, once with the built sheets
 * and once with none, and fails when the two are identical. `mdx__device-vault`
 * differs in hundreds of properties — its page chrome, sections, metrics and
 * tables are all styled — so it passes, correctly, while the component that is
 * the entire content of the surface receives nothing. That check is not wrong;
 * it is answering a different question. A wholly unstyled COMPONENT inside a
 * well-styled SURFACE is the exact shape it cannot resolve.
 *
 * `check-orphaned-stylesheets.mjs` finds sheets nothing imports, from the other
 * end, and its own docblock warns that the obvious inference — orphan sheet,
 * therefore unstyled surface — is unreliable: `.ed-tree` is in an orphaned
 * `editor-core.css` AND has 30 rules in the built CSS from an imported sheet.
 * It says the claim has to be made per class against the BUILT css. This is the
 * check that makes it.
 *
 * `check-chip-tones.mjs` does exactly this for one family, `tone-*`, against
 * source CSS. This is that idea generalised to every literal class, and moved
 * onto the built chunks so a rule in a sheet the bundler never sees does not
 * count as coverage.
 *
 * ── The question it asks, stated exactly ──────────────────────────────────────
 *   For every literal class name that a client component renders, does at least
 *   one selector in the built CSS chunks mention that class?
 *
 * Not "is it styled well", not "does the rule match at runtime" — the weakest
 * possible form of the question, so that a failure is never a matter of taste.
 * A class with zero mentions in the shipped stylesheets cannot style anything,
 * on any surface, ever, whatever the component's comments claim.
 *
 * ── What it deliberately does NOT assert ──────────────────────────────────────
 * • That a mentioned class actually matches. `.mdx-shell .docs-panel` counts as
 *   coverage for `docs-panel` even if a caller forgets the `.mdx-shell` scope.
 *   Deciding that needs the cascade, which is check-surface-styling's job.
 * • Anything about dynamically built names. `` `docs-fw-${d.framework}` `` is
 *   skipped rather than guessed at, the same way check-chip-tones skips
 *   `` tone-${…} ``. The captured fragment would be a lie.
 * • That a class is superfluous. A class can legitimately exist only as a test
 *   hook or a querySelector target, which is precisely why this is a ratchet
 *   with a reviewed baseline rather than a hard assertion.
 *
 * ── Why a ratchet ─────────────────────────────────────────────────────────────
 * The first honest run found 396 undefined class names across 597 call sites —
 * whole families (`eng-blocker-*`, `ps-*`, `anl-phase-*`, `rse-*`) that were
 * ported as markup and left behind as stylesheet, the same defect as
 * DocumentsPanel and mostly for the same reason. Fixing those is a design port
 * per family and cannot be done by a linter. Freezing the set and letting it
 * only shrink is what a gate can do; each entry that leaves has to leave
 * through `--write-baseline`, which makes the removal visible in review.
 *
 * ── Why it refuses to run against a stale build ───────────────────────────────
 * It reads `dist/public/assets`. A build older than the source describes a
 * product that no longer exists: a class added since the build would be
 * reported missing when the next build defines it, and a class whose rules were
 * just deleted would be reported present. Both directions are wrong, and the
 * second is the dangerous one. Exit 2 means "do not trust this run", matching
 * the visual-qa convention, as distinct from exit 1, "the product has findings".
 *
 * Exit codes: 0 clean · 1 new undefined class · 2 harness/build not trustworthy.
 *
 * Usage:
 *   npm run build                                        # this reads the SHIPPED css
 *   node scripts/ci/check-component-class-coverage.mjs
 *   node scripts/ci/check-component-class-coverage.mjs --list
 *   node scripts/ci/check-component-class-coverage.mjs --self-test   # no build needed
 *   node scripts/ci/check-component-class-coverage.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtStylesheets } from '../visual-qa/built-css.mjs';
import { newestSourceMtime } from '../visual-qa/capture-freshness.mjs';

const TAG = '[ci:component-class-coverage]';
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');
const SCAN = path.join(ROOT, 'client', 'src');
const BASELINE_FILE = path.join(ROOT, 'scripts/ci/component-class-coverage-baseline.json');

/**
 * The trees whose edits can change the CSS the build emits, and only those.
 *
 * `client/src` twice over: it holds the authored stylesheets, and it is what
 * tailwind.config.ts scans (`content: ['./client/index.html',
 * './client/src/**\/*.{js,jsx,ts,tsx}']`), so a new utility class in a .tsx
 * changes the emitted CSS. `design-system` because client/src/index.css pulls
 * its sheets in.
 *
 * `shared` is deliberately absent. It is in the JS graph and in
 * capture-freshness's own list, but Tailwind does not scan it and no stylesheet
 * lives there, so a server-shared type edit cannot change one byte of the built
 * CSS. Including it would make this gate refuse to run for a reason that has
 * nothing to do with what it measures.
 */
const BUILD_INPUT_DIRS = ['client/src', 'design-system'];

/* ────────────────────────────────────────────────────────────────────────────
 * The used side: literal class names in component source.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Strip TS/TSX comments so prose cannot register as a usage.
 *
 * This file's own subject matter is class names, and components document the
 * classes they used to render; counting a comment would fail the build over an
 * accurate note. String state is tracked so a `//` inside a URL does not eat
 * the rest of the line.
 */
export function stripJsComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { if (i + 1 < src.length) out += src[i + 1]; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i += 1; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i += 1; } continue; }
    if (c === '/' && n === '*') {
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

/** End index (exclusive) of the balanced `{…}` starting at `i`. */
function balanced(src, i) {
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      i += 1;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i += 1; i += 1; }
      i += 1;
      continue;
    }
    if (c === '`') {
      i += 1;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { i = balanced(src, i + 1); continue; }
        i += 1;
      }
      i += 1;
      continue;
    }
    if (c === '{') { depth += 1; i += 1; continue; }
    if (c === '}') { depth -= 1; i += 1; if (depth === 0) return i; continue; }
    i += 1;
  }
  return i;
}

/** A CSS identifier, so `-`, `+` and `50%` never register as class names. */
const IDENT = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;

/** Calls whose string arguments ARE class names rather than data. */
const CLASS_JOINERS = new Set(['cn', 'cx', 'clsx', 'classNames', 'twMerge']);

/**
 * Class tokens in one literal chunk.
 *
 * `openAdj`/`closeAdj` mark a chunk that abuts an interpolation with no space,
 * where the touching token is a FRAGMENT of a name and not a name: in
 * `` `docs-fw-${id}` `` the chunk is `docs-fw-` and there is no class to report.
 */
function tokensOf(chunk, openAdj, closeAdj) {
  const parts = chunk.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  const out = parts.slice();
  if (closeAdj && !/\s$/.test(chunk)) out.pop();
  if (openAdj && !/^\s/.test(chunk) && out.length) out.shift();
  return out.filter((t) => IDENT.test(t));
}

/**
 * The class-context string literals in one expression, each with the adjacency
 * facts needed to tell a whole class name from a fragment of one.
 *
 * A chunk that touches an interpolation with no whitespace between them is
 * USUALLY a fragment — `` `docs-fw-${id}` `` renders `docs-fw-820` and there is
 * no `.docs-fw-` class to look for. But not always, and the difference is not
 * cosmetic: DocumentsPanel writes
 *
 *     `docs-panel${density === 'compact' ? ' docs-panel-compact' : ''}`
 *
 * where `docs-panel` is a whole class and the interpolation only ever appends a
 * SPACE-PREFIXED modifier or nothing. An earlier version of this reader dropped
 * it as a fragment, and the proof was unpleasant: deleting the DocumentsPanel
 * stylesheet to check this gate catches L100, it reported nineteen of the
 * twenty classes and stayed silent about `.docs-panel` — the one the ledger row
 * leads with, and the one measured computing to display:block.
 *
 * So the interpolation is inspected. If every class string it can contribute is
 * empty or starts with whitespace, and at least one starts with whitespace, it
 * cannot extend the token before it and that token is whole. `${x ?? ''}` does
 * not qualify — its only literal is empty, the value is dynamic, and the token
 * before it stays a fragment.
 */
/**
 * Adjacency runs OUTWARD TOO, and for a while it only ran inward.
 *
 * `classPieces` told the surrounding chunk whether an interpolation could
 * extend it, but never told the interpolation's own literals whether the
 * surrounding chunk extends THEM. So
 *
 *     `dd-att-ico kind-${f.kind || 'file'}`
 *
 * reported a class named `file`. The element renders `kind-file`; nothing in
 * the product ever renders `file`. The gate was reporting, and the baseline was
 * carrying, a name that does not exist — while `kind-file`, the real fallback
 * kind and the one with no rule of its own, went unnamed.
 *
 * Which pieces are glued: a piece whose `openAdj` is already true is glued to
 * something INSIDE the interpolation (it follows a `+`), so it cannot be the
 * first thing the interpolation emits and the outer text cannot reach it. A
 * piece whose `openAdj` is false can begin the interpolation's output — true of
 * every arm of a `||` or a `?:`, and of the first operand of a `+` — so if the
 * text before the interpolation does not end in whitespace, that piece's first
 * token is a fragment. `closeAdj` is the mirror, and is resolved a step later
 * because the text after the interpolation has not been read yet.
 */
function glue(pieces, gluedLeft) {
  if (!gluedLeft) return;
  for (const p of pieces) if (!p.openAdj) p.openAdj = true;
}

function classPieces(expr) {
  const out = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      let raw = '';
      while (j < expr.length && expr[j] !== q) {
        if (expr[j] === '\\') { raw += expr[j + 1] ?? ''; j += 2; continue; }
        raw += expr[j];
        j += 1;
      }
      const lead = expr.slice(0, i).replace(/\s+$/, '');
      const trail = expr.slice(j + 1).replace(/^\s+/, '');
      // `row[0] === 'Overall' ? …` — an operand of a comparison is data.
      const comparand = /[=!]==?$/.test(lead) || /^[=!]==?/.test(trail);
      // `k.delta.startsWith('-')` — an argument to anything but a class joiner
      // is data too. This is how `-` and `+` used to be reported as classes.
      const callee = lead.endsWith('(') ? (lead.slice(0, -1).match(/([A-Za-z_$][\w$]*)$/) || [])[1] : null;
      const foreignArg = callee != null && !CLASS_JOINERS.has(callee);
      if (!comparand && !foreignArg) {
        out.push({ raw, openAdj: lead.slice(-1) === '+', closeAdj: trail.slice(0, 1) === '+' });
      }
      i = j + 1;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let chunk = '';
      let openAdj = false;
      /* Pieces from the interpolation just read, still waiting to learn whether
         the literal text that FOLLOWS them is glued on. See `glue` below. */
      let pendingRight = [];
      const flushRight = (nextChunk) => {
        if (pendingRight.length > 0 && nextChunk !== '' && !/^\s/.test(nextChunk)) {
          for (const p of pendingRight) p.closeAdj = true;
        }
        pendingRight = [];
      };
      while (j < expr.length && expr[j] !== '`') {
        if (expr[j] === '\\') { chunk += expr[j + 1] ?? ''; j += 2; continue; }
        if (expr[j] === '$' && expr[j + 1] === '{') {
          const end = balanced(expr, j + 1);
          const inner = classPieces(expr.slice(j + 2, end - 1));
          const raws = inner.map((p) => p.raw);
          const leads = raws.length > 0 && raws.some((r) => /^\s/.test(r)) && raws.every((r) => r === '' || /^\s/.test(r));
          const ends = raws.length > 0 && raws.some((r) => /\s$/.test(r)) && raws.every((r) => r === '' || /\s$/.test(r));
          flushRight(chunk);
          out.push({ raw: chunk, openAdj, closeAdj: !leads });
          glue(inner, chunk === '' ? openAdj : !/\s$/.test(chunk));
          out.push(...inner);
          pendingRight = inner;
          chunk = '';
          openAdj = !ends;
          j = end;
          continue;
        }
        chunk += expr[j];
        j += 1;
      }
      flushRight(chunk);
      out.push({ raw: chunk, openAdj, closeAdj: false });
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

/** Every literal class token inside one `className=` expression. */
function classesInExpr(expr) {
  return classPieces(expr).flatMap((p) => tokensOf(p.raw, p.openAdj, p.closeAdj));
}

const ATTR = /\bclassName\s*=\s*/g;

/** @returns {{cls: string, line: number}[]} literal classes a source file renders. */
export function findLiteralClasses(src) {
  const clean = stripJsComments(src);
  const found = [];
  let m;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(clean)) !== null) {
    let i = m.index + m[0].length;
    const line = clean.slice(0, m.index).split('\n').length;
    let expr;
    if (clean[i] === '{') {
      const end = balanced(clean, i);
      expr = clean.slice(i + 1, end - 1);
      i = end;
    } else if (clean[i] === '"' || clean[i] === "'") {
      const q = clean[i];
      let j = i + 1;
      while (j < clean.length && clean[j] !== q) { if (clean[j] === '\\') j += 1; j += 1; }
      expr = clean.slice(i, j + 1);
      i = j + 1;
    } else {
      continue;
    }
    for (const cls of classesInExpr(expr)) found.push({ cls, line });
    ATTR.lastIndex = i;
  }
  return found;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The defined side: class names the built chunks mention.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every class name any built stylesheet mentions.
 *
 * Deliberately generous, the same way check-phantom-tokens treats a token
 * declared in any form as existing: escapes are unwrapped so Tailwind's
 * `.md\:flex` and `.w-1\/2` resolve, and a `.foo` appearing anywhere in a
 * selector counts. Over-collecting can only make this gate UNDER-report, which
 * is the safe direction for a check whose failure blocks a build.
 */
export function definedClasses(sheets) {
  const set = new Set();
  for (const { css } of sheets) {
    for (const m of css.matchAll(/\.((?:[A-Za-z0-9_-]|\\.)+)/g)) {
      set.add(m[1].replace(/\\(.)/g, '$1'));
    }
  }
  return set;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Proving the instrument before believing it.
 * ──────────────────────────────────────────────────────────────────────────── */

function extractorSelfCheck() {
  const cases = [
    {
      name: 'reads a plain className string',
      src: '<div className="docs-panel docs-panel-compact" />',
      expect: (f) => f.map((x) => x.cls).join(' ') === 'docs-panel docs-panel-compact',
    },
    {
      name: 'reads a braced string expression',
      src: "<div className={'docs-row'} />",
      expect: (f) => f.length === 1 && f[0].cls === 'docs-row',
    },
    {
      name: 'reads the literal half of a template and skips the interpolation',
      src: '<div className={`docs-panel ${density === "compact" ? "docs-panel-compact" : ""}`} />',
      expect: (f) => f.some((x) => x.cls === 'docs-panel') && f.some((x) => x.cls === 'docs-panel-compact'),
    },
    {
      name: 'drops the fragment that abuts an interpolation',
      src: '<span className={`docs-framework docs-fw-${d.framework ?? ""}`} />',
      expect: (f) => f.map((x) => x.cls).join(' ') === 'docs-framework',
    },
    {
      name: 'keeps a whole class that abuts an interpolation which only ever prepends a space',
      src: '<div className={`docs-panel${density === "compact" ? " docs-panel-compact" : ""}`} />',
      expect: (f) => f.map((x) => x.cls).sort().join(' ') === 'docs-panel docs-panel-compact',
    },
    {
      name: 'keeps a whole class that abuts an interpolation which only ever appends a space',
      src: '<div className={`${open ? "is-open " : ""}docs-row`} />',
      expect: (f) => f.map((x) => x.cls).sort().join(' ') === 'docs-row is-open',
    },
    {
      name: 'does not read a class named only in a line comment',
      src: '// .docs-rail had no rule behind it\nconst x = 1;',
      expect: (f) => f.length === 0,
    },
    {
      name: 'does not read a class named only in a block comment',
      src: '/* every one of its classes — .docs-row, .docs-rail — matched nothing */',
      expect: (f) => f.length === 0,
    },
    {
      name: 'does not read a call argument as a class',
      src: '<div className={`anl-delta ${k.delta.startsWith("-") ? "down" : "up"}`} />',
      expect: (f) => !f.some((x) => x.cls === '-'),
    },
    {
      name: 'does not read a comparison operand as a class',
      src: '<tr className={row[0] === "Overall" ? "is-overall" : ""} />',
      expect: (f) => f.map((x) => x.cls).join(' ') === 'is-overall',
    },
    {
      name: 'does read the arguments of a class joiner',
      src: '<div className={cn("docs-row", open && "is-open")} />',
      expect: (f) => f.map((x) => x.cls).sort().join(' ') === 'docs-row is-open',
    },
    {
      name: 'reports the line the class is rendered on',
      src: 'const a = 1;\nconst b = 2;\n<div className="docs-rail" />',
      expect: (f) => f.length === 1 && f[0].line === 3,
    },
    {
      name: 'a // inside a string does not swallow the rest of the line',
      src: 'const u = "https://x.example"; const el = <i className="docs-open" />;',
      expect: (f) => f.length === 1 && f[0].cls === 'docs-open',
    },
    {
      name: 'keeps reading after a className with a nested object expression',
      src: '<div className={{ a: 1 } && "docs-body"} /><div className="docs-title" />',
      expect: (f) => f.some((x) => x.cls === 'docs-title'),
    },
  ];
  const broken = cases.filter((c) => {
    try { return !c.expect(findLiteralClasses(c.src)); } catch { return true; }
  }).map((c) => c.name);
  return { total: cases.length, broken };
}

/**
 * The defined side has to be proved too, and against the real build.
 *
 * The first version of check-surface-styling reported all 24 surfaces unstyled
 * because it could load no CSS at all — "a result where 100% of cases fail the
 * same way is the instrument, not the subject". The same trap is open here: a
 * selector regex that stopped matching would report every class in the repo as
 * undefined, in an authoritative-looking list.
 *
 * The controls are the two SHELL ROOTS, `.c2c-v2` and `.mdx-shell`, and the
 * choice was corrected by running the gate against a real defect. The first
 * version used `.docs-panel` — the class this gate exists because of — and when
 * the DocumentsPanel stylesheet was deleted to prove the gate catches it, the
 * gate reported a broken harness instead of a finding. A positive control has
 * to be INDEPENDENT of the subject, or the instrument switches itself off at
 * exactly the moment it matters. The shell roots qualify: every scoped rule in
 * the product hangs off one of them, so their absence means no shell stylesheet
 * reached the build at all, which is a harness or build failure and not a
 * component's missing rules.
 *
 * The negative control asserts the set is not simply everything — a selector
 * scan that matched noise would report full coverage forever.
 */
function cssSelfCheck(defined) {
  const problems = [];
  if (defined.size === 0) problems.push('no class names read out of the built CSS at all');
  for (const root of ['c2c-v2', 'mdx-shell']) {
    if (!defined.has(root)) {
      problems.push(`.${root} is not in the built CSS — no shell stylesheet reached this build, so every class would read as undefined`);
    }
  }
  if (defined.has('a-class-no-stylesheet-defines')) {
    problems.push('the defined set contains a name nothing could define — the selector scan is matching noise');
  }
  return problems;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Run.
 * ──────────────────────────────────────────────────────────────────────────── */

function walk(dir, exts, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '__tests__') walk(p, exts, acc);
    } else if (exts.some((x) => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}

/** Newest mtime among the built stylesheets — when this build was produced. */
function buildMtime(sheets) {
  return sheets.reduce((n, s) => Math.max(n, fs.statSync(s.path).mtimeMs), 0);
}

function assertBuildIsFresh(sheets) {
  const built = buildMtime(sheets);
  const { newest, newestFile } = newestSourceMtime(ROOT, BUILD_INPUT_DIRS);
  if (newest <= built) {
    console.log(`${TAG} build is current (newer than every source file it is built from).`);
    return;
  }
  const mins = Math.round((newest - built) / 60000);
  console.error(`${TAG} STALE BUILD — refusing to report.`);
  console.error(`${TAG}   built:         ${new Date(built).toISOString()}`);
  console.error(`${TAG}   newest source: ${new Date(newest).toISOString()}  (${newestFile})`);
  console.error(`${TAG}   the source is ${mins} minute(s) ahead of the build, so a class added since`);
  console.error(`${TAG}   then would be reported missing and a rule deleted since then would be`);
  console.error(`${TAG}   reported present. Both answers would be about a product that is not this one.`);
  console.error(`${TAG}`);
  console.error(`${TAG}   Rebuild:  npm run build`);
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);

  const { total, broken } = extractorSelfCheck();
  if (broken.length > 0) {
    console.error(`${TAG} SELF-CHECK FAILED — the class reader is not trustworthy:`);
    for (const b of broken) console.error(`  x ${b}`);
    process.exit(2);
  }
  // `--self-test` proves the class READER and stops there. It deliberately does
  // not go on to read dist/, so it is runnable in a checkout with no build —
  // which is the state a contributor is in when they want to know whether a
  // change to the reader broke it.
  if (args.includes('--self-test')) {
    console.log(`${TAG} self-test OK — ${total} class-reader cases pass.`);
    process.exit(0);
  }

  const sheets = builtStylesheets(TAG, { soft: true });
  if (sheets.length === 0) {
    console.error(`${TAG} no built stylesheets in dist/public/assets.`);
    console.error(`${TAG} Run \`npm run build\` first — this gate reads the SHIPPED css, not source.`);
    console.error(`${TAG} A rule in a stylesheet the bundler never sees does not style anything, so`);
    console.error(`${TAG} measuring against source would count exactly the coverage that is missing.`);
    process.exit(2);
  }

  assertBuildIsFresh(sheets);

  const defined = definedClasses(sheets);
  const cssProblems = cssSelfCheck(defined);
  if (cssProblems.length > 0) {
    console.error(`${TAG} SELF-CHECK FAILED — the built-CSS side is not trustworthy:`);
    for (const p of cssProblems) console.error(`  x ${p}`);
    console.error(`${TAG} Fix the harness before reading anything below.`);
    process.exit(2);
  }

  if (!fs.existsSync(SCAN)) {
    console.error(`${TAG} client/src is absent — there is nothing to measure, which is not the same as clean.`);
    process.exit(2);
  }

  const found = new Map(); // "file::class" -> {file, cls, lines[]}
  let uses = 0;
  for (const file of walk(SCAN, ['.tsx', '.jsx'])) {
    const rel = path.relative(ROOT, file);
    for (const u of findLiteralClasses(fs.readFileSync(file, 'utf8'))) {
      uses += 1;
      if (defined.has(u.cls)) continue;
      const key = `${rel}::${u.cls}`;
      if (!found.has(key)) found.set(key, { file: rel, cls: u.cls, lines: [] });
      found.get(key).lines.push(u.line);
    }
  }

  // Code-unit order, not localeCompare: the baseline is a committed artefact and
  // two machines with different ICU data must produce the same file, or the
  // ratchet churns on a diff nobody made.
  const entries = [...found.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const sites = entries.reduce((n, [, v]) => n + v.lines.length, 0);
  const classNames = new Set(entries.map(([, v]) => v.cls));

  if (args.includes('--write-baseline')) {
    fs.writeFileSync(
      BASELINE_FILE,
      JSON.stringify(
        {
          $comment:
            'Literal class names a component renders that NO built CSS chunk defines, keyed ' +
            'file::class. A class with no rule behind it cannot style anything on any surface, ' +
            'whatever the component claims. This list may only SHRINK — by writing the rules, ' +
            'by importing the stylesheet that already has them, or by deleting the class from ' +
            'the markup. Regenerate with --write-baseline ONLY after removing entries, and only ' +
            'against a fresh `npm run build`.',
          $generated: new Date().toISOString().slice(0, 10),
          entryCount: entries.length,
          classCount: classNames.size,
          siteCount: sites,
          entries: entries.map(([k]) => k),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`${TAG} baseline written — ${entries.length} entr(ies), ${classNames.size} class name(s), ${sites} site(s).`);
    process.exit(0);
  }

  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(`${TAG} FAIL — baseline missing. Generate it with:`);
    console.error('  npm run build && node scripts/ci/check-component-class-coverage.mjs --write-baseline');
    process.exit(2);
  }

  const baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).entries);
  const currentKeys = new Set(entries.map(([k]) => k));
  const introduced = entries.filter(([k]) => !baseline.has(k));
  const resolved = [...baseline].filter((k) => !currentKeys.has(k)).sort();

  if (args.includes('--list')) {
    for (const [, v] of entries) {
      console.log(`  ${v.cls}  —  ${v.file}:${v.lines.slice(0, 6).join(',')}${v.lines.length > 6 ? ',…' : ''}`);
    }
    console.log('');
  }

  console.log(
    `${TAG} ${uses} literal class use(s) across the client; ` +
      `${classNames.size} class name(s) with no rule in any of the ${sheets.length} built chunks, ` +
      `${sites} site(s) (baseline ${baseline.size}).`,
  );

  if (resolved.length > 0) {
    console.log(
      `\n  ${resolved.length} baseline entr${resolved.length === 1 ? 'y is' : 'ies are'} now defined or gone:\n` +
        resolved.slice(0, 12).map((r) => `    ${r}`).join('\n') +
        `${resolved.length > 12 ? '\n    …' : ''}\n` +
        '  Regenerate so the ratchet holds:\n' +
        '    node scripts/ci/check-component-class-coverage.mjs --write-baseline',
    );
  }

  if (introduced.length > 0) {
    console.error(`\n${TAG} FAIL — ${introduced.length} class name(s) rendered with no rule in the shipped CSS:\n`);
    for (const [, v] of introduced) {
      console.error(`  ${v.file}`);
      console.error(`    .${v.cls}  — rendered at line(s) ${v.lines.join(', ')}, defined in none of the ${sheets.length} built CSS chunks`);
    }
    console.error(
      '\nA class no stylesheet defines renders as nothing. jsdom cannot see it — it applies\n' +
        'no cascade — and check-surface-styling.mjs cannot see it either, because the surface\n' +
        'around the component is styled and that is the question it asks.\n' +
        '\nEither write the rules, or import the stylesheet that already has them: a rule in a\n' +
        'sheet nothing imports (ui_kits/**, an orphan under client/src) is not\n' +
        'coverage. See check-orphaned-stylesheets.mjs.\n',
    );
    process.exit(1);
  }

  console.log(`${TAG} OK — no new class rendered without a rule behind it.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
