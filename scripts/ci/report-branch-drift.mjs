#!/usr/bin/env node

/**
 * report-branch-drift.mjs
 *
 * Compares concept2cure-v2 against supplied branches (or all remote claude/* branches)
 * and reports:
 *   - files changed per branch
 *   - branches with zero meaningful diff
 *   - branches with likely stranded changes
 *
 * Usage:
 *   node scripts/ci/report-branch-drift.mjs                    # all claude/* branches
 *   node scripts/ci/report-branch-drift.mjs branch1 branch2    # specific branches
 *
 * Exit code: always 0 (report only, does not block CI)
 */

import { execSync } from 'node:child_process';

const BASE = 'origin/concept2cure-v2';

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 30_000 }).trim();
  } catch {
    return '';
  }
}

function getBranches(args) {
  if (args.length > 0) {
    return args.map(b => b.startsWith('origin/') ? b : `origin/${b}`);
  }
  // Default: all remote claude/* branches
  const raw = run('git branch -r');
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('origin/claude/'))
    .filter(l => l !== 'origin/claude/repo-control-guardrails-ntLIR'); // exclude self
}

function analyzeBranch(branch) {
  const shortName = branch.replace('origin/', '');

  // Check if branch tip is ancestor of base (i.e., merged)
  const mergeBase = run(`git merge-base ${BASE} ${branch}`);
  const branchTip = run(`git rev-parse ${branch}`);
  const isMerged = mergeBase === branchTip;

  // Get diff stats
  const stat = run(`git diff --stat ${BASE}...${branch}`);
  const files = run(`git diff --name-only ${BASE}...${branch}`)
    .split('\n')
    .filter(Boolean);

  // Parse summary line
  const summaryMatch = stat.match(/(\d+) files? changed/);
  const filesChanged = summaryMatch ? parseInt(summaryMatch[1], 10) : 0;

  const insertMatch = stat.match(/(\d+) insertions?\(\+\)/);
  const insertions = insertMatch ? parseInt(insertMatch[1], 10) : 0;

  const deleteMatch = stat.match(/(\d+) deletions?\(-\)/);
  const deletions = deleteMatch ? parseInt(deleteMatch[1], 10) : 0;

  // Classify
  let status;
  if (isMerged) {
    status = 'MERGED';
  } else if (filesChanged === 0) {
    status = 'EMPTY';
  } else if (files.every(f => f.startsWith('docs/'))) {
    status = 'DOCS-ONLY';
  } else {
    status = 'STRANDED';
  }

  return {
    branch: shortName,
    status,
    filesChanged,
    insertions,
    deletions,
    files,
  };
}

// --- Main ---

// Ensure we have remote refs
run('git fetch origin --prune 2>/dev/null');

const args = process.argv.slice(2);
const branches = getBranches(args);

if (branches.length === 0) {
  console.log('No branches to analyze.');
  process.exit(0);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`  Branch Drift Report — ${new Date().toISOString().slice(0, 10)}`);
console.log(`  Base: ${BASE}`);
console.log(`  Branches analyzed: ${branches.length}`);
console.log(`${'='.repeat(70)}\n`);

const results = branches.map(analyzeBranch);

// Summary table
console.log('STATUS      | FILES | +INS  | -DEL  | BRANCH');
console.log('------------|-------|-------|-------|-------');
for (const r of results) {
  const status = r.status.padEnd(11);
  const files = String(r.filesChanged).padStart(5);
  const ins = String(r.insertions).padStart(5);
  const del = String(r.deletions).padStart(5);
  console.log(`${status} | ${files} | ${ins} | ${del} | ${r.branch}`);
}

// Stranded branches
const stranded = results.filter(r => r.status === 'STRANDED');
if (stranded.length > 0) {
  console.log(`\n--- STRANDED BRANCHES (${stranded.length}) ---\n`);
  for (const r of stranded) {
    console.log(`  ${r.branch}`);
    console.log(`    ${r.filesChanged} files, +${r.insertions}/-${r.deletions}`);
    console.log(`    Key files:`);
    for (const f of r.files.slice(0, 8)) {
      console.log(`      ${f}`);
    }
    if (r.files.length > 8) {
      console.log(`      ... and ${r.files.length - 8} more`);
    }
    console.log('');
  }
}

// Empty / merged
const empty = results.filter(r => r.status === 'EMPTY' || r.status === 'MERGED');
if (empty.length > 0) {
  console.log(`\n--- MERGED / EMPTY BRANCHES (${empty.length}) ---\n`);
  for (const r of empty) {
    console.log(`  ${r.branch} — ${r.status}`);
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`  Total: ${results.length} branches | ${stranded.length} stranded | ${empty.length} merged/empty`);
console.log(`${'='.repeat(70)}\n`);

process.exit(0);
