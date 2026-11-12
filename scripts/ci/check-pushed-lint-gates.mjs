#!/usr/bin/env node
/**
 * ci.yml's Lint-job gates, run at push time, refusing what the push itself brings.
 *
 * ── Why (2026-11-12, MR-02 Stage 3 holding trunk CI) ────────────────────────
 * A full run of ci.yml's Lint job at trunk's head found 5 red guardrail steps:
 * - ci:error-envelope;
 * - ci:internals-in-copy;
 * - ci:empty-state-honesty;
 * - ci:success-before-ok;
 * - ci:tenant-isolation:no-regression.
 * Each was brought by a lane's push in the previous two days, and no push was
 * refused. 113 of the job's 130 steps run commands .husky/pre-push never runs.
 * CI answers about 47 hours late, so each red sat on trunk until someone re-ran
 * the job by hand. Those gates, leaving out their selftests and the proof tier,
 * take about two minutes all told: they were left out of the hook, not kept out
 * for cost.
 *
 * ── What it runs ────────────────────────────────────────────────────────────
 * The Lint job's steps, read from .github/workflows/ci.yml on every run, so a
 * gate added to the job is run here without anyone editing this file. A step
 * is taken when every line of its `run:` is `npm run [--silent|-s] <script>`
 * or `node scripts/ci/<file>`, and none of its commands is:
 * - already in .husky/pre-push;
 * - a selftest or a test suite (CI still runs them);
 * - in SLOW (the proof tier, the ESLint ratchet, the full typechecks).
 *
 * ── What it refuses ─────────────────────────────────────────────────────────
 * A failing gate's output is read for the file paths it names. Each is
 * compared with the files this push changes (lib/push-range.mjs), by path
 * suffix, since some gates print paths relative to client/src.
 * - A failing gate that names a file this push changes, or whose own script
 *   or ci.yml the push changes, is the push's: it is refused (exit 1).
 * - A failing gate that names only other files is trunk's red. It is reported
 *   by name, with its files, and does not refuse: blocking every lane on one
 *   lane's red is what MR-02's landing gate (F-7) decides, not this.
 * CI still runs every gate over the whole tree. This is the part of it that
 * stops a red at the push that brings it.
 *
 * ── Fail closed ─────────────────────────────────────────────────────────────
 * ci.yml unreadable, or no Lint job, or no gate selected: exit 1. A push with no
 * comparable upstream ref runs every gate and refuses any red, since nothing
 * can be told apart.
 *
 * Usage:
 *   node scripts/ci/check-pushed-lint-gates.mjs              # against the upstream ref
 *   node scripts/ci/check-pushed-lint-gates.mjs --base REF   # against an explicit ref
 *   node scripts/ci/check-pushed-lint-gates.mjs --list       # print the gates it would run
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { changedSince, git, resolvePushBase } from './lib/push-range.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TAG = '[ci:pushed-lint-gates]';
const WORKFLOW = '.github/workflows/ci.yml';
/**
 * Not gates over the tree at push time. CI runs them:
 * - the proof tier (about 18 minutes);
 * - the ESLint ratchet, which reads the Run ESLint step's output;
 * - the full typechecks, which the hook runs diff-scoped as ci:pushed-typecheck.
 */
export const SLOW = new Set(['test:proof-tier', 'ci:eslint-ratchet', 'ci:typecheck:no-regression', 'beta:typecheck']);
/** Selftests prove a gate script; test suites are tests. Neither is a gate over the tree. */
const SELFTEST = /:(?:selftest|self-test)$|selftest\.mjs$|^test:|:test$/;
const COMMAND = /^(?:npm run (?:--silent |-s )?([\w:.@/-]+)|node (scripts\/ci\/[\w./-]+\.m?js)(?:\s+[\w=./-]+)*)$/;

/** The commands of one `run:` block, or null when any line is not a plain gate command. */
export function gateCommands(run) {
  const lines = String(run).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) return null;
  const out = [];
  for (const line of lines) {
    const m = COMMAND.exec(line);
    if (!m) return null;
    out.push({ line, id: m[1] ?? m[2] });
  }
  return out;
}

/** The Lint-job steps this gate runs: [{ name, commands, env }]. */
export function selectGates(workflow, hookText) {
  const steps = workflow?.jobs?.lint?.steps;
  if (!Array.isArray(steps)) return null;
  const gates = [];
  for (const step of steps) {
    if (typeof step?.run !== 'string') continue;
    const commands = gateCommands(step.run);
    if (!commands) continue;
    if (commands.some((c) => SELFTEST.test(c.id) || SLOW.has(c.id) || hookText.includes(c.id))) continue;
    gates.push({ name: step.name ?? commands.map((c) => c.line).join(' && '), commands, env: step.env ?? {} });
  }
  return gates;
}

