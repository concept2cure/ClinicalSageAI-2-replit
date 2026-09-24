/**
 * What a push changes — one implementation for every push-scoped gate.
 *
 * check-pushed-lint-errors and check-untracked-imports each carried an identical
 * private `resolveBase`, and the pre-push typecheck trigger would have been the
 * third. Extracted here on 2026-09-24 when that third one was about to be
 * written; both existing gates now import it.
 *
 * ── The base ────────────────────────────────────────────────────────────────
 * An explicit `--base REF` when given; else the configured upstream; else the
 * remote's copy of this branch (what a first push to an existing branch compares
 * to). Null when none resolves — a brand-new branch — and each CALLER decides
 * what null means for it, because the right answer differs: a lint of changed
 * files has nothing to lint, but a whole-tree typecheck that cannot tell what
 * changed should run rather than assume nothing did.
 *
 * ── The diff filter is the caller's, deliberately ───────────────────────────
 * The two original gates used --diff-filter=ACMR, which drops DELETIONS. That is
 * right for them: a deleted file cannot be linted and has no imports to resolve.
 * It is exactly wrong for a typecheck trigger, since deleting a .ts file is one
 * of the surest ways to break every file that imported it. So the filter is a
 * parameter with the originals' value as the default, not baked in.
 */

import { spawnSync } from 'node:child_process';

/** Run git; the trimmed stdout, or null on a non-zero exit. */
export function git(args) {
  const p = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return p.status === 0 ? p.stdout.trim() : null;
}

/** The ref a push is measured against, or null when there is none. */
export function resolvePushBase(argv = []) {
  const flag = argv.indexOf('--base');
  if (flag !== -1 && argv[flag + 1]) return argv[flag + 1];
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstream && git(['rev-parse', '--verify', '--quiet', upstream])) return upstream;
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const remote = branch ? `origin/${branch}` : null;
  if (remote && git(['rev-parse', '--verify', '--quiet', remote])) return remote;
  return null;
}

/**
 * Paths changed between the merge-base with `base` and HEAD.
 *
 * Three-dot, so a merge of the remote into this branch contributes only this
 * branch's net changes, not everything the remote gained meanwhile. Returns null
 * — never [] — when git itself fails, so a caller cannot mistake "could not
 * tell" for "nothing changed".
 */
export function changedSince(base, { diffFilter = 'ACMR' } = {}) {
  const out = git(['diff', '--name-only', `--diff-filter=${diffFilter}`, `${base}...HEAD`]);
  if (out === null) return null;
  return out
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}
