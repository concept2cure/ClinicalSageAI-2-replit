#!/usr/bin/env node
/**
 * check-unapproved-model-pins.mjs — no new pin to a model that is not approved
 * for high-risk regulatory work.
 *
 * The gateway refuses an unapproved model only when a request's task type is
 * high-risk (document_drafting, or regulatory_review without a declared
 * low/medium risk — approved-models.ts isHighRiskRequest). A call that pins
 * `model: 'gpt-4o'` as a `general` request is served by that model whatever it
 * drafts. On 2026-09-23 every such pin in server code was classified — reached
 * or not, governed output or not — and the governed ones were fixed
 * (docs/evidence/MODEL-GOVERNANCE/2026-09-23/after/pin-sweep-classification.md).
 * The rest are listed in the baseline, each with the reason it stays.
 *
 * This gate keeps that list closed:
 *   - a pin in a file the baseline does not list fails;
 *   - a file with more pins than its baseline count fails;
 *   - a file with FEWER pins fails too, so the baseline is tightened in the
 *     same change that removes one and cannot quietly regain it;
 *   - a baseline entry with no written reason fails.
 *
 * A "pin" is a string literal naming a chat model that is not a Claude Opus
 * model, assigned to `model` / `defaultModel` / `*_MODEL`. Comments are
 * stripped first. The registry and governance definitions themselves, the eval
 * harness and tests are not scanned.
 *
 * Usage:
 *   node scripts/ci/check-unapproved-model-pins.mjs
 *   node scripts/ci/check-unapproved-model-pins.mjs --self-test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = 'scripts/ci/unapproved-model-pins-baseline.json';
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '__tests__']);

/**
 * `model: 'x'`, `defaultModel = "x"`, `EMBED_MODEL: 'x'`, and a default behind
 * `||` / `??` (`model: options.model || 'x'`) — the literal is captured.
 */
const PIN = /\b(?:model|defaultModel|[A-Z_]*MODEL)\s*[:=]\s*(?:[\w.?]+\s*(?:\|\||\?\?)\s*)?['"`]([^'"`]+)['"`]/g;
/** Chat model families that are not approved for high-risk work. */
const UNAPPROVED = /^(gpt-|o[134](-|$)|chatgpt|claude-(3|sonnet|haiku|instant|2)|claude-[\d.-]*(sonnet|haiku)|kimi|moonshot|llama|mistral|mixtral|gemini|command-r)/i;

function isExcluded(rel) {
  const p = rel.split(path.sep).join('/');
  return (
    !p.startsWith('server/') ||
    p.startsWith('server/services/ai-gateway/') ||
    p.startsWith('server/services/ai-governance/') ||
    p.startsWith('server/eval/') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(p)
  );
}

/** Comments blanked, strings kept (scripts/ci/lib/strip-comments.mjs). */
const codeOnly = stripComments;

/** { 'server/x.ts': [{ line, model }] } for every pin under root. */
export function findPins(root) {
  const out = {};
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full);
        continue;
      }
      if (!/\.[cm]?[jt]sx?$/.test(e.name)) continue;
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (isExcluded(rel)) continue;
      codeOnly(fs.readFileSync(full, 'utf8'))
        .split('\n')
        .forEach((text, i) => {
          for (const m of text.matchAll(PIN)) {
            if (!UNAPPROVED.test(m[1])) continue;
            (out[rel] ??= []).push({ line: i + 1, model: m[1] });
          }
        });
    }
  };
  walk(path.join(root, 'server'));
  return out;
}

/** Problems with the pins found, measured against the baseline. */
export function compare(pins, baseline) {
  const problems = [];
  for (const [file, entry] of Object.entries(baseline)) {
    if (!entry || typeof entry.reason !== 'string' || entry.reason.trim().length < 20) {
      problems.push(`${file}: baseline entry has no written reason`);
    }
    const found = pins[file]?.length ?? 0;
    if (found < entry.count) {
      problems.push(
        `${file}: ${found} pin(s), baseline says ${entry.count} — tighten the baseline to ${found} in this change`,
      );
    }
  }
  for (const [file, list] of Object.entries(pins)) {
    const allowed = baseline[file]?.count ?? 0;
    if (list.length > allowed) {
      const where = list.map((p) => `${file}:${p.line} (${p.model})`).join(', ');
      problems.push(`${file}: ${list.length} pin(s), baseline allows ${allowed} — ${where}`);
    }
  }
  return problems;
}

function checkRepo() {
  const baseline = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, BASELINE), 'utf8')).files;
  const problems = compare(findPins(REPO_ROOT), baseline);
  if (problems.length === 0) {
    const total = Object.values(baseline).reduce((n, e) => n + e.count, 0);
    console.log(`✓ unapproved-model-pins: ${total} known pin(s), each with a recorded reason; no new ones`);
    return 0;
  }
  console.error(`✗ unapproved-model-pins: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\nA pinned unapproved model serves any non-high-risk request, whatever it drafts. For\n' +
      'regulatory drafting or review, drop the pin and pass taskType document_drafting or\n' +
      `regulatory_review. Otherwise add the file to ${BASELINE} with the reason it is safe.`,
  );
  return 1;
}

