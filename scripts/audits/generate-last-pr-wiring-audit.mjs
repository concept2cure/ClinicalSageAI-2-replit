#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

export function parseArgs(argv) {
  const opts = {
    limit: 20,
    output: null,
    date: new Date().toISOString().slice(0, 10),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') {
      opts.limit = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--output') {
      opts.output = argv[i + 1];
      i += 1;
    } else if (arg === '--date') {
      opts.date = argv[i + 1];
      i += 1;
    }
  }

  if (!Number.isInteger(opts.limit) || opts.limit <= 0) {
    throw new Error(`--limit must be a positive integer. Received: ${opts.limit}`);
  }

  return opts;
}

function getMergedPrs(limit) {
  const raw = run(`git log --merges --oneline --grep='Merge pull request #' -n ${limit}`);
  if (!raw) return [];

  return raw.split('\n').map((line) => {
    const sha = line.split(' ')[0];
    const match = line.match(/#(\d+)/);
    const pr = match ? Number(match[1]) : null;
    const branch = line.includes(' from ') ? line.split(' from ')[1] : 'unknown';
    return { sha, pr, branch, line };
  });
}

function safeList(cmd) {
  const out = run(cmd);
  return out ? out.split('\n').filter(Boolean) : [];
}

function collectPrMetrics(item) {
  const { sha } = item;
  const files = safeList(`git diff --name-only ${sha}^1 ${sha}`);
  const prSideCommitCount = Number(run(`git rev-list --count ${sha}^1..${sha}^2`));
  const missingFiles = files.filter((file) => !existsSync(file)).length;
  const testsChanged = files.filter((file) => {
    const name = path.basename(file).toLowerCase();
    return file.includes('/__tests__/') || file.startsWith('tests/') || name.includes('test');
  }).length;

  const limitedFiles = files.slice(0, 20);
  let downstreamTouches = 0;
  if (limitedFiles.length > 0) {
    const escaped = limitedFiles.map((file) => `"${file.replace(/"/g, '\\"')}"`).join(' ');
    downstreamTouches = Number(run(`git rev-list --count ${sha}..HEAD -- ${escaped}`));
  }

  const wiringAssessment =
    missingFiles > 0
      ? '❌ Potentially broken (changed files missing at HEAD).'
      : testsChanged > 0
        ? '✅ Structurally wired with test coverage in PR diff.'
        : downstreamTouches > 0
          ? '✅ Structurally wired and actively touched downstream.'
          : '✅ Structurally wired (low-churn path).';

  return {
    ...item,
    prSideCommitCount,
    filesChanged: files.length,
    testsChanged,
    missingFiles,
    downstreamTouches,
    wiringAssessment,
  };
}

export function buildReport({ date, limit, results }) {
  const successful = results.filter((r) => r.missingFiles === 0).length;

  const rows = results
    .map(
      (r) =>
        `| #${r.pr ?? '?'} | \`${r.sha}\` | ${r.prSideCommitCount} | ${r.filesChanged} | ${r.testsChanged} | ${r.missingFiles} | ${r.downstreamTouches} | ${r.wiringAssessment} |`,
    )
    .join('\n');

  return `# Last ${limit} PR Wiring Audit (${date})

## Scope
- Audits the latest **${limit} merged pull requests** reachable from \`HEAD\` using merge commits matching \`Merge pull request #...\`.
- Evaluates structural merge/wiring signals: PR-side commit lineage, changed-file presence at current \`HEAD\`, test-file involvement, and downstream touches.

## Method
1. Enumerate PR merges: \`git log --merges --oneline --grep='Merge pull request #' -n ${limit}\`.
2. For each merge commit, collect:
   - PR branch commit count (\`git rev-list --count <merge>^1..<merge>^2\`),
   - changed files (\`git diff --name-only <merge>^1 <merge>\`),
   - missing-file count at \`HEAD\`,
   - test-file count in diff,
   - downstream touch count for up to 20 changed files (\`git rev-list --count <merge>..HEAD -- <files>\`).
3. Assign a structural wiring assessment from these signals.

## Summary Verdict
- ${successful}/${results.length} audited PRs have **zero missing changed files at HEAD**.
- This report is a **structural wiring audit**; runtime behavior still requires CI/integration execution in a provisioned environment.

## PR-by-PR Results

| PR | Merge SHA | PR-side commits | Files | Tests in PR | Missing files | Downstream touches | Wiring assessment |
|---|---|---:|---:|---:|---:|---:|---|
${rows}

## Usage
- Regenerate this report with:
  - \`node scripts/audits/generate-last-pr-wiring-audit.mjs --limit ${limit} --date ${date} --output docs/audits/LAST_${limit}_PRS_WIRING_AUDIT_${date}.md\`
`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const output =
    opts.output ?? `docs/audits/LAST_${opts.limit}_PRS_WIRING_AUDIT_${opts.date}.md`;

  const prs = getMergedPrs(opts.limit);
  if (prs.length === 0) {
    throw new Error('No merged pull requests found with the expected merge-commit pattern.');
  }

  const results = prs.map(collectPrMetrics);
  const report = buildReport({ date: opts.date, limit: opts.limit, results });

  const outDir = path.dirname(output);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(output, report, 'utf8');

  process.stdout.write(`Wrote audit report: ${output}\n`);
}

// Run when invoked directly; remain importable for tests.
const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main();
}
