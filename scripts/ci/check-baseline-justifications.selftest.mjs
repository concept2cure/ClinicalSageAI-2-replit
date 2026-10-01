#!/usr/bin/env node
/**
 * Self-test for ci:tenant-isolation-justifications (alias ci:baseline-justifications;
 * scripts/ci/check-baseline-justifications.mjs).
 *
 * On the real tree the gate reports "OK — tenant-isolation baseline: 5 source
 * file(s) all justified, no stale rows", so none of its failure branches fires
 * in normal use. A gate whose failure branch has never been seen has not been
 * tested (CLAUDE.md, working agreement). This shows each one firing on the shape
 * it was written for, and shows the gate staying quiet on the near-misses the
 * real justifications doc already contains.
 *
 * ── How ─────────────────────────────────────────────────────────────────────
 * Each case writes a fixture tree into a fresh temp directory:
 *   docs/reports/tenant-isolation-baseline.json   (fingerprints `file#hash:tables`)
 *   docs/reports/tenant-isolation-justifications.md
 *   server/**                                     (only for the empty-baseline branch)
 * and writes a copy of the REAL gate into that tree at its repository path,
 * with exactly one declaration rewritten: `repoRoot`, to the fixture tree. The
 * baseline and doc paths derive from it, so nothing else needs touching and
 * what is judged is the logic CI runs. The gate's `./lib/*.mjs` imports are
 * copied from this repository beside it, so the suppression regex and the
 * scan-root check under test are the real ones too.
 *
 * ── The defect shapes ───────────────────────────────────────────────────────
 * The gate's header and docs/reports/tenant-isolation-justifications.md give
 * the policy: every source file in the tenant-isolation baseline has a row in
 * the "Justified entries" table, and every row there still corresponds to a
 * baseline entry. The failing cases are:
 *   - a baseline entry with no row — how the 2026-09-06 optional-tenant-predicate
 *     rule took the baseline 2 → 12: frozen entries are tolerable only because
 *     each one is written down with an owner;
 *   - a row whose file has left the baseline — the 2026-09-28 licensing-history
 *     ratchet (9 → 8), where the row must move to "Resolved";
 *   - a row moved to "Resolved" while the fingerprint is still in the baseline —
 *     the justification is then nowhere the gate reads it;
 *   - a baseline file named only as a backticked path in a LATER cell of
 *     another file's row — a mention is not a row, and only a row's first cell
 *     names the file it justifies;
 *   - the "Justified entries" heading gone (renamed), and the doc itself gone;
 *   - after the 2026-08-07 retirement (baseline 25 → 0), the mechanism that
 *     replaced it: a `tenant-isolation-safe` marker with no reason, no markers
 *     at all (the gate measuring ∅ ⊆ ∅), and no server/ to scan.
 * The quiet cases are the near-misses that real doc already has: the table
 * sits under a `###` subsection, not directly under the `##` heading; one file
 * carries several fingerprints (kernel-observability.ts has four) and one row;
 * a row cell cites `path:lines` with a comma list; a row moved to "Resolved"
 * exactly as the gate's own remedy text says to; a later cell that opens with a
 * backticked token that is not a file (the deep-research-orchestrator row's
 * "| `getJobStatus`; its comment states…"), which every fixture row carries;
 * and "## Justified entries" as the doc's last `##` section, so the table runs
 * to end of file and the section regex's `$` branch is what ends it. And for
 * the marker branch:
 * a marker whose keyword is upper-cased, and bare markers inside
 * server/node_modules, server/dist and non-source files, none of which the
 * tenant-isolation scanner reads.
 *
 * Baseline semantics, in this gate's terms: the "reason" for a baseline entry
 * is its justification row. A justified entry suppresses; an unjustified one
 * fails; a justification for an entry that is gone (an over-allowance) fails.
 * The gate checks only that a row EXISTS for a file — an empty reason cell in
 * a row is not inspected — so that is not asserted here.
 *
 * Usage:
 *   node scripts/ci/check-baseline-justifications.selftest.mjs
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-baseline-justifications.selftest.mjs
 *     (run the cases against a different copy of the gate — the mutation check)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SELF = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(SELF), '..', '..');
const TAG = '[ci:tenant-isolation-justifications:selftest]';
const GATE_REL = path.join('scripts', 'ci', 'check-baseline-justifications.mjs');
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, GATE_REL);

const ROOT_DECL = /const repoRoot = [^;]+;/;
const gateSrc = fs.readFileSync(GATE, 'utf8');
if (!ROOT_DECL.test(gateSrc)) {
  // Without it the copy would judge the real tree, and every verdict below
  // would be about something else.
  console.error(`${TAG} cannot find \`const repoRoot = …;\` in ${GATE} — the selftest no longer knows how to point it at a fixture tree.`);
  process.exit(1);
}
// The gate's relative lib imports, copied beside the copy so they resolve to
// the real modules.
const LIB_IMPORTS = [...gateSrc.matchAll(/from '\.\/(lib\/[^']+)'/g)].map((m) => m[1]);

const BASELINE_REL = 'docs/reports/tenant-isolation-baseline.json';
const DOC_REL = 'docs/reports/tenant-isolation-justifications.md';

// Real baseline file names, so the fixtures read like the thing they model.
const KOBS = 'server/services/kernel-observability.ts';
const DRO = 'server/services/deep-research-orchestrator.ts';
const MAR = 'server/routes/module-access-requests.ts';
const LIC = 'server/routes/admin/licensing-history.ts';
const PVAULT = 'server/routes/c2c/project-vault.ts';

/** `file#hash:tables`, the scanner's fingerprint shape; `n` distinct hashes per file. */
function baseline(files) {
  const fingerprints = [];
  for (const [file, n = 1] of files) {
    for (let i = 0; i < n; i++) fingerprints.push(`${file}#${(0xa5493933404b + i).toString(16)}:ai_kernel_decision_records`);
  }
  return JSON.stringify({ generatedAt: '2026-09-28T01:50:47.171Z', fingerprints }, null, 2);
}

