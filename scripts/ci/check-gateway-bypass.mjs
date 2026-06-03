#!/usr/bin/env node
/**
 * Gateway-bypass guard.
 *
 * The governed AI gateway (server/services/ai-gateway) is the single point that
 * records model, prompt hash, temperature, seed, and the fallback chain for
 * every AI call. Direct LLM client instantiation (`new OpenAI(...)` /
 * `new Anthropic(...)`) outside the gateway escapes that audit trail.
 *
 * This guard fails if a NEW file instantiates a client directly — i.e. one not
 * already in scripts/ci/gateway-bypass-baseline.json. It does not force-migrate
 * the existing baselined files; it stops the bypass surface from growing and
 * gives a burndown list. Removing a file from the baseline (by routing it
 * through the gateway) is encouraged.
 *
 * Usage: node scripts/ci/check-gateway-bypass.mjs
 * Exit code 1 on a new bypass.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baselinePath = path.join(repoRoot, 'scripts', 'ci', 'gateway-bypass-baseline.json');

const GATEWAY_DIR = 'server/services/ai-gateway/';
const PATTERN = 'new (OpenAI|Anthropic)[[:space:]]*\\(';
const SEARCH_PATHS = ['server', 'services', 'workers', 'shared', 'scripts'];

// This guard's own source + baseline contain the match pattern as data; they are
// not real client instantiations, so exclude them from the scan.
const SELF_EXCLUDE = new Set([
  'scripts/ci/check-gateway-bypass.mjs',
  'scripts/ci/gateway-bypass-baseline.json',
]);

function currentBypassFiles() {
  let out = '';
  try {
    out = execSync(`git grep -lE "${PATTERN}" -- ${SEARCH_PATHS.join(' ')}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } catch (err) {
    // git grep exits 1 when there are no matches — treat as empty.
    if (err.status === 1) return [];
    throw err;
  }
  return out
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(f => !f.startsWith(GATEWAY_DIR) && !SELF_EXCLUDE.has(f));
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const allowed = new Set(baseline.allowed ?? []);
const current = currentBypassFiles();

const added = current.filter(f => !allowed.has(f));
const removed = [...allowed].filter(f => !current.includes(f));

if (removed.length > 0) {
  console.info(
    `[check-gateway-bypass] ${removed.length} baselined file(s) no longer bypass the gateway — ` +
      `prune them from the baseline:\n  ${removed.join('\n  ')}`
  );
}

if (added.length > 0) {
  console.error(
    `\n🚫 [check-gateway-bypass] ${added.length} NEW gateway bypass(es) detected:\n  ${added.join('\n  ')}\n`
  );
  console.error(
    'Route AI calls through server/services/ai-gateway (getGateway) or the shared client so the\n' +
      'request is audited (model, prompt hash, temperature, seed, fallback chain). If a direct\n' +
      'client is genuinely required, justify it and add the file to scripts/ci/gateway-bypass-baseline.json.'
  );
  process.exit(1);
}

console.info(
  `[check-gateway-bypass] OK — no new bypasses (${current.length} baselined site(s) tolerated).`
);
