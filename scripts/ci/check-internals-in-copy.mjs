#!/usr/bin/env node
/**
 * CI Guard: API routes, table names and internal identifiers in user-visible copy.
 *
 * ── The rule this enforces ────────────────────────────────────────────────────
 * BIOPHARMA_WORK_ORDER.md, hard guardrail 3:
 *
 *   "DO NOT render API routes, table names, env vars, file paths or exception
 *    text in client UI. In these lanes I found /api/ind-checklist,
 *    /api/labeling-pi, project_sections and a shadow-review endpoint all
 *    rendered as page copy."
 *
 * and the acceptance criterion for BP-W0-5: "Grep the built client bundle: no
 * /api/, no project_sections, no task names in visible copy."
 *
 * ── Why it is a real defect and not a tidiness preference ─────────────────────
 * The reader of these surfaces is a regulatory director, not an engineer. Copy
 * like "GET /api/dossier-readiness/:projectId didn't respond" tells them nothing
 * they can act on, and in a regulated product the internal shape of the system —
 * route topology, the names of governed stores — is an information-disclosure
 * finding, not a cosmetic one. `project_sections` in an empty state names a
 * table to whoever is holding the session.
 *
 * The house already fixed the same class server-side: the 503 in
 * server/routes/c2c/projects.ts used to put the missing relation into the
 * client-facing message and now sends it to the log keyed by request id. This is
 * that decision applied to the strings the client itself renders.
 *
 * ── What counts as user-visible ───────────────────────────────────────────────
 * Only positions that reach the screen: the copy-bearing JSX attributes
 * (hint / title / subtitle / placeholder / label / note / caption / message) and
 * JSX text nodes. NOT: the argument to apiRequest/useLiveRows/fetch (that IS the
 * route and must say so), `//` and block comments, imports, or test files.
 *
 * A route mentioned in a `code`/`mono` span is still visible copy and still
 * counts — a monospace font does not make an endpoint meaningful to a reader.
 *
 * Usage:
 *   node scripts/ci/check-internals-in-copy.mjs                 # fail on new
 *   node scripts/ci/check-internals-in-copy.mjs --list           # show all
 *   node scripts/ci/check-internals-in-copy.mjs --write-baseline # after fixing
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BASELINE = path.join(ROOT, 'scripts/ci/internals-in-copy-baseline.json');

/** Internals that must never appear in copy. */
const INTERNALS = [
  { re: /\/api\//, what: 'API route' },
  { re: /\b(project_sections|authoring_documents|authoring_sections|unified_tasks|regulatory_programs|c2c_document_sections|labeling_pi_sections|c2c_ana_actions|audit_logs|mdx_notifications|project_tasks|document_workflows|software_lifecycle_items|unified_documents)\b/, what: 'table name' },
  { re: /\b(GET|POST|PATCH|PUT|DELETE)\s+\//, what: 'HTTP method + path' },
  { re: /\bprocess\.env\.[A-Z_]+/, what: 'env var' },
  // ── Folded in from a parallel gate (check-ui-internals) that was doing the
  // same job under a different name. Two gates for one rule is the duplication
  // this repo forbids, so that one is deleted and its extra rule classes live
  // here. Each pattern below was observed on a real screen during the MDX UAT.
  { re: /\brelation\s+"/i, what: 'missing-relation error' },
  { re: /failed query/i, what: 'driver error' },
  { re: /\b(?:select|insert\s+into|update|delete\s+from)\s+["'`]/i, what: 'SQL' },
  { re: /\b(?:pg_[a-z_]{3,}|information_schema)\b/, what: 'Postgres catalog' },
  // Multi-segment env names: ESTAR_TEMPLATE_DIR is three segments, and a
  // single-segment pattern misses it.
  { re: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:URL|KEY|SECRET|TOKEN|DIR|PATH|PASSWORD|DSN|HOST|PORT)\b/, what: 'env var' },
  { re: /(?:^|[\s(])\/(?:home|usr|var|opt|app|etc)\//, what: 'absolute file path' },
  { re: /\.(?:ts|tsx|js|mjs|cjs):\d+/, what: 'source location' },
  { re: /\b[\w.-]+\.(?:ts|tsx|mjs|cjs|sql)\b/, what: 'source file' },
];

/** Copy-bearing JSX attributes: `hint="…"` / `title={'…'}`. */
const ATTR = /\b(hint|title|subtitle|placeholder|label|note|caption|message|desc|description)\s*=\s*\{?\s*["'`]([^"'`]{0,400})["'`]/g;
/** JSX text between tags, excluding expressions. */
const TEXT = />([^<>{}\n]{3,400})</g;

function sourceFiles() {
  const out = execSync("git ls-files 'client/src/**/*.tsx' 'client/src/**/*.ts'", {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/__tests__|\.test\.tsx?$|\.spec\.tsx?$|\/fixtures\//.test(f));
}

/** Blank out comments so prose ABOUT a route is not reported as the route. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

function findings() {
  const hits = [];
  for (const file of sourceFiles()) {
    const raw = readFileSync(path.join(ROOT, file), 'utf8');
    const code = stripComments(raw);
    const lineOf = (idx) => code.slice(0, idx).split('\n').length;

    const scan = (re, group) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code)) !== null) {
        const value = m[group];
        if (!value) continue;
        for (const { re: bad, what } of INTERNALS) {
          if (!bad.test(value)) continue;
          hits.push({ file, line: lineOf(m.index), what, text: value.trim().slice(0, 110) });
          break;
        }
      }
    };
    scan(ATTR, 2);
    scan(TEXT, 1);
  }
  return hits;
}

const hits = findings();
const key = (h) => `${h.file}:${h.line}`;

if (process.argv.includes('--list')) {
  for (const h of hits) console.log(`${key(h)}  [${h.what}]  ${h.text}`);
  console.log(`\n${hits.length} occurrence(s) across ${new Set(hits.map((h) => h.file)).size} file(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  const files = [...new Set(hits.map((h) => h.file))].sort();
  writeFileSync(BASELINE, JSON.stringify({ files }, null, 2) + '\n');
  console.log(`Baseline written: ${hits.length} occurrence(s) across ${files.length} file(s).`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).files : [];
const allowed = new Set(baseline);
const fresh = hits.filter((h) => !allowed.has(h.file));

if (fresh.length > 0) {
  console.error('\n❌ Internal identifiers in user-visible copy.\n');
  for (const h of fresh) console.error(`   ${key(h)}  [${h.what}]\n     ${h.text}`);
  console.error(`
   The reader of these surfaces is a regulatory director. A route name tells
   them nothing they can act on, and the internal shape of a governed system is
   an information-disclosure finding in a regulated product, not a cosmetic one.
   (BIOPHARMA_WORK_ORDER.md guardrail 3; BP-W0-5.)

   Name the CAPABILITY, not the endpoint:
     "GET /api/cmc/stability-studies didn't respond."
     → "The stability register didn't respond."
`);
  process.exit(1);
}

const stale = baseline.filter((f) => !hits.some((h) => h.file === f));
console.log(
  `check-internals-in-copy: no new occurrences. ${hits.length} baselined across ${new Set(hits.map((h) => h.file)).size} file(s).` +
    (stale.length ? `\n  ${stale.length} baselined file(s) now clean — run --write-baseline to shrink it.` : '')
);
