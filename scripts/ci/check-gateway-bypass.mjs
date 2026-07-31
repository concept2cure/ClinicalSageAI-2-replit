#!/usr/bin/env node
/**
 * Gateway-bypass guard.
 *
 * The governed AI gateway (server/services/ai-gateway) is the single point that
 * records model, prompt hash, temperature, seed, and the fallback chain for
 * every AI call. Direct LLM client instantiation outside the gateway escapes
 * that audit trail. This guard catches both language surfaces:
 *   - TypeScript/JavaScript: `new OpenAI(...)` / `new Anthropic(...)`
 *   - Python: `OpenAI(...)`, `openai.OpenAI(...)`, `Anthropic(...)`, the async
 *     variants, and the cloud SDK clients (AzureOpenAI, AnthropicBedrock,
 *     AnthropicVertex). Python has no `new` keyword, so the JS regex alone is
 *     blind to it — a Python agent framework (AutoGen/CrewAI/LangChain) or a
 *     sidecar script could otherwise open a second, unaudited egress path.
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

// TS/JS: direct client construction uses `new`.
const JS_PATTERN = 'new (OpenAI|Anthropic)[[:space:]]*\\(';
const JS_SEARCH_PATHS = ['server', 'services', 'workers', 'shared', 'scripts'];

// Python: no `new`; a client is constructed by calling the class. Match both the
// bare (`OpenAI(`) and module-qualified (`openai.OpenAI(`) forms, plus the async
// and cloud-SDK client classes. Scoped to *.py so the JS/`.mjs` sources (which
// carry these names only as pattern data) are never matched.
const PY_CLIENTS =
  'OpenAI|AsyncOpenAI|AzureOpenAI|AsyncAzureOpenAI|Anthropic|AsyncAnthropic|AnthropicBedrock|AnthropicVertex';
const PY_PATTERN = `(^|[^A-Za-z0-9_.])(openai\\.|anthropic\\.)?(${PY_CLIENTS})[[:space:]]*\\(`;
const PY_SEARCH_PATHS = ['*.py'];

// This guard's own source + baseline contain the match pattern as data; they are
// not real client instantiations, so exclude them from the scan.
const SELF_EXCLUDE = new Set([
  'scripts/ci/check-gateway-bypass.mjs',
  'scripts/ci/gateway-bypass-baseline.json',
]);

function grepFiles(pattern, paths) {
  try {
    return execSync(`git grep -lE "${pattern}" -- ${paths.join(' ')}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } catch (err) {
    // git grep exits 1 when there are no matches — treat as empty.
    if (err.status === 1) return '';
    throw err;
  }
}

function currentBypassFiles() {
  const out = `${grepFiles(JS_PATTERN, JS_SEARCH_PATHS)}\n${grepFiles(PY_PATTERN, PY_SEARCH_PATHS)}`;
  const seen = new Set(
    out
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .filter(f => !f.startsWith(GATEWAY_DIR) && !SELF_EXCLUDE.has(f)),
  );
  return [...seen];
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
