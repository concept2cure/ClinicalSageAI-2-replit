#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

export function parseArgs(argv) {
  const opts = {
    limit: 20,
    date: new Date().toISOString().slice(0, 10),
    output: null,
    jsonOutput: null,
    autoInstall: false,
    strict: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') {
      opts.limit = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--date') {
      opts.date = argv[i + 1];
      i += 1;
    } else if (arg === '--output') {
      opts.output = argv[i + 1];
      i += 1;
    } else if (arg === '--json-output') {
      opts.jsonOutput = argv[i + 1];
      i += 1;
    } else if (arg === '--auto-install') {
      opts.autoInstall = true;
    } else if (arg === '--strict') {
      opts.strict = true;
    }
  }

  if (!Number.isInteger(opts.limit) || opts.limit <= 0) {
    throw new Error(`--limit must be a positive integer. Received: ${opts.limit}`);
  }

  return opts;
}

export function tryRun(cmd) {
  const startedAt = new Date().toISOString();
  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024,
    });

    return {
      cmd,
      status: 'pass',
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: 0,
      output: output.trim(),
      classification: 'success',
    };
  } catch (error) {
    const joinedOutput = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    return {
      cmd,
      status: 'fail',
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: error.status ?? 1,
      output: joinedOutput,
      classification: classifyFailure(joinedOutput),
    };
  }
}

export function classifyFailure(output) {
  const text = output.toLowerCase();
  if (
    text.includes('vite: not found') ||
    text.includes('cannot find type definition file') ||
    text.includes('node_modules')
  ) {
    return 'environment_dependency';
  }
  if (text.includes('npm error code e403') || text.includes('forbidden')) {
    return 'environment_network_policy';
  }
  return 'application_or_config';
}

export function skippedStep(cmd, reason) {
  const timestamp = new Date().toISOString();
  return {
    cmd,
    status: 'skipped',
    startedAt: timestamp,
    finishedAt: timestamp,
    exitCode: null,
    output: reason,
    classification: 'skipped_due_to_preflight',
  };
}

export function trimOutput(output, max = 1400) {
  if (!output) return '_no output_';
  return output.length <= max ? output : `${output.slice(0, max)}\n... (truncated)`;
}

export function writeMarkdownReport({ outputPath, options, preflightNotes, steps }) {
  const passCount = steps.filter((s) => s.status === 'pass').length;
  const failCount = steps.filter((s) => s.status === 'fail').length;
  const skipCount = steps.filter((s) => s.status === 'skipped').length;

  const lines = [
    `# Last-${options.limit} PR Audit Build Plan Execution (${options.date})`,
    '',
    '## Plan',
    `1. Regenerate structural wiring audit for latest ${options.limit} merged PRs.`,
    '2. Verify dependency baseline (optional install).',
    '3. Run operational checks: typecheck, build, governed export route/shape checks.',
    '',
    '## Preflight',
    ...(preflightNotes.length > 0 ? preflightNotes.map((item) => `- ${item}`) : ['- ✅ No preflight blockers detected.']),
    '',
    '## Execution Summary',
    `- Passed steps: **${passCount}**`,
    `- Failed steps: **${failCount}**`,
    `- Skipped steps: **${skipCount}**`,
    '',
    '## Step Results',
  ];

  for (const step of steps) {
    const emoji = step.status === 'pass' ? '✅' : step.status === 'skipped' ? '⚠️' : '❌';
    lines.push(`### ${emoji} \`${step.cmd}\``);
    lines.push(`- Status: ${step.status}`);
    lines.push(`- Classification: ${step.classification}`);
    lines.push(`- Started: ${step.startedAt}`);
    lines.push(`- Finished: ${step.finishedAt}`);
    if (step.exitCode !== null) {
      lines.push(`- Exit code: ${step.exitCode}`);
    }
    lines.push('');
    lines.push('```text');
    lines.push(trimOutput(step.output));
    lines.push('```');
    lines.push('');
  }

  lines.push('## Recommended Next Actions');
  if (failCount === 0 && skipCount === 0) {
    lines.push('- ✅ Operational checks completed successfully in this environment.');
  } else if (failCount === 0 && skipCount > 0) {
    lines.push('- ⚠️ No hard failures occurred, but one or more checks were skipped due to environment preflight blockers.');
    lines.push('- Resolve preflight blockers, then rerun with `npm run audit:last-20-prs:plan:auto-install` or in CI with dependencies preinstalled.');
  } else {
    lines.push('- Run with `--auto-install` after confirming network access/policy for dependency installation.');
    lines.push('- If install is blocked, execute this script in CI where dependencies are pre-provisioned.');
    lines.push('- Investigate failures with classification `application_or_config` first; those are most likely real regressions.');
  }

  mkdirSync('docs/audits', { recursive: true });
  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

export function writeJsonReport(pathname, payload) {
  writeFileSync(pathname, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = options.output ?? `docs/audits/LAST_${options.limit}_PRS_BUILD_PLAN_EXECUTION_${options.date}.md`;
  const jsonOutputPath = options.jsonOutput ?? `docs/audits/LAST_${options.limit}_PRS_BUILD_PLAN_EXECUTION_${options.date}.json`;

  const preflightNotes = [];
  let dependenciesReady = existsSync('node_modules');
  if (!dependenciesReady) {
    preflightNotes.push('⚠️ `node_modules/` is missing.');
  }

  const steps = [];
  steps.push(
    tryRun(
      `node scripts/audits/generate-last-pr-wiring-audit.mjs --limit ${options.limit} --date ${options.date} --output docs/audits/LAST_${options.limit}_PRS_WIRING_AUDIT_${options.date}.md`,
    ),
  );

  if (!dependenciesReady && options.autoInstall) {
    const installStep = tryRun('npm ci');
    steps.push(installStep);
    dependenciesReady = installStep.status === 'pass';
  }

  if (!dependenciesReady) {
    const reason = 'Skipped: dependencies are not installed (`node_modules/` missing).';
    steps.push(skippedStep('npm run typecheck', reason));
    steps.push(skippedStep('npm run build', reason));
    steps.push(skippedStep('npm run ci:governed-export-routes', reason));
    steps.push(skippedStep('npm run ci:governed-export-consequence-shape', reason));
  } else {
    steps.push(tryRun('npm run typecheck'));
    steps.push(tryRun('npm run build'));
    steps.push(tryRun('npm run ci:governed-export-routes'));
    steps.push(tryRun('npm run ci:governed-export-consequence-shape'));
  }

  writeMarkdownReport({ outputPath, options, preflightNotes, steps });
  writeJsonReport(jsonOutputPath, { options, preflightNotes, steps });

  process.stdout.write(`Wrote plan execution report: ${outputPath}\n`);
  process.stdout.write(`Wrote machine-readable report: ${jsonOutputPath}\n`);

  if (options.strict && steps.some((step) => step.status !== 'pass')) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
