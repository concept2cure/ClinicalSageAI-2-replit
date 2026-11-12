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
 * refused. 113 of the job's 130 steps ran commands .husky/pre-push never ran.
 * CI answers about 47 hours late, so each red sat on trunk until someone re-ran
 * the job by hand.
 *
 * ── What it runs ────────────────────────────────────────────────────────────
 * The Lint job's steps, read from .github/workflows/ci.yml on every run, so a
 * gate added to the job is run here with no edit to this file. A step takes
 * part when every line of its `run:` is `npm run [--silent|-s] <script>` or
 * `node scripts/ci/<file>`. Then each of its commands runs, except one that is:
 * - already run by .husky/pre-push (by exact name, outside comments);
 * - a selftest or a test suite (`:selftest`, `--self-test`, `test:…`, `…:test`),
 *   which CI still runs;
 * - in SLOW (the proof tier, the ESLint ratchet, the full typechecks).
 *
 * ── Whose red it is ─────────────────────────────────────────────────────────
 * The gates run on what is pushed: HEAD, checked out in a temporary git
 * worktree. An uncommitted edit is not pushed, so it is not read. Nor is a
 * worktree nested in the repository (an agent's, under .claude/worktrees/),
 * which repo-walking gates would read as a second copy of every migration and
 * dependency: on 2026-11-12 three gates refused a push that changed one
 * Markdown file. Each red gate is then run again on the base, the commit this
 * push lands on, in a second temporary worktree:
 * - green on the base: this push brought the red, so it is refused;
 * - red on both, naming a tracked or changed file now that it did not name on
 *   the base: this push added to it, so it is refused;
 * - red on both, with nothing new: trunk's red. It is named, with its first
 *   lines, and does not refuse. Whether one lane's red blocks every lane is
 *   MR-02 Stage 2's landing-gate decision (F-7), not this gate's.
 * The base is the upstream ref. On a detached HEAD or a branch without one, it
 * is origin/concept2cure-v2, the only place RULE 0 lets a push land.
 *
 * When the base cannot be checked out, a red is the push's if its output names
 * a file the push changes (deleted and renamed ones too), or if the push changes
 * the gate's script or ci.yml. With no base at all, every red is refused: no
 * comparison can be made.
 *
 * ── Never touches the working tree ──────────────────────────────────────────
 * Two gates rewrite reports under docs/reports/ as they run. They do it inside
 * the temporary worktrees, which are removed afterwards. HEAD that cannot be
 * checked out is a failure: nothing was checked.
 *
 * Usage:
 *   node scripts/ci/check-pushed-lint-gates.mjs              # against the upstream ref
 *   node scripts/ci/check-pushed-lint-gates.mjs --base REF   # against an explicit ref
 *   node scripts/ci/check-pushed-lint-gates.mjs --list       # print the gates it would run
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { git, resolvePushBase } from './lib/push-range.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TAG = '[ci:pushed-lint-gates]';
const WORKFLOW = '.github/workflows/ci.yml';
const CANONICAL = 'origin/concept2cure-v2';
/** Not gates over the tree at push time; CI runs them. */
export const SLOW = new Set(['test:proof-tier', 'ci:eslint-ratchet', 'ci:typecheck:no-regression', 'beta:typecheck']);
/** Selftests prove a gate script; test suites are tests. Neither is a gate over the tree. */
const SELFTEST_ID = /:(?:selftest|self-test)$|selftest\.mjs$|^test:|:test$/;
const SELFTEST_LINE = /\s--self-?test\b/;
const COMMAND = /^(?:npm run (?:--silent |-s )?([\w:.@/-]+)|node (scripts\/ci\/[\w./-]+\.m?js)(?:\s+[\w=./-]+)*)$/;
/** Where gates write their latest report as they run. */

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

/**
 * What the hook itself runs: each `npm run <script>` and `node scripts/ci/<file>` on a line that is not a comment,
 * by exact name. A name the hook only mentions in a comment, or one that is a prefix of a name it runs, is not run.
 */
export function hookCommands(hookText) {
  const code = String(hookText).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  return new Set([
    ...[...code.matchAll(/npm run (?:--silent |-s )?([\w:.@/-]+)/g)].map((m) => m[1]),
    ...[...code.matchAll(/node (scripts\/ci\/[\w./-]+\.m?js)/g)].map((m) => m[1]),
  ]);
}

/** Whether one command is a gate this runs: not a selftest, a test suite, a slow tool, or the hook's own. */
export function runsHere(command, inHook) {
  return !(SELFTEST_ID.test(command.id) || SELFTEST_LINE.test(command.line) || SLOW.has(command.id) || inHook.has(command.id));
}

/** The Lint-job gates this runs: [{ name, commands, env }], each step keeping only the commands that run here. */
export function selectGates(workflow, hookText) {
  const steps = workflow?.jobs?.lint?.steps;
  if (!Array.isArray(steps)) return null;
  const inHook = hookCommands(hookText);
  const gates = [];
  for (const step of steps) {
    if (typeof step?.run !== 'string') continue;
    const all = gateCommands(step.run);
    if (!all) continue;
    const commands = all.filter((c) => runsHere(c, inHook));
    if (!commands.length) continue;
    gates.push({ name: step.name ?? commands.map((c) => c.line).join(' && '), commands, env: step.env ?? {} });
  }
  return gates;
}

/** Repository paths a gate's output names (`a/b.ts`, `a/b.ts:12`, client/src-relative too), with `roots` stripped. */
export function namedPaths(output, roots = []) {
  let text = String(output);
  for (const r of roots) if (r) text = text.split(`${r.replace(/\/+$/, '')}/`).join('');
  const found = new Set();
  for (const m of text.matchAll(/(?:^|[\s([`'"=:])((?:\.{0,2}\/)?[\w@.-]+(?:\/[\w@.[\]-]+)+\.[a-z]{1,5})(?::\d+)?/gim)) {
    found.add(m[1].replace(/^\.\//, '').replace(/^\/+/, ''));
  }
  return [...found];
}

/** The files among `files` that a named path points at (suffix match either way). */
export function attribute(paths, files) {
  const hits = new Set();
  for (const p of paths) {
    for (const c of files) {
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
 * The verdict over the gates' results.
 * - results: [{ name, ok, output, files }] at HEAD;
 * - onBase: Map name → { ok, output } for the reds run again on the base, or null when the base was not checked out;
 * - changed: files the push changes (deleted and renamed included), or null when there is no base;
 * - known: (path) → whether it is a tracked or changed file (for "names a file it did not name before");
 * - roots: absolute roots to strip from outputs.
 * Returns { refuse: [...], trunk: [...] }.
 */
export function decide(results, { onBase = null, changed = null, known = () => true, roots = [] } = {}) {
  const refuse = [];
  const trunk = [];
  for (const r of results.filter((x) => !x.ok)) {
    const before = onBase?.get(r.name);
    if (before) {
      if (before.ok) { refuse.push({ ...r, why: 'green before this push, red after it' }); continue; }
      const was = new Set(namedPaths(before.output, roots));
      const fresh = namedPaths(r.output, roots).filter((p) => !was.has(p) && known(p));
      if (fresh.length) refuse.push({ ...r, why: `red before this push too, and now also names ${fresh.slice(0, 5).join(', ')}` });
      else trunk.push(r);
      continue;
    }
    if (changed === null) { refuse.push({ ...r, why: 'no base to compare with, so every red is refused' }); continue; }
    const mine = attribute(namedPaths(r.output, roots), changed);
    const ownGate = r.files.filter((f) => changed.includes(f)).concat(changed.includes(WORKFLOW) ? [WORKFLOW] : []);
    if (mine.length || ownGate.length) refuse.push({ ...r, why: mine.length ? `names ${mine.join(', ')}` : `this push changes ${ownGate.join(', ')}` });
    else trunk.push(r);
  }
  return { refuse, trunk };
}

/** The base ref: the upstream, else origin/concept2cure-v2 (RULE 0's only destination), else null. */
export function resolveBase(argv, { pushBase = resolvePushBase, exists = (ref) => git(['rev-parse', '--verify', '--quiet', ref]) !== null } = {}) {
  return pushBase(argv) ?? (exists(CANONICAL) ? CANONICAL : null);
}

/** Paths the push changes against `base`, deleted and both sides of a rename included; null when git cannot say. */
function changedFiles(base) {
  const out = git(['diff', '--name-only', '--no-renames', '--diff-filter=ACDMR', `${base}...HEAD`]);
  return out === null ? null : out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function runOne(gate, cwd) {
  return new Promise((resolve) => {
    const script = gate.commands.map((c) => c.line).join(' && ');
    const env = { ...process.env, ...Object.fromEntries(Object.entries(gate.env).map(([k, v]) => [k, String(v)])) };
    const child = spawn('bash', ['-o', 'pipefail', '-c', script], { cwd, env });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (code) => resolve({ name: gate.name, ok: code === 0, output }));
    child.on('error', (err) => resolve({ name: gate.name, ok: false, output: String(err) }));
  });
}

async function runAll(gates, cwd, width = 3) {
  const results = [];
  let next = 0;
  const lanes = Array.from({ length: Math.min(width, gates.length) }, async () => {
    while (next < gates.length) {
      const i = next++;
      results[i] = await runOne(gates[i], cwd);
    }
  });
  await Promise.all(lanes);
  return results;
}

/** Run `gates` on `ref` in a temporary worktree: { results, map: Map name → result, both null when it could not be made, tree }. */
async function runAt(gates, ref, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-pushed-lint-gates-'));
  const tree = path.join(dir, name);
  try {
    if (spawnSync('git', ['worktree', 'add', '--quiet', '--detach', tree, ref], { cwd: ROOT }).status !== 0) return { results: null, map: null, tree };
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tree, 'node_modules'));
    const results = await runAll(gates, tree);
    return { results, map: new Map(results.map((r) => [r.name, r])), tree };
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', tree], { cwd: ROOT });
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
  spawnSync('git', ['worktree', 'prune'], { cwd: ROOT });
  const base = resolveBase(argv);
  const changed = base ? changedFiles(base) : null;
  const t0 = Date.now();

  const head = await runAt(gates, 'HEAD', 'head');
  if (!head.results) {
    console.error(`${TAG} FAIL — HEAD could not be checked out in a temporary worktree. Nothing was checked.`);
    return 1;
  }
  const results = head.results.map((r, i) => ({ ...r, files: gateFiles(gates[i].commands, scripts) }));

  const reds = results.filter((r) => !r.ok);
  let onBase = null;
  let baseTree = null;
  if (reds.length && base) {
    const redGates = gates.filter((g) => reds.some((r) => r.name === g.name));
    const ran = await runAt(redGates, base, 'base');
    onBase = ran.map;
    baseTree = ran.tree;
    if (!onBase) console.log(`${TAG} the base (${base}) could not be checked out; reds are judged by the files they name.`);
  }
  const tracked = new Set((git(['ls-files']) ?? '').split('\n').filter(Boolean).concat(changed ?? []));
  const known = (p) => tracked.has(p) || attribute([p], [...tracked]).length > 0;
  const { refuse, trunk } = decide(results, { onBase, changed, known, roots: [head.tree, baseTree, ROOT] });
  const seconds = Math.round((Date.now() - t0) / 1000);
  console.log(`${TAG} ${gates.length} Lint-job gate(s) run in ${seconds}s; ${reds.length} red${onBase ? `, each run again on ${base}` : ''}.`);
  for (const r of trunk) {
    console.log(`${TAG} red on ${base} already, not from this push: ${r.name}`);
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
