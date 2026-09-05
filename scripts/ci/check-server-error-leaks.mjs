#!/usr/bin/env node
/**
 * CI Guard: a server error response may not carry the underlying failure text.
 *
 * ── THE INCIDENT ─────────────────────────────────────────────────────────────
 * `serverError()` in server/lib/api-response.ts copied `err.message` into the
 * response body while its own docstring claimed the envelope was "sanitized".
 * A route whose relation was missing answered the browser with
 *
 *     500 {"error":"relation \"software_lifecycle_items\" does not exist"}
 *
 * — verbatim the string MDX_WORK_ORDER's W0-3 verification step says must never
 * appear, delivered to whoever holds the session. That helper was fixed: the
 * detail now goes to the log, keyed by the request id echoed as X-Request-Id,
 * and the client gets a code, a sentence and that id.
 *
 * Fixing the helper was not enough. 346 sites across 72 files answer a 5xx with
 * `err.message` WITHOUT going through it — mostly a `fail()` helper that was
 * copy-pasted per route file. Each copy is individually reasonable. The set of
 * them is why fixing one function did not close the finding.
 *
 * ── WHY THIS IS A CONTROL, NOT A TIDINESS RULE ───────────────────────────────
 * The reader of these bodies is a regulatory director, and in a regulated
 * product the internal shape of a governed store — relation names, driver text,
 * constraint names, a host and port from ECONNREFUSED — is an
 * information-disclosure finding. Client-side redaction does not help: it
 * scrubs at render time and leaves the API still shipping the string to a proxy
 * log, a devtools panel or a saved HAR.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * One way to answer a server error: `serverError(res, log, where, err)`, which
 * logs the detail and returns { error: CODE, message, correlationId }. A 5xx
 * body that reads `.message` off the caught error is a bypass.
 *
 * This gate fails on a NEW bypass. It does not fail on the ones already in the
 * baseline, so it can be adopted today and the list is worked down over time.
 * The list MAY SHRINK, NEVER GROW.
 *
 * ── Identity is per FILE, not per line ───────────────────────────────────────
 * The first cut of this gate keyed each site on `file:line`. Within a day it
 * reported nine new leaks in two files whose true count had not changed at all:
 * another change had edited those files ABOVE the leaks and shifted every line
 * number. A gate that fires on unrelated edits is a gate people learn to
 * re-baseline past, which is how a ratchet quietly becomes a rubber stamp.
 *
 * So a file's baseline is a COUNT. A file may not gain a leak; it may lose as
 * many as it likes. Line numbers are still reported by --list, because that is
 * how you find them — they are just not the identity.
 *
 * ── WHAT IS NOT A VIOLATION ──────────────────────────────────────────────────
 *   - `serverError(...)` — the canonical helper. It does not inline a 5xx body.
 *   - `pendingStore(...)` (server/routes/c2c/projects.ts) — builds its object in
 *     a function that logs the relation and returns a sentence; no inline read.
 *   - A 5xx whose body is a literal string, or reads `.message` off something
 *     that is not the caught error (a validation result, a job record).
 *   - 4xx responses. A 400 echoing a validation message is the intended
 *     behaviour and a different question entirely.
 *
 * Usage:
 *   node scripts/ci/check-server-error-leaks.mjs                 # fail on new
 *   node scripts/ci/check-server-error-leaks.mjs --list          # show all
 *   node scripts/ci/check-server-error-leaks.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_ROOTS = ['server'].map((d) => path.join(repoRoot, d));
const BASELINE_FILE = path.join(repoRoot, 'scripts/ci/server-error-leaks-baseline.json');

/** A 5xx status being sent. Captures the code so 4xx never enters the scan. */
const STATUS_5XX = /\.status\(\s*(5\d\d)\s*\)/g;

