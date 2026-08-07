#!/usr/bin/env node
/**
 * Does every module the server registers actually reach dist/index.js?
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * Six bootstrap files and two blueprint catalogs loaded their modules with
 * `import(variableSpecifier)`. esbuild cannot resolve those, so it bundled none
 * of them: 112 route families and all 13 regional blueprints were absent from
 * the production bundle while the server logged a healthy start for each. Every
 * request to those routes 404d; every regional project silently got a generic
 * CTD outline instead of its own.
 *
 * A source-level guard (server/bootstrap/__tests__/routes-reach-the-bundle.test.ts)
 * catches the specific idiom that caused it, cheaply, in the unit suite. This is
 * the guard that cannot be fooled by a NEW idiom, because it asks the bundler
 * itself. It is deliberately separate because it costs a ~40s build over 2,400
 * inputs, which does not belong in a unit run.
 *
 * ── What it asserts ───────────────────────────────────────────────────────────
 * Two things, and the second is the one that took a second attempt to get right.
 *
 *   1. Every module statically imported by a registrar or catalog is in
 *      esbuild's metafile for the real production entry point, built with the
 *      real production options. Not "the file exists" — that was always true —
 *      but "the bundler put it in the output".
 *
 *   2. Every router MOUNTED through mountAll() is one of those imports.
 *
 * (1) alone is not enough, and the first version of this script shipped with
 * only (1). Tested by reverting one fix — turning a static import of
 * tenant-users back into a runtime-specifier load — it reported success: the
 * module had left the bundle, but it had also left the set of static imports, so
 * there was nothing to check. A guard that stops looking at the thing you
 * removed cannot detect the removal. (2) closes that, because the mount entry
 * `{ path: '/api/tenant-users', router: tenantUsers, … }` stays behind and names
 * an identifier that is no longer an import.
 *
 * ── What it deliberately does NOT assert ──────────────────────────────────────
 * That every file under server/routes/ is bundled. Some genuinely are dead, and
 * a rule that failed on dead code would force either a mount nobody wants or an
 * exclusion list nobody maintains. Deleting dead routes is a separate decision
 * with its own blast radius (docs/audits/ROUTE_OWNERSHIP.md). The property here
 * is narrower and unambiguous: what we CLAIM to register must be in the bundle.
 */

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const SOURCES = [
  ...fs
    .readdirSync(path.join(ROOT, 'server/bootstrap'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `server/bootstrap/${f}`),
  'server/services/regulatory/taskBlueprintCatalog.ts',
  'server/services/regulatory/sectionBlueprintCatalog.ts',
];

/** Resolve a relative specifier the way Node/esbuild would, TS-source-first. */
function resolveSpecifier(fromFile, spec) {
  const base = path.normalize(path.join(path.dirname(fromFile), spec));
  const candidates = base.endsWith('.js')
    ? [`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`, base]
    : [`${base}.ts`, `${base}.tsx`, `${base}.js`, base, `${base}/index.ts`, `${base}/index.js`];
  return candidates.find((c) => fs.existsSync(path.join(ROOT, c))) ?? null;
}

const build = await esbuild.build({
  entryPoints: [path.join(ROOT, 'server/index.ts')],
  platform: 'node',
  packages: 'external',
  bundle: true,
  format: 'esm',
  outfile: '/dev/null',
  write: false,
  metafile: true,
  logLevel: 'silent',
});
const bundled = new Set(Object.keys(build.metafile.inputs));

/**
 * True when a module contributes nothing at runtime, so esbuild erasing it is
 * correct rather than a defect.
 *
 * This matters: the first run of this script flagged server/bootstrap/types.ts
 * from three registrars. That file is four `export type` / `export interface`
 * declarations, esbuild drops it entirely, and reporting it would have been a
 * false positive in a check whose whole value is that its failures are real. An
 * `import type` is skipped syntactically below; this covers the other spelling,
 * `import { SomeInterface } from './types'`, where the type-ness is not visible
 * at the call site.
 */
const typeOnlyCache = new Map();
function isTypeOnlyModule(rel) {
  if (typeOnlyCache.has(rel)) return typeOnlyCache.get(rel);
  const src = fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const exports = [...src.matchAll(/^\s*export\s+(?!type\b|interface\b)\S/gm)];
  const answer = exports.length === 0 && /^\s*export\s+(type|interface)\b/m.test(src);
  typeOnlyCache.set(rel, answer);
  return answer;
}

const missing = [];
let checked = 0;
let skippedTypeOnly = 0;
for (const file of SOURCES) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // Static imports only — `import x from '…'`, `import * as x from '…'`,
  // `import { x } from '…'`. A dynamic import is the source guard's business.
  // `import type …` is excluded here; the type-only module check below catches
  // the same thing spelled without the keyword.
  for (const m of src.matchAll(/^\s*import\s+(?!type\s)[^;]*?from\s+'(\.[^']+)'/gm)) {
    const spec = m[1];
    const resolved = resolveSpecifier(file, spec);
    if (resolved === null) {
      missing.push({ file, spec, why: 'no such file on disk' });
      continue;
    }
    if (isTypeOnlyModule(resolved)) {
      skippedTypeOnly += 1;
      continue;
    }
    checked += 1;
    if (!bundled.has(resolved)) {
      missing.push({ file, spec, why: `resolved to ${resolved}, absent from the bundle` });
    }
  }
}

/*
 * ── (2) every mounted router is a static import ───────────────────────────────
 *
 * Collect the identifiers bound by static imports in each file, then require
 * every `router: <ident>` inside a mountAll() entry to be one of them. An entry
 * whose router comes from anywhere else — an awaited dynamic import, a lookup
 * table, a local const — is exactly the shape the bundler cannot follow.
 */
let mounts = 0;
for (const file of SOURCES) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');

  const imported = new Set();
  for (const m of src.matchAll(/^\s*import\s+(?!type\s)([^;]*?)\s+from\s+'[^']+'/gm)) {
    const clause = m[1];
    // `x`, `* as x`, `{ a, b as c }`, and the combinations of them.
    const def = clause.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (def) imported.add(def[1]);
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) imported.add(ns[1]);
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const nm = part.trim().match(/(?:\bas\s+)?([A-Za-z_$][\w$]*)\s*$/);
        if (nm) imported.add(nm[1]);
      }
    }
  }

  for (const m of src.matchAll(/\brouter:\s*([A-Za-z_$][\w$]*)\s*[,}]/g)) {
    mounts += 1;
    const ident = m[1];
    if (!imported.has(ident)) {
      missing.push({
        file,
        spec: ident,
        why:
          `mounted as \`router: ${ident}\` but ${ident} is not bound by a static import ` +
          `in this file — the bundler cannot follow it`,
      });
    }
  }
}

console.log(
  `check-bundle-reachability: ${checked} runtime imports and ${mounts} mounted routers across ` +
    `${SOURCES.length} registrar/catalog files (${skippedTypeOnly} type-only skipped); ` +
    `${bundled.size} modules in the bundle.`,
);

if (missing.length > 0) {
  console.error(`\n❌ ${missing.length} registered module(s) will not be in dist/index.js:\n`);
  for (const m of missing) console.error(`   ${m.file}\n     → '${m.spec}': ${m.why}`);
  console.error(
    `\nA route in this state 404s in production while the server reports a healthy\n` +
      `start; a blueprint in this state silently falls back to the generic CTD\n` +
      `outline. Both are invisible without this check.\n`,
  );
  process.exit(1);
}

console.log('✅ every registered module reaches the production bundle.');
