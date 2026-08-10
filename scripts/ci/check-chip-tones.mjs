#!/usr/bin/env node
/**
 * CI Guard: every literal `tone-*` class has a CSS rule behind it.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `<span className="rd-chip tone-dim">` where no stylesheet defines `.tone-dim`.
 * Nothing errors. React renders the class, the browser finds no rule, and the
 * chip loses its pill entirely: measured in Chromium, `tone-dim` computed to
 * `background: rgba(0,0,0,0)` and `color: rgb(20,20,19)` — near-black body text
 * with no chip behind it, beside `tone-idle`'s proper muted `#e8e6dc`.
 *
 * jsdom cannot see this. A component test asserting the chip renders with the
 * right text passes while the chip has no appearance, because jsdom applies no
 * stylesheet. Neither can the token-cascade gate (the tokens resolve fine — the
 * rule referencing them just does not exist) nor phantom-tokens (which asks
 * whether a `var(--x)` is declared anywhere in the repo, a different question).
 *
 * ── Why a gate and not a comment ──────────────────────────────────────────────
 * A comment was already tried. client/src/concept2cure/v2/fixtures/
 * clinical-regulatory-evidence.ts carried, in prose:
 *
 *   "Only tones that actually exist in the stylesheets are used — ok, warn,
 *    err, idle, ai. (tone-dim appears in PrecedentEngine.tsx but has no CSS
 *    rule behind it, so it renders as an unstyled base chip; don't copy it.)"
 *
 * It was then copied twice more, into DocumentAuthoring.tsx, after that was
 * written. A note that names a hazard and asks people not to repeat it is not
 * an enforcement mechanism.
 *
 * ── Scope, stated honestly ────────────────────────────────────────────────────
 * LITERAL class names only. 43 call sites build the class dynamically —
 * `className={`rd-chip tone-${STATUS_TONE[s.status]}`}` — and resolving those
 * would mean evaluating arbitrary expressions, which a guard should not pretend
 * to do. Those are covered by their TypeScript unions and by fallbacks like
 * ClientPortal's `CP_T[p.status] || 'ai'`, which exists precisely because an
 * unmatched lookup once produced `tone-undefined`. This gate does not claim to
 * cover them and should not be read as doing so.
 *
 * A `tone-` sequence only counts when it STARTS a class token. `amem-tone-cell`
 * is a different family and is not a chip tone; an earlier version of this
 * matcher flagged three of those as violations.
 *
 * Exit codes: 0 = clean, 1 = a literal tone has no CSS rule.
 * Usage:
 *   node scripts/ci/check-chip-tones.mjs           # gate
 *   node scripts/ci/check-chip-tones.mjs --json    # machine output
 *   node scripts/ci/check-chip-tones.mjs --list    # also print the defined set
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const SCAN = path.join(ROOT, 'client', 'src');

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const listOut = args.includes('--list');

/**
 * Strip TS/TSX comments so prose cannot register as a usage.
 *
 * ClientPortal.tsx documents the `tone-undefined` hazard in a comment; counting
 * that as a violation would fail the build over an accurate warning. String
 * state is tracked so a `//` inside a URL or a quoted value does not eat the
 * rest of the line.
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
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') { out += src[i] === '\n' ? '\n' : ' '; i += 1; }
      continue;
    }
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

/**
 * Literal tone classes in a source file.
 *
 * The lookbehind requires the token to start at a quote, backtick, brace or
 * whitespace — never mid-identifier — so `amem-tone-cell` does not match while
 * `"rd-chip tone-idle"` does.
 */
