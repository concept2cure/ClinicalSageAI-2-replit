/**
 * The one way this server mounts a group of routers.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * Six bootstrap files independently grew the same registration idiom:
 *
 *     const config = [{ path, mod: '../routes/x.js', name }, …]
 *     const results = await Promise.allSettled(config.map(c => import(c.mod)))
 *     results.forEach((r, i) => r.status === 'fulfilled'
 *       ? app.use(config[i].path, r.value.default)
 *       : console.error(`❌ Failed to mount ${config[i].name}`, r.reason))
 *
 * It has two defects, and the second is only reachable because of the first.
 *
 * `import(c.mod)` takes a VARIABLE specifier. esbuild cannot resolve those, so
 * it bundled none of the modules named this way — 112 route families in total,
 * confirmed absent from dist/index.js by reading esbuild's own metafile. At
 * runtime the specifier then resolved relative to dist/, found nothing, and
 * rejected. `Promise.allSettled` reduced that to a console.error and the server
 * finished starting, so `npm run start` reported a healthy boot with the entire
 * multi-tenant admin layer, every IND route, the eCTD compiler, the QMS/CAPA
 * stack and the evidence layer unmounted. Every request to them 404s, and
 * nothing anywhere says why.
 *
 * The literal-specifier dynamic imports elsewhere in these files are fine —
 * esbuild resolves those statically. The broken form and the working form are
 * one variable apart and read identically, which is why this needed a guard
 * (server/bootstrap/__tests__/routes-reach-the-bundle.test.ts) rather than a
 * comment, and why the fix is a shared helper that takes an already-imported
 * router rather than a string it could load.
 *
 * ── Why `router: unknown` and a runtime check ─────────────────────────────────
 * A statically imported module with no default export is a compile error, which
 * is the outcome we want. But `export default undefined`, and a module whose
 * default is populated by a side effect that did not run, are both type-clean
 * and reach `app.use(path, undefined)` — a TypeError from inside Express with no
 * indication of which router caused it. Naming it is strictly better.
 */

import type { Express, RequestHandler } from 'express';

export interface RouteEntry {
  /** Mount path, e.g. '/api/tenants'. */
  path: string;
  /** The router itself — already imported, never a specifier to be resolved. */
  router: unknown;
  /** Human name, used only in the boot log. */
  name: string;
}

/**
 * Mount every entry, reporting a missing router as loudly as a failed load.
 *
 * Deliberately synchronous. The `Promise.allSettled` in the old idiom existed to
 * parallelise module loading; with static imports the modules are already
 * loaded by the time this runs, so there is nothing to await and no failure to
 * settle. Keeping the async shape would preserve the appearance of resilience
 * without any of the substance.
 */
export function mountAll(
  app: Express,
  entries: readonly RouteEntry[],
  /**
   * Middleware applied ahead of every router in the group — in practice
   * `authenticateToken`.
   *
   * A group parameter rather than a per-entry field on purpose. The IND family
   * is auth-gated HERE because most of the individual routers forget to gate
   * themselves, and that backstop only works if it cannot be switched off one
   * entry at a time. Making it a property of the group means adding a route to
   * an auth-gated list inherits the gate, and removing the gate is a visible
   * edit to the call site rather than an omitted field.
   */
  ...middleware: RequestHandler[]
): void {
  for (const entry of entries) {
    if (!entry.router) {
      console.error(`❌ ${entry.name} has no default export — not mounted`);
      continue;
    }
    app.use(entry.path, ...middleware, entry.router as never);
    console.info(`✅ ${entry.name} routes mounted successfully`);
  }
}
