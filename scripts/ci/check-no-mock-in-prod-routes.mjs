#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const routesDir = path.join(repoRoot, 'server', 'routes');
const baselinePath = path.join(
  repoRoot,
  'docs',
  'reports',
  'no-mock-in-prod-routes-baseline.json',
);
const writeBaseline = process.argv.includes('--write-baseline');
const strictBetaPath = process.argv.includes('--strict-beta-path');
const reportOnly = process.argv.includes('--report-only');

const allowedFiles = new Set([
  // Route intentionally supports dev-only mock pathways with explicit prod gates.
  'notification_routes.ts',
]);

/**
 * Identifier forms, not just the bare word.
 *
 * `/\bMOCK\b/i` matches only a standalone "mock" — and `_` is a word
 * character, so MOCK_PROGRAMS, mockData and mock_rows all failed it:
 *
 *   /\bMOCK\b/i.test('MOCK_PROGRAMS') === false
 *   /\bMOCK\b/i.test('mockData')      === false
 *
 * Real mock data is named exactly that way. Combined with matching raw text
 * (see stripCommentsAndStrings), the guard could fire on essentially nothing
 * BUT prose, which is precisely what its seven baselined findings turned out to
 * be. It reported for months on a condition it could not detect.
 *
 * Verified by mutation: appending `const MOCK_PROGRAMS = [{ id: 1 }]` to a real
 * route left the old guard green, and fails this one.
 */
const suspiciousPatterns = [
  /\bmock\w*/i,
  /\bsimulated\b/i,
  /\bdummy\w*/i,
];

/**
 * Strip comments and string literals before looking for mock markers.
 *
 * This guard matched raw file text, so it measured PROSE, not code — and the
 * result was perverse. All seven baselined "violations" were comments, and five
 * of them documented the removal of a mock:
 *
 *   auth.ts             "Removed error-path dev bypass that returned mock admin"
 *   ind-database.routes "This replaces all mock data with real database operations."
 *   submissionCenter    "Mock regulatory intelligence removed — returns real DB data"
 *
 * So fixing a mock and saying so made the guard angrier, while
 * `const rows = [{ id: 1, name: 'Acme' }]` with no comment passed clean. A
 * control that fires on the word rather than the thing trains people to delete
 * the explanation, which is the opposite of what it is for.
 *
 * String literals go too: a user-facing message like "simulated annealing" or a
 * route path containing "mock" is not mock DATA, and an audit trail of false
 * positives is how a baseline grows until nobody reads it.
 *
 * Written as a scanner rather than a regex on purpose. The obvious
 * `/\/\*[\s\S]*?\*\//g` + `/\/\/.*$/gm` pair corrupts ordinary source: the `//`
 * inside `'https://example.com'` truncates the rest of that line, which can
 * silently delete a real finding sitting after a URL. Tracking string state is
 * the only way to tell a comment from two slashes inside quotes.
 */
function stripCommentsAndStrings(source) {
  let out = '';
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    // Line comment — keep the newline so line numbers survive.
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }

    // Block comment — preserve interior newlines for the same reason.
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }

    // String or template literal: consume it, honouring backslash escapes.
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\') i += 1;
        else if (source[i] === '\n') out += '\n';
        i += 1;
      }
      i += 1;
      out += quote + quote;
      continue;
    }

    out += c;
    i += 1;
  }

  return out;
}

const prodGatePattern = /(NODE_ENV\s*===\s*['"]production['"])|(process\.env\.ENABLE_MOCK_)/;

/**
 * SECOND RULE — fabricated scholarly provenance (ledger L171).
 *
 * The rule above matches IDENTIFIERS after comments and string literals are
 * stripped, because a mock is a named thing (`MOCK_PROGRAMS`, `mockData`) and
 * matching prose is what made the old guard measure nothing. That is right for
 * mocks and structurally blind to the other way a route lies: emitting content
 * that ASSERTS provenance it never obtained. Nothing there is called "mock".
 *
 * POST /api/analytics/demo-analysis built, per request, three academic
 * references by interpolating the caller's own indication and phase into title
 * templates, attached invented authors, journal, volume, pages — and a DOI:
 *
 *     title: 'Endpoint selection for regulatory approval in ' + protocolData.indication,
 *     authors: 'Baxter P, Thompson J, Wilson C',
 *     doi: '10.1007/s43441-024-00521-1',
 *
 * A DOI is a resolvable identifier for one specific published work. A route
 * that manufactures one is not formatting a citation, it is minting evidence,
 * and this product exists to assemble filings for regulators. Two earlier
 * sessions had already removed `Math.random()` from the IND score and the
 * dropout rate in that same handler, one of them noting that a fabricated
 * number "dressed with academic citations" is "the dangerous case" — and left
 * the citations.
 *
 * So this rule reads STRING LITERALS, deliberately, where the mock rule
 * discards them: here the content IS the finding. The signal is sharp — across
 * the whole of server/routes/ there were five hardcoded DOIs and all five were
 * in that one handler, so this is not a heuristic with a tolerance.
 *
 * The rule is about LITERALS, not about DOIs. A route returning a DOI it read
 * from a row is reporting stored data and matches nothing here; a route with
 * one written into its source did not look it up. Whether the paper is real is
 * not the question and cannot be the remedy: the route never consulted it, so
 * it must not present it as the basis of its advice.
 */
const DOI_LITERAL = /\b10\.\d{4,9}\/[^\s"'`,;)\]]+/;

/**
 * String literals with their line numbers — the inverse of
 * stripCommentsAndStrings, and skipping comments for the same reason it does:
 * a comment explaining this rule may quote a DOI (the one above does), and a
 * guard that fires on its own documentation teaches people to delete the
 * documentation.
 */
function stringLiteralsOf(source) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '\n') { line += 1; i += 1; continue; }

    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      const startLine = line;
      let value = '';
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\') { value += source[i + 1] ?? ''; i += 2; continue; }
        if (source[i] === '\n') line += 1;
        value += source[i];
        i += 1;
      }
      i += 1;
      out.push({ line: startLine, value });
      continue;
    }

    i += 1;
  }

  return out;
}