/**
 * The caught-error bindings this codebase actually uses. Keying on the binding
 * is what keeps the gate precise: `.message` alone cannot be judged — a job
 * record, a validation result and a Zod issue all have one — but `err.message`
 * inside a 5xx body is the failure text by construction.
 *
 * The list used to be literal — err|error|e|ex|cause|reason|dbErr|dbError|pgErr
 * — which meant a catch NAMED for what it was doing was invisible to the gate.
 * `catch (promoteErr)`, `catch (renderErr)`, `catch (fallbackErr)`,
 * `catch (artErr)` are all ordinary in this tree, and six 5xx bodies were
 * shipping `<thing>Err.message` to the client while this gate reported green.
 * A gate that is silent on a naming convention the codebase actually uses is
 * not measuring what its name says. The trailing alternative matches any
 * identifier ending in `Err`/`Error`; the fixed names stay for `e`, `ex`,
 * `cause` and `reason`, which that pattern cannot cover.
 */
const ERR_BINDING =
  '(?:err|error|e|ex|cause|reason|[A-Za-z_$][\\w$]*(?:Err|Error))';

/** `.message` read off a caught error, in any of the observed spellings. */
const LEAK_PATTERNS = [
  // err.message / error?.message / e.message
  new RegExp(`\\b${ERR_BINDING}\\s*\\??\\.\\s*message\\b`),
  // (error as Error).message  /  (err as any).message
  new RegExp(`\\(\\s*${ERR_BINDING}\\s+as\\s+[\\w.<>\\[\\] ]+\\s*\\)\\s*\\??\\.\\s*message\\b`),
  // String(err) — the same disclosure by another route
  new RegExp(`\\bString\\(\\s*${ERR_BINDING}\\s*\\)`),
  // err.stack — strictly worse than a message
  new RegExp(`\\b${ERR_BINDING}\\s*\\??\\.\\s*stack\\b`),
  // err.detail / err.hint / err.constraint — the Postgres driver's own fields
  new RegExp(`\\b${ERR_BINDING}\\s*\\??\\.\\s*(?:detail|hint|constraint|table|column|routine)\\b`),
];

/**
 * How far past `.status(5xx)` to read. A response body is written as one
 * expression; 600 characters covers every multi-line form in this tree with
 * room to spare, and stopping there keeps an unrelated later statement out of
 * the window.
 */
const WINDOW = 600;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'build', '__tests__', '__mocks__'].includes(entry.name)) continue;
      walk(full, out);
    } else if (/\.(ts|js|mts|mjs)$/.test(entry.name) && !/\.(test|spec|d)\.(ts|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Strip comments so prose about this very rule does not trip it. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}

/**
 * Index just past the response statement beginning at `window[0]`.
 *
 * Walks from the `res.status(...)` call tracking bracket depth, skipping string
 * and template literals so a `;` or brace inside a message cannot end it early,
 * and stops at the first `;` at depth 0 — the actual end of the statement. Falls
 * back to the whole window if the statement is unterminated within it.
 */
function responseStatementEnd(window) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < window.length; i++) {
    const c = window[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; continue; }
    if (c === ';' && depth <= 0) return i + 1;
  }
  return window.length;
}

const findings = [];
for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const rel = path.relative(repoRoot, file).split(path.sep).join('/');
    const raw = fs.readFileSync(file, 'utf8');
    const src = stripComments(raw);
    STATUS_5XX.lastIndex = 0;
    let m;
    while ((m = STATUS_5XX.exec(src)) !== null) {
      const window = src.slice(m.index, m.index + WINDOW);
      // Only the body that is actually being sent.
      //
      // This used to cut at the first BLANK LINE, which is not the end of a
      // statement — and the common shape of a fail-closed handler has no blank
      // line in it:
      //
      //     return res.status(503).json({ error: { code: 'X', message: 'static' } });
      //   }
      //   console.error('...', err instanceof Error ? err.message : String(err));
      //
      // so the LOGGER's `err.message` was attributed to the RESPONSE and a
      // correct handler was reported as a leak. That is worse than a missed
      // finding: a gate that fires on correct code is one people silence by
      // widening the baseline, which is how a real leak gets in.
      const body = window.slice(0, responseStatementEnd(window));
      if (!/\.json\s*\(|\.send\s*\(/.test(body)) continue;
      const hit = LEAK_PATTERNS.find((re) => re.test(body));
      if (!hit) continue;
      const line = src.slice(0, m.index).split('\n').length;
      findings.push({ site: `${rel}:${line}`, status: m[1] });
    }
  }
}

