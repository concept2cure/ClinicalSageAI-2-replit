#!/usr/bin/env node
/**
 * Evidence sweep for docs/evaluation-2026-09.
 *
 * Runs every runnable ci:/audit:/readiness: gate, records exit code and tail
 * output, and classifies each result. Re-runnable: `node docs/evaluation-2026-09/evidence/sweep.mjs`
 *
 * Excluded by design (destructive, or mutate state rather than report on it):
 *   :write-baseline  — rewrites the baseline the gate is measured against
 *   :list            — always exits 0, cannot pass or fail
 *   audit:prune-artifacts    — deletes files
 *   audit:last-20-prs:*      — runs `npm ci` and queries GitHub
 *   audit:bundle             — full production build
 */
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TIMEOUT_MS = 300_000;
const EXCLUDE = [
  /:(write-baseline|list)$/,
  /^audit:prune-artifacts$/,
  /^audit:last-20-prs/,
  /^audit:bundle$/,
];

const scripts = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).scripts;
const gates = Object.keys(scripts)
  .filter((k) => /^(ci|audit|readiness):/.test(k))
  .filter((k) => !EXCLUDE.some((re) => re.test(k)))
  .sort();

const results = [];
for (const gate of gates) {
  const started = Date.now();
  let code = 0;
  let out;
  try {
    const r = await run('npm', ['run', '--silent', gate], {
      timeout: TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    out = `${r.stdout}${r.stderr}`;
  } catch (err) {
    code = err.killed ? 124 : (err.code ?? 1);
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  const tail = out.split('\n').filter(Boolean).slice(-6).join('\n');
  results.push({ gate, code, ms: Date.now() - started, tail });
  process.stderr.write(`${code === 0 ? 'PASS' : `EXIT ${code}`}  ${gate}\n`);
}

writeFileSync(
  new URL('01-gate-sweep.json', import.meta.url),
  `${JSON.stringify({ sha: process.env.SWEEP_SHA ?? null, node: process.version, generated: new Date().toISOString(), results }, null, 2)}\n`,
);
process.stderr.write(`\n${results.length} gates; ${results.filter((r) => r.code === 0).length} exit 0\n`);
