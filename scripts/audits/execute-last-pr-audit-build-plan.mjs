#!/usr/bin/env node
/**
 * Execute the last-20-PRs audit build plan.
 *
 * Runs three steps in sequence:
 *   1. Regenerate the structural wiring audit for the latest N merged PRs.
 *   2. TypeScript typecheck.
 *   3. Production build.
 *
 * Reports the outcome as both a markdown summary and a JSON sidecar. Each
 * step is classified by failure type so callers can distinguish environment
 * problems from real regressions.
 *
 * CLI:
 *   --limit N            How many PRs to include in the wiring audit (default 20).
 *   --date YYYY-MM-DD    Report date suffix (default today).
 *   --auto-install       If node_modules is missing, run `npm ci` before the plan.
 *   --strict             Fail the process when any step is skipped (not just failed).
 *
 * Each helper is exported so the test suite can exercise it without spawning
 * a child process.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// ─── CLI parsing ────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const opts = {
    limit: 20,
    date: new Date().toISOString().slice(0, 10),
    autoInstall: false,
    strict: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--limit':
        opts.limit = Number(argv[++i]);
        if (!Number.isFinite(opts.limit) || opts.limit <= 0) opts.limit = 20;
        break;
      case '--date':
        opts.date = argv[++i];
        break;
      case '--auto-install':
        opts.autoInstall = true;
        break;
      case '--strict':
        opts.strict = true;
        break;
      default:
        // Unknown flags are ignored to keep forward-compat.
        break;
    }
  }
  return opts;
}

// ─── Failure classification ─────────────────────────────────────────────────

/**
 * Classify a failure's stderr/stdout to distinguish reproducible regressions
 * from environment / network / dependency issues. Used by the report and by
 * strict-mode gating.
 */
export function classifyFailure(output) {
  const text = String(output || '').toLowerCase();
  if (
    text.includes('not found') ||
    text.includes('cannot find type definition') ||
    text.includes('cannot find module') ||
    text.includes('missing dependency') ||
    text.includes('eresolve')
  ) {
    return 'environment_dependency';
  }
  if (
    text.includes('e403') ||
    text.includes('forbidden') ||
    text.includes('etarget') ||
    text.includes('econnrefused') ||
    text.includes('network policy') ||
    text.includes('proxy')
  ) {
    return 'environment_network_policy';
  }
  return 'application_or_config';
}

// ─── Step helpers ───────────────────────────────────────────────────────────

export function trimOutput(output, max = 1200) {
  if (!output) return '_no output_';
  return output.length <= max ? output : `${output.slice(0, max)}\n... (truncated)`;
}

export function skippedStep(cmd, output) {
  const now = new Date().toISOString();
  return {
    cmd,
    status: 'skipped',
    classification: 'skipped_due_to_preflight',
    startedAt: now,
    finishedAt: now,
    exitCode: null,
    output,
  };
}

function runStep(cmd) {
  const startedAt = new Date().toISOString();
  try {
    const out = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      cmd,
      status: 'pass',
      classification: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: 0,
      output: out.trim(),
    };
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    return {
      cmd,
      status: 'fail',
      classification: classifyFailure(output),
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: error.status ?? 1,
      output,
    };
  }
}

// ─── Report writers ─────────────────────────────────────────────────────────

