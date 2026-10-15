/**
 * Run a real CI gate over a handful of files, in a throwaway git repository.
 *
 * Most gates under scripts/ci/ resolve their root (and their baseline) from
 * their own path and list what they scan with `git ls-files`. So a case is:
 * the given files written into a fresh repo in the OS temp dir, the gate and
 * the shared comment stripper copied in at their repository paths, `git init`
 * and `git add -A` so ls-files sees the files, and the gate run there with no
 * baseline.
 *
 * Every GIT_* variable is dropped from the child environment. A pre-push hook
 * exports GIT_DIR, and an inherited one would point `git init`, `git add` and
 * the gate's own `git ls-files` at the real repository instead of this one.
 *
 * `source` exists so a case can be run against another version of the gate,
 * e.g. the pre-migration file, to show the case failing on it.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** scripts/ci in this checkout. */
export const CI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIB = path.join(CI_DIR, 'lib', 'strip-comments.mjs');

const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

/**
 * @param {object} o
 * @param {string} o.gate     basename under scripts/ci, e.g. 'check-action-overclaim.mjs'
 * @param {string} [o.source] the file to install as that gate (default: this checkout's)
 * @param {Record<string, string>} o.files  repo-relative path → contents
 * @param {string[]} [o.args] arguments to the gate
 * @returns {{ code: number | null, out: string }}
 */
export function runGateInScratchRepo({ gate, source = path.join(CI_DIR, gate), files, args = [] }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `${path.basename(gate, '.mjs')}-`)));
  try {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    const ci = path.join(root, 'scripts', 'ci');
    fs.mkdirSync(path.join(ci, 'lib'), { recursive: true });
    fs.copyFileSync(path.resolve(source), path.join(ci, gate));
    fs.copyFileSync(LIB, path.join(ci, 'lib', 'strip-comments.mjs'));
    git(root, ['init', '-q']);
    git(root, ['add', '-A']);
    const r = spawnSync(process.execPath, [path.join(ci, gate), ...args], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 20_000,
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** 1-based line of the first `needle` in `src`. Throws if it is absent. */
export function lineOf(src, needle) {
  const at = src.indexOf(needle);
  if (at === -1) throw new Error(`fixture does not contain ${JSON.stringify(needle)}`);
  return src.slice(0, at).split('\n').length;
}