export function findLiteralTones(src) {
  const clean = stripJsComments(src);
  const found = [];
  clean.split('\n').forEach((line, idx) => {
    for (const m of line.matchAll(/(?<=['"`{ \t])tone-([a-z][a-z0-9-]*)\b/g)) {
      // `tone-${…}` is dynamic; the captured name would be a fragment.
      if (line.slice(m.index).startsWith('tone-$')) continue;
      found.push({ tone: m[1], line: idx + 1 });
    }
  });
  return found;
}

/** Every `.tone-x` a stylesheet defines. */
export function definedTones(cssFiles) {
  const set = new Set();
  for (const f of cssFiles) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\.tone-([a-z0-9-]+)/g)) set.add(m[1]);
  }
  return set;
}

function selfCheck() {
  const cases = [
    {
      name: 'finds a literal tone in a className string',
      src: `<span className="rd-chip tone-idle">x</span>`,
      expect: (f) => f.length === 1 && f[0].tone === 'idle',
    },
    {
      name: 'does NOT match a different family that merely ends in -tone-*',
      src: `<div className="amem-tone-cell"><span className="amem-tone-k" /></div>`,
      expect: (f) => f.length === 0,
    },
    {
      name: 'ignores a tone named only inside a line comment',
      src: `// tone-dim has no rule behind it; don't copy it\nconst x = 1;`,
      expect: (f) => f.length === 0,
    },
    {
      name: 'ignores a tone named only inside a block comment',
      src: `/* those render as \`tone-undefined\`, which matches no rule */`,
      expect: (f) => f.length === 0,
    },
    {
      name: 'skips the dynamic form rather than capturing a fragment',
      src: 'const c = `rd-chip tone-${STATUS[s]}`;',
      expect: (f) => f.length === 0,
    },
    {
      name: 'still catches a literal tone on a line that also has a dynamic one',
      src: 'const a = `tone-${x}`; const b = "rd-chip tone-warn";',
      expect: (f) => f.length === 1 && f[0].tone === 'warn',
    },
    {
      name: 'catches multiple tones on one line',
      src: `<i className="tone-ok" /><i className="tone-err" />`,
      expect: (f) => f.length === 2,
    },
    {
      name: 'a // inside a string does not swallow the rest of the line',
      src: `const u = "https://x.example"; const c = "rd-chip tone-ai";`,
      expect: (f) => f.length === 1 && f[0].tone === 'ai',
    },
  ];
  return cases.filter((c) => {
    try { return !c.expect(findLiteralTones(c.src)); } catch { return true; }
  }).map((c) => c.name);
}

function walk(dir, exts, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, exts, acc); }
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}

function main() {
  const failures = selfCheck();
  if (failures.length > 0) {
    console.error('[chip-tones] SELF-CHECK FAILED — the gate is not trustworthy:');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }

  if (!fs.existsSync(SCAN)) {
    console.log('[chip-tones] client/src absent — nothing to check.');
    process.exit(0);
  }

  const defined = definedTones(walk(SCAN, ['.css']));
  const violations = [];
  let uses = 0;

  for (const f of walk(SCAN, ['.tsx', '.ts'])) {
    const rel = path.relative(ROOT, f);
    for (const u of findLiteralTones(fs.readFileSync(f, 'utf8'))) {
      uses += 1;
      if (!defined.has(u.tone)) violations.push({ file: rel, ...u });
    }
  }

  if (jsonOut) {
    console.log(JSON.stringify({ defined: [...defined].sort(), uses, violations }, null, 2));
    process.exit(violations.length > 0 ? 1 : 0);
  }

  if (listOut) console.log(`[chip-tones] defined: ${[...defined].sort().join(' ')}\n`);

  if (violations.length === 0) {
    console.log(`[chip-tones] OK — ${uses} literal tone use(s), all ${defined.size} resolve to a CSS rule.`);
    process.exit(0);
  }

  console.error(`[chip-tones] ${violations.length} literal tone(s) with no CSS rule:\n`);
  for (const v of violations) {
    console.error(`  ✗ ${v.file}:${v.line}   tone-${v.tone}`);
  }
  console.error(`\n  Defined tones: ${[...defined].sort().join(' ')}`);
  console.error('  An undefined tone renders as an unstyled chip — jsdom cannot see it.');
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
