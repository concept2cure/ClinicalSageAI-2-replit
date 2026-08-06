#!/usr/bin/env node
/**
 * CI guard: no dynamic import() with a non-literal specifier in bundled server code.
 *
 * ── The failure this prevents ─────────────────────────────────────────────────
 * The server ships as a single esbuild bundle (scripts/build-server.mjs,
 * bundle:true). esbuild can bundle `import('string literal')` but it CANNOT
 * bundle `import(variable)` — it leaves the latter as a runtime import. In the
 * built dist/index.js that runtime specifier (e.g. '../routes/tenants-simple.js')
 * resolves relative to dist/index.js, finds nothing, and throws
 * ERR_MODULE_NOT_FOUND. Where the call sits inside Promise.allSettled/try-catch
 * (as the route registrars did), the error is swallowed and the route is
 * SILENTLY ABSENT in production while working fine in dev (tsx from source).
 *
 * That is the worst shape of bug: invisible until deployed, and invisible even
 * then unless someone hits the missing route. ~127 route mounts shipped this way
 * (fix: "bundle the ~127 route mounts esbuild was silently dropping in prod").
 *
 * ── The rule ──────────────────────────────────────────────────────────────────
 * Every dynamic import() in bundled server code must take a STRING LITERAL, so
 * esbuild can resolve and inline it at build time. To load a module chosen at
 * runtime, carry a thunk with a literal import — `() => import('./x')` — and
 * call it; the literal is inside the thunk, so esbuild still bundles it.
 *
 * The only legitimate exception is loading an EXTERNAL, optional npm dependency
 * that may be absent at runtime (OTEL, Temporal). Those are deliberately hidden
 * from esbuild via `new Function('m','return import(m)')` and resolved from
 * node_modules at runtime with a catch. They are allow-listed by file below,
 * each with a reason.
 *
 * Usage: node scripts/ci/check-bundlable-imports.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_ROOTS = ['server'];

/**
 * Files permitted to use a non-literal dynamic import, each because it loads an
 * external, optional npm package that may not be installed — never a local
 * module. These use `new Function('m','return import(m)')` and catch failure.
 */
const ALLOWLIST = new Map([
  ['server/services/telemetry/opentelemetry.ts', 'optional @opentelemetry/* SDK, loaded via new Function, catch-guarded'],
  ['server/services/workflow/temporalBridge.ts', 'optional @temporalio/client, loaded via new Function, catch-guarded'],
  ['server/services/ana/submission-chat-otel-exporter.ts', 'optional OTLP exporter, loaded via new Function, catch-guarded'],
  ['server/integrations/citationjs/client.ts', 'optional citation-js external package, runtime-resolved'],
  ['server/services/submission-gateways/fda-esg.ts', 'optional ssh2-sftp-client external package (AS2-only orgs skip it), catch-guarded'],
]);

function isTestPath(rel) {
  return /(^|\/)__tests__\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...walk(full));
    } else if (entry.isFile() && /\.[cm]?tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// A dynamic import whose first non-whitespace argument character is NOT a quote
// (' " `) is a variable/expression specifier. `import(` preceded by a word char
// (e.g. an identifier ending in "import") is excluded via the leading boundary.
const NON_LITERAL_IMPORT = /(^|[^.\w])import\(\s*([^'"`\s)])/g;

const findings = [];

for (const root of SCAN_ROOTS) {
  for (const file of walk(path.join(repoRoot, root))) {
    const rel = path.relative(repoRoot, file).replaceAll(path.sep, '/');
    if (isTestPath(rel)) continue;
    if (ALLOWLIST.has(rel)) continue;

    const text = fs.readFileSync(file, 'utf8');
    NON_LITERAL_IMPORT.lastIndex = 0;
    let m;
    while ((m = NON_LITERAL_IMPORT.exec(text)) !== null) {
      // Ignore `import(` that appears inside a string literal on the same line
      // (the new Function pattern); the allowlist covers the real cases, but a
      // stray occurrence in a comment/string should not fail the gate.
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      const lineEnd = text.indexOf('\n', m.index);
      const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      if (/return import\(/.test(line) || /['"`][^'"`]*import\(/.test(line)) continue;
      const lineNo = text.slice(0, m.index).split('\n').length;
      findings.push({ file: rel, line: lineNo, snippet: line.trim().slice(0, 100) });
    }
  }
}

if (findings.length === 0) {
  console.log('[ci:bundlable-imports] OK — every dynamic import() in server/ uses a string literal (or is allow-listed).');
  process.exit(0);
}

console.error('[ci:bundlable-imports] FAIL — non-literal dynamic import() found in bundled server code:\n');
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.snippet}`);
}
console.error(
  '\nesbuild cannot bundle import(<variable>); it becomes a runtime import that throws\n' +
    'ERR_MODULE_NOT_FOUND from dist/index.js and is silently swallowed in production.\n' +
    'Fix: use a thunk with a literal — { load: () => import(\'./x\') } — and call it.\n' +
    'If this genuinely loads an OPTIONAL EXTERNAL package, add the file to ALLOWLIST\n' +
    'in this script with a one-line reason.'
);
process.exit(1);
