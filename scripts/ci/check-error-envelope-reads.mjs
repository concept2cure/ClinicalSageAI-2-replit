#!/usr/bin/env node
/**
 * CI Guard: no surface reads an API error envelope by hand.
 *
 * ── THE INCIDENT ─────────────────────────────────────────────────────────────
 * `client/src/lib/queryClient.ts` lifted its user-facing message with one
 * expression:
 *
 *   errorPayload?.error?.message || errorPayload?.error || errorPayload?.message
 *
 * Against `{ error: 'PENDING_STORE', message: '<a real sentence>' }` the second
 * term wins, because `error` is a non-empty string, so the third is never
 * reached. The New Project wizard rendered the literal token `PENDING_STORE` in
 * its error banner during MDX UAT — an internal enum presented as the product's
 * user-facing copy, on the first screen an evaluating customer reaches.
 *
 * Fixing that one line was not enough. Twenty-odd surfaces had independently
 * re-implemented the same expression — `json?.error || json?.message`,
 * `typeof p.error === 'string' ? p.error : …` — so the enum still rendered on
 * the task board, the labeling surface, the risk register, mission control and
 * the CMC writes. Each copy was individually reasonable. The set of them is why
 * the fix did not hold the first time.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * There is exactly one reader of an error envelope, in queryClient.ts:
 *
 *   serverMessage(payload)          the sentence the server sent, or null
 *   extractApiError(payload, status){ message, code } with a status fallback
 *   errorCodeOf(payload)            the machine code, for branching
 *
 * They are the only place that knows an enum token is not a sentence, and the
 * only place that filters infrastructure text — SQL, `relation "x" does not
 * exist`, API routes, env vars, file paths, stack frames — out of copy that
 * reaches a screen. In a regulated product that filter is an information
 * disclosure control, not a formatting nicety, so it must not be bypassed by a
 * twenty-first local re-implementation.
 *
 * This gate fails on a NEW hand-rolled read. It does not fail on the ones that
 * remain in the baseline, so it can be adopted without a flag day.
 *
 * ── WHAT IS NOT A VIOLATION ──────────────────────────────────────────────────
 * Reading `.error` off a value that is not an API envelope: dataConnect's
 * `{ data, error }` result, an upload item's own `error` field, an SSE event.
 * Those are matched narrowly against the envelope-shaped patterns below, and
 * anything the patterns cannot distinguish belongs in the baseline with a
 * reason rather than in a widened regex.
 *
 * Usage:
 *   node scripts/ci/check-error-envelope-reads.mjs
 *   node scripts/ci/check-error-envelope-reads.mjs --list
 *   node scripts/ci/check-error-envelope-reads.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');
const SCAN_ROOT = path.join(repoRoot, 'client/src');
const BASELINE_FILE = path.join(repoRoot, 'scripts/ci/error-envelope-reads-baseline.json');

/** The canonical readers. A file that imports one is not the problem. */
const CANONICAL = ['serverMessage', 'extractApiError', 'errorCodeOf'];

/**
 * Envelope-shaped reads. Each targets the specific shape a server error body
 * has, not the word "error" in general.
 */
/**
 * Receivers that hold a PARSED RESPONSE BODY.
 *
 * Keying on the receiver is what makes this gate precise. `.error` alone cannot
 * be judged: `live.error` and `res.error` are dataConnect results whose `error`
 * is ALREADY a safe string lifted by apiRequest, and flagging those would make
 * the gate noise. `body.error` / `json.error` / `payload.error` are the raw
 * envelope, read before anything has decided whether the string is copy.
 *
 * The list is the naming convention this client actually uses; a body bound to
 * an unusual name is a false negative, which for a drift gate is the right way
 * round — it never blocks a correct change, and the common idiom is caught.
 */
const ENVELOPE = '(?:body|json|payload|parsed|errorPayload|errorBody|j|p|b)';

