#!/usr/bin/env node
/**
 * CI Guard: a 21 CFR Part 11 §11.10(e) audit row whose outcome is DISCARDED.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `logAction` does not reject when a persistence attempt fails. That is
 * deliberate policy — an audit-trail outage must not break the user action it
 * records — so it RESOLVES an `AuditWriteResult` and says what happened in
 * `persisted` (and in `chained`, which distinguishes the retrievable
 * `audit_logs` row from a tamper-proof-only write).
 *
 * Two syntaxes discard that value, and they are the same defect:
 *
 *     void auditService.logAction({ … });      // explicit fire-and-forget
 *     await auditService.logAction({ … });     // awaited at statement position
 *
 * The second form reads more careful than the first and is not: awaiting a promise
 * and throwing away what it resolved to reports exactly as much as not awaiting
 * it. Either way the call has two possible outcomes and one observable result —
 * the caller, its caller, the HTTP envelope and the surface are byte-identical
 * whether the Part 11 record exists or does not, and the only trace of a lost row
 * is one line in the server log.
 *
 * This guard originally caught only `void`. Closing that hole is the whole reason
 * it was renamed: at the time the awaited form was found there were 135 of those
 * sites against 0 remaining `void` ones, so the gate had been reporting a
 * near-clean repository while the larger population of the identical defect went
 * unmeasured. A gate that catches one syntax of a defect and lets the other
 * through is worse than no gate, because its green is believed.
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
 *   node scripts/ci/check-discarded-audit-write.mjs              # fail on new
 *   node scripts/ci/check-discarded-audit-write.mjs --self-test  # prove the gate
 *   node scripts/ci/check-discarded-audit-write.mjs --list
 *   node scripts/ci/check-discarded-audit-write.mjs --write-baseline
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BASELINE = path.join(ROOT, 'scripts/ci/discarded-audit-write-baseline.json');

/** `void auditService.logAction(` — explicit fire-and-forget. */
const VOID_WRITE = /\bvoid\s+auditService\s*\.\s*logAction\s*\(/g;

/**
 * `await auditService.logAction(` at STATEMENT position — awaited and thrown away.
 *
 * Anchored to the start of a line (after indentation) so the forms that DO keep
 * the value are not flagged:
 *   `const audit = await auditService.logAction(…)`  — assigned
 *   `return await auditService.logAction(…)`         — handed to the caller
 *   `x = await auditService.logAction(…)`            — assigned
 * Those all have a token before `await` on the line.
 *
 * One shape defeats that anchor: a call passed as an ARGUMENT across lines —
 *
 *     transmitAttemptAudit.push(
 *       await recordAuditRow({ … }),
 *     );
 *
 * where the `await` does start its own line and the value is nevertheless kept.
 * `isArgumentPosition` below excludes it. There is no such site in the current
 * population — I checked all 102 — but the shape is real (it appears verbatim in
 * ind-icsr-transmission-persistence, with recordAuditRow), and a gate that flags
 * correct code gets that code BASELINED, which then admits a genuine defect in the
 * same file later. Cheaper to exclude it than to explain the baseline entry.
 */
const AWAITED_DISCARDED = /^[ \t]*await\s+auditService\s*\.\s*logAction\s*\(/gm;

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

/**
 * True when the matched `await` is an argument rather than a statement: the
 * previous code-bearing line ends in a token that opens one.
 */
function isArgumentPosition(code, matchIndex) {
  const before = code.slice(0, matchIndex).split('\n');
  before.pop(); // the line the match is on
  for (let i = before.length - 1; i >= 0; i--) {
    const line = before[i].trimEnd();
    if (line.trim() === '') continue;
    return /[([,=]$|=>$|&&$|\|\|$|\?$|:$/.test(line);
  }
  return false;
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
  for (const re of [VOID_WRITE, AWAITED_DISCARDED]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      if (re === AWAITED_DISCARDED && isArgumentPosition(code, m.index)) continue;
      hits.push({ file, line: code.slice(0, m.index).split('\n').length });
    }
  }
  hits.sort((a, b) => a.line - b.line);
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
  const AWAITED = `
    async function f(entry) {
      await auditService.logAction({ action: entry.action });
    }`;
  const RETURNED = `
    async function f(entry) {
      return await auditService.logAction({ action: entry.action });
    }`;
  const REASSIGNED = `
    async function f(entry) {
      let audit;
      audit = await auditService.logAction({ action: entry.action });
      if (!audit.persisted) log.error('audit row NOT persisted', { a: 1 });
    }`;
  const ARGUMENT = `
    async function f(entry, collected) {
      collected.push(
        await auditService.logAction({ action: entry.action }),
      );
      return collected;
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
  say(scanSource(AWAITED, '<t>').length === 1, 'an awaited write whose result is discarded is flagged');
  say(scanSource(REPORTED, '<t>').length === 0, 'an awaited-and-reported write is not flagged');
  say(scanSource(RETURNED, '<t>').length === 0, 'a write returned to the caller is not flagged');
  say(scanSource(REASSIGNED, '<t>').length === 0, 'a write assigned to an existing variable is not flagged');
  say(scanSource(ARGUMENT, '<t>').length === 0, 'a write passed as an argument across lines is not flagged');
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
  console.log(`\n${hits.length} discarded audit-write outcome(s) across ${Object.keys(counts).length} file(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        $note:
          'Per-file COUNT of DISCARDED audit-write outcomes — `void auditService.logAction(...)` ' +
          'and statement-position `await auditService.logAction(...)`. Shrink only — a file at its ' +
          'baselined count passes, a file above it fails, and a file not listed here must be ' +
          'zero. See scripts/ci/check-discarded-audit-write.mjs for what to write instead.',
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
   Both \`void auditService.logAction(...)\` and a statement-position
   \`await auditService.logAction(...)\` discard the AuditWriteResult. logAction
   does not reject when persistence fails — by policy — so either way the call has
   two outcomes and one observable result: nothing downstream can tell a recorded
   action from an unrecorded one. Awaiting and ignoring reports no more than not
   awaiting at all.

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
  `check-discarded-audit-write: no new occurrences. ${hits.length} baselined across ${Object.keys(counts).length} file(s).` +
    (stale.length
      ? `\n  ${stale.length} baselined file(s) now below their count — run --write-baseline to shrink it.`
      : ''),
);
