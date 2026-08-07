/**
 * Every router the bootstrap now imports statically must actually load.
 *
 * ── Why this exists, and why it did not before ────────────────────────────────
 * The 112 route families restored to the bundle were, for as long as anyone can
 * tell, never imported in production. They were loaded as `import(c.mod)` with a
 * variable specifier, esbuild left them out of dist/index.js, the import
 * rejected, and `Promise.allSettled` reduced that to a console.error while the
 * server finished starting.
 *
 * Fixing that changes the failure mode in a way worth guarding. A static import
 * runs the module's top level at BOOT. A module that throws while initialising —
 * a missing env var read at module scope, a client constructed eagerly, a
 * `throw` in a config check — used to be swallowed into one log line among
 * hundreds. Now it takes the process down before Express listens.
 *
 * That trade is the right one: a server that will 404 an entire product surface
 * should not report a healthy start. But it means the blast radius of these
 * modules moved from "one route is broken" to "nothing starts", and a change
 * that large deserves a test that names it rather than a hope.
 *
 * ── What this asserts ─────────────────────────────────────────────────────────
 * Each module imports without throwing, and exports something mountable. It does
 * NOT exercise any handler — that is what the route suites are for. The question
 * here is narrower and was previously unaskable: does requiring all of this at
 * once boot?
 *
 * ── Why the list is derived, not written down ─────────────────────────────────
 * Read out of the bootstrap files themselves, so it covers whatever is actually
 * registered today. A hand-maintained list would drift the first time someone
 * adds a router, and drift in exactly the direction that hides the problem.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BOOTSTRAP_DIR = path.join(ROOT, 'server/bootstrap');

beforeAll(() => {
  // These modules read configuration at import time — which is the whole point
  // of the test. Give them the same minimum the server itself requires so a
  // failure means a real defect and not an unset variable in the test runner.
  process.env.JWT_SECRET ||= 'registered-routers-load-test-secret';
  process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

/**
 * Every `from '../routes/x.js'` in every bootstrap registrar, with a note on
 * whether the binding is MOUNTED as a router or merely used.
 *
 * The distinction is not cosmetic and the first version of this file got it
 * wrong: it demanded a mountable default from all 196 and 7 failed, because
 * `510k-workflow-routes`, `pma-workflow-routes`, `audit-trail-routes`,
 * `misc-inline-routes`, `ana-ri-inline-routes` and `test-assembly` export
 * FACTORIES (`create510kWorkflowRoutes(pool)`) that the registrar calls, and
 * `ask-ana-utils` is a pure utility module with no router at all. All seven
 * imported cleanly; only the assertion was too broad.
 *
 * So mountability is asserted exactly where the code mounts — a binding used as
 * `router: <name>` in a mountAll() entry — and clean loading is asserted
 * everywhere, which is the question this file exists to answer.
 */
function registeredRouteSpecifiers(): Array<{ spec: string; mounted: boolean }> {
  const found = new Map<string, boolean>();
  const files = fs.readdirSync(BOOTSTRAP_DIR).filter((f) => f.endsWith('.ts'));

  const mountedIdents = new Set<string>();
  const sources = new Map<string, string>();
  for (const file of files) {
    const src = fs.readFileSync(path.join(BOOTSTRAP_DIR, file), 'utf8');
    sources.set(file, src);
    for (const m of src.matchAll(/\brouter:\s*([A-Za-z_$][\w$]*)\s*[,}]/g)) {
      mountedIdents.add(m[1]);
    }
  }

  for (const src of sources.values()) {
    for (const m of src.matchAll(
      /^\s*import\s+(?!type\s)([A-Za-z_$][\w$]*|\{[^}]*\}|\*\s+as\s+[A-Za-z_$][\w$]*)\s+from\s+'(\.\.\/routes\/[^']+)'/gm,
    )) {
      const clause = m[1];
      const spec = m[2];
      const idents = clause.startsWith('{')
        ? clause
            .slice(1, -1)
            .split(',')
            .map((p) => p.trim().match(/(?:\bas\s+)?([A-Za-z_$][\w$]*)\s*$/)?.[1])
            .filter(Boolean)
        : [clause.replace(/^\*\s+as\s+/, '')];
      const mounted = idents.some((i) => i && mountedIdents.has(i));
      found.set(spec, (found.get(spec) ?? false) || mounted);
    }
  }
  return [...found.entries()]
    .map(([spec, mounted]) => ({ spec, mounted }))
    .sort((a, b) => a.spec.localeCompare(b.spec));
}

const SPECS = registeredRouteSpecifiers();
const MOUNTED = SPECS.filter((s) => s.mounted);

describe('every statically registered router loads', () => {
  it('there are routers to check (guards against an empty sweep)', () => {
    // A derived list that silently resolves to nothing is the failure mode of
    // every derived list. 97 route families were restored in one change; a
    // number in the low single digits means the extraction regex stopped
    // matching, not that the routers went away.
    expect(SPECS.length).toBeGreaterThan(80);
  });

  it('a meaningful share of them are actually mounted', () => {
    // Guards the mounted/unmounted split itself. If the `router:` extraction
    // stopped matching, every module would fall into the weaker "loads cleanly"
    // bucket and the mountability assertion below would quietly cover nothing.
    expect(MOUNTED.length).toBeGreaterThan(80);
  });

  it.each(SPECS.map((s) => s.spec))('%s imports without throwing', async (spec) => {
    // The specifier is relative to server/bootstrap/; this file is one level
    // deeper, so '../' reaches the same place '../../' does from here.
    const fromHere = spec.replace(/^\.\.\//, '../../');
    try {
      await import(/* @vite-ignore */ fromHere);
    } catch (err) {
      // Fail with the module's own error rather than a generic one. When this
      // breaks, the cause is almost always a line in the module's top level and
      // the stack is the whole diagnosis.
      throw new Error(
        `${spec} throws while loading, which now takes the server down at boot ` +
          `rather than logging and continuing:\n${(err as Error)?.stack ?? String(err)}`,
      );
    }
  });

  it.each(MOUNTED.map((s) => s.spec))('%s exports something app.use() can mount', async (spec) => {
    const mod = (await import(/* @vite-ignore */ spec.replace(/^\.\.\//, '../../'))) as Record<
      string,
      unknown
    >;
    // protocol_routes is the one module here that exports its router under a
    // name rather than as default; register-clinical-intel-routes imports it
    // that way on purpose.
    const mountable = mod.default ?? mod.protocolRoutes;
    expect(mountable, `${spec} is mounted but has nothing to mount`).toBeDefined();
    expect(
      typeof mountable,
      `${spec} exports a ${typeof mountable}, which app.use() cannot mount`,
    ).toBe('function');
  });
});