const betaPathHints = [
  'ana-ri',
  'authoring-actions',
  'ai-actions',
  'concept2cure',
  'cerv2',
  'project-modules',
  'conversation-os',
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...walk(full));
    }
    else if (entry.isFile() && full.endsWith('.ts')) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(routesDir)) {
  const rel = path.relative(repoRoot, file);
  const base = path.basename(file);
  const rawText = fs.readFileSync(file, 'utf8');
  // Match against CODE only — comments and string literals are prose (see
  // stripCommentsAndStrings). The prod-gate check below still reads the raw
  // text: a gate is code, and reading it from the stripped form would be fine
  // too, but the raw read cannot produce a false NEGATIVE here.
  const text = stripCommentsAndStrings(rawText);

  const hasSuspicious = suspiciousPatterns.some((pattern) => pattern.test(text));
  if (!hasSuspicious) continue;

  if (allowedFiles.has(base)) {
    if (!prodGatePattern.test(rawText)) {
      findings.push({
        file: rel,
        message: 'contains mock/simulated markers but no explicit production gate',
      });
    }
    continue;
  }

  findings.push({
    file: rel,
    message: 'contains mock/simulated/placeholder markers in route handler scope',
  });
}

// Second pass for the provenance rule: it reads string literals, so it cannot
// share the `hasSuspicious` early-continue above (a file that names nothing
// "mock" is exactly where a manufactured citation hides).
for (const file of walk(routesDir)) {
  const rel = path.relative(repoRoot, file);
  for (const literal of stringLiteralsOf(fs.readFileSync(file, 'utf8'))) {
    const match = DOI_LITERAL.exec(literal.value);
    if (!match) continue;
    findings.push({
      file: rel,
      message: `emits a hardcoded DOI (${match[0]}) at line ${literal.line} — a citation the route never looked up`,
    });
  }
}

findings.sort((a, b) => (a.file === b.file ? a.message.localeCompare(b.message) : a.file.localeCompare(b.file)));
const flattenedFindings = findings.map((f) => `${f.file}: ${f.message}`);
const strictBetaFindings = findings.filter((f) =>
  betaPathHints.some((hint) => f.file.toLowerCase().includes(hint))
);
const flattenedStrictBetaFindings = strictBetaFindings.map((f) => `${f.file}: ${f.message}`);

if (writeBaseline) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({ generatedAt: new Date().toISOString(), findings: flattenedFindings }, null, 2),
    'utf8',
  );
  console.log(`✅ wrote baseline: ${path.relative(repoRoot, baselinePath)} (${flattenedFindings.length} findings)`);
  process.exit(0);
}

const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  : { findings: [] };
const baselineSet = new Set(Array.isArray(baseline.findings) ? baseline.findings : []);
const newFindings = flattenedFindings.filter((f) => !baselineSet.has(f));

if (strictBetaPath) {
  if (flattenedStrictBetaFindings.length > 0) {
    console.error('❌ no-mock-in-prod-routes strict beta-path check failed:');
    for (const f of flattenedStrictBetaFindings) console.error(`  - ${f}`);
    if (reportOnly) {
      console.log('ℹ️ report-only mode: strict findings reported without failing process');
      process.exit(0);
    }
    process.exit(1);
  }
  console.log('✅ no-mock-in-prod-routes strict beta-path check passed (no beta-path findings)');
  process.exit(0);
}

if (newFindings.length > 0) {
  console.error('❌ no-mock-in-prod-routes check failed (new findings):');
  for (const f of newFindings) console.error(`  - ${f}`);
  console.error(`\nBaseline: ${path.relative(repoRoot, baselinePath)}`);
  if (reportOnly) {
    console.log('ℹ️ report-only mode: new findings reported without failing process');
    process.exit(0);
  }
  process.exit(1);
}

console.log(
  `✅ no-mock-in-prod-routes check passed (current=${flattenedFindings.length}, baseline=${baselineSet.size}, new=0)`,
);
