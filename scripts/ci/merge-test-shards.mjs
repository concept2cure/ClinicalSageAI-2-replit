#!/usr/bin/env node
/**
 * merge-test-shards.mjs — the one verdict for ci.yml's sharded Test job.
 *
 * ── Why (2026-10-30, MR-02 Stage 3, OPS-25) ──────────────────────────────────
 * The Vitest suite runs one file at a time (vitest.config.ts: maxWorkers 1,
 * fileParallelism false — kept, for the memory reason written there). At 5,809
 * files that takes longer than GitHub's 360-minute job limit, so from
 * 2026-10-24 the Test job was cancelled on almost every push with no verdict at
 * all, and deploy-aws.yml's `ci-verdict` had nothing to read. ci.yml now runs
 * the same command, still one file at a time, in N shards on N runners
 * (`npm test -- --shard=i/N`), and this script is what turns their N reports
 * back into the one `Test` verdict the release-evidence policy names.
 *
 * A sharded suite can be green while having run less than the suite, which is
 * the failure this script exists to refuse. It passes only when ALL hold:
 *   1. every shard 1..N delivered its Vitest report and its Jest report;
 *   2. the files the shards report are exactly the files `vitest list
 *      --filesOnly` collects for vitest.config.ts — none missing, none extra,
 *      none run twice;
 *   3. every shard's Vitest and Jest reports say success, and the shard jobs
 *      themselves concluded success (SHARD_JOBS_RESULT, from `needs`).
 * Anything else exits 1 and names each reason. Nothing is inferred from a
 * missing report: an absent shard is a failed Test, never a smaller one.
 *
 * Writes <out>/vitest.json (the shards' testResults concatenated, counts
 * summed), <out>/jest.json (shard 1's, Jest being the same six files in every
 * shard) and <out>/shards.json (per-shard summary and the checks above).
 *
 * Usage: node scripts/ci/merge-test-shards.mjs --shards 8 --dir shards --out test-results
 *          [--collected collected.json]   # a `vitest list --filesOnly --json` file; default: run it
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const COUNTERS = [
  'numTotalTestSuites', 'numPassedTestSuites', 'numFailedTestSuites', 'numPendingTestSuites',
  'numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests',
];

/** Repository-relative, forward-slashed: a runner's checkout path differs per shard. */
export function relativeFile(name, root = ROOT) {
  const normalized = String(name).replace(/\\/g, '/');
  const marker = `${root.replace(/\\/g, '/')}/`;
  if (normalized.startsWith(marker)) return normalized.slice(marker.length);
  // Another runner's checkout: …/<repo>/<repo>/<path>. Keep what follows the
  // first top-level directory the suite is collected from.
  const m = normalized.match(/(?:^|\/)((?:tests|server|client|shared)\/.*)$/);
  return m ? m[1] : normalized;
}

function readJson(file) {
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    return { error: fs.existsSync(file) ? `unreadable (${err.message})` : 'missing' };
  }
}

/**
 * The decision, free of I/O so its failure branches can be exercised directly.
 * shards: [{ index, vitest?: object, vitestError?: string, jest?: object, jestError?: string }]
 */
