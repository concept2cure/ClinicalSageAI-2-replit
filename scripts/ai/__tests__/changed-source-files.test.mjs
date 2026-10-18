import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { changedSourceFiles } from '../changed-source-files.mjs';
const roots = [];
const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'c2c-test-presence-')); roots.push(cwd);
  git(cwd, ['init', '-b', 'concept2cure-v2']);
  git(cwd, ['config', 'user.name', 'Local test']); git(cwd, ['config', 'user.email', 'test@example.invalid']);
  mkdirSync(join(cwd, 'server'));
  writeFileSync(join(cwd, 'server/existing.ts'), 'export const value = 1;\n');
  git(cwd, ['add', '.']); git(cwd, ['commit', '-m', 'Synthetic fixture']);
  return cwd;
}
afterEach(() => { for (const cwd of roots.splice(0)) rmSync(cwd, { recursive: true, force: true }); });
test('a one-commit checkout reports tracked edits instead of swallowing missing HEAD~1', () => {
  const cwd = fixture(); writeFileSync(join(cwd, 'server/existing.ts'), 'export const value = 2;\n');
  assert.equal(changedSourceFiles(cwd), 'M\tserver/existing.ts');
});
test('new untracked sources are additions requiring the existing companion policy', () => {
  const cwd = fixture(); writeFileSync(join(cwd, 'server/new.ts'), 'export const added = true;\n');
  assert.equal(changedSourceFiles(cwd), 'A\tserver/new.ts');
});
test('an explicitly requested but missing PR base fails rather than reporting no changes', () => {
  assert.throws(() => changedSourceFiles(fixture(), 'missing-base'), /unavailable/);
});
test('a clean shallow checkout without comparison evidence fails closed', () => {
  assert.throws(() => changedSourceFiles(fixture()), /no comparison commit/);
});
test('staged renames preserve the destination identity and added status', () => {
  const cwd = fixture(); git(cwd, ['mv', 'server/existing.ts', 'server/renamed.ts']);
  assert.match(changedSourceFiles(cwd), /^R\d+\tserver\/renamed.ts$/);
});
test('a real committed comparison still includes local and untracked work', () => {
  const cwd = fixture(); git(cwd, ['update-ref', 'refs/remotes/origin/review-base', 'HEAD']);
  writeFileSync(join(cwd, 'server/committed.ts'), 'export const committed = true;\n');
  git(cwd, ['add', '.']); git(cwd, ['commit', '-m', 'Committed fixture change']);
  writeFileSync(join(cwd, 'server/committed.ts'), 'export const committed = false;\n');
  writeFileSync(join(cwd, 'server/new.ts'), 'export const local = true;\n');
  assert.equal(changedSourceFiles(cwd, 'review-base'), 'A\tserver/committed.ts\nA\tserver/new.ts');
});
