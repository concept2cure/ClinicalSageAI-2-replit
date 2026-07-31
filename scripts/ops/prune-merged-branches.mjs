#!/usr/bin/env node
/**
 * prune-merged-branches — delete remote branch pointers that hold nothing unique.
 *
 * The repo's branch-authority policy (.husky/pre-push, CLAUDE.md) makes
 * concept2cure-v2 the ONE canonical branch: every session commits there, so a
 * `claude/*` or `codex/*` pointer normally ends up 0-ahead and vestigial. Those
 * accumulate — several hundred at the time of writing — and each one is a small
 * hazard, because merging a stale pointer does not just no-op: it can RESURRECT
 * files the canonical branch deliberately deleted and REVERT newer work. That is
 * not hypothetical; it was measured on a real branch here (18 resurrected files
 * plus a reverted fix).
 *
 * Deleting a pointer with zero unique commits loses nothing: every commit it
 * references is already reachable from the canonical branch.
 *
 * ── Safety: a branch is pruned ONLY if ALL of these hold ────────────────────
 *   1. It is not the canonical branch, not HEAD, not protected.
 *   2. `git rev-list --count <canonical>..<branch>` is 0 — zero unique commits.
 *      This is the load-bearing check: it is why deletion is lossless.
 *   3. (informational) how many deleted files it would RESURRECT if merged —
 *      reported as the reason pruning is worth doing, never as a blocker.
 *   4. It has no open pull request (checked when a token is available).
 *   5. It has not been updated within --min-age-days (default 7), so an ACTIVE
 *      session's branch is never yanked mid-flight.
 *
 * DRY RUN BY DEFAULT. Nothing is deleted without --apply.
 *
 *   node scripts/ops/prune-merged-branches.mjs                 # report only
 *   node scripts/ops/prune-merged-branches.mjs --json          # machine readable
 *   node scripts/ops/prune-merged-branches.mjs --apply         # actually delete
 *   node scripts/ops/prune-merged-branches.mjs --apply --min-age-days 30
 *
 * Requires push rights to delete refs. In the sandboxed agent environment the
 * git proxy refuses every ref except concept2cure-v2, so --apply reports the
 * refusal rather than pretending to succeed; run it from a maintainer checkout
 * or CI with a token that may delete branches.
 */

import { execFileSync } from 'node:child_process';

const CANONICAL = 'concept2cure-v2';
/** Never pruned, whatever their state. */
const PROTECTED = new Set([CANONICAL, 'main', 'master', 'HEAD', 'develop', 'production']);

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const APPLY = has('--apply');
const JSON_OUT = has('--json');
const MIN_AGE_DAYS = Number(val('--min-age-days', '7'));
const LIMIT = Number(val('--limit', '0')); // 0 = no cap

const git = (args) =>
  execFileSync('git', ['-c', 'diff.renames=false', ...args], { encoding: 'utf8' }).trim();
const gitTry = (args) => {
  try {
    return { ok: true, out: git(args) };
  } catch (e) {
    return { ok: false, out: (e.stderr || e.stdout || String(e)).trim() };
  }
};

/** Open PR head-branch names, when a token is available. Null = unknown. */
async function openPrHeads() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || 'concept2cure/ClinicalSageAI-2-replit';
  if (!token) return null;
  const heads = new Set();
  try {
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/pulls?state=open&per_page=100&page=${page}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
      );
      if (!res.ok) return null;
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const pr of batch) if (pr?.head?.ref) heads.add(pr.head.ref);
      if (batch.length < 100) break;
    }
    return heads;
  } catch {
    return null;
  }
}

