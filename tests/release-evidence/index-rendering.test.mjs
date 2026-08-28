/**
 * index.md must surface manifest.knownDeviations for reviewer disposition.
 *
 * PR #1352 review: the generator carried knownDeviations into manifest.json
 * but index.md — the page reviewers actually read — omitted them entirely, so
 * a deviation could ship without anyone ever being shown it. These tests were
 * demonstrated FAILING against the pre-fix cli.mjs before the rendering was
 * added.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { baseInput, makeRepo, runCli, writeInput } from './helpers.mjs';

async function generatedIndex(t, knownDeviations) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'release-evidence-index-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const repo = await makeRepo(base);
  await writeInput(repo, { ...baseInput(repo), knownDeviations });
  const result = runCli(repo.root, 'generate');
  assert.equal(result.status, 0, result.stderr);
  return readFile(path.join(repo.root, 'release-evidence', 'index.md'), 'utf8');
}

test('index.md renders every knownDeviations entry with id, disposition, and description', async t => {
  const index = await generatedIndex(t, [
    { id: 'RE-DEV-001', description: 'evidence is execution-record granularity, not per-case result files', disposition: 'unreviewed' },
    { id: 'RE-DEV-002', description: 'second deviation to prove the rendering is not single-entry', disposition: 'open' },
  ]);
  assert.match(index, /## Known deviations/, 'index.md must carry a deviations section reviewers cannot miss');
  assert.match(index, /RE-DEV-001/);
  assert.match(index, /execution-record granularity, not per-case result files/);
  assert.match(index, /unreviewed/);
  assert.match(index, /RE-DEV-002/);
  assert.match(index, /second deviation to prove the rendering is not single-entry/);
  assert.match(index, /open/);
  // The section must sit with the automated material, ABOVE the human-decisions
  // divider, so it reads as evidence needing disposition rather than as a
  // decision already made.
  assert.ok(
    index.indexOf('## Known deviations') < index.indexOf('## Human decisions'),
    'deviations must be listed before the human-decisions section',
  );
});

test('index.md states affirmatively when no deviations are declared', async t => {
  const index = await generatedIndex(t, []);
  assert.match(index, /## Known deviations/);
  assert.match(index, /None declared/, 'an empty list must be an explicit statement, not a missing section');
});
