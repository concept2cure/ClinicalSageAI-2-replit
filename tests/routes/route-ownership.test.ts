/**
 * Route ownership architecture test — tripwire for Phase 6's invariants.
 *
 * Guards:
 *
 * 1. `server/startup/routes.ts` contains zero inline `app.use(...)` calls.
 *    Every mount must be delegated to a named `register*Routes` function in
 *    `server/bootstrap/`. The composition root is for orchestration only.
 *
 * 2. The `register-inline-routes.ts` family exports exactly the six slot
 *    functions documented in `ROUTE_OWNERSHIP.md`, and `startup/routes.ts`
 *    calls each of them exactly once.
 *
 * Regressions in either guard are breaks of the `ROUTE_OWNERSHIP.md` truth
 * table and must be fixed (or the truth table updated and this test
 * amended with a proof report).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

// We intentionally analyze `register-inline-routes.ts` as source text rather
// than importing it at runtime. Runtime import would transitively pull in the
// whole route graph (which uses `@shared/*` path aliases not resolved by the
// default vitest config), turning an architecture test into a dependency-wiring
// smoke test. Source analysis keeps this test local and deterministic.

const ROOT = join(__dirname, '..', '..');
const STARTUP_ROUTES = join(ROOT, 'server/startup/routes.ts');
const INLINE_ROUTES = join(ROOT, 'server/bootstrap/register-inline-routes.ts');

const EXPECTED_SLOTS = [
  'registerInlineEarlyRoutes',
  'registerInlineAnaIntelligenceRoutes',
  'registerInlineLitCommerceRoutes',
  'registerInlinePlatformFacadesRoutes',
  'registerInlineAiWorkflowRoutes',
  'registerInlineSubmissionWorkflowRoutes',
] as const;

function stripCommentsAndStrings(source: string): string {
  // Strip block comments, line comments, and string literals so our matchers
  // don't false-positive on docstring examples or error messages.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

describe('Phase 6 — Route ownership invariants', () => {
  describe('server/startup/routes.ts is a pure composition root', () => {
    it('contains zero inline app.use(...) calls', () => {
      const source = stripCommentsAndStrings(readFileSync(STARTUP_ROUTES, 'utf-8'));
      const appUseMatches = source.match(/\bapp\.use\s*\(/g) ?? [];
      expect(
        appUseMatches,
        `server/startup/routes.ts must delegate every mount to a register*Routes ` +
          `function. Found ${appUseMatches.length} inline app.use(...) call(s). ` +
          `Move them into an appropriate register-*-routes.ts file under ` +
          `server/bootstrap/ and call the registrar from startup/routes.ts instead. ` +
          `See docs/audits/ROUTE_OWNERSHIP.md.`
      ).toHaveLength(0);
    });

    it('contains zero inline express.static(...) mounts', () => {
      // /uploads was the only static mount pre-Phase-6; it now lives inside
      // registerInlinePlatformFacadesRoutes. If a new static mount appears
      // here, it means someone bypassed the slot structure.
      const source = stripCommentsAndStrings(readFileSync(STARTUP_ROUTES, 'utf-8'));
      expect(source).not.toMatch(/\bexpress\.static\s*\(/);
    });

    it('contains zero inline dynamic import(...) of route modules', () => {
      // The six slot functions are allowed to `await import(...)` dynamically
      // — the composition root is not. Catches regressions where someone adds
      // a new route with a try/catch around a dynamic import instead of
      // putting it in a registrar.
      const source = stripCommentsAndStrings(readFileSync(STARTUP_ROUTES, 'utf-8'));
      const dynamicRouteImports = source.match(
        /await\s+import\s*\(\s*[''\"`]\.\.\/routes\//g
      ) ?? [];
      expect(dynamicRouteImports).toHaveLength(0);
    });
  });

  describe('register-inline-routes.ts exposes the documented slot API', () => {
    const inlineSource = readFileSync(INLINE_ROUTES, 'utf-8');

    it('declares all six slot functions with the expected names', () => {
      for (const slot of EXPECTED_SLOTS) {
        const decl = new RegExp(
          `export\\s+(?:async\\s+)?function\\s+${slot}\\s*\\(`
        );
        expect(
          decl.test(inlineSource),
          `register-inline-routes.ts must export slot function ${slot}. ` +
            `See docs/audits/ROUTE_OWNERSHIP.md.`
        ).toBe(true);
      }
    });

    it('declares only the documented slot functions as value exports', () => {
      // Match all `export function` / `export async function` / `export const X = …`
      // declarations. Type/interface exports don't count — they're compile-time only.
      const valueExportPattern =
        /export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
      const declared: string[] = [];
      let match;
      while ((match = valueExportPattern.exec(inlineSource)) !== null) {
        declared.push(match[1]);
      }
      const expected = [...EXPECTED_SLOTS].sort();
      expect(
        declared.sort(),
        `register-inline-routes.ts should value-export only the six slot ` +
          `functions (${expected.join(', ')}). If you're adding a seventh slot, ` +
          `update EXPECTED_SLOTS in this test and ROUTE_OWNERSHIP.md together. ` +
          `Found: ${JSON.stringify(declared)}`
      ).toEqual(expected);
    });
  });

  describe('server/startup/routes.ts wires every slot exactly once', () => {
    const source = stripCommentsAndStrings(readFileSync(STARTUP_ROUTES, 'utf-8'));

    for (const slot of EXPECTED_SLOTS) {
      it(`calls ${slot} exactly once`, () => {
        const callPattern = new RegExp(`\\b${slot}\\s*\\(`, 'g');
        const calls = source.match(callPattern) ?? [];
        expect(
          calls.length,
          `${slot} must be called exactly once from startup/routes.ts, ` +
            `in the position documented in ROUTE_OWNERSHIP.md. Found ${calls.length} call(s).`
        ).toBe(1);
      });
    }

    it('calls the six slots in the documented order', () => {
      const positions = EXPECTED_SLOTS.map(slot => ({
        slot,
        idx: source.search(new RegExp(`\\b${slot}\\s*\\(`)),
      }));
      for (const entry of positions) {
        expect(entry.idx, `${entry.slot} should appear in startup/routes.ts`).toBeGreaterThan(-1);
      }
      const indices = positions.map(p => p.idx);
      const sorted = [...indices].sort((a, b) => a - b);
      expect(
        indices,
        `Slot invocation order in startup/routes.ts must match EXPECTED_SLOTS ` +
          `order (ROUTE_OWNERSHIP.md). Reordering changes startup sequence and ` +
          `requires a proof report.`
      ).toEqual(sorted);
    });
  });

  describe('register-inline-routes.ts content stays within its family scope', () => {
    it('imports only from ../routes/, ../services/, ../middleware/, ../auth*, or ../betaRouteManifest', () => {
      const source = readFileSync(INLINE_ROUTES, 'utf-8');
      const imports = source.match(/^import\s[^;]+;/gm) ?? [];
      const relativeImports = imports
        .map(line => {
          const m = line.match(/from\s+[''\"]([^''\"]+)[''\"]/);
          return m ? m[1] : null;
        })
        .filter((p): p is string => p !== null && p.startsWith('.'));

      const allowed = (p: string): boolean =>
        p.startsWith('../routes/') ||
        p.startsWith('../services/') ||
        p.startsWith('../middleware/') ||
        p.startsWith('../auth') ||
        p.startsWith('../betaRouteManifest') ||
        p.startsWith('../src/routes/'); // stability router lives under src/routes/

      const violations = relativeImports.filter(p => !allowed(p));
      expect(
        violations,
        `register-inline-routes.ts should import only route routers, ` +
          `services, middleware, and helper modules. Disallowed imports: ` +
          `${JSON.stringify(violations)}`
      ).toEqual([]);
    });
  });
});
