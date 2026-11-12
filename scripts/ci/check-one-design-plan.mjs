#!/usr/bin/env node
/**
 * ci:one-design-plan — nobody builds outside the one plan (CLAUDE.md RULE 5,
 * docs/design/ONE_DESIGN_PLAN.md, founder decision P-78, 2026-10-31).
 *
 * For every commit being pushed that descends from the plan's introduction
 * (the commit that added docs/design/one-design-plan.json), merges aside:
 *
 *   1. it names a package — a `Plan: <ID>` trailer — that exists in the ledger
 *      and is `open` (not queued, closed or parked);
 *   2. every file it changes lies inside that package's `paths` (tests,
 *      docs/evidence/** and .design/** are always allowed);
 *   3. it adds no screen (a UI_SURFACES id or a SURFACE_VIEWS entry), no API
 *      mount (an /api/… path registered in server/bootstrap or server/index.ts)
 *      and no table (CREATE TABLE in a new migration, for a name no existing
 *      migration creates) unless the ledger's approvedAdditions lists it under
 *      that package;
 *   4. a change to the plan itself — the plan, its ledger, this gate, or the
 *      rule files every tool reads — is `Plan: PLAN` with a
 *      `Founder-Decision: P-<n>` trailer;
 *   5. RULE 6 (founder decision P-80, 2026-11-01: "no agent is allowed to build
 *      anything new … they're allowed to continue and finish and conclude with
 *      brilliant working UI everything that's in place"): it names what it
 *      finishes — one or more `Completes: <path>` trailers, each a file or
 *      folder that existed before the commit — and it adds no route file, no
 *      service (a new folder, or a new file directly, under server/services/ or
 *      services/) and no AnA tool (a name new to the AnA tool inventory)
 *      unless approvedAdditions lists it. PLAN commits are exempt from the
 *      trailer. Only commits after RULE 6's introduction (the ledger's
 *      "completesRequired") are asked for it.
 *   6. P-122 (2026-11-10, "rendering a shell or 10% of what we built"): it
 *      removes no screen — a deleted file under client/src/concept2cure/*\/surfaces/,
 *      a UI_SURFACES id or a SURFACE_VIEWS entry — unless it carries a
 *      `Founder-Decision: P-<n>` trailer.
 *
 * There is no bypass. RULE 0 held only once its bypass was removed; a rule
 * whose escape hatch is printed in its own refusal is a suggestion.
 *
 *   node scripts/ci/check-one-design-plan.mjs                 # origin/concept2cure-v2..HEAD
 *   node scripts/ci/check-one-design-plan.mjs --range A..B
 *   node scripts/ci/check-one-design-plan.mjs --selftest      # see check-one-design-plan.selftest.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEDGER_PATH = 'docs/design/one-design-plan.json';
const REGISTRY_FILE = /^shared\/constants\/ui-surface-registry[^/]*\.ts$/;
const VIEWS_FILE = 'client/src/concept2cure/v2/surfaceViews.ts';
const MOUNT_FILE = /^server\/(bootstrap\/[^/]+\.ts|index\.ts)$/;
const MIGRATION_FILE = /^(migrations|db\/migrations)\/.+\.sql$/;
const ROUTE_FILE = /^server\/(routes|api)\/.+\.(ts|mts|js|mjs)$/;
const SERVICE_FILE = /^(server\/services|services)\/([^/]+)(\/)?/;
const TEST_FILE = /(^|\/)(__tests__|__mocks__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$|\.fixture\.[cm]?[jt]s$/;
const SCREEN_FILE = /^client\/src\/concept2cure\/[^/]+\/surfaces\/[^/]+\.tsx$/;
export const ANA_TOOL_INVENTORY = 'server/services/ana/ana-launch-scope.inventory.json';

/* ── Pure core ─────────────────────────────────────────────────────────── */

