#!/usr/bin/env node
/**
 * ledger-check.mjs — keeps docs/GA_COMPLETION_LEDGER_2026-08.md from rotting.
 *
 * The ledger is the single register of open GA work across every space. Its
 * failure mode is not being wrong on the day it is written; it is going stale
 * afterwards — a row citing a file that got renamed, a row marked `done` on the
 * strength of an agent's say-so, two rows quietly sharing an ID. Each of those
 * has already happened at least once in this effort, which is why the ledger
 * exists in the first place. So the ledger is checked the same way everything
 * else here is: by observation.
 *
 * What it enforces:
 *   1. STRUCTURE — every row parses; IDs are unique and well-formed; owner and
 *      state come from the declared vocabulary; item and evidence are non-empty.
 *   2. EVIDENCE — a row may only be `done` if every path it cites actually
 *      exists. "Done" with a dangling reference is the exact failure this file
 *      is built to catch.
 *   3. SPECIFICATIONS — a doc reference carrying a section anchor (`… §1.3`)
 *      must exist whatever the row's state: you cannot specify work against a
 *      document that is not there.
 *   4. COMMANDS — a cited `node scripts/…` command must name a real script.
 *   5. THE INDEX — every document in the ledger's index table exists.
 *
 * What it deliberately does NOT fail on: a path cited by an `open` or
 * `in-flight` row that does not exist yet. That is the row's deliverable — the
 * place the work will land. Those are reported as `pending`, because a checker
 * that forbids naming a target forces the ledger to be vague about exactly the
 * rows that most need to be specific.
 *
 * Usage:
 *   node scripts/ops/ledger-check.mjs           # human-readable
 *   node scripts/ops/ledger-check.mjs --json    # machine-readable
 *
 * Exit code: 0 when every check passes, 1 on any failure. Pending targets never
 * change the exit code.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_MODE = process.argv.includes('--json');
/* An explicit ledger path is accepted so the checker itself can be exercised
   against a deliberately-broken fixture. A checker no one can prove fails is
   indistinguishable from one that always passes. */
const LEDGER =
  process.argv.slice(2).find((a) => a.endsWith('.md') && !a.startsWith('--')) ??
  'docs/GA_COMPLETION_LEDGER_2026-08.md';

const OWNERS = new Set(['eng', 'proc', 'qual', 'prod']);
const STATES = new Set(['open', 'in-flight', 'done', 'blocked']);

const failures = [];
const pending = [];
let rowCount = 0;

const fail = (id, message) => failures.push({ id, message });

/* ── read ────────────────────────────────────────────────────────────────── */

