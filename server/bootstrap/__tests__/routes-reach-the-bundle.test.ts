/**
 * A route loaded by a variable specifier never reaches production.
 *
 * ── What happened ─────────────────────────────────────────────────────────────
 * Fifteen route families were registered as
 *
 *     litIntConfig.map(c => import(c.mod))     // c.mod is a runtime string
 *
 * esbuild cannot resolve a dynamic import whose specifier is a variable, so it
 * bundled none of them. Confirmed from esbuild's own metafile, not by grepping
 * the output: 15/15 absent from dist/index.js. At runtime the specifier
 * '../routes/billing.js' then resolved relative to dist/, found nothing, and
 * rejected — and `Promise.allSettled` turned that into a console.error while the
 * server carried on starting.
 *
 * So `npm run start` came up healthy with the entire commercial layer (licensing,
 * module subscriptions, billing, billing dashboard) and much of the product
 * (report-os, deep research, intelligent reports, device cockpit, global markets,
 * safety narratives, statistical defensibility, conversation health, workspace
 * config, insights) never mounted. Every request to them 404s.
 *
 * ── Why the code looked fine ──────────────────────────────────────────────────
 * The same file dynamically imports other routes three functions away and those
 * work perfectly, because their specifiers are string LITERALS, which esbuild
 * resolves statically. The broken form and the working form are one variable
 * apart and read identically. That is the whole reason this needs a guard rather
 * than a comment.
 *
 * ── Why a source check and not a build ────────────────────────────────────────
 * The honest test is "build the server and read the metafile", and that is how
 * the defect was found and the fix verified. It is also a ~40s esbuild run over
 * 2,200 inputs, which is too slow to sit in the unit suite. This asserts the
 * property that actually causes it — no variable specifiers in the bootstrap —
 * which is cheap, and is falsifiable by reverting the fix.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const BOOTSTRAP = 'server/bootstrap/register-inline-routes.ts';

describe('route registration reaches the production bundle', () => {
  it('no dynamic import in the bootstrap uses a variable specifier', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), BOOTSTRAP), 'utf8');

    // `import(` not immediately followed by a quote — i.e. a computed specifier.
    // Comments are stripped first so prose describing the bug cannot trip it,
    // a lesson from a source guard that flagged its own explanatory comment.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    const offenders = [...code.matchAll(/\bimport\(\s*([^'"`\s)][^)]*)\)/g)].map((m) => m[1].trim());

    expect(
      offenders,
      `${BOOTSTRAP} imports a route by computed specifier: ${offenders.join(', ')}. ` +
        `esbuild cannot resolve that, so the module will be absent from dist/index.js and ` +
        `the route will 404 in production while the server reports a healthy start. ` +
        `Use a static import.`,
    ).toEqual([]);
  });

  it('the commercial routes are imported statically by name', () => {
    // The positive half. The check above passes trivially on a file that
    // registers nothing at all, so name what must actually be there.
    const src = fs.readFileSync(path.resolve(process.cwd(), BOOTSTRAP), 'utf8');
    for (const mod of [
      'billing.js',
      'billing-dashboard.js',
      'licensing.js',
      'module-subscriptions.js',
      'report-os.js',
    ]) {
      expect(src, `${mod} is no longer statically imported`).toContain(`from '../routes/${mod}'`);
    }
  });
});
