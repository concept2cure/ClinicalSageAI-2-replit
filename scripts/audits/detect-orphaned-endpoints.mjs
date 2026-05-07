#!/usr/bin/env node
/**
 * Orphan-endpoint detector.
 *
 * Closes the "160+ orphaned backend endpoints (registered, no UI)" finding
 * from STABILIZATION_REPORT.md by replacing a one-shot audit with an
 * automated, repeatable measurement that tracks orphan count as an
 * operational metric.
 *
 * Strategy:
 *   1. Walk server/routes/** and server/api/** for router.<method>(<path>)
 *      declarations. Build the declared-endpoint set.
 *   2. Walk client/src/** for fetch() / axios calls / queryKey patterns
 *      that reference '/api/...' paths. Build the consumed-endpoint set.
 *   3. Compute the diff. A declared endpoint with no client reference is
 *      an "orphan". Each orphan is decorated with:
 *        - file + line where it's declared
 *        - mount-prefix owner from docs/reports/route-mount-owners.json
 *        - heuristic decision suggestion (retire / document / keep)
 *   4. Write a structured JSON report and a human-readable Markdown summary.
 *
 * Limitations (known and called out in the report):
 *   - String matching: dynamic path construction (`/api/${id}`) is matched
 *     by the static prefix, not the full path.
 *   - Templated route params (:id, :slug) are normalized to {param} for
 *     comparison.
 *   - Server-only endpoints called from another server route or a worker
 *     would also appear "orphan" — the detector is a starting point for
 *     triage, not a verdict.
 *
 * Usage:
 *   node scripts/audits/detect-orphaned-endpoints.mjs
 *   node scripts/audits/detect-orphaned-endpoints.mjs --json     # stdout
 *   node scripts/audits/detect-orphaned-endpoints.mjs --threshold 200
 *
 * Exit codes:
 *   0 — orphan count is at or below --threshold (default: report only).
 *   1 — orphan count exceeds threshold (only when --threshold is given).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const stdoutJson = args.includes('--json');
let threshold = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--threshold') {
    threshold = Number(args[i + 1]);
    i += 1;
  }
}

// ─── Filesystem helpers ─────────────────────────────────────────────────────

function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '__tests__' ||
        entry.name === 'dist' ||
        entry.name === '_deprecated_migrations' ||
        entry.name === '_deprecated' ||
        entry.name === '_archive'
      ) continue;
      out.push(...walk(full, exts));
    } else if (entry.isFile() && exts.some(e => full.endsWith(e))) {
      if (full.endsWith('.test.ts') || full.endsWith('.test.js')) continue;
      if (full.endsWith('.spec.ts') || full.endsWith('.spec.js')) continue;
      out.push(full);
    }
  }
  return out;
}

function rel(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
}

// ─── Server-side endpoint discovery ─────────────────────────────────────────

// Match: router.get('/foo', ...), app.post("/bar", ...), etc.
// Captures: method, path string.
const ROUTE_DECL = /\b(?:router|app|api|express\(\))\s*\.\s*(get|post|put|patch|delete|all|use)\s*\(\s*['"`]([^'"`]+)['"`]/g;

// Match: app.use('/api/foo', someModule.default) / app.use('/api/foo', router)
// preceded somewhere in the same file by an import of the router module.
const APP_USE_MOUNT = /\bapp\s*\.\s*use\s*\(\s*['"`](\/api\/[^'"`]+)['"`]\s*,\s*([A-Za-z_$][\w$]*)/g;
const STATIC_IMPORT = /import\s+(?:[\w$\s{},*]+?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const NAMED_STATIC_IMPORT = /import\s+(?:(?:\{[^}]*\b([A-Za-z_$][\w$]*)\b[^}]*\})|(\w+))\s+from\s+['"]([^'"]+)['"]/g;

/**
 * Scan bootstrap / startup / index files to learn which router files are
 * mounted at which /api prefix. Produces a Map keyed by absolute resolved
 * router file path → mount prefix.
 *
 * Strategy: for each file that contains app.use(..., NAME), find the
 * import statement that bound NAME (static or dynamic). Resolve the
 * import path relative to the calling file, normalize, and record.
 */