/** `**`, `*`, `?` and `{a,b}` globs over repository paths. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      re += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const matchesAny = (file, globs) => globs.some((g) => globToRegExp(g).test(file));

export function trailers(message) {
  const plan = /^Plan:\s*(\S+)\s*$/m.exec(message)?.[1] ?? null;
  const decision = /^Founder-Decision:\s*(P-\d+)\s*$/m.exec(message)?.[1] ?? null;
  const completes = [...message.matchAll(/^Completes:\s*(\S+)\s*$/gm)].map((m) => m[1].replace(/\/+$/, ''));
  return { plan, decision, completes };
}

/**
 * commit: { sha, message, files: [{status, path}], additions: [{kind, name}],
 *           completesRequired?: boolean, completesMissing?: string[] }
 * Returns findings: [{ sha, reason }]. Empty means the commit is inside the plan.
 */
export function evaluateCommit(ledger, commit) {
  const out = [];
  const say = (reason) => out.push({ sha: commit.sha, reason });
  const { plan, decision, completes } = trailers(commit.message);
  if (!plan) {
    say('names no package: add a "Plan: <ID>" trailer naming an open package of docs/design/one-design-plan.json');
    return out;
  }
  const pkg = ledger.packages.find((p) => p.id === plan);
  if (!pkg) { say(`names package "${plan}", which the plan does not have`); return out; }
  if (pkg.status !== 'open') say(`names package ${plan}, which is ${pkg.status}${pkg.dependsOn?.length ? ` (it waits on ${pkg.dependsOn.join(', ')})` : ''}`);

  const planFilesTouched = commit.files.filter((f) => ledger.planFiles.includes(f.path)).map((f) => f.path);
  if (planFilesTouched.length && (plan !== 'PLAN' || !decision)) {
    say(`changes the plan (${planFilesTouched.join(', ')}): only "Plan: PLAN" with a "Founder-Decision: P-<n>" trailer may`);
  }
  const outside = commit.files
    .map((f) => f.path)
    .filter((p) => !ledger.planFiles.includes(p) && !matchesAny(p, ledger.alwaysAllowed) && !matchesAny(p, pkg.paths));
  if (outside.length) say(`changes files outside package ${plan}: ${outside.slice(0, 8).join(', ')}${outside.length > 8 ? ` and ${outside.length - 8} more` : ''}`);

  if (commit.completesRequired && plan !== 'PLAN') {
    if (!completes.length) say('names nothing it completes (RULE 6: nothing new, finish what exists): add a "Completes: <path>" trailer naming the existing file or folder this work finishes');
    for (const p of commit.completesMissing ?? []) say(`"Completes: ${p}" names nothing that existed before this commit (RULE 6)`);
  }
  // P-122 (2026-11-10): nothing a screen showed is removed without a founder decision.
  if (!decision) {
    for (const r of commit.removals ?? []) say(`removes a ${r.kind} "${r.name}" (P-122: nothing a screen showed is removed without a founder decision): add a "Founder-Decision: P-<n>" trailer naming the decision that removes it`);
  }
  for (const a of commit.additions) {
    const approved = ledger.approvedAdditions.some((x) => x.kind === a.kind && x.name === a.name && x.package === plan);
    if (!approved) say(`adds a ${a.kind} "${a.name}" the plan does not approve under ${plan} (approvedAdditions)`);
  }
  return out;
}

export function evaluate(ledger, commits) {
  return commits.flatMap((c) => evaluateCommit(ledger, c));
}

/* ── What a commit adds, read from file contents ───────────────────────── */

