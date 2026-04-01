#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const today = new Date().toISOString().slice(0, 10);
const output = `docs/audits/LAST_20_PRS_BUILD_PLAN_EXECUTION_${today}.md`;

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
      startedAt,
      finishedAt: new Date().toISOString(),
      output: out.trim(),
    };
  } catch (error) {
    return {
      cmd,
      status: 'fail',
      startedAt,
      finishedAt: new Date().toISOString(),
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim(),
      code: error.status ?? 1,
    };
  }
}

function trimOutput(output, max = 1200) {
  if (!output) return '_no output_';
  return output.length <= max ? output : `${output.slice(0, max)}\n... (truncated)`;
}

function main() {
  const preflight = [];
  if (!existsSync('node_modules')) {
    preflight.push('`node_modules/` is missing; package dependencies may not be installed.');
  }

  const steps = [
    runStep(
      `node scripts/audits/generate-last-pr-wiring-audit.mjs --limit 20 --date ${today} --output docs/audits/LAST_20_PRS_WIRING_AUDIT_${today}.md`,
    ),
    runStep('npm run typecheck'),
    runStep('npm run build'),
  ];

  const passCount = steps.filter((s) => s.status === 'pass').length;
  const failCount = steps.filter((s) => s.status === 'fail').length;

  const lines = [
    `# Last-20 PR Audit Build Plan Execution (${today})`,
    '',
    '## Plan',
    '1. Regenerate structural wiring audit for latest 20 merged PRs.',
    '2. Run TypeScript validation (`npm run typecheck`).',
    '3. Run production build (`npm run build`).',
    '',
    '## Preflight',
    ...(preflight.length > 0 ? preflight.map((item) => `- ⚠️ ${item}`) : ['- ✅ Local prerequisites detected.']),
    '',
    '## Execution Summary',
    `- Passed steps: **${passCount}**`,
    `- Failed steps: **${failCount}**`,
    '',
    '## Step Results',
  ];

  for (const step of steps) {
    const emoji = step.status === 'pass' ? '✅' : '❌';
    lines.push(`### ${emoji} \`${step.cmd}\``);
    lines.push(`- Started: ${step.startedAt}`);
    lines.push(`- Finished: ${step.finishedAt}`);
    if (step.code !== undefined) lines.push(`- Exit code: ${step.code}`);
    lines.push('');
    lines.push('```text');
    lines.push(trimOutput(step.output));
    lines.push('```');
    lines.push('');
  }

  lines.push('## Recommended Next Actions');
  if (failCount === 0) {
    lines.push('- ✅ All plan steps succeeded in this environment.');
  } else {
    lines.push('- Install/restore dependencies (`npm ci`) and rerun this plan script.');
    lines.push('- If type defs are still missing, verify `@types/*` packages from `package.json` are present in lockfile and install step.');
  }

  mkdirSync('docs/audits', { recursive: true });
  writeFileSync(output, `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`Wrote plan execution report: ${output}\n`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main();