function discoverMountMap() {
  const mountMap = new Map();

  const candidateRoots = [
    path.join(repoRoot, 'server', 'index.ts'),
    ...walk(path.join(repoRoot, 'server', 'bootstrap'), ['.ts', '.js']),
    ...walk(path.join(repoRoot, 'server', 'startup'), ['.ts', '.js']),
  ];

  for (const file of candidateRoots) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');

    // Build a name → import-path map for this file.
    const names = new Map();
    DYNAMIC_IMPORT.lastIndex = 0;
    let dm;
    while ((dm = DYNAMIC_IMPORT.exec(text)) !== null) {
      names.set(dm[1], dm[2]);
    }
    NAMED_STATIC_IMPORT.lastIndex = 0;
    let sm;
    while ((sm = NAMED_STATIC_IMPORT.exec(text)) !== null) {
      const name = sm[2] ?? sm[1];
      if (name) names.set(name, sm[3]);
    }

    APP_USE_MOUNT.lastIndex = 0;
    let am;
    while ((am = APP_USE_MOUNT.exec(text)) !== null) {
      const mount = am[1];
      const name = am[2];
      const importPath = names.get(name) ?? names.get(name.replace(/Module$/, ''));
      if (!importPath) continue;
      const resolved = resolveImportPath(file, importPath);
      if (!resolved) continue;
      mountMap.set(resolved, mount);
    }
  }

  return mountMap;
}

