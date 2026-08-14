#!/usr/bin/env node
/**
 * CI Guard: a request-controlled value must not reach a filesystem path
 * without a containment check.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * Three instances of the same shape were found by hand in one afternoon:
 *
 *   • routes/document-understanding.ts — MOUNTED. Accepted `filePath` from the
 *     request body against an allowlist that (a) matched roots by string prefix,
 *     so `/app/storage-evil` passed for `/app/storage`, and (b) included
 *     `storage`, which contains the per-tenant vault. One customer could name
 *     another customer's regulatory document and read it back.
 *   • routes/pdf-task-routes.ts — unmounted. `path.join(exportsDir, filename)`
 *     straight from `req.params`.
 *   • routes/reports/subscriptions-routes.ts — unmounted. Two request params
 *     joined onto a path.
 *
 * Express does not split a param on `%2F`, so `..%2F..%2F.env` arrives as
 * `../../.env` in a single `req.params` value. "It's only one segment" is not a
 * defence.
 *
 * Finding the fourth by reading code is not a plan. This is the ratchet: any NEW
 * occurrence fails, and every existing one is baselined with a written reason.
 *
 * ── What counts as safe ───────────────────────────────────────────────────────
 * A file is considered to handle containment when it uses any of:
 *   • `resolveDocumentPath` / `isPathWithin`  (utils/document-file-roots)
 *   • `path.basename(...)` on the value       (strips every separator)
 *   • `startsWith(<root> + path.sep)`         (separator-aware containment)
 * Matching is per-LINE and follows the binding from `req.params`/`query`/`body`
 * to the variable that reaches the sink. A first cut matched per FILE — "mentions
 * a request somewhere AND joins a path somewhere" — and flagged 28 files, nearly
 * all false (billing.ts joins a path for an unrelated reason and reads req.body
 * elsewhere). That baseline would have been 28 unexamined "probably fine" lines,
 * i.e. the report people learn to ignore, which is worse than no gate at all.
 *
 * It is still a heuristic, not dataflow analysis: it will miss a value passed
 * through a helper function. Stated so nobody reads a green result as proof.
 *
 * Exit 0 — no unjustified occurrences.
 * Exit 1 — a new one appeared, or a baselined file changed shape.
 *
 * Usage:
 *   node scripts/ci/check-path-containment.mjs
 *   node scripts/ci/check-path-containment.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baselinePath = path.join(repoRoot, 'docs/reports/path-containment-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');

const SCAN_DIRS = ['server'];
const SKIP = /(__tests__|\.test\.ts|\.spec\.ts|node_modules|_archive|_deprecated)/;

/**
 * A filesystem path being built or opened.
 *
 * `path` must not be preceded by a dot: `e.path.join('.')` is a Zod issue path
 * being joined into a STRING, not the node path module, and it accounted for two
 * of the first ten hits. Matching it would have put two pure-noise entries in the
 * baseline, which is how a baseline stops being read.
 */