const PATTERNS = [
  // body?.error || 'fallback'   — the read is producing COPY
  { id: 'envelope-error-or-copy', re: new RegExp(`\\b${ENVELOPE}\\??\\.error\\s*(?:\\|\\||\\?\\?)\\s*['"\`]`) },
  // body?.error || body?.message — the exact precedence bug
  { id: 'envelope-error-or-message', re: new RegExp(`\\b${ENVELOPE}\\??\\.error\\s*(?:\\|\\||\\?\\?)\\s*[\\w?.]*\\.message\\b`) },
  // typeof body.error === 'string' — the branch that treats a token as a sentence
  { id: 'typeof-error-string', re: /typeof\s+[\w?.]*\.error\s*===\s*['"]string['"]/ },
  // body?.error?.message — reads the nested envelope without the filters
  { id: 'envelope-error-dot-message', re: new RegExp(`\\b${ENVELOPE}\\??\\.error\\??\\.message\\b`) },
];

/** Files that are allowed to read envelopes directly: the readers themselves. */
const EXEMPT = new Set([
  'lib/queryClient.ts',
  'lib/__tests__/api-error-extraction.test.ts',
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const findings = [];
for (const file of walk(SCAN_ROOT)) {
  const rel = path.relative(SCAN_ROOT, file).split(path.sep).join('/');
  if (EXEMPT.has(rel)) continue;
  const src = fs.readFileSync(file, 'utf8');
  // A file that already uses a canonical reader for a given line is still
  // flagged if it ALSO hand-rolls one elsewhere — partial migration is exactly
  // how the enum survived the first fix.
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (!code.trim() || code.trimStart().startsWith('*')) return;
    if (CANONICAL.some((fn) => code.includes(fn))) return;
    for (const { id, re } of PATTERNS) {
      if (re.test(code)) {
        findings.push({ site: `${rel}:${i + 1}`, rule: id });
        break;
      }
    }
  });
}

findings.sort((a, b) => a.site.localeCompare(b.site));
const currentSites = new Set(findings.map((f) => f.site));

if (process.argv.includes('--list')) {
  for (const f of findings) console.log(`${f.site}  [${f.rule}]`);
  console.log(`\n${findings.length} hand-rolled envelope read(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE_FILE,
    JSON.stringify(
      {
        note:
          'Hand-rolled API error-envelope reads that predate the single-reader rule. ' +
          'Migrate onto serverMessage/extractApiError (client/src/lib/queryClient.ts) ' +
          'and re-run with --write-baseline to shrink this list. It must never grow.',
        generatedBy: 'scripts/ci/check-error-envelope-reads.mjs --write-baseline',
        sites: findings.map((f) => f.site),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`[ci:error-envelope] baseline written — ${findings.length} site(s).`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE_FILE)) {
  console.error(
    '[ci:error-envelope] FAIL — baseline missing. Generate it with:\n' +
      '  node scripts/ci/check-error-envelope-reads.mjs --write-baseline',
  );
  process.exit(1);
}

const baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).sites);
const introduced = findings.filter((f) => !baseline.has(f.site));
const resolved = [...baseline].filter((s) => !currentSites.has(s));

if (introduced.length > 0) {
  console.error(
    `\n[ci:error-envelope] FAIL — ${introduced.length} new hand-rolled error-envelope read(s):\n`,
  );
  for (const f of introduced) console.error(`  ${f.site}  [${f.rule}]`);
  console.error(
    '\n  Read the envelope through the single canonical reader instead:\n' +
      "    import { serverMessage } from '@/lib/queryClient';\n" +
      "    const msg = serverMessage(body) ?? '<your own domain fallback>';\n" +
      '\n' +
      '  Reading `error` first renders the enum token (PENDING_STORE, FORBIDDEN)\n' +
      '  as user copy, and bypasses the filter that keeps SQL, relation names,\n' +
      '  routes and env vars off the screen.\n' +
      '\n' +
      '  If the match is a false positive — an `.error` that is not an API\n' +
      '  envelope — add it to the baseline with --write-baseline and say why in\n' +
      '  the commit message.\n',
  );
  process.exit(1);
}

let msg = `[ci:error-envelope] OK — ${findings.length} hand-rolled read(s) (baseline ${baseline.size}), none new.`;
if (resolved.length > 0) {
  msg +=
    `\n  ${resolved.length} baseline site(s) migrated. Shrink the baseline:\n` +
    '    node scripts/ci/check-error-envelope-reads.mjs --write-baseline';
}
console.log(msg);
process.exit(0);