async function main() {
  git(['fetch', '--all', '--prune', '--quiet']);

  const canonical = `origin/${CANONICAL}`;
  const rows = git([
    'for-each-ref',
    '--format=%(refname:short)%09%(committerdate:unix)',
    'refs/remotes/origin',
  ])
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [ref, ts] = l.split('\t');
      return { ref, name: ref.replace(/^origin\//, ''), ts: Number(ts) };
    })
    .filter((b) => b.name && !PROTECTED.has(b.name) && b.ref !== canonical);

  const prHeads = await openPrHeads();
  const nowSec = Math.floor(Date.now() / 1000);
  const minAgeSec = MIN_AGE_DAYS * 86400;

  const prunable = [];
  const kept = [];

  for (const b of rows) {
    const ageDays = Math.floor((nowSec - b.ts) / 86400);

    // (2) the load-bearing check — zero unique commits
    const uniq = Number(gitTry(['rev-list', '--count', `${canonical}..${b.ref}`]).out || '-1');
    if (uniq !== 0) {
      kept.push({ ...b, ageDays, reason: `has ${uniq} unique commit(s)` });
      continue;
    }

    // (3) How many files this stale pointer would RESURRECT if someone merged
    // it — i.e. files the canonical branch has since deleted. This is recorded
    // as the reason deletion is WORTH doing, not a reason to skip: with zero
    // unique commits (check 2) deletion is already lossless, while merging
    // would undo real cleanup. An earlier revision treated this as a blocker,
    // which made the script prune nothing at all.
    const addsOut = gitTry(['diff', '--diff-filter=A', '--name-only', canonical, b.ref]).out;
    const wouldResurrect = addsOut ? addsOut.split('\n').filter(Boolean).length : 0;

    // (4) never prune a branch with an open PR
    if (prHeads && prHeads.has(b.name)) {
      kept.push({ ...b, ageDays, reason: 'has an open pull request' });
      continue;
    }

    // (5) never yank an ACTIVE session's branch mid-flight
    if (nowSec - b.ts < minAgeSec) {
      kept.push({ ...b, ageDays, reason: `updated ${ageDays}d ago (< ${MIN_AGE_DAYS}d)` });
      continue;
    }

    prunable.push({ ...b, ageDays, wouldResurrect });
  }

  const targets = LIMIT > 0 ? prunable.slice(0, LIMIT) : prunable;
  const deleted = [];
  const refused = [];

  if (APPLY) {
    for (const b of targets) {
      const r = gitTry(['push', 'origin', '--delete', b.name]);
      (r.ok ? deleted : refused).push({ name: b.name, error: r.ok ? undefined : r.out.split('\n')[0] });
    }
  }

  const report = {
    canonical: CANONICAL,
    mode: APPLY ? 'apply' : 'dry-run',
    minAgeDays: MIN_AGE_DAYS,
    openPrCheck: prHeads ? 'enabled' : 'SKIPPED (no GITHUB_TOKEN — set one to be safe)',
    scanned: rows.length,
    prunable: prunable.length,
    kept: kept.length,
    deleted: deleted.length,
    refused,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify({ ...report, targets, kept }, null, 2));
  } else {
    console.log(`\nBranch prune — ${report.mode.toUpperCase()} (canonical: ${CANONICAL})`);
    console.log('='.repeat(66));
    console.log(`scanned ${report.scanned} remote branches`);
    console.log(`  prunable (0 unique commits, no open PR, aged): ${prunable.length}`);
    console.log(`  kept:                                                        ${kept.length}`);
    console.log(`open-PR check: ${report.openPrCheck}`);
    if (targets.length) {
      console.log(`\n${APPLY ? 'Deleting' : 'Would delete'} ${targets.length}:`);
      for (const b of targets)
        console.log(
          `  - ${b.name}  (${b.ageDays}d old` +
            (b.wouldResurrect ? `, would resurrect ${b.wouldResurrect} deleted file(s) if merged` : '') +
            ')',
        );
    }
    if (refused.length) {
      console.log(`\nRefused by the remote (${refused.length}) — needs push rights to delete refs:`);
      for (const r of refused.slice(0, 5)) console.log(`  ! ${r.name}: ${r.error}`);
    }
    if (!APPLY && targets.length) console.log('\nNothing was deleted. Re-run with --apply to act.');
  }

  // Non-zero only on a real failure, so CI can run this as a report safely.
  process.exit(refused.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('prune failed:', e?.message || e);
  process.exit(2);
});
