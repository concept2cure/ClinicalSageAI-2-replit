/**
 * A module loaded by a variable specifier never reaches production.
 *
 * ── What happened ─────────────────────────────────────────────────────────────
 * Six bootstrap files and two blueprint catalogs registered their modules as
 *
 *     config.map(c => import(c.mod))     // c.mod is a runtime string
 *
 * esbuild cannot resolve a dynamic import whose specifier is a variable, so it
 * bundled none of them. Confirmed from esbuild's own metafile, not by grepping
 * the output: 112 route families and all 13 regional blueprints absent from
 * dist/index.js. At runtime '../routes/billing.js' then resolved relative to
 * dist/, found nothing, and rejected — and `Promise.allSettled` turned that into
 * a console.error while the server carried on starting. The blueprint catalogs
 * were worse: they swallowed the rejection in a bare `catch { return null }` and
 * fell back to a generic outline, so there was no log line at all.
 *
 * So `npm run start` came up healthy with, among others:
 *   • every commercial route — licensing, module subscriptions, billing;
 *   • the entire multi-tenant admin layer — tenants, organizations, clients,
 *     tenant-users, tenant-config;
 *   • every IND route, the eCTD compiler and the eCTD submission agent;
 *   • the QMS / CAPA-MDR / design-risk / post-market device stack;
 *   • the evidence layer, knowledge base and GraphRAG;
 *   • all 13 regional blueprints — US, EU, Canada, Japan, China, Australia,
 *     Brazil, India — silently replaced by one generic CTD outline.
 * Every request to the routes 404s. Every regional project got the wrong plan.
 *
 * ── Why the code looked fine ──────────────────────────────────────────────────
 * The same files dynamically import other modules a few lines away and those
 * work perfectly, because their specifiers are string LITERALS, which esbuild
 * resolves statically. The broken form and the working form are one variable
 * apart and read identically. That is the whole reason this needs a guard rather
 * than a comment.
 *
 * ── Why a source check and not a build ────────────────────────────────────────
 * The honest test is "build the server and read the metafile", and that is how
 * the defect was found and every fix verified. It is also a ~40s esbuild run
 * over 2,400 inputs, which is too slow to sit in the unit suite — so it lives in
 * scripts/ci/check-bundle-reachability.mjs and runs as its own step. This file
 * asserts the property that actually causes the defect, which is cheap, and is
 * falsifiable by reverting any one of the fixes.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/**
 * The files where a module's absence is silent and material.
 *
 * A glob over the bootstrap directory rather than a hand-list, so a NEW
 * registrar is covered the day it is added rather than the day someone
 * remembers to add it here. The two blueprint catalogs are named individually
 * because they live in services/ and are the only two files there that resolve
 * a module by lookup key.
 *
 * Deliberately NOT all of server/. Six variable-specifier sites remain in
 * services — OpenTelemetry's exporter probe, citation-js, the Temporal bridge,
 * the FDA ESG signer, audit-services — and every one is an OPTIONAL dependency
 * where "absent" is a supported outcome the caller handles. Widening this guard
 * to cover them would fail on correct code, and a guard that has to be
 * suppressed is a guard that gets suppressed.
 */
const GUARDED = [
  ...fs
    .readdirSync(path.join(ROOT, 'server/bootstrap'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `server/bootstrap/${f}`),
  'server/services/regulatory/taskBlueprintCatalog.ts',
  'server/services/regulatory/sectionBlueprintCatalog.ts',
];

/** Source with comments stripped, so prose describing the bug cannot trip the check. */
function code(rel: string): string {
  return fs
    .readFileSync(path.resolve(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('route registration reaches the production bundle', () => {
  it('no guarded file imports a module by computed specifier', () => {
    // `import(` not immediately followed by a quote — i.e. a computed specifier.
    // Comments are stripped first, a lesson from a source guard that flagged its
    // own explanatory comment.
    const offenders: string[] = [];
    for (const rel of GUARDED) {
      for (const m of code(rel).matchAll(/\bimport\(\s*([^'"`\s)][^)]*)\)/g)) {
        offenders.push(`${rel}: import(${m[1].trim()})`);
      }
    }

    expect(
      offenders,
      `A module is imported by computed specifier:\n  ${offenders.join('\n  ')}\n` +
        `esbuild cannot resolve that, so the module will be absent from dist/index.js. ` +
        `A route will 404 in production while the server reports a healthy start; a ` +
        `blueprint will silently fall back to the generic CTD outline. Use a static import.`,
    ).toEqual([]);
  });

  it('the families that were missing are imported statically by name', () => {
    // The positive half. The check above passes trivially on a file that
    // registers nothing at all, so name what must actually be there. One
    // representative per bootstrap file that carried the defect — enough that
    // reverting any single fix fails here.
    const expectations: Array<[string, string[]]> = [
      ['server/bootstrap/register-inline-routes.ts', ['billing.js', 'licensing.js', 'report-os.js']],
      ['server/bootstrap/register-tenant-routes.ts', ['tenants-simple.js', 'tenant-users.js']],
      ['server/bootstrap/register-project-routes.ts', ['project-hierarchy.js', 'planner-routes.js']],
      ['server/bootstrap/register-clinical-intel-routes.ts', ['ind.js', 'regulatoryRoutes.js']],
      ['server/bootstrap/register-document-routes.ts', ['ectd-compile.js', 'qms.js', 'evidence.js']],
      ['server/bootstrap/register-advanced-platform-routes.ts', ['market-access.js', 'cro.js']],
    ];

    for (const [file, mods] of expectations) {
      const src = fs.readFileSync(path.resolve(ROOT, file), 'utf8');
      for (const mod of mods) {
        expect(src, `${file} no longer statically imports ${mod}`).toContain(
          `from '../routes/${mod}'`,
        );
      }
    }
  });

  it('every regional blueprint is imported statically by both catalogs', () => {
    // All 13 were absent, which meant Canada, Japan, China, Brazil, India and
    // Australia all resolved to the same generic CTD outline in production. The
    // section catalog covers 12 — US_IND keeps its own async path, documented in
    // that file — so the counts differ on purpose and are asserted separately
    // rather than smoothed into one number.
    const task = fs.readFileSync(
      path.resolve(ROOT, 'server/services/regulatory/taskBlueprintCatalog.ts'),
      'utf8',
    );
    const section = fs.readFileSync(
      path.resolve(ROOT, 'server/services/regulatory/sectionBlueprintCatalog.ts'),
      'utf8',
    );

    const ALL = [
      'usIndBlueprint', 'usNdaBlueprint', 'usBlaBlueprint', 'euMaaBlueprint', 'euCtaBlueprint',
      'canadaNdsBlueprint', 'canadaCtaBlueprint', 'japanMaaBlueprint', 'japanCtnBlueprint',
      'chinaCtaBlueprint', 'australiaCtnBlueprint', 'brazilDdcmBlueprint', 'indiaCtBlueprint',
    ];

    for (const bp of ALL) {
      expect(task, `taskBlueprintCatalog no longer imports ${bp}`).toContain(
        `./registry/blueprints/${bp}.js`,
      );
    }
    for (const bp of ALL.filter((b) => b !== 'usIndBlueprint')) {
      expect(section, `sectionBlueprintCatalog no longer imports ${bp}`).toContain(
        `./registry/blueprints/${bp}.js`,
      );
    }
  });
});
