#!/usr/bin/env node
/**
 * Can the production image load the server bundle it ships?
 *
 * ── The defect this exists for (2026-09-24, launch row D1) ───────────────────
 * scripts/build-server.mjs bundles server/index.ts with `packages: 'external'`,
 * so every npm package the server imports stays an `import … from "pkg"` in
 * dist/index.js and is resolved at load time from the image's node_modules.
 * Dockerfile.optimized builds that node_modules with `npm ci --omit=dev`.
 *
 * server/vite.ts imported `vite` (and, through ../vite.config, `vite` and
 * `@vitejs/plugin-react`) at module top level. Both are devDependencies. esbuild
 * hoists an external import to the top of the bundle even when the module that
 * holds it is only reached on the dev path, so dist/index.js began with
 * `import{createServer…}from"vite"` — and the production image exited
 * ERR_MODULE_NOT_FOUND at module linking, before one line of application code.
 * No health check, no /readyz, no log line from the app: every task dead.
 *
 * Nothing caught it because every job that boots dist/index.js (the CI
 * production boot smoke among them) runs after a full `npm ci`, devDependencies
 * included. The one environment that prunes them is the image, and no job
 * boots the image.
 *
 * ── What this checks ─────────────────────────────────────────────────────────
 * The BUILT bundle, because that is what the image runs. esbuild re-reads
 * dist/index.js and reports every external import with its kind. Each package
 * is then looked up in package-lock.json the way `npm ci --omit=dev` would
 * install it: an entry at node_modules/<name> not marked `"dev": true`.
 *
 *   - A static import (evaluated when the bundle loads) of a package the image
 *     does not ship FAILS. Nothing in the process can run until it resolves.
 *   - A dynamic import() or require() of such a package FAILS too, unless it is
 *     listed in RUNTIME_EXCEPTIONS below with the reason: production never
 *     reaches it, or the code handles its absence without pretending (refuses,
 *     or reports nothing). Unreached today is a property of today's call graph;
 *     the list makes each exception a written decision.
 *   - A package the lockfile does not know at all (a phantom dependency that
 *     only resolves locally because something else hoisted it) FAILS the same
 *     way: the image may well not have it.
 *
 * Usage:
 *   node scripts/build-server.mjs && node scripts/ci/check-server-bundle-prod-imports.mjs
 *   --bundle <file>     check another bundle (the self-test uses this)
 *   --lockfile <file>   against another lockfile (the self-test uses this)
 *
 * Exit 0 only when every import the bundle makes is one the image can satisfy.
 * Self-test: scripts/ci/check-server-bundle-prod-imports.selftest.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[server-bundle-prod-imports]';

/**
 * Packages the image does not ship that the bundle may still import at RUN
 * time, each with the reason that is safe. A static import of any of them is
 * still refused: it would be evaluated at load.
 */
export const RUNTIME_EXCEPTIONS = {
  // Optional by design: reached in production, absence handled honestly.
  // (No dev-only entry is needed for `vite`: imported inside setupVite(), it
  // leaves the bundle entirely — the build bakes NODE_ENV=production, so the
  // dev branch of server/startup/frontend.ts is removed as dead code.)
  'ssh2-sftp-client':
    'server/services/submission-gateways/fda-esg.ts SFTP transport. Not in package.json at all, so ' +
    'the image cannot send over SFTP: absence is refused before any connection, with a ' +
    'TransportError carrying NOTHING_TRANSMITTED. Whether production ships it is the ESG ' +
    "lane's decision (D7); this entry records that it does not today.",
  'citation-js':
    'server/integrations/citationjs/client.ts — optional citation normalization. Absence logs ' +
    '"Citation.js normalization unavailable" and returns no normalization, never a made-up one.',
};

const args = process.argv.slice(2);
const argValue = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const bundlePath = path.resolve(repoRoot, argValue('--bundle') ?? 'dist/index.js');
const lockPath = path.resolve(repoRoot, argValue('--lockfile') ?? 'package-lock.json');

function die(lines) {
  console.error([`${TAG} FAIL`, ...lines].join('\n'));
  process.exit(1);
}

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const packageName = (spec) =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];

