#!/usr/bin/env node
/**
 * CI gate: environment-variable documentation drift (no regressions).
 *
 * Every env var the server runtime reads (process.env.X under server/ and
 * shared/) should be documented in .env.example so operators know what to
 * configure. For a regulated deployment this is a real ops/security concern:
 * configuration governs posture — AUDIT_HMAC_KEY, RLS enforcement, ESG
 * gateway credentials, the AI-gateway substrate flags — and an env var that
 * the app silently reads but no one documents is a var that silently ships
 * mis-configured.
 *
 * Today a large cohort of vars is read but undocumented. Fixing all of them
 * at once (writing 200+ .env.example entries) is out of scope for any single
 * PR; ignoring the drift is dishonest. The middle path is the one this repo
 * already uses for typecheck errors and tenant-isolation findings: snapshot
 * the current undocumented set as a baseline, fail PRs that ADD a new
 * undocumented var, and ratchet the baseline down over time as vars get
 * documented.
 *
 * A var is a "finding" (undocumented drift) when it is:
 *   - referenced as process.env.NAME or process.env['NAME'] under server/ or
 *     shared/ (excluding *.test.* / *.spec.* / __tests__ / __mocks__ / .d.ts),
 *   - not a documented key in .env.example or .env.beta.example (an active
 *     `NAME=` line or a commented `# NAME=` example line both count), and
 *   - not an ambient runtime/tooling var (NODE_ENV, CI, PATH, …) that never
 *     belongs in an application .env file.
 *
 * Modes (mirrors scripts/ci/check-tenant-isolation.mjs):
 *   default                 report findings to stderr, exit 0 (learning mode)
 *   --strict                fail if there is any finding at all
 *   --strict-no-regression  fail only on findings NOT already in the baseline
 *   --write-baseline        snapshot the current findings as the baseline
 *   --json                  emit the full result as JSON on stdout
 *
 * Baseline file: docs/reports/env-var-docs-baseline.json
 *
 * Usage:
 *   node scripts/ci/check-env-var-docs.mjs
 *   node scripts/ci/check-env-var-docs.mjs --strict-no-regression
 *   node scripts/ci/check-env-var-docs.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const strictNoRegression = args.includes('--strict-no-regression');
const writeBaseline = args.includes('--write-baseline');
const stdoutJson = args.includes('--json');

const baselinePath = path.join(repoRoot, 'docs', 'reports', 'env-var-docs-baseline.json');

// ─── What counts as the server runtime surface ──────────────────────────────
// The deployed application is server/ (Express) + shared/ (schema/types).
// The client is Vite and reads import.meta.env, not process.env, so it is not
// part of this gate. Scripts and tests read many one-off / CI-only vars and
// are not part of the operator-facing config surface.
const SCAN_DIRS = ['server', 'shared'];
const SOURCE_EXT = new Set(['.ts', '.js', '.mjs', '.cjs', '.tsx']);

function isExcluded(relPath) {
  return (
    /\.d\.ts$/.test(relPath) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(relPath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__)\//.test(relPath) ||
    /(^|\/)node_modules\//.test(relPath)
  );
}

// ─── Ambient vars that never belong in an application .env file ──────────────
// Kept deliberately small and uncontroversial: process-manager / CI / shell
// injected. Anything not listed here falls into the baseline rather than being
// silently ignored, so a genuinely new config var is never missed.
const AMBIENT_EXACT = new Set([
  'NODE_ENV', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_DEBUG', 'NODE_EXTRA_CA_CERTS',
  'CI', 'DEBUG', 'FORCE_COLOR', 'NO_COLOR',
  'TZ', 'PWD', 'HOME', 'PATH', 'TERM', 'SHELL', 'USER', 'LANG', 'TMPDIR', 'TMP', 'TEMP',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy',
]);
const AMBIENT_PREFIX = ['GITHUB_', 'RUNNER_', 'VITEST', 'JEST_', 'npm_', 'LC_'];

function isAmbient(name) {
  if (AMBIENT_EXACT.has(name)) return true;
  return AMBIENT_PREFIX.some((p) => name.startsWith(p));
}

// ─── Collect source files ───────────────────────────────────────────────────
function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(repoRoot, full);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, out);
    } else if (SOURCE_EXT.has(path.extname(entry.name)) && !isExcluded(rel)) {
      out.push(full);
    }
  }
}

const files = [];
for (const dir of SCAN_DIRS) walk(path.join(repoRoot, dir), files);

// ─── Extract process.env references ─────────────────────────────────────────
// Matches process.env.NAME and process.env['NAME'] / process.env["NAME"].
const DOT_RE = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
const BRACKET_RE = /process\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g;

/** name -> sorted list of repo-relative files that read it (first few kept). */
const referenced = new Map();
function record(name, relFile) {
  if (!referenced.has(name)) referenced.set(name, new Set());
  referenced.get(name).add(relFile);
}

for (const file of files) {
  const rel = path.relative(repoRoot, file);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const re of [DOT_RE, BRACKET_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) record(m[1], rel);
  }
}

