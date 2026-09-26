#!/usr/bin/env node
/**
 * CI Guard: every multer upload site is bounded, filtered and byte-checked.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * A multer site with no `limits.fileSize` buffers whatever a client sends (with
 * memoryStorage, into the process heap); one with no `fileFilter` accepts any
 * declared type; one whose handler never calls assertUploadSafe trusts the
 * declared MIME type and runs no malware scan. The security audit of 2026-09-24
 * (IAM-14) counted 25 multer handlers of which 7 ran assertUploadSafe, and one
 * (server/src/routes/stability.router.ts) with neither a size limit nor a
 * filter. This gate makes that population a number that can only fall, and
 * refuses a new site that arrives without all three (plan P1-5).
 *
 * ── The rule ──────────────────────────────────────────────────────────────────
 * For every `multer(…)` call in server/ (tests excluded), the call's options
 * must contain `limits: { … fileSize … }` and a `fileFilter`, and the FILE must
 * call assertUploadSafe (server/middleware/uploadSafety.ts) at least once. A
 * site failing any of the three is "unguarded". The baseline is per file WITH
 * A WRITTEN REASON; an entry without one fails; a file may only shrink.
 *
 * ── Deliberately textual ──────────────────────────────────────────────────────
 * The presence of the three tokens is not proof the guard is correct (a filter
 * that admits everything passes); the behavioural proof is each route's own
 * tests. What this buys is that a NEW upload site cannot land without its
 * author having written all three, and that the existing population is
 * countable. Known limits: a multer instance built in one file and used in
 * another is attributed to the file that builds it; a `limits` object built
 * elsewhere and spread in (`...LIMITS`) is not seen; a comment containing
 * `multer(` on a line that starts with `*` or `//` is skipped.
 *
 * Usage:
 *   node scripts/ci/check-upload-guards.mjs                 gate (exit 1 on a new or worsened file, or a reasonless entry)
 *   node scripts/ci/check-upload-guards.mjs --list          print every site with what it lacks
 *   node scripts/ci/check-upload-guards.mjs --write-baseline  rewrite counts; keeps reasons, new files get an empty reason (which fails)
 *   node scripts/ci/check-upload-guards.mjs --selftest      construct the failing cases and prove they are caught
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const BASELINE = path.join(HERE, 'upload-guards-baseline.json');
const TAG = '[ci:upload-guards]';

const args = new Set(process.argv.slice(2));

/** Recursively list .ts files under dir, skipping tests and declarations. */
function tsFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'dist') continue;
        walk(p);
      } else if (
        entry.isFile() &&
        p.endsWith('.ts') &&
        !p.endsWith('.d.ts') &&
        !/\.(test|spec|dbtest)\.ts$/.test(p)
      ) {
        out.push(p);
      }
    }
  };
  walk(dir);
  return out.sort();
}

/** The balanced argument text of a call whose "(" is at index open. */
function callArgs(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return text.slice(open + 1);
}

/** Every multer(...) site in one file's text, with what each lacks. */
export function scanFileText(text) {
  const sites = [];
  const usesAssert = /\bassertUploadSafe\s*\(/.test(text);
  const re = /\bmulter\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const lineText = text.slice(lineStart, text.indexOf('\n', m.index) === -1 ? undefined : text.indexOf('\n', m.index));
    const trimmed = lineText.trimStart();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue; // a comment
    if (/\bimport\b/.test(lineText)) continue; // import multer from 'multer'
    const line = text.slice(0, m.index).split('\n').length;
    const opts = callArgs(text, m.index + m[0].length - 1);
    const missing = [];
    if (!/\blimits\s*:[\s\S]*?\bfileSize\b/.test(opts)) missing.push('limits.fileSize');
    if (!/\bfileFilter\s*:/.test(opts)) missing.push('fileFilter');
    if (!usesAssert) missing.push('assertUploadSafe');
    sites.push({ line, missing });
  }
  return sites;
}

function scanTree(dir) {
  const byFile = new Map();
  for (const file of tsFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('multer')) continue;
    const sites = scanFileText(text);
    if (sites.length) byFile.set(path.relative(ROOT, file).split(path.sep).join('/'), sites);
  }
  return byFile;
}

function unguardedCounts(byFile) {
  const counts = new Map();
  for (const [file, sites] of byFile) {
    const n = sites.filter((s) => s.missing.length).length;
    if (n) counts.set(file, n);
  }
  return counts;
}

