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


/**
 * THIRD RULE — a demo-marked route reachable in production (ledger L167).
 *
 * L171 closed the fabrication half of L167: the minted DOIs are gone and the
 * rule above catches a new one. It deliberately left the other half, which L171
 * itself restates — `POST /api/analytics/demo-analysis` "is mounted live by
 * register-project-routes with no NODE_ENV gate and no client caller". Correct
 * content on an endpoint that should not be reachable at all is half a repair.
 *
 * It is worse than a naming problem. `analyticsRoutes` is mounted WITHOUT
 * middleware (the sibling `mountAll` for quality management passes
 * requireTenantContext; the analytics one passes nothing) and the file installs
 * no `router.use` auth, so that handler was unauthenticated and tenant-less in
 * production while writing caller-supplied text under `exports/` and spending a
 * model call, for a route nothing in the client calls.
 *
 * WHY THE TOKEN IS `demo` AND NOTHING ELSE. The obvious rule — path contains
 * demo|sample|mock|fake|dummy|example — was measured before it was written and
 * rejected: it matches 8 route registrations, and 6 are `/sample-size`,
 * `/apply-sample-size`, `/mmrm/sample-size` and `/estimand/regulatory-examples`.
 * In a biostatistics product "sample size" is the domain vocabulary, not a
 * marker of fake data, and baselining six real endpoints is how "a baseline
 * grows until nobody reads it" — the failure this file's own header warns about.
 * Restricted to a `demo` path segment the signal is sharp, not heuristic: two
 * registrations in the whole of server/routes/, one of them genuine.
 *
 * SCOPE, STATED RATHER THAN IMPLIED: the gate is satisfied by a production gate
 * anywhere in the FILE, not by one provably guarding this route. With two demo
 * registrations tree-wide, a per-route AST check buys nothing a reader of the
 * diff cannot see; a file that gated one demo route and not a second would need
 * it. That limitation is the reason this is stated, not a claim it is absent.
 */
const DEMO_ROUTE_PATH = /^\/[A-Za-z0-9_\-/:.]*\bdemo/i;

/**
 * Both spellings, on purpose. `prodGatePattern` above matches only the POSITIVE
 * form because that is what rule 1's allowlisted file uses. Reusing it here
 * would repeat a mistake already paid for: check-no-dev-auth-in-prod.mjs matched
 * only `NODE_ENV !== 'production'`, so sso.ts used the positive spelling and
 * "read as clean" (see that file's header). A route is legitimately gated either
 * way round, so both count — and an ENABLE_* opt-in flag counts too, which is
 * how notification_routes.ts and cerv2-export-routes.ts gate theirs.
 */
const ANY_PROD_GATE = /NODE_ENV\s*(===|!==)\s*['"]production['"]|process\.env\.ENABLE_[A-Z0-9_]+/;

/**
 * Demo routes that are a named product capability rather than the L167 class.
 *
 * `/demo-packs` lists the DOCX factory's available demo INPUT packs from static
 * JSON via the shadow service. It reads no tenant data, writes nothing, and
 * fabricates no provenance — "demo pack" is the product's word for a starter
 * input set, so gating it would remove a feature rather than close a hole. Keyed
 * by file and path so the entry cannot silently cover a second demo route added
 * to the same file later.
 */
const allowedDemoRoutes = new Set([
  'server/routes/docx-factory.ts:/demo-packs',
]);

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

// Third pass for the demo-route rule. It reads string literals like the
// provenance rule (a route PATH is a literal) and therefore inherits its
// comment-immunity: stringLiteralsOf skips comments, so the worked example in
// this rule's own header cannot trip it. The extra `router.` test on the source
// line keeps an unrelated literal that merely starts with "/demo" — a docs URL,
// a client path in a message — from reading as a registration.
for (const file of walk(routesDir)) {
  const rel = path.relative(repoRoot, file);
  const rawText = fs.readFileSync(file, 'utf8');
  const lines = rawText.split('\n');
  const gated = ANY_PROD_GATE.test(rawText);

  for (const literal of stringLiteralsOf(rawText)) {
    if (!DEMO_ROUTE_PATH.test(literal.value)) continue;
    if (!/router\s*\.\s*(get|post|put|patch|delete|use|all)\s*\(/.test(lines[literal.line - 1] ?? '')) continue;
    if (allowedDemoRoutes.has(`${rel}:${literal.value}`)) continue;
    if (gated) continue;
    findings.push({
      file: rel,
      message: `mounts demo route ${literal.value} at line ${literal.line} with no production gate — reachable on a real deployment`,
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
