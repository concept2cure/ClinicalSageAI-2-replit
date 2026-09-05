import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// A full `eslint .` takes minutes, so — same pattern as
// dependency-risk-gate.test.mjs and NPM_AUDIT_JSON — the report is injected
// via ESLINT_RATCHET_REPORT_JSON and the baseline via ESLINT_RATCHET_BASELINE.
// The spawn-the-real-linter path (exit-2 fail-closed included) was proven by
// hand against the live repo; these tests pin the ratchet arithmetic and every
// fail-closed branch downstream of the report.
const script = new URL('../check-eslint-warning-ratchet.mjs', import.meta.url);

const msg = (ruleId, severity = 1) => ({ ruleId, severity, message: 'm', line: 1, column: 1 });
const file = (filePath, ...messages) => ({
  filePath,
  messages,
  errorCount: messages.filter((m) => m.severity === 2).length,
  warningCount: messages.filter((m) => m.severity === 1).length,
});
const baselineOf = (rules) => ({
  totalWarnings: Object.values(rules).reduce((n, c) => n + c, 0),
  rules,
});

function run({ report, baseline, args = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'eslint-ratchet-'));
  const reportPath = join(dir, 'report.json');
  const baselinePath = join(dir, 'baseline.json');
  writeFileSync(reportPath, typeof report === 'string' ? report : JSON.stringify(report));
  if (baseline !== undefined) {
    writeFileSync(baselinePath, typeof baseline === 'string' ? baseline : JSON.stringify(baseline));
  }
  const result = spawnSync(process.execPath, [script.pathname, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ESLINT_RATCHET_REPORT_JSON: reportPath,
      ESLINT_RATCHET_BASELINE: baselinePath,
    },
  });
  return { ...result, baselinePath };
}

test('passes when the count matches the baseline exactly', () => {
  const result = run({
    report: [file('a.ts', msg('no-undef'), msg('prefer-const')), file('b.ts', msg('no-undef'))],
    baseline: baselineOf({ 'no-undef': 2, 'prefer-const': 1 }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK — warning count did not grow/);
});

test('fails when the total grows, naming the rule that grew', () => {
  const result = run({
    report: [file('a.ts', msg('no-undef'), msg('no-undef'), msg('prefer-const'))],
    baseline: baselineOf({ 'no-undef': 1, 'prefer-const': 1 }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL — 1 more warning\(s\)/);
  assert.match(result.stderr, /no-undef {2}1 → 2 {2}\(\+1\)/);
});

test('fails when a rule absent from the baseline appears', () => {
  const result = run({
    report: [file('a.ts', msg('no-undef'), msg('eqeqeq'))],
    baseline: baselineOf({ 'no-undef': 1 }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /eqeqeq {2}0 → 1 {2}\(\+1\)/);
});

test('passes on shrink, telling the committer to ratchet down', () => {
  // House convention (check-phantom-tokens, check-shell-css-collisions,
  // check-orphaned-stylesheets): shrink is a PASS plus a regenerate nudge —
  // the ratchet locks in when the baseline is rewritten in the same change.
  const result = run({
    report: [file('a.ts', msg('no-undef'))],
    baseline: baselineOf({ 'no-undef': 2, 'prefer-const': 1 }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 fewer warning\(s\) than baseline — ratchet down/);
  assert.match(result.stdout, /--write-baseline/);
});

test('passes an equal-total mix shift but reports what moved', () => {
  const result = run({
    report: [file('a.ts', msg('eqeqeq'))],
    baseline: baselineOf({ 'no-undef': 1 }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Rule mix shifted within the same total/);
  assert.match(result.stdout, /eqeqeq {2}0 → 1/);
});

test('counts only severity-1 messages — errors belong to the Run ESLint step', () => {
  const result = run({
    report: [file('a.ts', msg('no-undef'), msg('no-debugger', 2))],
    baseline: baselineOf({ 'no-undef': 1 }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 error\(s\) also present — the Run ESLint step owns those/);
});

test('fails closed on invalid report JSON (crashed or truncated lint run)', () => {
  const result = run({ report: '{"trunca', baseline: baselineOf({}) });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not valid JSON/);
  assert.match(result.stderr, /fails? closed/i);
});

test('fails closed when the report is not a results array (error envelope)', () => {
  const result = run({
    report: { error: 'Oops! Something went wrong!' },
    baseline: baselineOf({}),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not a results array/);
});

test('fails closed on a missing baseline, with the generation command', () => {
  const result = run({ report: [file('a.ts', msg('no-undef'))] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /baseline missing/);
  assert.match(result.stderr, /--write-baseline/);
});

test('fails closed on a hand-edited baseline whose rules do not sum to the total', () => {
  const result = run({
    report: [file('a.ts', msg('no-undef'))],
    baseline: { totalWarnings: 5, rules: { 'no-undef': 1 } },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /internally inconsistent/);
});

test('--write-baseline writes totals and per-rule counts that the gate then accepts', () => {
  const report = [
    file('a.ts', msg('no-undef'), msg('prefer-const'), msg('no-debugger', 2)),
    file('b.ts', msg('no-undef'), msg(null)),
  ];
  const written = run({ report, args: ['--write-baseline'] });
  assert.equal(written.status, 0, written.stderr);
  const baseline = JSON.parse(readFileSync(written.baselinePath, 'utf8'));
  assert.equal(baseline.totalWarnings, 4); // the severity-2 message is not counted
  assert.deepEqual(baseline.rules, { '(no ruleId)': 1, 'no-undef': 2, 'prefer-const': 1 });
  const recheck = run({ report, baseline });
  assert.equal(recheck.status, 0, recheck.stderr);
});
