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
 * Usage:
 *   node scripts/ci/check-dead-audit-catch.mjs                 # fail on new
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

function findings() {
  const hits = [];
  for (const file of sourceFiles()) {
    const src = readFileSync(path.join(ROOT, file), 'utf8');
    if (!src.includes('auditService.logAction')) continue;
    DEAD_CATCH.lastIndex = 0;
    let m;
    while ((m = DEAD_CATCH.exec(src)) !== null) {
      const body = m[1];
      // Another awaited call in the same try means the catch IS reachable.
      const awaits = (body.match(/\bawait\b/g) || []).length;
      if (awaits > 1) continue;
      hits.push({ file, line: src.slice(0, m.index).split('\n').length });
    }
  }
  return hits;
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
