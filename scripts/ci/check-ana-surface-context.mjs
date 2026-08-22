#!/usr/bin/env node
/**
 * CI gate: AnA's screen-awareness does not regress, and its adoption ratchets.
 *
 * ── THE GAP THIS EXISTS FOR ─────────────────────────────────────────────────
 * A surface tells AnA what it is showing by calling `usePublishSurfaceContext`
 * (client/src/concept2cure/v2/surfaceContext.ts). The shell forwards that as
 * `module_context` on every turn, and the server renders it into the system
 * prompt (server/services/ana-ri/surface-context-block.ts).
 *
 * The pipeline was completed end to end — publisher, transport, consumer — and
 * then THREE surfaces out of 118 called the publisher. On the other 115, AnA
 * was handed a live conversation and an empty screen: she could be asked "what
 * should I do next?" on a page whose contents she could not see, and would
 * answer from the surface id alone. That is worse than no assistant, because
 * it looks like one.
 *
 * Nothing detected that. The publisher shipped, the consumer shipped, both were
 * tested, and the thing between them — surfaces actually calling it — was
 * nobody's test.
 *
 * ── WHY A RATCHET AND NOT A HARD REQUIREMENT ────────────────────────────────
 * Requiring all 118 today would fail the build on day one and be reverted by
 * lunchtime, which protects nothing (the same reasoning the eslint step in
 * .github/workflows/pr-checks.yml records for its warning backlog). So the
 * gate holds a BASELINE: adoption may rise, and may never fall. A surface that
 * stops publishing is a regression and fails; the backlog is reported, not
 * failed.
 *
 * Raise BASELINE as surfaces are wired. It is meant to reach 0 remaining.
 *
 * Usage:
 *   node scripts/ci/check-ana-surface-context.mjs
 *   node scripts/ci/check-ana-surface-context.mjs --json
 *   node scripts/ci/check-ana-surface-context.mjs --list   # what is still unwired
 *
 * Exit 0 — adoption is at or above the baseline. Exit 1 — it fell.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_MODE = process.argv.includes('--json');
const LIST_MODE = process.argv.includes('--list');

const SURFACES_DIR = 'client/src/concept2cure/v2/surfaces';
const PUBLISHER = 'usePublishSurfaceContext';

/**
 * Surfaces publishing screen state today. RAISE THIS as surfaces are wired;
 * never lower it to make a build pass — a fall means a surface went silent.
 */
const BASELINE = 19;

/**
 * Surfaces that legitimately publish nothing, with the reason.
 *
 * Kept deliberately short. "It is not built yet" is NOT a reason to be here —
 * that is the backlog, which this gate reports rather than excuses.
 */
const NO_CONTEXT_NEEDED = {
  ClientPortal: 'external-participant surface that deliberately offers no assistant',
  ConversationThread: 'the conversation itself — its context is the thread',
  AnaCommand: 'AnA rail surface; its subject is AnA, not a screen under discussion',
  AnaMemory: 'AnA rail surface; renders what AnA already holds',
  Coverage: 'engineering diagnostic, not a customer capability',
};

function surfaceFiles() {
  const dir = path.join(repoRoot, SURFACES_DIR);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    .sort();
}

/**
 * Every surface id the registry actually routes to.
 *
 * The publisher keys its context by id and the reader returns NOTHING unless
 * that key matches the active surface — so an id the registry does not know is
 * a silent no-op: the surface publishes, the shell reads past it, and AnA is
 * still looking at a blank screen. Read from the registry rather than listed
 * here, so a renamed surface cannot leave a stale allowlist behind.
 */
function registrySurfaceIds() {
  const candidates = ['surfaceViews.tsx', 'surfaceViews.ts'];
  for (const f of candidates) {
    const full = path.join(repoRoot, 'client/src/concept2cure/v2', f);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf8');
    const ids = new Set();
    for (const m of src.matchAll(/^\s*'([a-z0-9-]+)':/gm)) ids.add(m[1]);
    for (const m of src.matchAll(/^\s*([a-z0-9-]+):\s*\{/gm)) ids.add(m[1]);
    if (ids.size > 0) return ids;
  }
  return null;
}

const REGISTRY_IDS = registrySurfaceIds();

const publishing = [];
const unwired = [];
/** Surfaces that call the publisher with an id the registry does not route. */
const badIds = [];

for (const file of surfaceFiles()) {
  const name = file.replace(/\.tsx$/, '');
  if (name in NO_CONTEXT_NEEDED) continue;
  const src = fs.readFileSync(path.join(repoRoot, SURFACES_DIR, file), 'utf8');

  /* A CALL with a literal id, not a mention.
     This was `src.includes(PUBLISHER)`, which counted a file that merely
     imported the publisher, or called it with a typo'd id, as wired — so the
     number this gate reports could exceed the number of surfaces AnA can
     actually see. Every surface wired to date passes a string literal, so
     requiring one costs nothing and closes both holes. */
  const calls = [...src.matchAll(/usePublishSurfaceContext\(\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
  if (calls.length === 0) {
    unwired.push(name);
    continue;
  }
  publishing.push(name);
  if (REGISTRY_IDS) {
    for (const id of calls) {
      if (!REGISTRY_IDS.has(id)) badIds.push(`${name} publishes as '${id}', which the registry does not route`);
    }
  }
}

const failures = [];
for (const b of badIds) {
  failures.push(`${b} — the shell reads context by surface id, so this publishes into nothing`);
}
if (publishing.length < BASELINE) {
  failures.push(
    `adoption fell to ${publishing.length}, below the baseline of ${BASELINE} — ` +
      'a surface stopped publishing its screen state to AnA',
  );
}

// A stale exclusion implies a decision that no longer applies.
const present = new Set(surfaceFiles().map((f) => f.replace(/\.tsx$/, '')));
for (const [name, reason] of Object.entries(NO_CONTEXT_NEEDED)) {
  if (!present.has(name)) failures.push(`${name}: declared as needing no context but no longer exists`);
  else if (!reason || reason.trim().length < 10) failures.push(`${name}: declared with no usable reason`);
}

const summary = {
  publishing: publishing.length,
  unwired: unwired.length,
  exempt: Object.keys(NO_CONTEXT_NEEDED).length,
  baseline: BASELINE,
};

if (JSON_MODE) {
  console.log(JSON.stringify({ summary, publishing, unwired, failures }, null, 2));
} else if (LIST_MODE) {
  console.log(`\nSurfaces not yet publishing screen state to AnA (${unwired.length}):\n`);
  for (const n of unwired) console.log(`  ${n}`);
  console.log('');
} else if (failures.length === 0) {
  console.log(
    `\n[ci:ana-surface-context] OK — ${summary.publishing} surface(s) publish screen state ` +
      `(baseline ${BASELINE}), ${summary.unwired} still to wire, ${summary.exempt} exempt.\n` +
      (summary.unwired > 0
        ? `  On those ${summary.unwired}, AnA is asked about a screen she cannot see.\n` +
          '  Run with --list to see them.\n'
        : ''),
  );
} else {
  console.error(`\n[ci:ana-surface-context] FAIL — ${failures.length} issue(s):\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    '\nA surface that takes the shell conversation and publishes nothing leaves AnA\n' +
      'answering about a screen she cannot see. Restore the publish call, or — if the\n' +
      'surface genuinely needs no context — declare it in NO_CONTEXT_NEEDED with a reason.\n',
  );
}

process.exit(failures.length === 0 ? 0 : 1);