export function writeMarkdownReport({ outputPath, options, preflightNotes, steps }) {
  const passCount = steps.filter(s => s.status === 'pass').length;
  const failCount = steps.filter(s => s.status === 'fail').length;
  const skipCount = steps.filter(s => s.status === 'skipped').length;

  const lines = [
    `# Last-${options.limit} PR Audit Build Plan Execution (${options.date})`,
    '',
    '## Plan',
    `1. Regenerate structural wiring audit for the latest ${options.limit} merged PRs.`,
    '2. Run TypeScript validation against the baseline (`npm run ci:typecheck:no-regression`).',
    '3. Run production build (`npm run build`).',
    '',
    '## Preflight',
    ...(preflightNotes.length > 0 ? preflightNotes.map(item => `- ${item}`) : ['- ✅ Local prerequisites detected.']),
    '',
    '## Execution Summary',
    `- Passed steps: **${passCount}**`,
    `- Failed steps: **${failCount}**`,
    `- Skipped steps: **${skipCount}**`,
    '',
    '## Step Results',
  ];

  for (const step of steps) {
    const emoji = step.status === 'pass' ? '✅' : step.status === 'skipped' ? '⏭️' : '❌';
    lines.push(`### ${emoji} \`${step.cmd}\``);
    lines.push(`- Status: ${step.status}`);
    if (step.classification) lines.push(`- Classification: ${step.classification}`);
    lines.push(`- Started: ${step.startedAt}`);
    lines.push(`- Finished: ${step.finishedAt}`);
    if (step.exitCode !== undefined && step.exitCode !== null) lines.push(`- Exit code: ${step.exitCode}`);
    lines.push('');
    lines.push('```text');
    lines.push(trimOutput(step.output));
    lines.push('```');
    lines.push('');
  }

  lines.push('## Recommended Next Actions');
  if (failCount === 0 && skipCount === 0) {
    lines.push('- ✅ All plan steps succeeded in this environment.');
  } else if (failCount === 0 && skipCount > 0) {
    lines.push('- ⏭️ No hard failures occurred, but one or more checks were skipped. Resolve the preflight blockers and rerun for full coverage.');
  } else {
    lines.push('- Install/restore dependencies (`npm ci`) and rerun this plan script.');
    lines.push('- If type defs are still missing, verify `@types/*` packages from `package.json` are present in the lockfile.');
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

export function writeJsonReport(outputPath, { options, preflightNotes, steps }) {
  const payload = {
    options,
    preflightNotes,
    steps,
    generatedAt: new Date().toISOString(),
  };
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

// ─── Entry point ────────────────────────────────────────────────────────────

function main(argv) {
  const opts = parseArgs(argv);
  const mdPath = `docs/audits/LAST_${opts.limit}_PRS_BUILD_PLAN_EXECUTION_${opts.date}.md`;
  const jsonPath = `docs/audits/LAST_${opts.limit}_PRS_BUILD_PLAN_EXECUTION_${opts.date}.json`;

  const preflightNotes = [];
  let preflightOk = true;
  if (!existsSync('node_modules')) {
    if (opts.autoInstall) {
      preflightNotes.push('node_modules missing — running `npm ci`.');
      try {
        execSync('npm ci', { stdio: 'inherit', encoding: 'utf8' });
      } catch {
        preflightNotes.push('⚠️ `npm ci` failed; downstream steps will be skipped.');
        preflightOk = false;
      }
    } else {
      preflightNotes.push('⚠️ `node_modules/` is missing; package dependencies may not be installed.');
      preflightOk = false;
    }
  }

  const stepCmds = [
    `node scripts/audits/generate-last-pr-wiring-audit.mjs --limit ${opts.limit} --date ${opts.date} --output docs/audits/LAST_${opts.limit}_PRS_WIRING_AUDIT_${opts.date}.md`,
    // The strict-plan job's purpose is "did anything regress on this
    // branch?". `npm run typecheck` is bare `tsc --noEmit`, which always
    // fails on the codebase's ~2,600 latent type errors that predate
    // this rollout (tracked by .typecheck-baseline.json). The
    // baseline-aware gate is the right interpretation of "regressed".
    'npm run ci:typecheck:no-regression',
    'npm run build',
  ];

  const steps = preflightOk
    ? stepCmds.map(runStep)
    : stepCmds.map(cmd => skippedStep(cmd, 'Skipped: preflight failed (missing node_modules)'));

  writeMarkdownReport({ outputPath: mdPath, options: opts, preflightNotes, steps });
  writeJsonReport(jsonPath, { options: opts, preflightNotes, steps });
  process.stdout.write(`Wrote plan execution report: ${mdPath}\n`);

  const failCount = steps.filter(s => s.status === 'fail').length;
  const skipCount = steps.filter(s => s.status === 'skipped').length;
  if (failCount > 0 || (opts.strict && skipCount > 0)) {
    process.exitCode = 1;
  }
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
  main(process.argv.slice(2));
}
