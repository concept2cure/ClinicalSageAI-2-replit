import { cp, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const cliPath = path.join(repoRoot, 'scripts', 'release-evidence', 'cli.mjs');

export const git = (root, ...args) => execFileSync(
  'git',
  ['-c', 'user.email=ci@example.test', '-c', 'user.name=CI Fixture', '-c', 'commit.gpgsign=false', ...args],
  { cwd: root, encoding: 'utf8' },
).trim();

/** A minimal clean git checkout carrying the REAL reviewed policy and manifest schema. */
export async function makeRepo(base) {
  const root = path.join(base, 'repo');
  await mkdir(path.join(root, 'config'), { recursive: true });
  await mkdir(path.join(root, 'schemas'), { recursive: true });
  await cp(path.join(repoRoot, 'config', 'release-evidence-policy.v1.json'), path.join(root, 'config', 'release-evidence-policy.v1.json'));
  await cp(path.join(repoRoot, 'schemas', 'release-evidence-manifest.v1.schema.json'), path.join(root, 'schemas', 'release-evidence-manifest.v1.schema.json'));
  await writeFile(path.join(root, 'README.md'), 'release evidence test fixture\n');
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'fixture');
  return { root, commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}') };
}

export const writeInput = (repo, input) =>
  writeFile(path.join(repo.root, 'release-evidence-input.json'), JSON.stringify(input, null, 2) + '\n');

export const baseInput = repo => ({ commit: repo.commit, artifacts: [], workflowJobs: [], automatedEvidence: {}, knownDeviations: [] });

export const runCli = (root, ...args) => spawnSync(process.execPath, [cliPath, ...args], { cwd: root, encoding: 'utf8' });
