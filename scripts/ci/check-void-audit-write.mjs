#!/usr/bin/env node
/**
 * CI Guard: `void auditService.logAction(...)` — a §11.10(e) row nobody checked.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `logAction` does not reject when a persistence attempt fails. That is
 * deliberate policy — an audit-trail outage must not break the user action it
 * records — so it RESOLVES an `AuditWriteResult` and says what happened in
 * `persisted` (and in `chained`, which distinguishes the retrievable
 * `audit_logs` row from a tamper-proof-only write).
 *
 * `void` discards that value. The call then has two possible outcomes and one
 * observable result: the caller, its caller, the HTTP envelope and the surface
 * are byte-identical whether the 21 CFR Part 11 record exists or does not. The
 * only trace of a lost row is one line in the server log.
 *
 * This is not the same defect as `check-dead-audit-catch`, which flags a `catch`
 * that cannot fire. That one is unreachable handling. This one is no handling,
 * written in a form that reads as a decision.
 *
 * WO-16C finding 133 fixed this for the PDEV approval path. This guard caps the
 * rest: the baseline is the population that existed when it was written, per
 * file WITH ITS COUNT, so a baselined file cannot quietly grow and a clean file
 * cannot become dirty. Shrink it as paths are converted; never grow it.
 *
 * ── What to write instead ─────────────────────────────────────────────────────
 *     const audit = await auditService.logAction({ ... });
 *     if (!audit.persisted) {
 *       log.error('audit row NOT persisted', { action, resourceId, reason: audit.error });
 *     }
 *
 * and where the caller answers a client, carry the outcome out to it rather than
 * logging and returning success — `recordAuditRow` in
 * server/services/pdev/pdev-audit-record.ts is the shape this repo uses: a
 * `{ persisted: true, chained }` arm and a `{ persisted: false, code, message }`
 * arm whose message is safe to show and whose detail stays in the log.
 *
 * A path that needs the row to EXIST for the action to be valid — a signature, a
 * freeze, a governed transmission — uses `writeChainedAuditRow(client, ...)` on
 * the mutation's own transaction, where a failed row rolls the mutation back.
 *
 * ── Deliberately narrow ───────────────────────────────────────────────────────
 * Only `void auditService.logAction(` in real code is reported. Comments and
 * string literals are stripped first: several files document this very defect by
 * quoting it, and a guard that fails on its own explanation is noise.
 *
 * Usage:
 *   node scripts/ci/check-void-audit-write.mjs                 # fail on new
 *   node scripts/ci/check-void-audit-write.mjs --self-test     # prove the gate
 *   node scripts/ci/check-void-audit-write.mjs --list
 *   node scripts/ci/check-void-audit-write.mjs --write-baseline
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BASELINE = path.join(ROOT, 'scripts/ci/void-audit-write-baseline.json');

const VOID_WRITE = /\bvoid\s+auditService\s*\.\s*logAction\s*\(/g;

/**
 * Blank out comments and string/template literals, preserving newlines so line
 * numbers stay true. A quoted or commented occurrence is documentation, not a
 * call.
 */