export const registryIds = (text) => new Set([...text.matchAll(/^\s*id:\s*'([a-z0-9][a-z0-9-]*)',?\s*$/gm)].map((m) => m[1]));
export const viewKeys = (text) => new Set([...text.matchAll(/^\s*'?([a-z0-9][a-z0-9-]*)'?\s*:\s*\{\s*component\s*:/gm)].map((m) => m[1]));
export const mountPaths = (text) => new Set([...text.matchAll(/(?:path:\s*|app\.use\(\s*)['"`](\/api\/[^'"`\s]+)['"`]/g)].map((m) => m[1]));
export const createdTables = (text) => new Set([...text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-z_][a-z0-9_]*)"?\.)?"?([a-z_][a-z0-9_]*)"?/gi)]
  .map((m) => `${(m[1] ?? 'public').toLowerCase()}.${m[2].toLowerCase()}`));

const diffSet = (after, before) => [...after].filter((x) => !before.has(x));

/** Every tool name in the AnA tool inventory (in scope or held for a hidden app). */
export function anaToolNames(text) {
  let doc;
  try { doc = JSON.parse(text || '{}'); } catch { return new Set(); }
  const tools = doc?.tools ?? {};
  const inScope = Array.isArray(tools.inScope) ? tools.inScope : [];
  const hidden = Array.isArray(tools.hiddenApp) ? tools.hiddenApp.flatMap((g) => (Array.isArray(g?.names) ? g.names : [])) : [];
  return new Set([...inScope, ...hidden].filter((n) => typeof n === 'string'));
}

/* ── The git layer ─────────────────────────────────────────────────────── */

function git(cwd, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}
const show = (cwd, rev, file) => git(cwd, ['show', `${rev}:${file}`], { allowFail: true }) ?? '';
const existsAt = (cwd, rev, file) => git(cwd, ['cat-file', '-e', `${rev}:${file}`], { allowFail: true }) !== null;

function additionsOf(cwd, sha, files, rule6 = false) {
  const parent = `${sha}^`;
  const out = [];
  for (const f of files) {
    if (f.status === 'D') continue;
    if (REGISTRY_FILE.test(f.path)) {
      for (const id of diffSet(registryIds(show(cwd, sha, f.path)), registryIds(show(cwd, parent, f.path)))) out.push({ kind: 'surface', name: id });
    } else if (f.path === VIEWS_FILE) {
      for (const id of diffSet(viewKeys(show(cwd, sha, f.path)), viewKeys(show(cwd, parent, f.path)))) out.push({ kind: 'surface', name: id });
    } else if (MOUNT_FILE.test(f.path)) {
      for (const p of diffSet(mountPaths(show(cwd, sha, f.path)), mountPaths(show(cwd, parent, f.path)))) out.push({ kind: 'mount', name: p });
    } else if (rule6 && f.path === ANA_TOOL_INVENTORY) {
      for (const n of diffSet(anaToolNames(show(cwd, sha, f.path)), anaToolNames(show(cwd, parent, f.path)))) out.push({ kind: 'ana-tool', name: n });
    } else if (rule6 && f.status === 'A' && ROUTE_FILE.test(f.path) && !TEST_FILE.test(f.path)) {
      out.push({ kind: 'route', name: f.path });
    } else if (rule6 && f.status === 'A' && SERVICE_FILE.test(f.path) && !TEST_FILE.test(f.path)) {
      const [, root, first, slash] = SERVICE_FILE.exec(f.path);
      const service = slash ? `${root}/${first}` : f.path;
      if (!slash || !existsAt(cwd, parent, service)) out.push({ kind: 'service', name: service });
    } else if (f.status === 'A' && MIGRATION_FILE.test(f.path)) {
      for (const t of createdTables(show(cwd, sha, f.path))) {
        const [, name] = t.split('.');
        const existing = git(cwd, ['grep', '-l', '-i', '-E', `create table (if not exists )?("?[a-z_]+"?\\.)?"?${name}"?([^a-z0-9_]|$)`, parent, '--', 'migrations', 'db/migrations'], { allowFail: true });
        if (!existing) out.push({ kind: 'table', name: t });
      }
    }
  }
  // A surface is one addition whether the registry, the views map or both name it.
  return out.filter((a, i) => out.findIndex((b) => b.kind === a.kind && b.name === a.name) === i);
}

/** What a commit removes from the screens (P-122): a deleted screen file, a UI_SURFACES id, a SURFACE_VIEWS entry. */
function removalsOf(cwd, sha, files) {
  const parent = `${sha}^`;
  const out = [];
  for (const f of files) {
    if (f.status === 'D' && SCREEN_FILE.test(f.path) && !TEST_FILE.test(f.path)) out.push({ kind: 'screen file', name: f.path });
    else if (REGISTRY_FILE.test(f.path)) {
      for (const id of diffSet(registryIds(show(cwd, parent, f.path)), registryIds(show(cwd, sha, f.path)))) out.push({ kind: 'surface', name: id });
    } else if (f.path === VIEWS_FILE) {
      for (const id of diffSet(viewKeys(show(cwd, parent, f.path)), viewKeys(show(cwd, sha, f.path)))) out.push({ kind: 'surface', name: id });
    }
  }
  return out.filter((a, i) => out.findIndex((b) => b.kind === a.kind && b.name === a.name) === i);
}

/** The commits a push carries that the plan governs, with what each adds. */
export function collectCommits({ cwd, range }) {
  const intro = git(cwd, ['log', '--format=%H', '--diff-filter=A', '--', LEDGER_PATH]).trim().split('\n').filter(Boolean).pop();
  if (!intro) return { intro: null, commits: [] };
  // RULE 6 applies from the commit that put "completesRequired" into the ledger.
  const rule6 = git(cwd, ['log', '--format=%H', '-S', '"completesRequired"', '--', LEDGER_PATH], { allowFail: true })?.trim().split('\n').filter(Boolean).pop() ?? null;
  const shas = git(cwd, ['rev-list', '--no-merges', '--reverse', range]).trim().split('\n').filter(Boolean);
  const commits = [];
  for (const sha of shas) {
    if (sha === intro) continue;
    if (git(cwd, ['merge-base', '--is-ancestor', intro, sha], { allowFail: true }) === null) continue;
    const message = git(cwd, ['log', '-1', '--format=%B', sha]);
    const files = git(cwd, ['diff-tree', '--no-commit-id', '-r', '--name-status', '-M', sha]).trim().split('\n').filter(Boolean).map((line) => {
      const parts = line.split('\t');
      const status = parts[0][0];
      return { status, path: parts[parts.length - 1] };
    });
    const completesRequired = Boolean(rule6) && sha !== rule6 && git(cwd, ['merge-base', '--is-ancestor', rule6, sha], { allowFail: true }) !== null;
    const completesMissing = completesRequired ? trailers(message).completes.filter((p) => !existsAt(cwd, `${sha}^`, p)) : [];
    commits.push({ sha, message, files, additions: additionsOf(cwd, sha, files, completesRequired), removals: removalsOf(cwd, sha, files), completesRequired, completesMissing });
  }
  return { intro, commits };
}

export function loadLedger(cwd, rev = null) {
  const text = rev ? show(cwd, rev, LEDGER_PATH) : fs.readFileSync(path.join(cwd, LEDGER_PATH), 'utf8');
  return JSON.parse(text);
}

export function run({ cwd, range }) {
  const { intro, commits } = collectCommits({ cwd, range });
  if (!intro) return { checked: 0, findings: [] };
  // The ledger as the pushed tip holds it: a plan change rides with the work it permits only under PLAN.
  const ledger = loadLedger(cwd, 'HEAD');
  return { checked: commits.length, findings: evaluate(ledger, commits) };
}

/* ── CLI ───────────────────────────────────────────────────────────────── */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    // A child process: the selftest imports this module, so importing it from here would wait on itself.
    const selftest = fileURLToPath(new URL('./check-one-design-plan.selftest.mjs', import.meta.url));
    try {
      execFileSync(process.execPath, [selftest], { stdio: 'inherit' });
    } catch {
      process.exit(1);
    }
  } else {
    const i = args.indexOf('--range');
    const range = i >= 0 ? args[i + 1] : 'origin/concept2cure-v2..HEAD';
    const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const { checked, findings } = run({ cwd, range });
    if (findings.length) {
      console.error(`ci:one-design-plan: ${findings.length} finding(s) in ${checked} commit(s) — work outside the one plan (CLAUDE.md RULE 5, docs/design/ONE_DESIGN_PLAN.md):`);
      for (const f of findings) console.error(`  ${f.sha.slice(0, 10)}  ${f.reason}`);
      console.error('  Reword or split the commit so it names an open package and stays inside it. If the plan itself is wrong, that is the founder\'s decision.');
      process.exit(1);
    }
    console.log(`ci:one-design-plan: OK — ${checked} commit(s) inside the plan.`);
  }
}