function resolveImportPath(callerFile, importPath) {
  // Skip external packages.
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) return null;
  const callerDir = path.dirname(callerFile);
  const baseAbs = path.resolve(callerDir, importPath);

  const candidates = [
    baseAbs,
    `${baseAbs}.ts`,
    `${baseAbs}.js`,
    `${baseAbs}.mjs`,
    path.join(baseAbs, 'index.ts'),
    path.join(baseAbs, 'index.js'),
    path.join(baseAbs, 'index.mjs'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  // Some imports use .js extension that resolves to a .ts source.
  if (baseAbs.endsWith('.js')) {
    const tsCandidate = baseAbs.replace(/\.js$/, '.ts');
    if (fs.existsSync(tsCandidate)) return tsCandidate;
  }
  return null;
}

function discoverServerEndpoints(mountMap) {
  const serverFiles = [
    ...walk(path.join(repoRoot, 'server', 'routes'), ['.ts', '.js']),
    ...walk(path.join(repoRoot, 'server', 'api'), ['.ts', '.js']),
  ];

  const endpoints = [];
  for (const file of serverFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    const mountPrefix = mountMap.get(file) ?? null;
    ROUTE_DECL.lastIndex = 0;
    let m;
    while ((m = ROUTE_DECL.exec(text)) !== null) {
      const method = m[1].toUpperCase();
      const rawPath = m[2];

      let fullPath;
      if (rawPath.startsWith('/api/')) {
        fullPath = rawPath;
      } else if (mountPrefix && rawPath.startsWith('/')) {
        // Compose mount + relative path.
        fullPath = mountPrefix.replace(/\/+$/, '') + rawPath;
      } else {
        // No /api/ prefix and no known mount — skip rather than mis-attribute.
        continue;
      }

      // Skip Express-style middleware mounts (.use). They're plumbing,
      // not endpoints in their own right.
      if (method === 'USE') continue;

      const lineNumber = text.slice(0, m.index).split('\n').length;
      endpoints.push({
        method,
        rawPath: fullPath,
        file: rel(file),
        line: lineNumber,
        snippet: lines[lineNumber - 1]?.trim().slice(0, 140) ?? '',
        mountPrefix,
      });
    }
  }
  return endpoints;
}

// ─── Client-side endpoint usage discovery ──────────────────────────────────

// Catch any string or template-literal head that starts with /api/. This
// matches plain literals ('/api/foo'), template starts (`/api/foo/${id}`),
// and queryKey arrays (['/api/foo', id]). Intentionally loose because the
// client uses many different fetch wrappers.
const CLIENT_API_REF = /['"`](\/api\/[A-Za-z0-9_\-./]*)/g;

function discoverApiReferences() {
  // Scan both client/src/ AND server-side files (workers, jobs, internal
  // services that fan-out to the API surface). The server-to-server pass
  // is what shrinks the orphan-count overestimate — many endpoints flagged
  // as "no client reference" are actually called from a worker or another
  // route, not the UI.
  const files = [
    ...walk(path.join(repoRoot, 'client', 'src'), ['.ts', '.tsx', '.js', '.jsx']),
    ...walk(path.join(repoRoot, 'server', 'workers'), ['.ts', '.js']),
    ...walk(path.join(repoRoot, 'server', 'jobs'), ['.ts', '.js']),
    ...walk(path.join(repoRoot, 'server', 'services'), ['.ts', '.js']),
    ...walk(path.join(repoRoot, 'server', 'submission-ops'), ['.ts', '.js']),
    ...walk(path.join(repoRoot, 'server', 'brain'), ['.ts', '.js']),
    ...walk(path.join(repoRoot, 'server', 'integrations'), ['.ts', '.js']),
    // Server routes can also fan-out to other internal endpoints.
    ...walk(path.join(repoRoot, 'server', 'routes'), ['.ts', '.js']),
  ];
  const refs = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    CLIENT_API_REF.lastIndex = 0;
    let m;
    while ((m = CLIENT_API_REF.exec(text)) !== null) {
      refs.add(m[1]);
    }
  }
  return refs;
}

// ─── Path matching ─────────────────────────────────────────────────────────

/**
 * Normalize Express-style :params and (regex) groups to a fragment we can
 * match against client references. We compare prefix-form: a server route
 * /api/projects/:id is considered consumed if the client references any
 * path that starts with /api/projects/.
 */
function normalizePathForMatch(serverPath) {
  // Strip everything from the first :param or wildcard onward, plus any
  // trailing slash. /api/projects/:id/foo → /api/projects/
  const stripped = serverPath.replace(/(\/:|\/\*).*$/, '/');
  return stripped.replace(/\/+$/, '/') ;
}

function isConsumedByClient(serverPath, clientRefs) {
  const prefix = normalizePathForMatch(serverPath);
  // Direct match (no params) is handled by prefix lookup too.
  for (const ref of clientRefs) {
    if (ref === serverPath) return true;
    if (ref.startsWith(prefix)) return true;
    // Server may declare /foo while client uses /foo/.
    if (ref + '/' === prefix) return true;
  }
  return false;
}

// ─── Owner attribution ─────────────────────────────────────────────────────

function loadOwners() {
  const ownersPath = path.join(repoRoot, 'docs', 'reports', 'route-mount-owners.json');
  if (!fs.existsSync(ownersPath)) return [];
  const data = JSON.parse(fs.readFileSync(ownersPath, 'utf8'));
  return (data.owners || []).sort(
    (a, b) => (b.prefix?.length ?? 0) - (a.prefix?.length ?? 0)
  );
}

function ownerFor(serverPath, owners) {
  for (const o of owners) {
    if (o.prefix && serverPath.startsWith(o.prefix)) return o;
  }
  return null;
}

// ─── Decision heuristics ───────────────────────────────────────────────────

const RETIRE_HINTS = [
  /test/i,
  /demo/i,
  /scaffold/i,
  /placeholder/i,
  /experimental/i,
  /\bdebug\b/i,
];

const KEEP_HINTS = [
  /webhook/i,
  /callback/i,
  /healthz?$/i,
  /metrics$/i,
  /export\b/i,
  /download\b/i,
  /cron\b/i,
];

function suggestDecision(endpoint) {
  const tag = `${endpoint.rawPath} ${endpoint.snippet}`;
  for (const re of KEEP_HINTS) if (re.test(tag)) return 'keep-server-only';
  for (const re of RETIRE_HINTS) if (re.test(tag)) return 'retire-candidate';
  return 'needs-review';
}

// ─── Run ────────────────────────────────────────────────────────────────────

const mountMap = discoverMountMap();
const declared = discoverServerEndpoints(mountMap);
const clientRefs = discoverApiReferences();
const owners = loadOwners();

const orphans = [];
const consumed = [];
for (const ep of declared) {
  if (isConsumedByClient(ep.rawPath, clientRefs)) {
    consumed.push(ep);
  } else {
    const owner = ownerFor(ep.rawPath, owners);
    orphans.push({
      method: ep.method,
      path: ep.rawPath,
      file: ep.file,
      line: ep.line,
      ownerPrefix: owner?.prefix ?? null,
      owner: owner?.owner ?? 'Unassigned',
      contact: owner?.contact ?? null,
      decision: suggestDecision(ep),
    });
  }
}

orphans.sort((a, b) => {
  if (a.owner !== b.owner) return a.owner.localeCompare(b.owner);
  return a.path.localeCompare(b.path);
});

// ─── Aggregation by owner / decision ───────────────────────────────────────

function tally(items, key) {
  const out = new Map();
  for (const item of items) {
    const k = item[key];
    out.set(k, (out.get(k) || 0) + 1);
  }
  return Object.fromEntries(
    Array.from(out.entries()).sort((a, b) => b[1] - a[1])
  );
}

const summary = {
  generatedAt: new Date().toISOString(),
  totalDeclared: declared.length,
  totalConsumedByClient: consumed.length,
  totalOrphans: orphans.length,
  byOwner: tally(orphans, 'owner'),
  byDecision: tally(orphans, 'decision'),
};

// ─── Output ────────────────────────────────────────────────────────────────

const reportsDir = path.join(repoRoot, 'docs', 'reports');
fs.mkdirSync(reportsDir, { recursive: true });
const jsonPath = path.join(reportsDir, 'orphan-endpoints-latest.json');
const mdPath = path.join(reportsDir, 'orphan-endpoints-latest.md');

const fullReport = { summary, orphans };
fs.writeFileSync(jsonPath, JSON.stringify(fullReport, null, 2) + '\n');

// Markdown summary
const mdLines = [];
mdLines.push('# Orphan-endpoint inventory');
mdLines.push('');
mdLines.push(`Generated: ${summary.generatedAt}`);
mdLines.push('');
mdLines.push('## Summary');
mdLines.push('');
mdLines.push(`- Declared server endpoints: **${summary.totalDeclared}**`);
mdLines.push(
  `- Consumed (client + server-to-server, heuristic): **${summary.totalConsumedByClient}**`
);
mdLines.push(`- Orphans (no caller reference): **${summary.totalOrphans}**`);
mdLines.push('');
mdLines.push('## Orphans by owner');
mdLines.push('');
mdLines.push('| Owner | Count |');
mdLines.push('| --- | ---: |');
for (const [owner, count] of Object.entries(summary.byOwner)) {
  mdLines.push(`| ${owner} | ${count} |`);
}
mdLines.push('');
mdLines.push('## Orphans by suggested decision');
mdLines.push('');
mdLines.push('| Decision | Count | Meaning |');
mdLines.push('| --- | ---: | --- |');
mdLines.push(
  `| keep-server-only | ${summary.byDecision['keep-server-only'] ?? 0} | Webhook / callback / health / export — legitimately not called from the client UI |`
);
mdLines.push(
  `| retire-candidate | ${summary.byDecision['retire-candidate'] ?? 0} | Path or comment suggests test / demo / scaffold — review for removal |`
);
mdLines.push(
  `| needs-review | ${summary.byDecision['needs-review'] ?? 0} | Heuristic could not classify — manual triage required |`
);
mdLines.push('');
mdLines.push('## Methodology + caveats');
mdLines.push('');
mdLines.push(
  '- Client consumption is detected by string-matching `/api/...` literals in client/src/. ' +
    'Dynamic path construction (`fetch(\\`/api/${id}/foo\\`)`) is matched on the static prefix.'
);
mdLines.push(
  '- Server-to-server calls (worker → API, route → route) are not tracked. An endpoint flagged here may still be in use.'
);
mdLines.push(
  '- Express path params are normalized to a prefix for comparison: `/api/projects/:id/foo` is considered consumed if the client references anything starting with `/api/projects/`.'
);
mdLines.push(
  '- The `decision` field is a heuristic suggestion, not a verdict. Owners should review their lane.'
);
mdLines.push('');
mdLines.push('## Detail');
mdLines.push('');
mdLines.push('See `orphan-endpoints-latest.json` for the full per-endpoint list with file:line references.');
fs.writeFileSync(mdPath, mdLines.join('\n') + '\n');

if (stdoutJson) {
  process.stdout.write(JSON.stringify(fullReport, null, 2) + '\n');
} else {
  console.log(`Declared:   ${summary.totalDeclared}`);
  console.log(`Consumed:   ${summary.totalConsumedByClient}`);
  console.log(`Orphans:    ${summary.totalOrphans}`);
  console.log('');
  console.log(`Report:     ${path.relative(repoRoot, jsonPath)}`);
  console.log(`Summary:    ${path.relative(repoRoot, mdPath)}`);
  console.log('');
  console.log('Top owners:');
  for (const [owner, count] of Object.entries(summary.byOwner).slice(0, 5)) {
    console.log(`  ${count.toString().padStart(4)}  ${owner}`);
  }
}

if (threshold !== null && summary.totalOrphans > threshold) {
  console.error(
    `\n[orphaned-endpoints] FAIL — ${summary.totalOrphans} orphans exceeds threshold of ${threshold}`
  );
  process.exit(1);
}
