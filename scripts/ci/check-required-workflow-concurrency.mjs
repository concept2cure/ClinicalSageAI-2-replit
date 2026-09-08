#!/usr/bin/env node
/**
 * CI Guard: a workflow the release-evidence policy REQUIRES must not cancel
 * its own run when the next commit lands on the canonical branch.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `config/release-evidence-policy.v1.json` names nine jobs a release candidate
 * requires, four of them in sibling workflows (CodeQL ×2, Semgrep, Tier 5).
 * ci.yml's `assemble-release-evidence` job waits for the sibling run AT THIS
 * COMMIT'S SHA and packages its conclusion verbatim; `cli.mjs validate` then
 * rejects any manifest whose required job did not succeed. That chain is
 * correct and fails closed, exactly as designed.
 *
 * What it cannot see is a scan that was never allowed to finish. codeql.yml and
 * semgrep.yml both carried
 *
 *     group: codeql-${{ github.workflow }}-${{ github.ref }}
 *     cancel-in-progress: true
 *
 * — a group keyed on the REF, so every push to `concept2cure-v2` cancelled the
 * previous commit's security analysis. In the seventeen hours to
 * 2026-09-06T01:04Z, **74 of the last 100 canonical-branch CodeQL runs ended
 * `cancelled`**. Each of those 74 commits failed the release-evidence gate with
 *
 *     required workflow CodeQL/Analyze (CodeQL javascript-typescript) is cancelled
 *
 * and could not produce a release-evidence package at all. Only whichever
 * commit happened to be last in a burst was ever scanned.
 *
 * Two harms, stated separately because they are not equally severe. The
 * certain one: per-commit release evidence — the artifact this repository
 * assembles for regulatory review — was unobtainable for roughly three commits
 * in four, and no amount of re-running fixes it after the fact. The secondary
 * one, which is how this survived: the gate was red on most commits for a
 * reason that had nothing to do with the commit, so a red release-evidence job
 * read as background noise to every session that saw it. That is the same
 * defect as ledger L78 and L130 one layer up — a check whose failure carries no
 * information stops being read, and then a real failure is invisible too.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * For every workflow named in the policy's `requiredJobs[].workflow`:
 *
 *   • no `concurrency:` block, or `cancel-in-progress: false` → nothing can be
 *     cancelled, PASS;
 *   • otherwise the `group` expression, rendered for two DIFFERENT commits on
 *     the canonical branch, must produce two DIFFERENT groups.
 *
 * The group is rendered, not pattern-matched: `${{ … }}` segments are evaluated
 * against a synthetic `github` context (canonical ref, two SHAs) by a small
 * evaluator covering the subset GitHub expressions use here — context lookups,
 * string literals, `==`, `!=`, `&&`, `||`. Anything outside that subset is a
 * NAMED REFUSAL, never a silent pass: an unreadable group on a required
 * workflow is exactly the case this guard exists to catch.
 *
 * Behaviour on other refs is deliberately not constrained. Pull requests
 * produce no release evidence (`assemble-release-evidence` is gated on
 * `github.ref == 'refs/heads/concept2cure-v2'`), so superseding an in-flight
 * scan there is a legitimate economy.
 *
 * `--self-test` feeds the checker the exact pre-fix workflow shape and a few
 * near-miss variants and requires it to reject each one, so the detection logic
 * cannot rot into a check that has only ever been seen to pass.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW_DIR = path.join(ROOT, '.github/workflows');
const POLICY = path.join(ROOT, 'config/release-evidence-policy.v1.json');
const CI_WORKFLOW = path.join(ROOT, '.github/workflows/ci.yml');

/** The one branch that ships (CLAUDE.md Rule 0) and the only ref that assembles
 *  release evidence. Asserted against ci.yml below rather than trusted. */
const CANONICAL_BRANCH = 'concept2cure-v2';

export class ConcurrencyGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConcurrencyGuardError';
  }
}

