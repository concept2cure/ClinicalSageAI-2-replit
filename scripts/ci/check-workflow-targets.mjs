#!/usr/bin/env node
/**
 * CI Guard: a workflow step must not invoke a repo path that does not exist.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `.github/workflows/nightly-contradiction-scan.yml` ran
 *
 *     python -m shadow_service.nightly_scan
 *
 * every night at 03:00 UTC and failed every night with `No module named
 * shadow_service.nightly_scan`. The module was deleted months earlier by
 * b79f020e1 ("surgical dead code purge — 670 files removed, build verified"),
 * which removed 221 files under shadow_service/ and left the workflow that
 * calls into it. "Build verified" did not cover a scheduled workflow, because
 * nothing links a workflow's command line to the tree it runs against.
 *
 * A scan of the other nineteen workflows found the same shape eight more times
 * — an entire purged directory (ind_automation/), four validator scripts, a
 * staging verifier, a smoke test, a requirements file. Two of those workflows
 * only trigger on `main` or on pull requests, neither of which this repository
 * uses, so they had never once been observed to fail. That is worse than a red
 * light: it is a step nobody knows is broken until the day they press the
 * button.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * For every step, each of these must resolve to something on disk:
 *
 *   • `working-directory:`             (step, job default, or workflow default)
 *   • `pip install -r <file>`
 *   • `python -m <a.b.c>`              — only when `a` is a directory in the
 *                                        repo, so `python -m pytest` is left
 *                                        alone
 *   • any `…/name.{py,sh,mjs,cjs,sql}` token in a `run:` block
 *
 * Resolution follows the step's working directory, and a leading `cd X &&` on
 * the same line, so `cd ind_automation && pip install -r requirements.txt` is
 * checked against `ind_automation/requirements.txt` and not the root manifest.
 *
 * ── What it deliberately does not flag ──────────────────────────────────────
 * A path the step guards with its own existence test (`[ -f x ]`, `test -f x`)
 * is intentionally optional — neon-preview-db.yml probes for two .sql files it
 * knows may be absent and says so in a notice. Flagging those would put honest
 * code in the report, which is how a report stops being read. Shell comments are
 * stripped for the same reason: that same workflow explains the guarded probe in
 * a comment one step later, and reading the explanation as a call would flag the
 * file the guard exists to make optional. Expressions (`${{ … }}`), globs, and
 * bare filenames with no directory part are skipped: the first two cannot be
 * resolved statically, and the third is ambiguous.
 *
 * Exit 0 — every referenced path exists, or is baselined with a reason.
 * Exit 1 — a new dead reference appeared, or a baselined one changed.
 *
 * Usage:
 *   node scripts/ci/check-workflow-targets.mjs
 *   node scripts/ci/check-workflow-targets.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflowDir = path.join(repoRoot, '.github/workflows');
const baselinePath = path.join(repoRoot, 'docs/reports/workflow-target-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');

/** A path token that names a script or manifest, with a directory part. */
const SCRIPT_TOKEN = /(?<![\w${}/-])((?:[\w.-]+\/)+[\w.-]+\.(?:py|sh|mjs|cjs|sql))(?![\w-])/g;
const PIP_REQUIREMENTS = /pip\s+install\s+(?:[^\n]*?\s)?-r\s+(\S+)/g;
const PYTHON_MODULE = /python3?\s+-m\s+([A-Za-z_][\w.]*)/g;
const CD_PREFIX = /(?:^|&&|;)\s*cd\s+([^\s&;|]+)\s*&&/;

