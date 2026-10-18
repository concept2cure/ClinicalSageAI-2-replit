import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function exists(cwd, ref) {
  try { git(cwd, ['rev-parse', '--verify', `${ref}^{commit}`]); return true; } catch { return false; }
}
/** Include the reviewable worktree; an unavailable comparison is never evidence of no changes. */
export function changedSourceFiles(cwd, baseRef = '') {
  const local = git(cwd, ['diff', '--name-status', '--find-renames', '--diff-filter=ACMR', 'HEAD']);
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard']);
  let committed = '';
  if (baseRef) {
    const base = `origin/${baseRef}`;
    if (!exists(cwd, base)) throw new Error(`Comparison ${base} is unavailable. Fetch the PR base before checking test presence.`);
    committed = git(cwd, ['diff', '--name-status', '--find-renames', '--diff-filter=ACMR', `${base}...HEAD`]);
  } else if (!local && !untracked) {
    const base = exists(cwd, 'origin/main') ? 'origin/main' : 'HEAD~1';
    if (!exists(cwd, base)) throw new Error('No worktree changes and no comparison commit are available. Fetch history before checking test presence.');
    committed = git(cwd, ['diff', '--name-status', '--find-renames', '--diff-filter=ACMR', `${base}...HEAD`]);
  }
  const files = new Map();
  for (const line of `${committed}\n${local}`.split('\n').filter(Boolean)) {
    const columns = line.split('\t');
    const name = columns.at(-1);
    const status = columns[0];
    // A committed addition remains an addition after an uncommitted edit.
    if (!files.has(name) || /^[AR]/.test(status)) files.set(name, status);
  }
  for (const name of untracked.split('\n').filter(Boolean)) files.set(name, 'A');
  return [...files].sort(([a], [b]) => a.localeCompare(b)).map(([file, status]) => `${status}\t${file}`).join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(changedSourceFiles(process.cwd(), process.env.GITHUB_BASE_REF ?? '')); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}