const PATH_SINK = /(?<![.\w])(path\.(join|resolve)|fs\.(createReadStream|createWriteStream|readFileSync|writeFileSync|existsSync|promises\.readFile)|res\.sendFile)\s*\(/;

/** Evidence the value is constrained to a directory, or reduced to a bare name. */
const CONTAINMENT = [
  /resolveDocumentPath\s*\(/,
  /isPathWithin\s*\(/,
  /path\.basename\s*\(/,
  /startsWith\s*\(\s*[^)]*\+\s*path\.sep/,
  // `path.dirname(full) !== ROOT` — routes/validation-kit.ts's idiom. It is a
  // real containment check (a traversed path has a different dirname), just not
  // the one written elsewhere. Recognised rather than baselined, because
  // baselining working code teaches people the gate is noise.
  /path\.dirname\s*\([^)]*\)\s*!==/,
];

/**
 * Names bound to a request value in this file.
 *
 * A file-level "mentions req.params somewhere AND path.join somewhere" rule
 * flagged 28 files, nearly all of them false — billing.ts joins a path for an
 * unrelated reason and happens to read req.body elsewhere. A baseline of 28
 * "probably fine" entries is the report people learn to ignore, which is worse
 * than no gate. So the match is per-LINE and follows the binding:
 *
 *   const { filename } = req.params;      →  filename
 *   const p = req.query.path;             →  p
 *   req.body.filePath                     →  (direct, matched on the line)
 */
function requestBoundNames(src) {
  const names = new Set();
  // const { a, b } = req.params
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*req\.(?:params|query|body)\b/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.split(':').pop().trim().replace(/\s*=.*$/, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  // const x = req.params.y  /  const x = String(req.params.y)
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*req\.(?:params|query|body)\b/g)) {
    names.add(m[1]);
  }
  return names;
}

/** Lines where a request-bound value reaches a path sink. */
function offendingLines(src) {
  const names = requestBoundNames(src);
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (!PATH_SINK.test(line)) return;
    const direct = /req\.(params|query|body)\b/.test(line);
    const viaName = [...names].some(n => new RegExp(`\\b${n}\\b`).test(line));
    if (direct || viaName) out.push(i + 1);
  });
  return out;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (SKIP.test(full)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (/\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

const findings = [];
for (const dir of SCAN_DIRS) {
  const abs = path.join(repoRoot, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const src = fs.readFileSync(file, 'utf8');
    if (CONTAINMENT.some(re => re.test(src))) continue;

    const hits = offendingLines(src);
    if (hits.length === 0) continue;

    findings.push({
      file: path.relative(repoRoot, file),
      lines: hits.slice(0, 5),
      digest: crypto.createHash('sha256').update(src).digest('hex').slice(0, 16),
    });
  }
}

if (writeBaseline) {
  const existing = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { entries: {} };
  const entries = {};
  for (const f of findings) {
    entries[f.file] = {
      digest: f.digest,
      lines: f.lines,
      reason: existing.entries?.[f.file]?.reason ?? 'TODO: state why this is safe, or fix it.',
    };
  }
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        _comment:
          'Files where a request-controlled value reaches a filesystem path with no ' +
          'containment check detectable by scripts/ci/check-path-containment.mjs. Every ' +
          'entry needs a REASON. The digest pins the file contents: change the file and ' +
          'it re-flags, so a baseline cannot quietly cover new code. This list may shrink, ' +
          'never grow.',
        entries,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`[ci:path-containment] baseline written — ${Object.keys(entries).length} entries`);
  process.exit(0);
}

const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  : { entries: {} };

const problems = [];
for (const f of findings) {
  const entry = baseline.entries?.[f.file];
  if (!entry) {
    problems.push(`NEW  ${f.file}:${f.lines.join(',')} — a request value reaches a path with no containment check`);
    continue;
  }
  if (entry.digest !== f.digest) {
    problems.push(
      `CHANGED  ${f.file} — baselined as "${entry.reason}" but the file has changed; ` +
        're-verify and refresh the baseline'
    );
  }
}

// A baseline entry whose file no longer trips the rule is a win; report it so
// the list gets trimmed rather than silently outliving the problem.
const stale = Object.keys(baseline.entries ?? {}).filter(
  f => !findings.some(x => x.file === f)
);

console.log(
  `[ci:path-containment] ${findings.length} file(s) match the shape; ` +
    `${Object.keys(baseline.entries ?? {}).length} baselined`
);
if (stale.length) {
  console.log(`[ci:path-containment] ${stale.length} baseline entry(ies) no longer needed:`);
  for (const s of stale) console.log(`    ${s}  (remove with --write-baseline)`);
}

if (problems.length) {
  console.error('\n[ci:path-containment] FAILED\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\n  Fix by resolving the value against a fixed root and checking containment —\n' +
      '  see server/utils/document-file-roots.ts (resolveDocumentPath / isPathWithin).\n' +
      '  path.basename() also suffices when a bare filename is all that is wanted.\n' +
      '  If it is genuinely safe, add it to the baseline WITH A REASON:\n' +
      '      npm run ci:path-containment:write-baseline\n'
  );
  process.exit(1);
}

console.log('[ci:path-containment] OK');