function readBaseline(file = BASELINE) {
  if (!fs.existsSync(file)) return { files: {} };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Compare a scan against a baseline. Returns { failures: string[], fixed: string[] }. */
export function evaluate(byFile, baseline) {
  const failures = [];
  const fixed = [];
  const counts = unguardedCounts(byFile);
  for (const [file, entry] of Object.entries(baseline.files ?? {})) {
    if (!entry || typeof entry.reason !== 'string' || entry.reason.trim().length < 20) {
      failures.push(`${file}: baseline entry has no written reason (the baseline is not a place to park a site)`);
    }
  }
  for (const [file, n] of counts) {
    const allowed = baseline.files?.[file]?.count ?? 0;
    if (n > allowed) {
      const detail = byFile
        .get(file)
        .filter((s) => s.missing.length)
        .map((s) => `line ${s.line} lacks ${s.missing.join(', ')}`)
        .join('; ');
      failures.push(`${file}: ${n} unguarded multer site(s), baseline allows ${allowed} — ${detail}`);
    } else if (n < allowed) {
      fixed.push(`${file}: ${allowed - n} site(s) guarded since the baseline`);
    }
  }
  for (const file of Object.keys(baseline.files ?? {})) {
    if (!counts.has(file)) fixed.push(`${file}: no unguarded site remains (drop the entry)`);
  }
  return { failures, fixed, counts };
}

function writeBaseline(byFile, previous) {
  const counts = unguardedCounts(byFile);
  const files = {};
  for (const [file, n] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    files[file] = { count: n, reason: previous.files?.[file]?.reason ?? '' };
  }
  const out = {
    $note:
      'Per-file COUNT of multer sites lacking limits.fileSize, a fileFilter, or an assertUploadSafe call in the file (see scripts/ci/check-upload-guards.mjs). Written 2026-09-25 (P1-5). Shrink only; every entry is a DEFECT with a written reason naming what is missing and who owns the fix. An entry without a reason fails the gate.',
    files,
  };
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n');
  return out;
}

function selftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-guards-'));
  const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
  write(
    'bare.ts',
    "import multer from 'multer';\nconst upload = multer({ storage: multer.memoryStorage() });\nexport default upload;\n",
  );
  write(
    'guarded.ts',
    "import multer from 'multer';\nimport { assertUploadSafe } from '../middleware/uploadSafety';\n" +
      'const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 }, fileFilter: (_r, _f, cb) => cb(null, true) });\n' +
      'export async function h(f: any) { await assertUploadSafe(f.buffer, f.mimetype, f.originalname); }\n',
  );
  write(
    'half.ts',
    "import multer from 'multer';\nimport { assertUploadSafe } from '../middleware/uploadSafety';\n" +
      '// multer({ storage: multer.memoryStorage() }) in a comment is not a site\n' +
      'const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 } });\n' +
      'export async function h(f: any) { await assertUploadSafe(f.buffer, f.mimetype, f.originalname); }\n',
  );
  const byFile = new Map();
  for (const name of ['bare.ts', 'guarded.ts', 'half.ts']) {
    byFile.set(`scratch/${name}`, scanFileText(fs.readFileSync(path.join(dir, name), 'utf8')));
  }
  const checks = [];
  const bare = byFile.get('scratch/bare.ts');
  checks.push(['bare site is one site lacking all three', bare.length === 1 && bare[0].missing.join() === 'limits.fileSize,fileFilter,assertUploadSafe']);
  checks.push(['guarded site lacks nothing', byFile.get('scratch/guarded.ts').every((s) => s.missing.length === 0)]);
  const half = byFile.get('scratch/half.ts');
  checks.push(['comment is not a site; the real site lacks only fileFilter', half.length === 1 && half[0].missing.join() === 'fileFilter']);
  const empty = evaluate(byFile, { files: {} });
  checks.push(['empty baseline: the two unguarded files fail', empty.failures.length === 2 && empty.failures.every((f) => /bare|half/.test(f))]);
  const parked = evaluate(byFile, { files: { 'scratch/bare.ts': { count: 1, reason: '' }, 'scratch/half.ts': { count: 1, reason: 'inherited; the excursion importer, owned by the D6 upload sweep' } } });
  checks.push(['a reasonless baseline entry fails even at its count', parked.failures.length === 1 && /no written reason/.test(parked.failures[0])]);
  const worsened = evaluate(byFile, { files: { 'scratch/bare.ts': { count: 1, reason: 'inherited; the bare importer, owned by the D6 upload sweep' }, 'scratch/half.ts': { count: 0, reason: 'inherited; owned by the D6 upload sweep' } } });
  checks.push(['a file above its baseline count fails', worsened.failures.length === 1 && /half\.ts: 1 unguarded/.test(worsened.failures[0])]);
  fs.rmSync(dir, { recursive: true, force: true });
  let ok = true;
  for (const [name, passed] of checks) {
    console.log(`${TAG} selftest ${passed ? 'caught' : 'MISSED'}: ${name}`);
    if (!passed) ok = false;
  }
  console.log(`${TAG} selftest ${ok ? `${checks.length}/${checks.length} caught` : 'FAILED'}`);
  process.exit(ok ? 0 : 1);
}

function main() {
  if (args.has('--selftest')) return selftest();
  const byFile = scanTree(path.join(ROOT, 'server'));
  if (args.has('--list')) {
    for (const [file, sites] of byFile) {
      for (const s of sites) {
        console.log(`${file}:${s.line} ${s.missing.length ? 'lacks ' + s.missing.join(', ') : 'guarded'}`);
      }
    }
    return;
  }
  const previous = readBaseline();
  if (args.has('--write-baseline')) {
    const out = writeBaseline(byFile, previous);
    const missingReasons = Object.entries(out.files).filter(([, e]) => !e.reason).map(([f]) => f);
    console.log(`${TAG} baseline written — ${Object.keys(out.files).length} file(s).`);
    if (missingReasons.length) console.log(`${TAG} write a reason for: ${missingReasons.join(', ')}`);
    return;
  }
  const { failures, fixed, counts } = evaluate(byFile, previous);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  for (const f of fixed) console.log(`${TAG} ${f}`);
  if (failures.length) {
    for (const f of failures) console.error(`${TAG} FAIL — ${f}`);
    console.error(`${TAG} A multer site needs limits.fileSize, a fileFilter and an assertUploadSafe call in its file (server/middleware/uploadAllowlist.ts, server/middleware/uploadSafety.ts).`);
    process.exit(1);
  }
  console.log(`${TAG} OK — ${total} unguarded multer site(s) across ${counts.size} file(s), none new; ${byFile.size} file(s) build uploads.`);
}

main();