function stripNonCode(src) {
  let out = '';
  let i = 0;
  const keepNewlines = (s) => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += keepNewlines(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += keepNewlines(src.slice(i, stop));
      i = stop;
      continue;
    }
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { j += 1; break; }
        j += 1;
      }
      out += keepNewlines(src.slice(i, j));
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function sourceFiles() {
  return execSync("git ls-files 'server/**/*.ts'", {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/__tests__|\.test\.ts$|auditService\.ts$/.test(f));
}

/** Scan one source string. Exposed separately so --self-test can drive it. */
export function scanSource(src, file) {
  const hits = [];
  if (!src.includes('logAction')) return hits;
  const code = stripNonCode(src);
  VOID_WRITE.lastIndex = 0;
  let m;
  while ((m = VOID_WRITE.exec(code)) !== null) {
    hits.push({ file, line: code.slice(0, m.index).split('\n').length });
  }
  return hits;
}

function findings() {
  const hits = [];
  for (const file of sourceFiles()) {
    hits.push(...scanSource(readFileSync(path.join(ROOT, file), 'utf8'), file));
  }
  return hits;
}

function countByFile(hits) {
  const counts = {};
  for (const h of hits) counts[h.file] = (counts[h.file] || 0) + 1;
  return counts;
}

// ── --self-test: prove the gate, and prove the ratchet ───────────────────────
//
// A baseline that admits growth is the failure mode this guard is most likely to
// have: 100+ sites are baselined on day one, and a per-file allowlist would then
// let any of those files add a hundred more. Case 4 is that mutation.
if (process.argv.includes('--self-test')) {
  const VOIDED = `
    async function f(entry) {
      void auditService.logAction({ action: entry.action });
    }`;
  const REPORTED = `
    async function f(entry) {
      const audit = await auditService.logAction({ action: entry.action });
      if (!audit.persisted) log.error('audit row NOT persisted', { a: 1 });
    }`;
  const DOCUMENTED = `
    /**
     * This path used to be \`void auditService.logAction({…})\`, which is the
     * defect this guard exists to catch.
     */
    async function f(entry) {
      const audit = await auditService.logAction({ action: entry.action });
      if (!audit.persisted) log.error('audit row NOT persisted', { a: 1 });
    }`;
  const TWO = `
    async function f(entry) {
      void auditService.logAction({ action: 'a' });
      void auditService.logAction({ action: 'b' });
    }`;

  let ok = true;
  const say = (pass, name) => {
    if (pass) console.log(`  ✓ ${name}`);
    else { console.error(`  ✗ ${name}`); ok = false; }
  };
  say(scanSource(VOIDED, '<t>').length === 1, 'a void write is flagged');
  say(scanSource(REPORTED, '<t>').length === 0, 'an awaited-and-reported write is not flagged');
  say(scanSource(DOCUMENTED, '<t>').length === 0, 'the defect quoted in a comment is not flagged');

  // Case 4: the ratchet. A file baselined at 1 that now has 2 must fail.
  const baselineOne = { 'server/x.ts': 1 };
  const now = countByFile(scanSource(TWO, 'server/x.ts'));
  const grew = Object.entries(now).filter(([f, n]) => n > (baselineOne[f] ?? 0));
  say(grew.length === 1 && grew[0][1] === 2, 'a baselined file that GROWS is flagged');

  // And the same file at its baselined count is not.
  const atBaseline = countByFile(scanSource(VOIDED, 'server/x.ts'));
  say(
    Object.entries(atBaseline).every(([f, n]) => n <= (baselineOne[f] ?? 0)),
    'a baselined file at its baselined count is not flagged',
  );

  console.log(ok ? '\nself-test PASSED — the gate flags the defect and the baseline cannot grow.' : '\nself-test FAILED');
  process.exit(ok ? 0 : 1);
}

const hits = findings();
const counts = countByFile(hits);

if (process.argv.includes('--list')) {
  for (const h of hits) console.log(`${h.file}:${h.line}`);
  console.log(`\n${hits.length} void audit write(s) across ${Object.keys(counts).length} file(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        $note:
          'Per-file COUNT of `void auditService.logAction(...)`. Shrink only — a file at its ' +
          'baselined count passes, a file above it fails, and a file not listed here must be ' +
          'zero. See scripts/ci/check-void-audit-write.mjs for what to write instead.',
        files: sorted,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Baseline written: ${hits.length} occurrence(s) across ${Object.keys(sorted).length} file(s).`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).files ?? {} : {};
const over = Object.entries(counts)
  .filter(([file, n]) => n > (baseline[file] ?? 0))
  .sort(([a], [b]) => a.localeCompare(b));

if (over.length > 0) {
  console.error('\n❌ A 21 CFR Part 11 audit row is written and its outcome discarded.\n');
  for (const [file, n] of over) {
    const was = baseline[file] ?? 0;
    console.error(`   ${file} — ${was} → ${n}`);
    for (const h of hits.filter((x) => x.file === file)) console.error(`       ${h.file}:${h.line}`);
  }
  console.error(`
   \`void auditService.logAction(...)\` discards the AuditWriteResult. logAction
   does not reject when persistence fails — by policy — so the call has two
   outcomes and one observable result: nothing downstream can tell a recorded
   action from an unrecorded one.

     const audit = await auditService.logAction({ ... });
     if (!audit.persisted) {
       log.error('audit row NOT persisted', { action, resourceId, reason: audit.error });
     }

   Where the caller answers a client, carry the outcome out to it instead of
   logging and returning success — see recordAuditRow in
   server/services/pdev/pdev-audit-record.ts. Where the row must EXIST for the
   action to be valid, use writeChainedAuditRow(client, ...) on the mutation's
   own transaction.
`);
  process.exit(1);
}

const stale = Object.entries(baseline).filter(([f, n]) => (counts[f] ?? 0) < n);
console.log(
  `check-void-audit-write: no new occurrences. ${hits.length} baselined across ${Object.keys(counts).length} file(s).` +
    (stale.length
      ? `\n  ${stale.length} baselined file(s) now below their count — run --write-baseline to shrink it.`
      : ''),
);