const unresolvable = (p) => /\$\{\{|\*|\?|\$\(/.test(p);

/** Steps, with the working directory each one actually runs in. */
function stepsOf(doc) {
  const out = [];
  const workflowDefault = doc?.defaults?.run?.['working-directory'];
  for (const job of Object.values(doc?.jobs ?? {})) {
    const jobDefault = job?.defaults?.run?.['working-directory'] ?? workflowDefault;
    for (const step of job?.steps ?? []) {
      out.push({
        run: typeof step?.run === 'string' ? step.run : '',
        cwd: step?.['working-directory'] ?? jobDefault ?? '.',
      });
    }
  }
  return out;
}

/** Paths this step tests for before using — optional by construction. */
function guardedPaths(run) {
  return new Set([...run.matchAll(/(?:\[\[?|test)\s+-[efdrsx]\s+"?([^\s"\]]+)"?/g)].map((m) => m[1]));
}

/** Every repo path a step names, already resolved against its cwd. */
function referencedPaths(step) {
  const guarded = guardedPaths(step.run);
  const refs = [];
  const add = (raw, kind, cwd) => {
    if (!raw || unresolvable(raw) || guarded.has(raw)) return;
    const rel = path.normalize(path.join(cwd, raw));
    if (rel.startsWith('..')) return;
    refs.push({ rel, kind, raw });
  };

  add(step.cwd === '.' ? null : step.cwd, 'working-directory', '.');

  for (const raw of step.run.split('\n')) {
    // A comment is prose about a call, not a call.
    const line = raw.replace(/(^|\s)#.*$/, '');
    const cd = CD_PREFIX.exec(line);
    const cwd = cd && !unresolvable(cd[1]) ? path.join(step.cwd, cd[1]) : step.cwd;
    for (const m of line.matchAll(SCRIPT_TOKEN)) add(m[1], 'script', cwd);
    for (const m of line.matchAll(PIP_REQUIREMENTS)) add(m[1], 'pip -r', cwd);
    for (const m of line.matchAll(PYTHON_MODULE)) {
      const segments = m[1].split('.');
      // Only a module that lives in this tree: `python -m pytest` is a
      // dependency, not a repo path, and must not be flagged.
      if (!fs.existsSync(path.join(repoRoot, cwd, segments[0]))) continue;
      const base = path.join(cwd, ...segments);
      const found = [`${base}.py`, path.join(base, '__init__.py')].some((c) =>
        fs.existsSync(path.join(repoRoot, c)),
      );
      if (!found) refs.push({ rel: `${base}.py`, kind: 'python -m', raw: m[1] });
    }
  }
  return refs;
}

const findings = [];
for (const name of fs.readdirSync(workflowDir).sort()) {
  if (!/\.ya?ml$/.test(name)) continue;
  let doc;
  try {
    doc = yaml.load(fs.readFileSync(path.join(workflowDir, name), 'utf8'));
  } catch (e) {
    console.error(`[ci:workflow-targets] ${name} is not parseable YAML: ${e.message}`);
    process.exit(1);
  }
  for (const step of stepsOf(doc)) {
    for (const ref of referencedPaths(step)) {
      if (fs.existsSync(path.join(repoRoot, ref.rel))) continue;
      const key = `${name} -> ${ref.rel}`;
      if (!findings.some((f) => f.key === key)) findings.push({ key, kind: ref.kind });
    }
  }
}

if (writeBaseline) {
  const existing = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { entries: {} };
  const entries = {};
  for (const f of findings) {
    entries[f.key] = {
      kind: f.kind,
      reason: existing.entries?.[f.key]?.reason ?? 'TODO: state why this is safe, or fix it.',
    };
  }
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        _comment:
          'Workflow steps that invoke a repo path which does not exist, per ' +
          'scripts/ci/check-workflow-targets.mjs. Every entry needs a REASON naming why ' +
          'the step is still here. These are not safe — each one fails the moment its ' +
          'workflow runs. This list may shrink, never grow.',
        entries,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`[ci:workflow-targets] baseline written — ${Object.keys(entries).length} entries`);
  process.exit(0);
}

const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  : { entries: {} };

const problems = findings
  .filter((f) => !baseline.entries?.[f.key])
  .map((f) => `  NEW  ${f.key} (${f.kind}) — the workflow invokes it; it does not exist`);

// The ratchet may only shrink: a baselined entry whose path now exists, or whose
// workflow is gone, must be removed from the list rather than left to rot.
for (const key of Object.keys(baseline.entries ?? {})) {
  if (!findings.some((f) => f.key === key)) {
    problems.push(`  STALE  ${key} — baselined, but no longer found; drop it from the baseline`);
  }
}

console.log(
  `[ci:workflow-targets] ${findings.length} dead reference(s); ${
    Object.keys(baseline.entries ?? {}).length
  } baselined`,
);

if (problems.length > 0) {
  console.log('\n[ci:workflow-targets] FAILED\n');
  console.log(problems.join('\n'));
  console.log(
    '\n  Fix by restoring the file, or by deleting the step that calls it.\n' +
      '  If the step must stay broken for now, baseline it WITH A REASON:\n' +
      '      npm run ci:workflow-targets:write-baseline\n',
  );
  process.exit(1);
}

console.log('[ci:workflow-targets] OK');
