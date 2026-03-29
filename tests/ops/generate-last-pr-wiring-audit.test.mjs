import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, buildReport } from '../../scripts/audits/generate-last-pr-wiring-audit.mjs';

test('parseArgs applies defaults', () => {
  const opts = parseArgs([]);
  assert.equal(opts.limit, 20);
  assert.equal(opts.output, null);
  assert.match(opts.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('parseArgs accepts explicit values', () => {
  const opts = parseArgs(['--limit', '15', '--date', '2026-03-28', '--output', 'out.md']);
  assert.equal(opts.limit, 15);
  assert.equal(opts.date, '2026-03-28');
  assert.equal(opts.output, 'out.md');
});

test('parseArgs rejects invalid limit', () => {
  assert.throws(() => parseArgs(['--limit', '0']), /positive integer/);
});

test('buildReport includes summary and table rows', () => {
  const markdown = buildReport({
    date: '2026-03-28',
    limit: 2,
    results: [
      {
        pr: 101,
        sha: 'abc123',
        prSideCommitCount: 1,
        filesChanged: 5,
        testsChanged: 2,
        missingFiles: 0,
        downstreamTouches: 7,
        wiringAssessment: '✅ Structurally wired with test coverage in PR diff.',
      },
      {
        pr: 100,
        sha: 'def456',
        prSideCommitCount: 2,
        filesChanged: 3,
        testsChanged: 0,
        missingFiles: 1,
        downstreamTouches: 0,
        wiringAssessment: '❌ Potentially broken (changed files missing at HEAD).',
      },
    ],
  });

  assert.match(markdown, /Last 2 PR Wiring Audit \(2026-03-28\)/);
  assert.match(markdown, /1\/2 audited PRs have \*\*zero missing changed files at HEAD\*\*/);
  assert.match(markdown, /\| #101 \| `abc123` \| 1 \| 5 \| 2 \| 0 \| 7 \|/);
  assert.match(markdown, /\| #100 \| `def456` \| 2 \| 3 \| 0 \| 1 \| 0 \|/);
});