findings.sort((a, b) => a.site.localeCompare(b.site));

/** Leaks per file — the unit the baseline is expressed in. */
function tally(list) {
  const byFile = {};
  for (const f of list) {
    const file = f.site.slice(0, f.site.lastIndexOf(':'));
    byFile[file] = (byFile[file] || 0) + 1;
  }
  return byFile;
}
const counts = tally(findings);

if (process.argv.includes('--list')) {
  for (const f of findings) console.log(`${f.site}  [${f.status}]`);
  console.log(`\n${findings.length} server-error leak site(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE_FILE,
    JSON.stringify(
      {
        note:
          'Server 5xx responses that put the caught error text in the body instead of the log. ' +
          'The canonical answer is serverError(res, log, where, err) in server/lib/api-response.ts, ' +
          'which logs the detail against the request id and returns { error: CODE, message, correlationId }. ' +
          'Migrate a site onto it and re-run with --write-baseline to shrink this list. It must never grow.',
        rule: 'MDX_WORK_ORDER W0-3 acceptance criterion 3; BIOPHARMA_WORK_ORDER hard guardrail 3.',
        generatedBy: 'scripts/ci/check-server-error-leaks.mjs --write-baseline',
        totalSites: findings.length,
        totalFiles: Object.keys(counts).length,
        /* Per-file COUNTS, not line numbers: an edit above a leak must not read
           as a new leak. Run --list to see where they are. */
        counts,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `[ci:server-error-leaks] baseline written — ${findings.length} site(s) across ${Object.keys(counts).length} file(s).`,
  );
  process.exit(0);
}

if (!fs.existsSync(BASELINE_FILE)) {
  console.error(
    '[ci:server-error-leaks] FAIL — baseline missing. Generate it with:\n' +
      '  node scripts/ci/check-server-error-leaks.mjs --write-baseline',
  );
  process.exit(1);
}

const baselineDoc = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
const baselineCounts = baselineDoc.counts ?? {};

const grown = [];
let fixedTotal = 0;
for (const file of new Set([...Object.keys(counts), ...Object.keys(baselineCounts)])) {
  const now = counts[file] ?? 0;
  const was = baselineCounts[file] ?? 0;
  if (now > was) grown.push({ file, was, now });
  else if (now < was) fixedTotal += was - now;
}

if (grown.length) {
  console.error('\n❌ A server error response carries the underlying failure text.\n');
  for (const g of grown) {
    console.error(`   ${g.file} — ${g.was} → ${g.now}`);
    for (const f of findings.filter((x) => x.site.startsWith(`${g.file}:`))) {
      console.error(`       ${f.site}  [${f.status}]`);
    }
  }
  console.error(
    '\n   The reader of this body is a regulatory director, and the internal shape of a\n' +
      '   governed store is an information-disclosure finding, not a formatting nicety.\n' +
      '   Client-side redaction does not close it — the API still ships the string.\n\n' +
      '   Send through the canonical helper instead:\n' +
      "     import { serverError } from '../lib/api-response';\n" +
      "     } catch (err) { return serverError(res, log, 'listing the register', err); }\n\n" +
      '   It logs the detail against the request id and answers with a code, a sentence\n' +
      '   and that id — so the operator can still find the real error.\n',
  );
  process.exit(1);
}

console.log(
  `[ci:server-error-leaks] OK — ${findings.length} baselined site(s) across ` +
    `${Object.keys(counts).length} file(s); no file gained one.` +
    (fixedTotal
      ? `\n[ci:server-error-leaks] ${fixedTotal} site(s) fixed since the baseline — shrink it with --write-baseline.`
      : ''),
);
