import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  parseArgs,
  classifyFailure,
  skippedStep,
  trimOutput,
  writeMarkdownReport,
  writeJsonReport,
} from '../../scripts/audits/execute-last-pr-audit-build-plan.mjs';

test('parseArgs supports strict and auto-install flags', () => {
  const opts = parseArgs(['--limit', '25', '--date', '2026-03-28', '--auto-install', '--strict']);
  assert.equal(opts.limit, 25);
  assert.equal(opts.date, '2026-03-28');
  assert.equal(opts.autoInstall, true);
  assert.equal(opts.strict, true);
});

test('classifyFailure marks dependency and network policy failures', () => {
  assert.equal(classifyFailure('sh: 1: vite: not found'), 'environment_dependency');
  assert.equal(classifyFailure('Cannot find type definition file for node'), 'environment_dependency');
  assert.equal(classifyFailure('npm error code E403 forbidden'), 'environment_network_policy');
  assert.equal(classifyFailure('Unhandled app exception'), 'application_or_config');
});

test('skippedStep produces skipped metadata', () => {
  const step = skippedStep('npm run build', 'Skipped: missing deps');
  assert.equal(step.status, 'skipped');
  assert.equal(step.classification, 'skipped_due_to_preflight');
  assert.equal(step.output, 'Skipped: missing deps');
});

test('trimOutput truncates long output', () => {
  const trimmed = trimOutput('a'.repeat(50), 10);
  assert.match(trimmed, /truncated/);
});

test('report writers generate markdown and json artifacts', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'audit-plan-'));
  const mdPath = path.join(tempDir, 'report.md');
  const jsonPath = path.join(tempDir, 'report.json');

  const options = { limit: 20, date: '2026-03-28' };
  const preflightNotes = ['⚠️ node_modules missing'];
  const steps = [
    {
      cmd: 'npm run typecheck',
      status: 'skipped',
      classification: 'skipped_due_to_preflight',
      startedAt: '2026-03-28T00:00:00.000Z',
      finishedAt: '2026-03-28T00:00:00.000Z',
      exitCode: null,
      output: 'Skipped',
    },
  ];

  writeMarkdownReport({ outputPath: mdPath, options, preflightNotes, steps });
  writeJsonReport(jsonPath, { options, preflightNotes, steps });

  const markdown = readFileSync(mdPath, 'utf8');
  const json = JSON.parse(readFileSync(jsonPath, 'utf8'));

  assert.match(markdown, /Skipped steps: \*\*1\*\*/);
  assert.match(markdown, /No hard failures occurred, but one or more checks were skipped/);
  assert.equal(json.steps[0].status, 'skipped');
});

test('strict mode fails closed when checks are skipped', () => {
  // The script skips its plan steps when preflight detects a missing
  // node_modules. Spawn in a tmp cwd (which has no node_modules) so the
  // skip path triggers deterministically, then assert strict mode
  // surfaces the skips as exit 1.
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'audit-strict-'));
  const scriptPath = path.resolve('scripts/audits/execute-last-pr-audit-build-plan.mjs');
  const run = spawnSync(
    'node',
    [scriptPath, '--limit', '1', '--date', '2026-03-29', '--strict'],
    { encoding: 'utf8', cwd: tmpDir },
  );

  assert.equal(run.status, 1);
  assert.match(run.stdout, /Wrote plan execution report/);
});