/** Every package `npm ci --omit=dev` installs from this lockfile. */
function shippedPackages(lock) {
  if (!lock.packages || typeof lock.packages !== 'object') {
    die([`${path.relative(repoRoot, lockPath)} has no "packages" map (lockfileVersion ${lock.lockfileVersion}); cannot tell what the image installs.`]);
  }
  const shipped = new Set();
  for (const [key, entry] of Object.entries(lock.packages)) {
    // Only top-level installs are resolvable from dist/: node_modules/<name>,
    // not node_modules/a/node_modules/<name>.
    const m = key.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)$/);
    if (m && !entry.dev) shipped.add(m[1]);
  }
  return shipped;
}

/** Every external import in the bundle, with esbuild's kind for it. */
async function bundleImports(file) {
  const result = await build({
    entryPoints: [file],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const input = Object.entries(result.metafile.inputs).find(([p]) => path.resolve(repoRoot, p) === file
    || path.resolve(process.cwd(), p) === file);
  if (!input) die([`esbuild did not report ${file} among its inputs; cannot read its imports.`]);
  return input[1].imports.filter((i) => i.external);
}

async function main() {
  if (!fs.existsSync(bundlePath)) {
    die([
      `${path.relative(repoRoot, bundlePath)} does not exist.`,
      '  This checks the BUILT server bundle, because that is what the image runs.',
      '  Build it first: node scripts/build-server.mjs',
    ]);
  }
  const shipped = shippedPackages(JSON.parse(fs.readFileSync(lockPath, 'utf8')));
  const imports = await bundleImports(bundlePath);

  const loadTime = new Map(); // package -> specifiers
  const runTime = new Map();
  for (const imp of imports) {
    if (BUILTINS.has(imp.path) || imp.path.startsWith('node:')) continue;
    if (imp.path.startsWith('<')) continue; // esbuild's own "<runtime>" helpers, not a package
    if (imp.path.startsWith('.') || imp.path.startsWith('/') || /^[a-z]+:/.test(imp.path)) continue;
    const name = packageName(imp.path);
    const target = imp.kind === 'import-statement' ? loadTime : runTime;
    target.set(name, [...new Set([...(target.get(name) ?? []), `${imp.path} (${imp.kind})`])]);
  }

  const failures = [];
  for (const [name, specs] of loadTime) {
    if (!shipped.has(name)) {
      failures.push(
        `  ${name} — imported at LOAD time (${specs.join(', ')}), and the image does not ship it ` +
          '(devDependency, or absent from package-lock.json). The container exits ERR_MODULE_NOT_FOUND ' +
          'before any application code runs. Import it dynamically inside the dev-only path, or move ' +
          'it to dependencies if production really uses it.',
      );
    }
  }
  const excused = [];
  for (const [name, specs] of runTime) {
    if (shipped.has(name)) continue;
    if (Object.hasOwn(RUNTIME_EXCEPTIONS, name)) {
      excused.push(`  ${name} — ${specs.join(', ')}: ${RUNTIME_EXCEPTIONS[name]}`);
      continue;
    }
    failures.push(
      `  ${name} — imported at RUN time (${specs.join(', ')}), and the image does not ship it. ` +
        'Production crashes the first time that path executes. Move it to dependencies, or, if ' +
        'production can never reach it or handles its absence honestly, add it to RUNTIME_EXCEPTIONS with the reason.',
    );
  }
  // An exception that no longer matches anything is a stale decision; drop it.
  for (const name of Object.keys(RUNTIME_EXCEPTIONS)) {
    if (!runTime.has(name) && !loadTime.has(name) && !argValue('--bundle')) {
      failures.push(`  RUNTIME_EXCEPTIONS lists ${name}, which the bundle no longer imports. Remove the entry.`);
    }
  }

  const rel = path.relative(repoRoot, bundlePath);
  if (failures.length) {
    die([`${rel} imports packages the production image (npm ci --omit=dev) does not ship:`, ...failures]);
  }
  console.log(
    `${TAG} ok — ${rel}: all ${loadTime.size} packages imported at load time are shipped by ` +
      `npm ci --omit=dev; ${runTime.size} imported at run time, ${excused.length} of them not shipped, each by written exception:`,
  );
  for (const e of excused) console.log(e);
}

await main();