export function evaluateShards({ total, shards, collected, shardJobsResult }) {
  const problems = [];
  const byIndex = new Map(shards.map((s) => [s.index, s]));
  const seen = new Map();
  const merged = { success: true, testResults: [] };
  for (const key of COUNTERS) merged[key] = 0;
  const perShard = [];

  for (let i = 1; i <= total; i += 1) {
    const shard = byIndex.get(i);
    if (!shard) {
      problems.push(`shard ${i}/${total} delivered no results`);
      perShard.push({ shard: i, delivered: false });
      continue;
    }
    if (!shard.vitest) problems.push(`shard ${i}/${total}: Vitest report ${shard.vitestError ?? 'missing'}`);
    if (!shard.jest) problems.push(`shard ${i}/${total}: Jest report ${shard.jestError ?? 'missing'}`);
    const files = [];
    if (shard.vitest) {
      if (shard.vitest.success !== true) problems.push(`shard ${i}/${total}: Vitest reports failure (${shard.vitest.numFailedTests ?? '?'} failed test(s))`);
      for (const key of COUNTERS) merged[key] += Number(shard.vitest[key] ?? 0);
      for (const result of shard.vitest.testResults ?? []) {
        const file = relativeFile(result.name);
        files.push(file);
        if (seen.has(file)) problems.push(`${file} ran in shard ${seen.get(file)} and again in shard ${i}`);
        else seen.set(file, i);
        merged.testResults.push(result);
      }
    }
    if (shard.jest && shard.jest.success !== true) problems.push(`shard ${i}/${total}: Jest reports failure (${shard.jest.numFailedTests ?? '?'} failed test(s))`);
    perShard.push({
      shard: i,
      delivered: true,
      files: files.length,
      vitestSuccess: shard.vitest?.success === true,
      jestSuccess: shard.jest?.success === true,
      failedTests: Number(shard.vitest?.numFailedTests ?? 0) + Number(shard.jest?.numFailedTests ?? 0),
    });
  }
  for (const s of shards) {
    if (!Number.isInteger(s.index) || s.index < 1 || s.index > total) problems.push(`a report was delivered for shard ${s.index}, which is not one of 1..${total}`);
  }

  const expected = new Set(collected.map((f) => relativeFile(f)));
  const missing = [...expected].filter((f) => !seen.has(f)).sort();
  const extra = [...seen.keys()].filter((f) => !expected.has(f)).sort();
  if (expected.size === 0) problems.push('vitest collected no test files, so there is nothing to compare the shards against');
  if (missing.length) problems.push(`${missing.length} collected file(s) ran in no shard: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}`);
  if (extra.length) problems.push(`${extra.length} file(s) ran that vitest does not collect: ${extra.slice(0, 10).join(', ')}${extra.length > 10 ? ', …' : ''}`);
  if (shardJobsResult !== undefined && shardJobsResult !== 'success') problems.push(`the shard jobs concluded "${shardJobsResult}", not success`);

  merged.success = problems.length === 0;
  return {
    ok: problems.length === 0,
    problems,
    merged,
    summary: { total, collected: expected.size, ran: seen.size, missing: missing.length, extra: extra.length, shardJobsResult: shardJobsResult ?? null, shards: perShard },
  };
}

function collectFiles(collectedPath) {
  if (collectedPath) return JSON.parse(fs.readFileSync(collectedPath, 'utf8')).map((x) => x.file ?? x);
  const out = path.join(ROOT, 'test-results', '.collected-files.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('npx', ['vitest', 'list', '--filesOnly', '--config', 'vitest.config.ts', `--json=${out}`], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  return JSON.parse(fs.readFileSync(out, 'utf8')).map((x) => x.file);
}

function main(argv) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const total = Number(arg('shards'));
  const dir = arg('dir', 'shards');
  const out = arg('out', 'test-results');
  if (!Number.isInteger(total) || total < 1) {
    console.error('merge-test-shards: --shards <N> is required');
    return 2;
  }
  const shards = [];
  for (let i = 1; i <= total; i += 1) {
    const base = path.join(dir, `test-results-shard-${i}`);
    if (!fs.existsSync(base)) continue;
    const vitest = readJson(path.join(base, 'vitest.json'));
    const jest = readJson(path.join(base, 'jest.json'));
    shards.push({ index: i, vitest: vitest.value, vitestError: vitest.error, jest: jest.value, jestError: jest.error });
  }
  const verdict = evaluateShards({ total, shards, collected: collectFiles(arg('collected')), shardJobsResult: process.env.SHARD_JOBS_RESULT });

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'vitest.json'), JSON.stringify(verdict.merged));
  const first = shards.find((s) => s.index === 1);
  if (first?.jest) fs.writeFileSync(path.join(out, 'jest.json'), JSON.stringify(first.jest));
  fs.writeFileSync(path.join(out, 'shards.json'), JSON.stringify({ ...verdict.summary, problems: verdict.problems }, null, 2));

  const s = verdict.summary;
  console.log(`[merge-test-shards] ${total} shard(s); ${s.collected} file(s) collected, ${s.ran} ran; ${verdict.merged.numTotalTests} test(s), ${verdict.merged.numFailedTests} failed.`);
  for (const shard of s.shards) {
    console.log(shard.delivered
      ? `  shard ${shard.shard}/${total}: ${shard.files} file(s), Vitest ${shard.vitestSuccess ? 'passed' : 'FAILED'}, Jest ${shard.jestSuccess ? 'passed' : 'FAILED'}`
      : `  shard ${shard.shard}/${total}: NO RESULTS`);
  }
  if (!verdict.ok) {
    console.error('[merge-test-shards] ❌ Test is not green:');
    for (const p of verdict.problems) console.error(`  • ${p}`);
    return 1;
  }
  console.log('[merge-test-shards] ✅ every collected file ran exactly once and every shard passed.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
