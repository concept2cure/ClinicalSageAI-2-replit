#!/usr/bin/env node
/**
 * CI Guard (pre-push): the files a push changes must not gain ESLint warnings.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `ci:eslint-warning-ratchet` holds the repo's warning total at its baseline, but
 * only CI runs it: a full `eslint .` takes minutes, too slow for a pre-push hook.
 * The hook ran `ci:pushed-lint-errors`, which lints the pushed files for ERRORS
 * only. So every lane could add a warning, see its push succeed, and leave the
 * Lint job red for everyone. A red Lint job also skips Build and Release
 * Evidence. The work-orders board recorded the pattern ("a warning added in one
 * lane is invisible to the lane that added it") and asked lanes to run the
 * ratchet by hand. They did not: on 2026-09-25 the ratchet stood at +11, sixteen
 * files across several lanes adding one to four warnings each, none of them the
 * last lane to push.
 *
 * ── What this runs ────────────────────────────────────────────────────────────
 * The ratchet's own `--since <ref> --gate` mode. It lints only the changed
 * files, both versions of each, and fails when their warnings grew in net. The
 * ref is the merge-base with the push base that `ci:pushed-lint-errors` uses
 * (lib/push-range.mjs), so a push is measured on its own changes, not on what
 * the remote gained meanwhile. Net, not per file, like the ratchet itself: code
 * moved between two files does not fail.
 *
 * No comparable upstream ref lints nothing and says so, as the errors gate does.
 * The ratchet refuses an unresolvable ref and fails closed when ESLint cannot run.
 *
 * Usage:
 *   node scripts/ci/check-pushed-lint-warnings.mjs            # against the upstream ref
 *   node scripts/ci/check-pushed-lint-warnings.mjs --base REF # against an explicit ref
 */
import { spawnSync } from 'node:child_process';
import { git, resolvePushBase } from './lib/push-range.mjs';

const TAG = '[ci:pushed-lint-warnings]';

const base = resolvePushBase(process.argv.slice(2));
if (!base) {
  console.log(`${TAG} no upstream ref to compare against — nothing to check.`);
  process.exit(0);
}
const mergeBase = git(['merge-base', base, 'HEAD']);
if (!mergeBase) {
  console.error(`${TAG} FAIL — no merge-base between ${base} and HEAD, so the pushed changes are unknown.`);
  process.exit(1);
}

const ratchet = new URL('./check-eslint-warning-ratchet.mjs', import.meta.url).pathname;
const proc = spawnSync(process.execPath, [ratchet, '--since', mergeBase, '--gate'], { stdio: 'inherit' });
process.exit(proc.status ?? 1);