/**
 * The third cell of a row, as the real doc's deep-research-orchestrator row
 * writes it: it OPENS with a backticked token that is not a file. The gate
 * reads a file only from a row's FIRST cell (the `^` in its row regex); a gate
 * that takes any cell opening with a backtick reports a stale `getJobStatus`
 * row on every quiet parity case below, as it does on the real tree.
 */
const WHAT = '`getJobStatus`; its comment states org is "optional only for internal callers that just created the job".';

/**
 * A justification table row. `r` is the first cell's backticked text, or
 * `[cell, what]` to set the third cell too. (Ignores `map`'s index argument.)
 */
const row = (r) => {
  const [cell, what = WHAT] = Array.isArray(r) ? r : [r];
  return `| \`${cell}\` | 1 | ${what} | Frozen. Kernel stream. |`;
};

/**
 * The justifications doc in the real one's shape: prose, the `##` Justified
 * heading, a `###` dated subsection, prose, then the table; then `## Resolved`
 * and `## Standing follow-up`. `endsAtTable` stops the doc at the Justified
 * table's last row, so "Justified entries" is the last `##` section and the
 * gate's section regex has only end-of-file to stop at.
 */
function doc({ justified = [], resolved = [], heading = '## Justified entries (remain in baseline)', endsAtTable = false } = {}) {
  const head = `# Tenant-isolation baseline — justifications

Status as of 2026-08-07 (baseline driven to **zero**).

**Policy:** a new baseline entry additionally requires a row in the "Justified
entries" table below — enforced by \`scripts/ci/check-baseline-justifications.mjs\`.

${heading}

### 2026-09-06 — the optional-tenant-predicate rule, and what it surfaced

\`\`\`sql
WHERE ($1::INT IS NULL OR org_id = $1)
\`\`\`

**These entries are frozen, not blessed.**

| File | Entries | What the null case means, per the code | Disposition |
|---|---|---|---|
${justified.map(row).join('\n')}
`;
  if (endsAtTable) return head;
  return `${head}
Every previously-justified entry from before this date is dispositioned inline.

## Resolved (no longer in baseline)

### 2026-09-28 — \`admin/licensing-history.ts\` (1): dispositioned inline, and the baseline ratcheted 9 → 8

| File | Entries | What the null case means, per the code | Disposition |
|---|---|---|---|
${resolved.map(row).join('\n')}

## Standing follow-up

- Re-argue each frozen entry with its owner.
`;
}