const ledgerPath = path.isAbsolute(LEDGER) ? LEDGER : path.join(repoRoot, LEDGER);
if (!fs.existsSync(ledgerPath)) {
  console.error(`ledger-check: ${LEDGER} does not exist.`);
  process.exit(1);
}
const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n');

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** Split a markdown table row into trimmed cells, dropping the outer pipes. */
function cells(line) {
  const t = line.trim();
  return t
    .slice(t.startsWith('|') ? 1 : 0, t.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((c) => c.trim());
}

const isDivider = (line) => /^\|[\s:|-]+\|$/.test(line.trim());

/** Backticked spans in a cell. */
function ticked(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
}

/**
 * Classify a backticked span. Only spans that genuinely look like repo paths
 * are checked — prose in backticks (a column name, a flag, an identifier) must
 * not be mistaken for a missing file, or the checker cries wolf and gets
 * ignored, which is worse than not having it.
 */
function classify(span) {
  // `node scripts/ops/x.mjs` / `npm run x` — take the script argument if any.
  const cmd = span.match(/^(?:node|npx|tsx)\s+([^\s]+)/);
  if (cmd) return { kind: 'command', target: cmd[1] };
  if (/^(npm|pnpm|yarn)\s/.test(span)) return { kind: 'ignore' };
  // Strip a trailing `:123` line reference and any trailing slash.
  const bare = span.replace(/:\d+(?:[,:]\d+)*$/, '').replace(/\/$/, '');
  if (/\s/.test(bare)) return { kind: 'ignore' };
  const looksLikePath =
    bare.includes('/') && /^[\w.@-]+(\/[\w.@+-]+)+$/.test(bare) && !bare.startsWith('/');
  if (!looksLikePath) return { kind: 'ignore' };
  return { kind: 'path', target: bare };
}

const exists = (rel) => fs.existsSync(path.join(repoRoot, rel));

/* ── 1. the index table: every document listed must exist ────────────────── */

for (const line of lines) {
  if (!line.trim().startsWith('|') || isDivider(line)) continue;
  const c = cells(line);
  if (c.length !== 2) continue;
  for (const span of ticked(c[0])) {
    const { kind, target } = classify(span);
    if (kind === 'ignore') continue;
    if (!exists(target)) fail('index', `index table cites \`${target}\`, which does not exist`);
  }
}

/* ── 2. the row tables ───────────────────────────────────────────────────── */

const seen = new Map();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim().startsWith('|') || isDivider(line)) continue;
  const c = cells(line);
  if (c.length !== 5) continue; // not a ledger row table
  const [id, item, owner, state, evidence] = c;
  if (id === 'ID') continue; // header

  if (!/^L\d+$/.test(id)) {
    fail(id || `line ${i + 1}`, `ID is not of the form L<number>`);
    continue;
  }
  rowCount++;

  if (seen.has(id)) fail(id, `duplicate ID (also on line ${seen.get(id)})`);
  else seen.set(id, i + 1);

  // Owner may be a compound: "eng + qual".
  const owners = owner.split('+').map((o) => o.trim());
  for (const o of owners) {
    if (!OWNERS.has(o)) fail(id, `unknown owner "${o}" (expected ${[...OWNERS].join(', ')})`);
  }
  if (!STATES.has(state)) {
    fail(id, `unknown state "${state}" (expected ${[...STATES].join(', ')})`);
  }
  if (!item) fail(id, 'empty item');
  if (!evidence) fail(id, 'empty evidence');

  const spans = ticked(evidence);
  if (spans.length === 0) {
    fail(id, 'evidence cites no file, document or command');
  }

  // A doc reference carrying a section anchor is a specification, and must
  // exist regardless of the row's state.
  const anchored = new Set();
  for (const m of evidence.matchAll(/`([^`]+)`[^`]*§/g)) anchored.add(m[1].trim());

  for (const span of spans) {
    const { kind, target } = classify(span);
    if (kind === 'ignore') continue;
    if (exists(target)) continue;

    if (kind === 'command') {
      fail(id, `cites command \`${span}\` but ${target} does not exist`);
    } else if (state === 'done') {
      fail(id, `is done but cites \`${target}\`, which does not exist`);
    } else if (anchored.has(span)) {
      fail(id, `specifies work against \`${target}\`, which does not exist`);
    } else {
      pending.push({ id, target });
    }
  }
}

if (rowCount === 0) fail('ledger', 'no rows parsed — the table format changed');

/* ── report ──────────────────────────────────────────────────────────────── */

if (JSON_MODE) {
  console.log(JSON.stringify({ rows: rowCount, failures, pending }, null, 2));
} else {
  console.log(`\nledger-check — ${LEDGER}\n`);
  console.log(`  rows parsed:       ${rowCount}`);
  console.log(`  pending targets:   ${pending.length}`);
  for (const p of pending) console.log(`    · ${p.id} → ${p.target} (not created yet)`);
  console.log(`  failures:          ${failures.length}`);
  for (const f of failures) console.log(`    ✗ ${f.id}: ${f.message}`);
  console.log(
    failures.length === 0
      ? '\n  Ledger is internally consistent.\n'
      : '\n  Ledger has drifted from the repository. Fix the rows above.\n',
  );
}

process.exit(failures.length === 0 ? 0 : 1);
