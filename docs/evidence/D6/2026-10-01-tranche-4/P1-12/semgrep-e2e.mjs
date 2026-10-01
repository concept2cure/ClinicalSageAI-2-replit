#!/usr/bin/env node
/**
 * P1-12 acceptance, "a deliberately failing Semgrep rule blocks", with the real
 * semgrep binary and the step scripts exactly as semgrep.yml writes them.
 *
 *   node docs/evidence/D6/2026-10-01-tranche-4/P1-12/semgrep-e2e.mjs <semgrep-bin-dir> <workflows-dir> [old|new]
 *
 * Builds a throwaway git repository: commit B is clean, commit H adds a line the
 * deliberate rule matches, commit L adds an unrelated change on top of H. The
 * registry rulesets (p/default, p/ci) are replaced by that one local rule —
 * semgrep.dev is not reachable from the machine this ran on — and nothing else
 * in the step is changed.
 *
 *   old: the "Run Semgrep" step of the given workflows dir, run at H.
 *   new: the "Blocking scan" step, run at H and L against several baselines.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('package.json'));
const { load } = require('js-yaml');
const [binDir, wfDir, mode = 'new'] = process.argv.slice(2);
const say = (s) => process.stdout.write(`${s}\n`);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-12-semgrep-'));
const repo = path.join(work, 'repo');
const rule = path.join(work, 'deliberate.yml');
fs.writeFileSync(rule, [
  'rules:',
  '  - id: p1-12-deliberate-eval',
  '    languages: [javascript]',
  '    severity: ERROR',
  '    message: deliberate P1-12 finding',
  '    pattern: eval(...)',
  '',
].join('\n'));

const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
fs.mkdirSync(repo);
git('init', '-q', '-b', 'concept2cure-v2');
git('config', 'user.email', 'p1-12@example.test');
git('config', 'user.name', 'p1-12');
fs.writeFileSync(path.join(repo, 'app.js'), 'export const ok = () => 1;\n');
git('add', '.'); git('commit', '-qm', 'B: clean');
const B = git('rev-parse', 'HEAD');
fs.appendFileSync(path.join(repo, 'app.js'), 'export const run = (input) => eval(input);\n');
git('commit', '-qam', 'H: adds a finding');
const H = git('rev-parse', 'HEAD');

const wf = load(fs.readFileSync(path.join(wfDir, 'semgrep.yml'), 'utf8'));
const step = (prefix) => wf.jobs.semgrep.steps.find((s) => (s.name ?? '').startsWith(prefix));

function runStep(label, script, env) {
  const file = path.join(work, 'step.sh');
  fs.writeFileSync(file, script);
  const r = spawnSync('sh', ['-e', file], {
    cwd: repo,
    encoding: 'utf8',
    env: { PATH: `${binDir}:${process.env.PATH}`, HOME: work, RUNNER_TEMP: work, GITHUB_WORKSPACE: repo, GITHUB_OUTPUT: path.join(work, 'out'), ...env },
  });
  const lines = `${r.stdout}${r.stderr}`.trim().split('\n');
  const shown = [...lines.filter((l) => l.startsWith('::error::')), ...lines.filter((l) => !l.startsWith('::error::')).slice(-4)];
  say(`\n## ${label}\n  exit ${r.status}\n    ${shown.join('\n    ')}`);
  return r.status;
}

say(`semgrep ${execFileSync(path.join(binDir, 'semgrep'), ['--version'], { encoding: 'utf8' }).trim()}; B=${B.slice(0, 8)} H=${H.slice(0, 8)}`);
if (mode === 'old') {
  const s = step('Run Semgrep');
  say(`job continue-on-error: ${wf.jobs.semgrep['continue-on-error']}; image: ${wf.jobs.semgrep.container.image}`);
  runStep('old step at H (a finding the rule matches is present)', s.run.replace('--config=p/default', `--config=${rule}`), {});
} else {
  const s = step('Blocking scan');
  const env = { SEMGREP_CONFIGS: `--config=${rule}` };
  runStep('new step at H, baseline B (H adds the finding)', s.run, { ...env, BASELINE: B });
  git('checkout', '-q', B);
  runStep('new step at B, baseline B (nothing added)', s.run, { ...env, BASELINE: B });
  git('checkout', '-q', 'concept2cure-v2');
  fs.writeFileSync(path.join(repo, 'other.js'), 'export const two = () => 2;\n');
  git('add', '.'); git('commit', '-qm', 'L: unrelated change after the red commit');
  runStep('new step at L, baseline B = last green (the finding stays red)', s.run, { ...env, BASELINE: B });
  runStep('new step at L, baseline H = previous push (why the baseline is the last GREEN commit)', s.run, { ...env, BASELINE: H });
  runStep('new step, baseline not in history (fails closed)', s.run, { ...env, BASELINE: '0123456789abcdef0123456789abcdef01234567' });
  runStep('new step, no baseline resolved (fails closed)', s.run, { ...env, BASELINE: '' });
}
fs.rmSync(work, { recursive: true, force: true });