// ── A very small GitHub-expressions evaluator ───────────────────────────────
// Covers exactly what a concurrency group needs: `github.*` lookups, single
// quoted strings, `==`, `!=`, `&&`, `||`. GitHub's `&&`/`||` return operands,
// not booleans, which is what makes the `cond && a || b` ternary work.

const truthy = value => value !== '' && value !== false && value !== null && value !== undefined;

function evaluate(expression, ctx, where) {
  const tokens = [];
  const source = expression.trim();
  for (let i = 0; i < source.length; ) {
    const ch = source[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === "'") {
      const end = source.indexOf("'", i + 1);
      if (end === -1) throw new ConcurrencyGuardError(`${where}: unterminated string literal in "${source}"`);
      tokens.push({ type: 'value', value: source.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const twoChar = source.slice(i, i + 2);
    if (twoChar === '&&' || twoChar === '||' || twoChar === '==' || twoChar === '!=') {
      tokens.push({ type: 'op', value: twoChar });
      i += 2;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(source.slice(i));
    if (!word) {
      throw new ConcurrencyGuardError(
        `${where}: concurrency group uses an expression this guard cannot read ("${source}", at "${source.slice(i, i + 12)}"). ` +
        'Refusing rather than assuming it is safe — extend scripts/ci/check-required-workflow-concurrency.mjs.',
      );
    }
    const name = word[0];
    if (!Object.prototype.hasOwnProperty.call(ctx, name)) {
      throw new ConcurrencyGuardError(
        `${where}: concurrency group reads "${name}", which this guard does not model. ` +
        'Refusing rather than assuming it varies per commit.',
      );
    }
    tokens.push({ type: 'value', value: ctx[name] });
    i += word[0].length;
  }
  if (tokens.length === 0) throw new ConcurrencyGuardError(`${where}: empty expression`);

  // Left-to-right over ==/!= first, then && and || — enough for `a == b && c || d`.
  const fold = (list, ops, apply) => {
    const out = [list[0]];
    for (let i = 1; i < list.length; i += 2) {
      const op = list[i];
      if (op?.type !== 'op') throw new ConcurrencyGuardError(`${where}: malformed expression "${source}"`);
      const right = list[i + 1];
      if (right === undefined) throw new ConcurrencyGuardError(`${where}: expression "${source}" ends in an operator`);
      if (ops.includes(op.value)) out[out.length - 1] = { type: 'value', value: apply(out[out.length - 1].value, op.value, right.value) };
      else out.push(op, right);
    }
    return out;
  };
  let list = fold(tokens, ['==', '!='], (a, op, b) => (op === '==' ? a === b : a !== b));
  list = fold(list, ['&&'], (a, _op, b) => (truthy(a) ? b : a));
  list = fold(list, ['||'], (a, _op, b) => (truthy(a) ? a : b));
  if (list.length !== 1) throw new ConcurrencyGuardError(`${where}: could not reduce expression "${source}"`);
  return list[0].value;
}

export function renderGroup(group, ctx, where) {
  if (typeof group !== 'string') throw new ConcurrencyGuardError(`${where}: concurrency group is not a string`);
  let out = '';
  let i = 0;
  for (;;) {
    const start = group.indexOf('${{', i);
    if (start === -1) { out += group.slice(i); break; }
    out += group.slice(i, start);
    const end = group.indexOf('}}', start);
    if (end === -1) throw new ConcurrencyGuardError(`${where}: unterminated \${{ in concurrency group`);
    out += String(evaluate(group.slice(start + 3, end), ctx, where));
    i = end + 2;
  }
  return out;
}

const contextFor = (workflowName, sha) => ({
  'github.workflow': workflowName,
  'github.ref': `refs/heads/${CANONICAL_BRANCH}`,
  'github.ref_name': CANONICAL_BRANCH,
  'github.sha': sha,
  'github.run_id': '1',
  'github.event_name': 'push',
});

/**
 * @returns {string[]} findings; empty means the invariant holds.
 */
export function checkConcurrency({ workflows }) {
  const findings = [];
  for (const { workflowName, file, doc } of workflows) {
    const where = `${file} ("${workflowName}")`;
    const concurrency = doc?.concurrency;
    if (concurrency === undefined || concurrency === null) continue; // nothing cancels anything
    if (typeof concurrency === 'string') {
      // Shorthand form is a bare group with cancel-in-progress defaulting to false.
      continue;
    }
    const cancel = concurrency['cancel-in-progress'];
    if (cancel === false || cancel === undefined) continue;
    if (cancel !== true && !(typeof cancel === 'string' && cancel.includes('${{'))) {
      findings.push(`${where}: cancel-in-progress is "${cancel}", which this guard cannot read as true, false or an expression.`);
      continue;
    }
    const a = renderGroup(concurrency.group, contextFor(workflowName, 'a'.repeat(40)), where);
    const b = renderGroup(concurrency.group, contextFor(workflowName, 'b'.repeat(40)), where);
    if (a === b) {
      findings.push(
        `${where}: on refs/heads/${CANONICAL_BRANCH} two different commits share the concurrency group "${a}" ` +
        'while cancel-in-progress is on, so the next push cancels this commit\'s run. ' +
        'The release-evidence policy requires a COMPLETED job from this workflow per commit, and a cancelled run ' +
        'makes that commit\'s evidence package unobtainable. Key the group on ${{ github.sha }} for this branch.',
      );
    }
  }
  return findings;
}

// ── Repo wiring ─────────────────────────────────────────────────────────────

function readWorkflowsByName(names, { read = file => readFileSync(file, 'utf8'), dir = WORKFLOW_DIR } = {}) {
  const byName = new Map();
  for (const entry of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(entry)) continue;
    const file = path.join(dir, entry);
    let doc;
    try {
      doc = yaml.load(read(file));
    } catch (error) {
      throw new ConcurrencyGuardError(`${path.relative(ROOT, file)}: could not be parsed as YAML (${error.message})`);
    }
    if (doc && typeof doc.name === 'string' && !byName.has(doc.name)) {
      byName.set(doc.name, { workflowName: doc.name, file: path.relative(ROOT, file), doc });
    }
  }
  return names.map(name => {
    const found = byName.get(name);
    if (!found) {
      throw new ConcurrencyGuardError(
        `the release-evidence policy requires jobs from a workflow named "${name}", but no file in .github/workflows/ declares that name. ` +
        'Realign config/release-evidence-policy.v1.json with the workflows on disk.',
      );
    }
    return found;
  });
}

/** The canonical branch is a constant here; assert ci.yml still agrees. */
function assertCanonicalBranch(read = file => readFileSync(file, 'utf8')) {
  const ci = read(CI_WORKFLOW);
  const marker = `if: github.ref == 'refs/heads/${CANONICAL_BRANCH}'`;
  if (!ci.includes(marker)) {
    throw new ConcurrencyGuardError(
      `ci.yml no longer gates release-evidence assembly on "${marker}". ` +
      'This guard is scoped to that branch; realign CANONICAL_BRANCH in scripts/ci/check-required-workflow-concurrency.mjs.',
    );
  }
}

function run() {
  if (!existsSync(POLICY)) throw new ConcurrencyGuardError(`release policy not found at ${path.relative(ROOT, POLICY)}`);
  assertCanonicalBranch();
  const policy = JSON.parse(readFileSync(POLICY, 'utf8'));
  if (!Array.isArray(policy.requiredJobs) || policy.requiredJobs.length === 0) {
    throw new ConcurrencyGuardError('release policy declares no requiredJobs — nothing to protect, which is itself wrong.');
  }
  const names = [...new Set(policy.requiredJobs.map(job => job.workflow))].sort();
  const workflows = readWorkflowsByName(names);
  const findings = checkConcurrency({ workflows });
  if (findings.length > 0) {
    console.error('Required-workflow concurrency guard FAILED:\n');
    for (const finding of findings) console.error(`  • ${finding}\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`Required-workflow concurrency guard OK — ${workflows.length} policy-required workflow(s) keep a per-commit run on ${CANONICAL_BRANCH}:`);
  for (const { workflowName, file } of workflows) console.log(`  ✓ ${workflowName} (${file})`);
}

// ── Self-test: the guard must reject the shape that shipped ─────────────────

function selfTest() {
  const clean = (() => {
    const policy = JSON.parse(readFileSync(POLICY, 'utf8'));
    const names = [...new Set(policy.requiredJobs.map(job => job.workflow))].sort();
    return checkConcurrency({ workflows: readWorkflowsByName(names) });
  })();
  if (clean.length > 0) {
    throw new ConcurrencyGuardError(`self-test requires a clean repo first; it currently reports:\n${clean.map(f => `  ${f}`).join('\n')}`);
  }

  const cases = [
    ['the shape that shipped (ref-keyed, cancel on)', {
      name: 'CodeQL',
      concurrency: { group: 'codeql-${{ github.workflow }}-${{ github.ref }}', 'cancel-in-progress': true },
    }],
    ['ref_name instead of ref — still one group per branch', {
      name: 'CodeQL',
      concurrency: { group: 'codeql-${{ github.ref_name }}', 'cancel-in-progress': true },
    }],
    ['a literal group shared by every run', {
      name: 'CodeQL',
      concurrency: { group: 'codeql', 'cancel-in-progress': true },
    }],
    ['sha behind a condition that never matches the canonical branch', {
      name: 'CodeQL',
      concurrency: {
        group: "codeql-${{ github.ref }}-${{ github.ref_name == 'main' && github.sha || 'ref' }}",
        'cancel-in-progress': true,
      },
    }],
    ['run_id keyed but cancel still on for the branch', {
      name: 'CodeQL',
      concurrency: { group: 'codeql-${{ github.event_name }}-${{ github.ref }}', 'cancel-in-progress': true },
    }],
  ];
  for (const [label, doc] of cases) {
    const findings = checkConcurrency({ workflows: [{ workflowName: doc.name, file: 'simulated.yml', doc }] });
    if (findings.length === 0) throw new ConcurrencyGuardError(`self-test missed: ${label}`);
  }

  // An unreadable group is a refusal, not a pass.
  let refused = false;
  try {
    checkConcurrency({
      workflows: [{
        workflowName: 'CodeQL',
        file: 'simulated.yml',
        doc: { name: 'CodeQL', concurrency: { group: '${{ hashFiles(github.sha) }}', 'cancel-in-progress': true } },
      }],
    });
  } catch (error) {
    refused = error instanceof ConcurrencyGuardError;
  }
  if (!refused) throw new ConcurrencyGuardError('self-test missed: an unreadable group expression must be refused, not passed');

  // And the shapes that are genuinely safe must NOT be flagged.
  const safe = [
    ['per-SHA on the canonical branch', {
      name: 'CodeQL',
      concurrency: {
        group: "codeql-${{ github.ref }}-${{ github.ref_name == 'concept2cure-v2' && github.sha || 'ref' }}",
        'cancel-in-progress': true,
      },
    }],
    ['cancel-in-progress off', { name: 'CI', concurrency: { group: 'ci-${{ github.ref }}', 'cancel-in-progress': false } }],
    ['no concurrency block at all', { name: 'Tier 5 Browser Smoke' }],
  ];
  for (const [label, doc] of safe) {
    const findings = checkConcurrency({ workflows: [{ workflowName: doc.name, file: 'simulated.yml', doc }] });
    if (findings.length > 0) throw new ConcurrencyGuardError(`self-test false positive on ${label}: ${findings.join('; ')}`);
  }

  console.log(`Required-workflow concurrency guard self-test passed: ${cases.length + 1} simulated drifts rejected, ${safe.length} safe shapes accepted.`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    if (process.argv.includes('--self-test')) selfTest();
    else run();
  } catch (error) {
    console.error(error instanceof ConcurrencyGuardError ? `Required-workflow concurrency guard: ${error.message}` : error);
    process.exitCode = 1;
  }
}
