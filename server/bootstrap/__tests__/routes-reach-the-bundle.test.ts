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

/**
 * Strip comments, and ONLY comments.
 *
 * ── Why this is a state machine and not two regexes ───────────────────────────
 * It used to be `.replace(/\/\*[\s\S]*?\*\//g, '')`. register-inline-routes.ts
 * line 788 contains the characters `/*` inside ordinary prose, which opened a
 * 13,294-character false "comment" spanning lines 788-1061 — and this guard
 * reported that file clean while a quarter of it was invisible. Twelve route
 * families lived in the hidden region, loaded by `await import(modPath)`, absent
 * from the bundle, 404ing in production behind twelve v2 surfaces that sat
 * silently on their fixtures.
 *
 * Blanking a string to spaces is not enough either: `import('pdfkit' as any)`
 * would collapse to `import( as any)` and be reported as computed. A string
 * literal is replaced by an empty quote pair so the character after `(` still
 * says "this is a literal".
 *
 * A template literal carrying a substitution is deliberately NOT treated as a
 * literal. `` import(`../routes/${name}`) `` is a computed specifier that
 * esbuild cannot resolve either, so it is rewritten to an identifier and caught.
 *
 * The self-check below pins all of that. This function has been wrong twice; it
 * does not get trusted on inspection any more.
 */
export function stripCommentsAndLiterals(src: string): string {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      const body: string[] = [];
      let interpolated = false;
      while (i < n) {
        if (src[i] === '\\') {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i += 1;
          break;
        }
        if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
          interpolated = true;
          let depth = 1;
          i += 2;
          const start = i;
          while (i < n && depth > 0) {
            if (src[i] === '{') depth += 1;
            else if (src[i] === '}') depth -= 1;
            i += 1;
          }
          body.push(src.slice(start, i - 1));
          continue;
        }
        if (src[i] === '\n') body.push('\n');
        i += 1;
      }
      out.push(interpolated ? `INTERPOLATED${body.join('')}` : `${quote}${body.join('')}${quote}`);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      // Newlines preserved so reported line numbers stay true.
      out.push(src.slice(i, stop).replace(/[^\n]/g, ' '));
      i = stop;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      out.push(' '.repeat(stop - i));
      i = stop;
      continue;
    }
    out.push(c);
    i += 1;
  }
  return out.join('');
}

const COMPUTED_IMPORT = /\bimport\(\s*([^'"`\s)][^)]*)\)/g;

function computedImportsIn(src: string): string[] {
  return [...stripCommentsAndLiterals(src).matchAll(COMPUTED_IMPORT)]
    .map((m) => m[1].trim())
    .filter((a) => a !== '' && a !== 'import.meta.url');
}

function code(rel: string): string {
  return fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
}

describe('the guard can see the whole file', () => {
  /*
   * The instrument is tested before its findings are believed. This guard has
   * been wrong twice — once flagging its own explanatory comment, once blinded
   * to 273 lines by a `/*` inside prose — and in both cases the failure was
   * silent: a green test over a file it could not read.
   */
  const CASES: Array<[string, number, string]> = [
    ["await import('x')", 0, 'a plain literal is not computed'],
    ['await import(v)', 1, 'a bare variable is computed'],
    ["await import('pdfkit' as any)", 0, 'a literal with a type assertion is still a literal'],
    ['/* prose mentioning /*) inside */ await import(v)', 1, 'a nested-looking comment does not swallow code'],
    ["const s = 'has /* inside'; await import(v)", 1, 'a /* inside a STRING does not open a comment'],
    ["// await import(v)\nawait import('y')", 0, 'a commented-out offender is not reported'],
    ['await import(`../routes/${n}`)', 1, 'a template with a substitution is computed'],
  ];

  it.each(CASES)('%s', (src, expected) => {
    expect(computedImportsIn(src)).toHaveLength(expected);
  });

  it('sees the whole of the largest bootstrap file', () => {
    // The specific regression. The old stripper reduced this file to 73% of its
    // real length; a line count is the cheapest way to notice that happening
    // again, whatever the cause.
    const raw = code('server/bootstrap/register-inline-routes.ts');
    const stripped = stripCommentsAndLiterals(raw);
    expect(stripped.split('\n').length).toBe(raw.split('\n').length);
    // A sentinel from deep inside the previously-invisible region. An
    // IDENTIFIER, not a path string: string literals are blanked to an empty
    // quote pair by design, so `path: '/api/cmc-changes'` would fail here for
    // the wrong reason. (It did, on the first run — the sentinel was wrong, not
    // the stripper.)
    expect(stripped).toContain('cmcChangesRoutes');
  });
});

describe('route registration reaches the production bundle', () => {
  it('no guarded file imports a module by computed specifier', () => {
    const offenders: string[] = [];
    for (const rel of GUARDED) {
      for (const arg of computedImportsIn(code(rel))) {
        offenders.push(`${rel}: import(${arg})`);
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