// ─── Parse documented keys from the .env example files ──────────────────────
// A key is "documented" if it appears as an active `NAME=` line or a commented
// `# NAME=` example line in any of the example files.
const ENV_EXAMPLE_FILES = ['.env.example', '.env.beta.example'];
const documented = new Set();
const ENV_KEY_RE = /^\s*#*\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;
for (const name of ENV_EXAMPLE_FILES) {
  const p = path.join(repoRoot, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = ENV_KEY_RE.exec(line);
    if (m) documented.add(m[1]);
  }
}

// ─── Compute findings: referenced ∧ ¬documented ∧ ¬ambient ──────────────────
const findings = [];
for (const [name, fileSet] of referenced) {
  if (documented.has(name)) continue;
  if (isAmbient(name)) continue;
  findings.push({
    name,
    files: [...fileSet].sort().slice(0, 5),
    refCount: fileSet.size,
  });
}
findings.sort((a, b) => a.name.localeCompare(b.name));
const findingNames = findings.map((f) => f.name);

const summary = {
  referenced: referenced.size,
  documented: documented.size,
  ambientIgnored: [...referenced.keys()].filter(isAmbient).length,
  undocumented: findings.length,
};

if (stdoutJson) {
  process.stdout.write(JSON.stringify({ summary, findings }, null, 2) + '\n');
}

// ─── --write-baseline ───────────────────────────────────────────────────────
if (writeBaseline) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  const prev = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : {};
  const baseline = {
    description:
      'Accepted set of env vars read by server/ + shared/ but not yet documented ' +
      'in .env.example. New undocumented vars fail CI; document them in ' +
      '.env.example (preferred) or, if intentional, re-run ' +
      'npm run ci:env-var-docs:write-baseline. Ratchet this list down over time.',
    count: findingNames.length,
    vars: findingNames,
    _history: Array.isArray(prev._history) ? [...prev._history] : [],
  };
  baseline._history.push(
    `${new Date().toISOString().slice(0, 10)}: ${findingNames.length} undocumented ` +
      `(referenced ${summary.referenced}, documented ${summary.documented}).`
  );
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
  console.log(
    `[ci:env-var-docs] baseline written to ${path.relative(repoRoot, baselinePath)} ` +
      `(${findingNames.length} undocumented vars)`
  );
  process.exit(0);
}

// ─── --strict-no-regression ─────────────────────────────────────────────────
if (strictNoRegression) {
  if (!fs.existsSync(baselinePath)) {
    console.error(
      `[ci:env-var-docs] FAIL — baseline file not found at ` +
        `${path.relative(repoRoot, baselinePath)}. Run with --write-baseline first.`
    );
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const baselineSet = new Set(baseline.vars || []);
  const currentSet = new Set(findingNames);

  const newVars = findingNames.filter((n) => !baselineSet.has(n));
  const fixedVars = [...baselineSet].filter((n) => !currentSet.has(n));

  if (fixedVars.length > 0) {
    console.log(
      `[ci:env-var-docs] ${fixedVars.length} baseline var(s) now documented or removed: ` +
        `${fixedVars.slice(0, 20).join(', ')}${fixedVars.length > 20 ? ', …' : ''}`
    );
    console.log(
      '  Consider running `npm run ci:env-var-docs:write-baseline` to ratchet the bar tighter.'
    );
  }

  if (newVars.length > 0) {
    console.error(
      `[ci:env-var-docs] FAIL — ${newVars.length} NEW undocumented env var(s) ` +
        `above baseline of ${baselineSet.size}:`
    );
    for (const name of newVars) {
      const f = findings.find((x) => x.name === name);
      console.error(`    ${name}  (read in ${f.refCount} file(s), e.g. ${f.files[0]})`);
    }
    console.error('');
    console.error('  Fix by documenting each in .env.example (preferred), or — if the var is');
    console.error('  intentional and internal — re-baseline: npm run ci:env-var-docs:write-baseline');
    process.exit(1);
  }

  console.log(
    `[ci:env-var-docs] OK — no new undocumented env vars above baseline ` +
      `(${currentSet.size} current, ${baselineSet.size} baseline)`
  );
  process.exit(0);
}

// ─── default / --strict ─────────────────────────────────────────────────────
console.log(
  `[ci:env-var-docs] ${summary.referenced} env vars referenced in server/ + shared/; ` +
    `${summary.documented} documented; ${summary.ambientIgnored} ambient ignored; ` +
    `${summary.undocumented} undocumented.`
);
if (findings.length > 0) {
  console.log('[ci:env-var-docs] undocumented vars:');
  for (const f of findings) {
    console.log(`    ${f.name}  (read in ${f.refCount} file(s), e.g. ${f.files[0]})`);
  }
}

if (strict && findings.length > 0) {
  console.error(`[ci:env-var-docs] FAIL — ${findings.length} undocumented env var(s) (--strict).`);
  process.exit(1);
}
process.exit(0);
