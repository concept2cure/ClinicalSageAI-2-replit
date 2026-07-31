#!/usr/bin/env node
/**
 * CI Guard: no exclamations, no emoji in customer-facing UI copy.
 *
 * THE INCIDENT. The 2026-07 CXO UI/UX audit found the design-system's own
 * non-negotiables ("No exclamation marks. No cheerleading. Numbers over
 * adjectives.") being violated in exactly the sites they were meant to
 * govern — sign-up CTAs, toast messages, error boundaries, AnA fallback
 * strings ("Sorry — AnA…"). Every offender was a one-line edit, but the
 * copy kept drifting back because there was no gate. #1260 fixed the
 * named sites; this gate stops the drift.
 *
 * The rule (from design-system/CLAUDE.md):
 *   - No exclamation marks in customer-facing text.
 *   - No emoji glyphs. The AnA ✻ (U+273B) is the single documented
 *     exception. Text-presentation dingbats used as functional icon
 *     glyphs (✓ ✕ ⚠ ☰ ▸ ▾ etc.) are also allowed — they are widgets, not
 *     pictographs. The rule targets the surrogate-pair pictograph range
 *     that reads as "look at me" decoration (📋 🎉 🚀 …).
 *
 * ESCAPE HATCH. Deliberate uses annotate the line, matching the repo's
 * existing gate convention (see check-compliance-claims.mjs):
 *
 *   // microcopy-allow: unicode-example page shows the character literally
 *   const example = 'The bang character is "!".';
 *
 * In Markdown, use an HTML comment on the line or the line before:
 *
 *   <!-- microcopy-allow: heading of the "what NOT to do" section -->
 *
 * The annotation is the point. It forces whoever ships the exception to
 * name it in the diff.
 *
 * Exit 0 — every customer-facing string is calm and factual.
 * Exit 1 — at least one exclamation or pictograph in customer-facing copy.
 *
 * Usage:
 *   node scripts/ci/check-microcopy.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const ALLOW = 'microcopy-allow';

// ─────────────────────────────────────────────────────────────────────────────
// Rule 1 — exclamation at end of a customer-facing string.
//
// We only flag when the `!` is the last non-whitespace character of a
// quoted-string literal, or is followed by whitespace then a capital letter
// or end-of-string. That catches the sentence-terminating "You're all set!"
// pattern the audit named while ignoring:
//
//   - the negation operator      `if (!x)`
//   - strict-inequality           `x !== y`
//   - non-null assertion (TS)     `foo!.bar`
//   - template holes              `\`${!ok}\``
//   - webpack-loader syntax       `import raw from '!raw-loader!./file'`
//
// The scan is line-based (same shape as check-compliance-claims) — good
// enough for the audit's ask, and the escape hatch covers whatever falls
// through.
// ─────────────────────────────────────────────────────────────────────────────
const EXCLAIM_RE = /(['"`])([^'"`\n]{2,}?[A-Za-z0-9,;:)\]}'"…])!\s*(?:[A-Z][^'"`\n]*)?\1/;

// ─────────────────────────────────────────────────────────────────────────────
// Rule 2 — pictograph emoji.
//
// Matches the surrogate-pair pictograph blocks (📋 📊 🎉 🚀 🧬 🔬 📝 …) and
// the higher symbol-and-pictograph range. Explicitly does NOT match:
//
//   - ✻ (U+273B)  — the documented AnA sparkle
//   - ✓ ✕ ✔ ✖    — status ticks used as functional icon glyphs
//   - ⚠            — warning triangle (text-presentation dingbat)
//   - ☰            — hamburger menu (Miscellaneous Symbols, functional)
//   - ▸ ▾ ▶ ▼    — disclosure chevrons
//   - the ZWJ / VS-16 combiners in isolation
//
// The rule targets the surrogate-pair range because that IS the class of
// "look at me" decorative emoji the design-system non-negotiable names.
// ─────────────────────────────────────────────────────────────────────────────
const EMOJI_RE = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

// ─────────────────────────────────────────────────────────────────────────────
// What to scan. Customer-facing UI copy: the concept2cure client and the
// SDL surfaces it renders. Server code, tests, fixtures, deprecated
// quarantines, and scripts (which are developer tools) are out of scope —
// their strings never reach a user.
// ─────────────────────────────────────────────────────────────────────────────
const SCAN_ROOTS = [path.join(repoRoot, 'client', 'src', 'concept2cure')];

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.mdx']);
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '_deprecated',
  '__tests__',
  '__mocks__',
  'fixtures',
]);

function isTestPath(rel) {
  return (
    rel.includes('/__tests__/') ||
    rel.includes('/__mocks__/') ||
    rel.includes('/fixtures/') ||
    /\.(test|spec|stories)\.(ts|tsx|js|jsx)$/.test(rel)
  );
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (CODE_EXT.has(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_ROOTS.flatMap((r) => walk(r));

const violations = [];

for (const file of files) {
  const rel = path.relative(repoRoot, file);
  if (isTestPath(rel)) continue;

  let lines;
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n');
  } catch {
    continue;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const exempt = line.includes(ALLOW) || (i > 0 && lines[i - 1].includes(ALLOW));
    if (exempt) continue;

    const em = line.match(EXCLAIM_RE);
    if (em) {
      violations.push({
        file: rel,
        line: i + 1,
        rule: 'exclamation',
        why: 'The design-system rule bans exclamations in customer-facing copy — the tone is calm and factual, never cheerleading.',
        text: em[0].trim().slice(0, 90),
      });
    }

    const emo = line.match(EMOJI_RE);
    if (emo) {
      violations.push({
        file: rel,
        line: i + 1,
        rule: 'emoji',
        why: 'The design-system rule bans pictograph emoji. Use a real icon from `../icons` (I.*) or the shared icon set.',
        text: emo[0],
      });
    }
  }
}

if (violations.length === 0) {
  console.log(
    `[ci:microcopy] OK — scanned ${files.length} customer-facing files, no exclamations or pictographs.`
  );
  process.exit(0);
}

console.error(
  `[ci:microcopy] FAIL — ${violations.length} microcopy violation(s) in customer-facing copy.\n`
);

const byRule = new Map();
for (const v of violations) {
  if (!byRule.has(v.rule)) byRule.set(v.rule, []);
  byRule.get(v.rule).push(v);
}

for (const [rule, vs] of byRule) {
  console.error(`  ${rule} (${vs.length})`);
  console.error(`    ${vs[0].why}`);
  for (const v of vs) {
    console.error(`      ${v.file}:${v.line}  —  ${v.text}`);
  }
  console.error('');
}

console.error('  Fix the copy, or — if the character is genuinely required — annotate the line:');
console.error(`      // ${ALLOW}: <why this specific use is required>`);
console.error(`      <!-- ${ALLOW}: <why this specific use is required> -->   (Markdown)`);
console.error('');
console.error('  See design-system/CLAUDE.md for the tone-of-voice non-negotiables.');

process.exit(1);