/**
 * A server source file carrying one marker, on line 4. No import line: a
 * relative specifier in this file's text is something an import-resolving
 * gate could read as a real one.
 */
const src = (marker) => `type Pool = { query(text: string, values: unknown[]): Promise<unknown> };

export async function sweep(pool: Pool) {
  ${marker}
  return pool.query('SELECT id FROM users WHERE id = $1', [1]);
}
`;
const GOOD_MARKER = '// tenant-isolation-safe: users is a global identity table; the id is the caller’s own';

const cases = [
  // ── parity branch: the baseline is non-empty ─────────────────────────────
  {
    name: 'FAILS — a baseline entry with no justification row (an unwritten-down frozen entry)',
    files: {
      [BASELINE_REL]: baseline([[KOBS, 4], [MAR, 1]]),
      [DOC_REL]: doc({ justified: [KOBS] }),
    },
    expectExit: 1,
    expectIn: ['baseline entries with NO justification row', `- ${MAR}`],
    expectNotIn: [`- ${KOBS}`],
  },
  {
    name: 'FAILS — a stale row: the entry left the baseline, its row stayed in "Justified entries" (the 9 → 8 ratchet)',
    files: {
      [BASELINE_REL]: baseline([[KOBS, 4]]),
      [DOC_REL]: doc({ justified: [KOBS, `${LIC}:522`] }),
    },
    expectExit: 1,
    expectIn: ['justification rows for files NO LONGER in the baseline', `- ${LIC}`],
    expectNotIn: [`- ${KOBS}`],
  },
  {
    name: 'FAILS — the row was moved to "Resolved" while its fingerprint is still in the baseline',
    files: {
      [BASELINE_REL]: baseline([[KOBS, 4], [DRO, 1]]),
      [DOC_REL]: doc({ justified: [KOBS], resolved: [DRO] }),
    },
    expectExit: 1,
    expectIn: ['baseline entries with NO justification row', `- ${DRO}`],
  },
  {
    name: 'FAILS — a baseline file named only in a LATER cell of another file\'s row has no row of its own',
    files: {
      [BASELINE_REL]: baseline([[KOBS, 4], [MAR, 1]]),
      // The writer added the new file to the row they were already editing.
      // Only a row whose first cell is the file justifies it.
      [DOC_REL]: doc({
        justified: [[KOBS, `\`${MAR}\` reads the same roll-up with the same optional-org shape.`]],
      }),
    },
    expectExit: 1,
    expectIn: ['baseline entries with NO justification row', `- ${MAR}`],
    expectNotIn: [`- ${KOBS}`, 'OK'],
  },
  {
    name: 'FAILS — both directions in one run; neither report masks the other',
    files: {
      [BASELINE_REL]: baseline([[KOBS, 4], [MAR, 1]]),
      [DOC_REL]: doc({ justified: [KOBS, PVAULT] }),
    },
    expectExit: 1,
    expectIn: [
      'baseline entries with NO justification row', `- ${MAR}`,
      'justification rows for files NO LONGER in the baseline', `- ${PVAULT}`,
    ],
  },
  {
    name: 'FAILS — the baseline was ratcheted to zero but rows remain in "Justified entries"',
    files: {
      [BASELINE_REL]: baseline([]),
      [DOC_REL]: doc({ justified: [KOBS] }),
      'server/jobs/sweep.ts': src(GOOD_MARKER),
    },
    expectExit: 1,
    expectIn: ['justification rows for files NO LONGER in the baseline', `- ${KOBS}`],
  },
  {
    name: 'FAILS — the "## Justified entries" heading is gone (renamed), so no table is read',
    files: {
      [BASELINE_REL]: baseline([[KOBS, 4]]),
      [DOC_REL]: doc({ justified: [KOBS], heading: '## Justifications' }),
    },
    expectExit: 1,
    expectIn: ['"## Justified entries" section not found'],
  },
  {
    name: 'FAILS — the justifications doc is missing; that is not an empty table',
    files: { [BASELINE_REL]: baseline([[KOBS, 4]]) },
    expectExit: 1,
    expectIn: ['ENOENT', 'tenant-isolation-justifications.md'],
    expectNotIn: ['OK'],
  },
  {
    name: 'quiet — the real doc shape: table under a ### subsection, four fingerprints of one file, one row',
    files: {
      [BASELINE_REL]: baseline([[KOBS, 4], [DRO, 1], [MAR, 1]]),
      [DOC_REL]: doc({ justified: [KOBS, DRO, MAR] }),
    },
    expectExit: 0,
    // Counts source files, not fingerprints: 3, not 6. Every row's third
    // cell opens with `getJobStatus`, which is not a file and not stale.
    expectIn: ['OK — tenant-isolation baseline: 3 source file(s) all justified, no stale rows'],
  },
  {
    name: 'quiet — "## Justified entries" is the LAST ## section: the table runs to end of file',
    files: {
      [BASELINE_REL]: baseline([[KOBS, 4], [DRO, 1]]),
      [DOC_REL]: doc({ justified: [KOBS, DRO], endsAtTable: true }),
    },
    expectExit: 0,
    expectIn: ['OK — tenant-isolation baseline: 2 source file(s) all justified, no stale rows'],
  },
  {
    name: 'quiet — a row cell citing `path:lines` with a comma list still justifies the file',
    files: {
      [BASELINE_REL]: baseline([[KOBS, 4], [DRO, 1]]),
      [DOC_REL]: doc({ justified: [`${KOBS}:112,140,188,231`, `${DRO}:77`] }),
    },
    expectExit: 0,
    expectIn: ['2 source file(s) all justified'],
  },
  {
    name: 'quiet — a row moved to "Resolved" as the remedy says is not stale',
    files: {
      [BASELINE_REL]: baseline([[KOBS, 4]]),
      [DOC_REL]: doc({ justified: [KOBS], resolved: [`${LIC}:522`, PVAULT] }),
    },
    expectExit: 0,
    expectIn: ['1 source file(s) all justified, no stale rows'],
  },

  // ── retired branch: the baseline is empty, the inline markers carry it ───
  {
    name: 'FAILS — empty baseline, a bare `tenant-isolation-safe` marker with no colon',
    files: {
      [BASELINE_REL]: baseline([]),
      [DOC_REL]: doc(),
      'server/jobs/sweep.ts': src(GOOD_MARKER),
      'server/services/tenant/offboarding.ts': src('// tenant-isolation-safe'),
    },
    expectExit: 1,
    expectIn: ['marker(s) with no reason', '- server/services/tenant/offboarding.ts:4'],
    expectNotIn: ['server/jobs/sweep.ts'],
  },
  {
    name: 'FAILS — empty baseline, a marker with a colon and nothing after it',
    files: {
      [BASELINE_REL]: baseline([]),
      [DOC_REL]: doc(),
      'server/jobs/sweep.ts': src(GOOD_MARKER),
      'server/routes/admin/licensing-history.ts': src('// tenant-isolation-safe:   '),
    },
    expectExit: 1,
    expectIn: ['marker(s) with no reason', '- server/routes/admin/licensing-history.ts:4'],
  },
  {
    name: 'FAILS — empty baseline and no markers anywhere: the gate would be asserting ∅ ⊆ ∅',
    files: {
      [BASELINE_REL]: baseline([]),
      [DOC_REL]: doc(),
      'server/jobs/sweep.ts': src('// scoped by organization_id below'),
    },
    expectExit: 1,
    expectIn: ['the baseline is empty AND no inline suppressions exist'],
  },
  {
    name: 'FAILS — empty baseline and no server/ to scan: a missing root is not a clean scan',
    files: {
      [BASELINE_REL]: baseline([]),
      [DOC_REL]: doc(),
    },
    expectExit: 1,
    expectIn: ['required scan root(s) missing'],
    expectNotIn: ['OK'],
  },
  {
    name: 'quiet — empty baseline, every marker reasoned (.ts/.js/.mjs, keyword in any case), counted exactly',
    files: {
      // No `fingerprints` key at all is an empty baseline too.
      [BASELINE_REL]: JSON.stringify({ generatedAt: '2026-09-28T01:50:47.171Z' }),
      [DOC_REL]: doc(),
      'server/jobs/sweep.ts': src(GOOD_MARKER),
      'server/lib/legacy.js': src('// TENANT-ISOLATION-SAFE: bootstrap seed, runs before any tenant exists'),
      'server/scripts/repair.mjs': src('// tenant-isolation-safe : Stripe event_id is globally unique'),
    },
    expectExit: 0,
    expectIn: ['OK — baseline is empty', '3 inline tenant-isolation-safe suppression(s), every one with a reason'],
  },
  {
    name: 'quiet — bare markers in server/node_modules, server/dist and non-source files are not scanned',
    files: {
      [BASELINE_REL]: baseline([]),
      [DOC_REL]: doc(),
      'server/jobs/sweep.ts': src(GOOD_MARKER),
      'server/node_modules/pg-helper/index.js': src('// tenant-isolation-safe'),
      'server/dist/index.js': src('// tenant-isolation-safe:'),
      'server/README.md': 'Mark a safe query with `// tenant-isolation-safe` and a reason.\n',
      'server/fixtures/query.sql': '-- tenant-isolation-safe\nSELECT 1;\n',
    },
    expectExit: 0,
    expectIn: ['1 inline tenant-isolation-safe suppression(s), every one with a reason'],
  },
];