/** Repository paths a gate's output names (`a/b.ts`, `a/b.ts:12`, `client/src`-relative too). */
export function namedPaths(output) {
  const found = new Set();
  for (const m of String(output).matchAll(/(?:^|[\s([`'"=:])((?:\.{0,2}\/)?[\w@.-]+(?:\/[\w@.[\]-]+)+\.[a-z]{1,5})(?::\d+)?/gim)) {
    found.add(m[1].replace(/^\.\//, '').replace(/^\/+/, ''));
  }
  return [...found];
}

/** The changed files a gate's named paths point at (suffix match either way). */
export function attribute(paths, changed) {
  const hits = new Set();
  for (const p of paths) {
    for (const c of changed) {
      if (c === p || c.endsWith(`/${p}`) || p.endsWith(`/${c}`)) hits.add(c);
    }
  }
  return [...hits];
}

/** The script files a gate's commands run, as repository paths (for "the push changed the gate itself"). */
export function gateFiles(commands, scripts) {
  const files = [];
  for (const c of commands) {
    const target = c.id.startsWith('scripts/') ? c.id : scripts?.[c.id];
    for (const m of String(target ?? '').matchAll(/(scripts\/[\w./-]+\.m?[jt]s)/g)) files.push(m[1]);
  }
  return files;
}

/**
 * The verdict over the gates' results. results: [{ name, ok, output, files }]; changed: string[] | null.
 * Returns { refuse: [...], trunk: [...] }.
 */
export function decide(results, changed) {
  const refuse = [];
  const trunk = [];
  for (const r of results.filter((x) => !x.ok)) {
    if (changed === null) { refuse.push({ ...r, why: 'no upstream to compare with, so every red is refused' }); continue; }
    const mine = attribute(namedPaths(r.output), changed);
    const ownGate = r.files.filter((f) => changed.includes(f)).concat(changed.includes(WORKFLOW) ? [WORKFLOW] : []);
    if (mine.length || ownGate.length) refuse.push({ ...r, why: mine.length ? `names ${mine.join(', ')}` : `this push changes ${ownGate.join(', ')}` });
    else trunk.push(r);
  }
  return { refuse, trunk };
}

function runOne(gate) {
  return new Promise((resolve) => {
    const script = gate.commands.map((c) => c.line).join(' && ');
    const env = { ...process.env, ...Object.fromEntries(Object.entries(gate.env).map(([k, v]) => [k, String(v)])) };
    const child = spawn('bash', ['-o', 'pipefail', '-c', script], { cwd: ROOT, env });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (code) => resolve({ name: gate.name, ok: code === 0, output }));
    child.on('error', (err) => resolve({ name: gate.name, ok: false, output: String(err) }));
  });
}

async function runAll(gates, width = 3) {
  const results = [];
  let next = 0;
  const lanes = Array.from({ length: Math.min(width, gates.length) }, async () => {
    while (next < gates.length) {
      const i = next++;
      results[i] = await runOne(gates[i]);
    }
  });
  await Promise.all(lanes);
  return results;
}

/** Where some gates write their latest report as they run (the route-mount audit, the orphaned-endpoints audit). */
export const REPORTS = /^docs\/reports\//;

/** Tracked files with changes in the working tree, or null when git cannot say. */
function dirtyTracked() {
  const out = git(['diff', '--name-only']);
  return out === null ? null : new Set(out.split('\n').filter(Boolean));
}

/**
 * Files the gates' run rewrote: those clean before and changed after. A report under docs/reports/ is put back, so
 * a push leaves the tree as it found it. Anything else is named, never reverted: it may be the pusher's own edit.
 */
export function rewrittenByGates(before, after) {
  const written = [...after].filter((f) => !before.has(f));
  return { restore: written.filter((f) => REPORTS.test(f)), other: written.filter((f) => !REPORTS.test(f)) };
}

function excerpt(output, max = 12) {
  const lines = String(output).split('\n').filter((l) => l.trim());
  return lines.slice(0, max).map((l) => `      ${l.slice(0, 220)}`).join('\n');
}

async function main(argv) {
  let workflow;
  try {
    workflow = createRequire(path.join(ROOT, 'package.json'))('yaml').parse(fs.readFileSync(path.join(ROOT, WORKFLOW), 'utf8'));
  } catch (err) {
    console.error(`${TAG} FAIL — ${WORKFLOW} could not be read (${err.message}). Nothing was checked.`);
    return 1;
  }
  const hookText = fs.readFileSync(path.join(ROOT, '.husky/pre-push'), 'utf8');
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts ?? {};
  const gates = selectGates(workflow, hookText);
  if (!gates || gates.length === 0) {
    console.error(`${TAG} FAIL — no Lint-job gate was found in ${WORKFLOW}. Nothing was checked.`);
    return 1;
  }
  if (argv.includes('--list')) {
    for (const g of gates) console.log(`${g.name}\n    ${g.commands.map((c) => c.line).join(' && ')}`);
    console.log(`${TAG} ${gates.length} gate(s).`);
    return 0;
  }
  const base = resolvePushBase(argv);
  const changed = base ? changedSince(base) : null;
  const t0 = Date.now();
  const before = dirtyTracked();
  const results = (await runAll(gates)).map((r, i) => ({ ...r, files: gateFiles(gates[i].commands, scripts) }));
  const after = dirtyTracked();
  if (before && after) {
    const { restore, other } = rewrittenByGates(before, after);
    if (restore.length) {
      spawnSync('git', ['checkout', '--', ...restore], { cwd: ROOT });
      console.log(`${TAG} put back ${restore.length} report(s) the gates rewrote: ${restore.join(', ')}`);
    }
    if (other.length) console.log(`${TAG} changed while the gates ran (left as they are): ${other.join(', ')}`);
  }
  const { refuse, trunk } = decide(results, changed);
  const seconds = Math.round((Date.now() - t0) / 1000);
  console.log(`${TAG} ${gates.length} Lint-job gate(s) run in ${seconds}s; ${results.filter((r) => !r.ok).length} red.`);
  for (const r of trunk) {
    console.log(`${TAG} red on trunk, not from this push: ${r.name}`);
    console.log(excerpt(r.output, 6));
  }
  if (refuse.length) {
    console.error(`\n${TAG} FAIL — ${refuse.length} gate(s) of CI's Lint job are red on what this push brings:`);
    for (const r of refuse) {
      console.error(`  • ${r.name} (${r.why})`);
      console.error(excerpt(r.output));
    }
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
