#!/usr/bin/env node
/**
 * CI Guard: a `catch` around `auditService.logAction` that can never fire.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `logAction` swallows both of its persistence sections internally and resolves
 * normally on failure. That is deliberate — an audit-trail outage must not crash
 * the user action it records — and it is documented on `writeChainedAuditRow`,
 * which exists precisely because a Part 11 signing path cannot get a guarantee
 * from `logAction` "not by awaiting it (it resolves normally on DB failure) and
 * not by catching (it never rejects for one)".
 *
 * Seventeen call sites across sixteen files nevertheless wrote
 *
 *     try {
 *       await auditService.logAction({ … });
 *     } catch (err) {
 *       log.warn('audit write failed (non-fatal)', { err });   // unreachable
 *     }
 *
 * The catch cannot run. It is dead code that reads as handling, and it is worse
 * than no handling at all: a reviewer checking "is the audit failure handled?"
 * finds a handler and moves on. Several of these sit on governed paths where a
 * lost audit row is a §11.10(e) record that no longer exists.
 *
 * ── What to write instead ─────────────────────────────────────────────────────
 * `logAction` now returns `AuditWriteResult`, so the handling can be real:
 *
 *     const audit = await auditService.logAction({ … });
 *     if (!audit.persisted) log.warn('audit write failed', { reason: audit.error });
 *
 * and a path that needs the row to EXIST — a signature, a freeze, a governed
 * transmission — uses `writeChainedAuditRow(client, …)` on its own transaction,
 * where a failure rolls the mutation back with it.
 *
 * ── Deliberately narrow ───────────────────────────────────────────────────────
 * Only an AWAITED logAction inside a try whose catch does nothing but log is
 * reported. `void auditService.logAction(…)` is explicit fire-and-forget and is
 * not flagged. A try block that also contains other awaited work has a reachable
 * catch and is not flagged either.
 *
 * Nor is a catch that RECORDS the failure into state the surrounding code goes
 * on to read:
 *
 *     let canonical;
 *     try { canonical = await auditService.logAction({ … }); }
 *     catch (err) { canonical = { persisted: false, error: String(err) }; }
 *     if (!canonical?.persisted) log.error('audit event NOT persisted', { … });
 *
 * That catch is belt-and-braces for a promise documented never to reject, and
 * the check that consumes it DOES run — which is the whole point of this guard.
 * Flagging it asks an author to delete real handling to satisfy a check named
 * for dead handling. `server/services/audit/auditLogger.ts` is written exactly
 * this way; without this exemption the guard fails on the one file that already
 * does what its own error message tells everyone else to do.
 *
 * Usage:
 *   node scripts/ci/check-dead-audit-catch.mjs                 # fail on new
 *   node scripts/ci/check-dead-audit-catch.mjs --self-test    # prove the gate
 *   node scripts/ci/check-dead-audit-catch.mjs --list
 *   node scripts/ci/check-dead-audit-catch.mjs --write-baseline
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BASELINE = path.join(ROOT, 'scripts/ci/dead-audit-catch-baseline.json');

/** `try { … await auditService.logAction(…) … } catch` with nothing else awaited. */
const DEAD_CATCH =
  /try\s*\{([^{}]{0,200}await\s+auditService\.logAction\([\s\S]{0,800}?)\}\s*catch/g;

/** `catch (e) { … }` / `catch { … }` immediately following a matched try. */
const CATCH_HEAD = /^\s*catch\s*(?:\([^)]*\)\s*)?\{/;

/** Walk from an opening brace to its match, ignoring strings and comments. */
function blockEnd(src, open) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; if (i < 1) return -1; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

/** Index of the '{' opening the block that ENCLOSES `pos`, or -1. */
function enclosingBlockOpen(src, pos) {
  let depth = 0;
  for (let i = pos; i >= 0; i--) {
    const c = src[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/**
 * Blank out comments and string/template literals, preserving offsets.
 *
 * USE, NOT MENTION. Without this the check below matched the word `canonical`
 * in a doc comment 250 lines further down and concluded the assignment was
 * read. Every file this guard inspects DESCRIBES the pattern it looks for —
 * that is what their headers are for — so a scan that cannot tell code from
 * prose about code will keep finding the prose. (The sibling guard
 * check-db-test-isolation.mjs strips comments for exactly this reason.)
 */
function codeOnly(text) {
  const out = text.split('');
  let quote = null;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) { quote = null; continue; }
      out[i] = ' ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && text[i + 1] === '/') {
      let j = text.indexOf('\n', i);
      if (j < 0) j = text.length;
      for (let k = i; k < j; k++) out[k] = ' ';
      i = j;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      let j = text.indexOf('*/', i);
      j = j < 0 ? text.length : j + 2;
      for (let k = i; k < j; k++) if (text[k] !== '\n') out[k] = ' ';
      i = j - 1;
    }
  }
  return out.join('');
}

/**
 * True when the catch records the failure into a binding the code AFTER the
 * try/catch reads — handling that runs, rather than a log line that cannot.
 *
 * Both halves are required, and both are bounded:
 *   - the read must be REAL CODE, not the identifier appearing in a comment;
 *   - the read must be in the SAME enclosing block. Searching to end-of-file
 *     lets an unrelated later function vouch for an assignment nobody reads,
 *     which is precisely the silent-pass this guard exists to prevent.
 */
function recordsFailureForLaterUse(src, catchStart) {
  const head = CATCH_HEAD.exec(src.slice(catchStart));
  if (!head) return false;
  const open = catchStart + head[0].length - 1;
  const end = blockEnd(src, open);
  if (end < 0) return false;
  const body = src.slice(open + 1, end - 1);

  const enclosing = enclosingBlockOpen(src, catchStart - 1);
  const enclosingEnd = enclosing >= 0 ? blockEnd(src, enclosing) : -1;
  const after = codeOnly(src.slice(end, enclosingEnd > end ? enclosingEnd : end));

  for (const m of body.matchAll(/(?:^|[;{\n])\s*([A-Za-z_$][\w$]*)\s*(?:\.[\w$]+)?\s*=(?!=)/g)) {
    const name = m[1];
    if (name === 'const' || name === 'let' || name === 'var') continue;
    if (new RegExp(`\\b${name}\\b`).test(after)) return true;
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
function scanSource(src, file) {
  const hits = [];
  if (!src.includes('auditService.logAction')) return hits;
  DEAD_CATCH.lastIndex = 0;
  let m;
  while ((m = DEAD_CATCH.exec(src)) !== null) {
    const body = m[1];
    // Another awaited call in the same try means the catch IS reachable.
    const awaits = (body.match(/\bawait\b/g) || []).length;
    if (awaits > 1) continue;
    // A catch that records the outcome for a check further down is handling
    // that runs — see the header. Not dead, not reported.
    if (recordsFailureForLaterUse(src, m.index + m[0].length - 'catch'.length)) continue;
    hits.push({ file, line: src.slice(0, m.index).split('\n').length });
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

// ── --self-test: prove the EXEMPTION cannot be used to smuggle a dead catch ──
//
// The baseline is empty, so this guard now fails on any reintroduction — which
// makes the exemption added for auditLogger.ts the only way through it. An
// exemption that is too generous turns this whole guard into the thing it was
// written to catch: a check that reports success while doing nothing. These
// four cases are the mutations that must each stay killed.
if (process.argv.includes('--self-test')) {
  const DEAD = `
    async function f(entry) {
      try {
        await auditService.logAction({ action: entry.action });
      } catch (err) {
        log.warn('audit write failed (non-fatal)', { err: String(err) });
      }
    }`;
  const RECORDED = `
    async function f(entry) {
      let canonical;
      try {
        canonical = await auditService.logAction({ action: entry.action });
      } catch (err) {
        canonical = { persisted: false, error: String(err) };
      }
      if (!canonical?.persisted) log.error('audit event NOT persisted', { a: 1 });
    }`;
  const UNREAD = `
    async function f(entry) {
      let canonical;
      try {
        canonical = await auditService.logAction({ action: entry.action });
      } catch (err) {
        canonical = { persisted: false, error: String(err) };
      }
    }
    function later() { return canonical; }`;
  const MENTIONED = `
    async function f(entry) {
      let canonical;
      try {
        canonical = await auditService.logAction({ action: entry.action });
      } catch (err) {
        canonical = { persisted: false, error: String(err) };
      }
      // canonical is named here, and only here — a comment is not a read.
    }`;
  const cases = [
    ['plain dead catch is flagged', DEAD, true],
    ['recorded-and-read catch is exempt', RECORDED, false],
    ['recorded but read only OUTSIDE the block is flagged', UNREAD, true],
    ['recorded but only MENTIONED in a comment is flagged', MENTIONED, true],
  ];
  let ok = true;
  for (const [name, src, shouldFlag] of cases) {
    const flagged = scanSource(src, '<self-test>').length > 0;
    if (flagged === shouldFlag) {
      console.log(`  ✓ ${name}`);
    } else {
      console.error(`  ✗ ${name} — expected ${shouldFlag ? 'flagged' : 'exempt'}, got ${flagged ? 'flagged' : 'exempt'}`);
      ok = false;
    }
  }
  console.log(ok ? '\nself-test PASSED — the exemption admits only handling that runs.' : '\nself-test FAILED');
  process.exit(ok ? 0 : 1);
}

const hits = findings();
const key = (h) => `${h.file}:${h.line}`;

if (process.argv.includes('--list')) {
  for (const h of hits) console.log(key(h));
  console.log(`\n${hits.length} dead catch block(s) across ${new Set(hits.map((h) => h.file)).size} file(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  writeFileSync(BASELINE, JSON.stringify({ files: [...new Set(hits.map((h) => h.file))].sort() }, null, 2) + '\n');
  console.log(`Baseline written: ${hits.length} occurrence(s).`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).files : [];
const allowed = new Set(baseline);
const fresh = hits.filter((h) => !allowed.has(h.file));

if (fresh.length > 0) {
  console.error('\n❌ A catch around `await auditService.logAction(...)` that can never fire.\n');
  for (const h of fresh) console.error(`   ${key(h)}`);
  console.error(`
   logAction swallows its persistence failures and resolves normally, so this
   catch is unreachable — dead code that reads as handling. Write handling that
   can actually run:

     const audit = await auditService.logAction({ ... });
     if (!audit.persisted) log.warn('audit write failed', { reason: audit.error });

   If the row must EXIST for the action to be valid (a signature, a freeze, a
   governed transmission), use writeChainedAuditRow(client, ...) on the
   mutation's own transaction so a failure rolls it back.
`);
  process.exit(1);
}

const stale = baseline.filter((f) => !hits.some((h) => h.file === f));
console.log(
  `check-dead-audit-catch: no new occurrences. ${hits.length} baselined across ${new Set(hits.map((h) => h.file)).size} file(s).` +
    (stale.length ? `\n  ${stale.length} baselined file(s) now clean — run --write-baseline to shrink it.` : ''),
);