/** Run a copy of the gate whose repoRoot is a fresh fixture tree holding `files`. */
function runGate({ files }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-justifications-selftest-')));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    const gatePath = path.join(root, GATE_REL);
    fs.mkdirSync(path.dirname(gatePath), { recursive: true });
    fs.writeFileSync(gatePath, gateSrc.replace(ROOT_DECL, () => `const repoRoot = ${JSON.stringify(root)};`));
    for (const lib of LIB_IMPORTS) {
      const dest = path.join(path.dirname(gatePath), lib);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, 'scripts', 'ci', lib), dest);
    }
    const res = spawnSync(process.execPath, [gatePath], { cwd: root, encoding: 'utf8', timeout: 20_000 });
    if (res.error) return { code: -1, out: String(res.error) };
    return { code: res.status, out: `${res.stdout}${res.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (process.env.SELFTEST_GATE_PATH) console.log(`${TAG} testing ${GATE} (SELFTEST_GATE_PATH)`);

let failed = 0;
for (const c of cases) {
  const { code, out } = runGate(c);
  const missing = c.expectIn.filter((s) => !out.includes(s));
  // expectNotIn is checked against the finding bullets for file names, and
  // against the whole output for verdict words like 'OK'.
  const bullets = out.split('\n').filter((l) => l.trimStart().startsWith('- ')).join('\n');
  const leaked = (c.expectNotIn ?? []).filter((s) => (s === 'OK' ? out.includes('] OK') : bullets.includes(s)));
  const ok = code === c.expectExit && missing.length === 0 && leaked.length === 0;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
  if (!ok) {
    failed++;
    if (code !== c.expectExit) console.log(`      expected exit ${c.expectExit}, got ${code}`);
    for (const s of missing) console.log(`      output lacked: ${JSON.stringify(s)}`);
    for (const s of leaked) console.log(`      output should not have had: ${JSON.stringify(s)}`);
    console.log(out.trimEnd().split('\n').map((l) => `      | ${l}`).join('\n'));
  }
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold against ${GATE.startsWith(repoRoot + path.sep) ? path.relative(repoRoot, GATE) : GATE}.`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
