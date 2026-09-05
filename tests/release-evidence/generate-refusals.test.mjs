/**
 * The generator's refusal paths, each shown actually failing.
 *
 * `cli.mjs generate` claims four fail-closed behaviors that had never been
 * demonstrated red (PR #1352 review): dirty-worktree refusal, cross-commit
 * refusal, duplicate workflow-metadata refusal, and symlink-escape refusal.
 * Every test here runs the REAL cli against a REAL git fixture carrying the
 * reviewed policy + schema, and asserts a non-zero exit with the named reason.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { baseInput, makeRepo, runCli, writeInput } from './helpers.mjs';

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'release-evidence-refusal-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const repo = await makeRepo(base);
  return { base, repo };
}

test('generate refuses a dirty worktree: tracked file modified after commit', async t => {
  const { repo } = await fixture(t);
  await writeInput(repo, baseInput(repo));
  await writeFile(path.join(repo.root, 'README.md'), 'tampered after commit\n');
  const result = runCli(repo.root, 'generate');
  assert.notEqual(result.status, 0, 'generate must exit non-zero on a dirty worktree');
  assert.match(result.stderr, /Refusing to generate evidence from a dirty worktree/);
  assert.match(result.stderr, /README\.md/, 'the refusal must name the dirty path');
});

test('generate refuses a dirty worktree: untracked file the input does not list', async t => {
  const { repo } = await fixture(t);
  await writeInput(repo, baseInput(repo));
  // The evidence artifact must contain EXACTLY release-evidence-input.json plus
  // the files listed in input.artifacts; this file is neither.
  await writeFile(path.join(repo.root, 'stray-unlisted-evidence.json'), '{}\n');
  const result = runCli(repo.root, 'generate');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to generate evidence from a dirty worktree/);
  assert.match(result.stderr, /stray-unlisted-evidence\.json/);
});

test('generate accepts ONLY the allowed untracked set (control for the dirty gate)', async t => {
  // Control case: the same fixture with only the input file untracked passes,
  // proving the two refusals above fail for the reason claimed and not because
  // the fixture is unconditionally broken.
  const { repo } = await fixture(t);
  await writeInput(repo, baseInput(repo));
  const result = runCli(repo.root, 'generate');
  assert.equal(result.status, 0, result.stderr);
});

test('generate refuses input assembled for a different commit', async t => {
  const { repo } = await fixture(t);
  await writeInput(repo, { ...baseInput(repo), commit: 'f'.repeat(40) });
  const result = runCli(repo.root, 'generate');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Input metadata belongs to a different commit/);
});

test('generate throws on duplicate workflow metadata for one required job', async t => {
  const { repo } = await fixture(t);
  // The fixture carries the REAL reviewed policy, whose requiredJobs include
  // CI / Test — so two records for it must be refused, not first-one-wins.
  const entry = { workflow: 'CI', job: 'Test', conclusion: 'success', headSha: repo.commit, runId: 1 };
  await writeInput(repo, { ...baseInput(repo), workflowJobs: [entry, { ...entry, runId: 2 }] });
  const result = runCli(repo.root, 'generate');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Duplicate workflow metadata for CI\/Test/);
});

test('generate refuses an artifact path that is a real symlink escaping the repository', async t => {
  const { base, repo } = await fixture(t);
  const outside = path.join(base, 'outside-secret.json');
  await writeFile(outside, '{"outside": true}\n');
  // A real symlink inside the checkout pointing outside it. The path IS in
  // input.artifacts, so the dirty-worktree gate allows it — the refusal must
  // come from symlink resolution, proving that check fires independently.
  await symlink(outside, path.join(repo.root, 'escaped-evidence.json'));
  await writeInput(repo, {
    ...baseInput(repo),
    artifacts: [{ id: 'escape', kind: 'test-results', path: 'escaped-evidence.json', commit: repo.commit, tree: repo.tree }],
  });
  const result = runCli(repo.root, 'generate');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /escapes the repository/);
});