function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-pins-'));
  const put = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  const reason = 'display metadata only; the gateway routes by task type';
  const cases = [
    ['control — an Opus pin', () => put('server/a.ts', "ai.chat({ model: 'claude-opus-4', messages });\n"), {}, 0],
    ['control — an embedding model', () => put('server/a.ts', "embed({ model: 'text-embedding-3-small' });\n"), {}, 0],
    ['control — a comment names a model', () => put('server/a.ts', "// was model: 'gpt-4o'\n/* model: 'gpt-4o' */\nconst a = 1;\n"), {}, 0],
    ['control — a test file', () => put('server/services/__tests__/a.test.ts', "chat({ model: 'gpt-4o' });\n"), {}, 0],
    ['control — the gateway registry', () => put('server/services/ai-gateway/gateway.ts', "{ model: 'gpt-4o' }\n"), {}, 0],
    ['control — a baselined pin, with its reason', () => put('server/b.ts', "chat({ model: 'gpt-4o' });\n"), { 'server/b.ts': { count: 1, reason } }, 0],
    ['a new pin in an unlisted file', () => put('server/api/draft.ts', "await ai.chat({ model: 'gpt-4o', messages });\n"), {}, 1],
    ['a Sonnet pin', () => put('server/api/draft.ts', "route({ model: 'claude-sonnet-4-6' });\n"), {}, 1],
    ['a constant pin', () => put('server/api/draft.ts', "const DRAFT_MODEL = 'gpt-4-turbo';\n"), {}, 1],
    ['a default behind ||', () => put('server/api/draft.js', "ai.chat({ model: options.model || 'gpt-4o', messages });\n"), {}, 1],
    ['a default behind ??', () => put('server/api/draft.js', "ai.chat({ model: opts?.model ?? 'claude-sonnet-4' });\n"), {}, 1],
    ['a second pin in a baselined file', () => put('server/b.ts', "chat({ model: 'gpt-4o' });\nchat({ model: 'gpt-4o-mini' });\n"), { 'server/b.ts': { count: 1, reason } }, 1],
    ['a baseline that was not tightened', () => put('server/b.ts', 'const a = 1;\n'), { 'server/b.ts': { count: 1, reason } }, 1],
    ['a baseline entry with no reason', () => put('server/b.ts', "chat({ model: 'gpt-4o' });\n"), { 'server/b.ts': { count: 1, reason: '' } }, 1],
  ];
  let failures = 0;
  for (const [name, setup, baseline, expect] of cases) {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    setup();
    const flagged = compare(findPins(root), baseline).length > 0 ? 1 : 0;
    const ok = flagged === expect;
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : expect ? '  — NOT CAUGHT' : '  — false positive'}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
  if (failures) {
    console.error(`\n✗ self-test: ${failures} case(s) wrong`);
    return 1;
  }
  console.log(`\n✓ self-test: ${cases.length} cases, every violation caught and the controls clean`);
  return 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes('--self-test') ? selfTest() : checkRepo());
}
