/**
 * Every /api route production mounts, and what launch scope answers for each.
 *
 * A measurement, not a gate: it needs a database (route registration runs the
 * authoring-authorization invariant) and the production boot secrets, so it
 * runs where those exist. The evidence it produced for D2 stage 3 is in
 * docs/evidence/D2-API-SCOPE/2026-09-25/stage3-*.
 *
 * Why the running registration and not a grep of `app.use`: routers mounted at
 * the bare `/api` register their own sub-prefixes, some mounts are conditional
 * on production flags, and Express 5 records a layer's path only when a request
 * matches it. So `Router.prototype.use` and `.route` are wrapped BEFORE any
 * route module loads, to tag each layer with the path it was mounted at; then
 * the real `registerPreStartRoutes` / `registerPostStartRoutes` run with the
 * flags `resolveStartupFlags()` gives this environment, and the stack is walked.
 *
 * Each unclaimed (`unmapped`) route is grouped by namespace and crossed with:
 *   - every client file that names it (comments stripped), and which launch or
 *     shell screen reaches that file (ci:launch-scope-api's import walker);
 *   - the auth boundary's public list (callers no screen shows).
 *
 * Usage (a throwaway database; never a shared one):
 *   NODE_ENV=production DATABASE_URL=... <production boot secrets> \
 *     npx tsx scripts/ci/launch-scope-route-inventory.ts --out <file.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const req = createRequire(import.meta.url);
const Router = req('router');
const origUse = Router.prototype.use;
Router.prototype.use = function (this: any, ...args: any[]) {
  const before = this.stack.length;
  const first = args[0];
  const mount = typeof first === 'function' || (Array.isArray(first) && typeof first[0] === 'function') ? '/' : first;
  const r = origUse.apply(this, args);
  for (let i = before; i < this.stack.length; i++) this.stack[i].__mount = mount;
  return r;
};
const origRoute = Router.prototype.route;
Router.prototype.route = function (this: any, p: any) {
  const r = origRoute.call(this, p);
  this.stack[this.stack.length - 1].__mount = p;
  return r;
};

interface RouteRow { path: string; methods: string[] }

function mountOf(layer: any): string {
  const m = layer.__mount;
  if (m === undefined || m === '/') return '';
  return Array.isArray(m) ? m.map(String).join('|') : String(m);
}
function walk(stack: any[], base: string, out: RouteRow[]) {
  for (const l of stack) {
    if (l.route) {
      const ps = Array.isArray(l.route.path) ? l.route.path : [l.route.path];
      for (const p of ps) out.push({ path: base + String(p), methods: Object.keys(l.route.methods) });
    } else if (l.handle?.stack) {
      walk(l.handle.stack, base + mountOf(l), out);
    }
  }
}

async function main() {
  const outFile = process.argv[process.argv.indexOf('--out') + 1];
  if (!process.argv.includes('--out') || !outFile) throw new Error('usage: --out <file.json>');
  const express = (await import('express')).default;
  const { registerPreStartRoutes, registerPostStartRoutes, createAiCircuitBreaker } = await import('../../server/startup/routes');
  const { resolveStartupFlags } = await import('../../server/startup/env');
  const { pool } = await import('../../server/db');
  const { buildPrefixMap, NEVER_GATED } = await import('../../server/services/entitlements/api-prefix-map');
  const { launchScopeApiVerdict } = await import('../../server/services/entitlements/launch-scope-api');
  const { checkLaunchScopeApi, REAL } = await import('./check-launch-scope-api');
  const { LAUNCH_SURFACE_IDS } = await import('../../shared/constants/launch-scope');

  const app = express();
  const flags = resolveStartupFlags();
  const ctx = { app, pool, experimentalRoutesEnabled: flags.experimentalRoutesEnabled, demoRoutesEnabled: flags.demoRoutesEnabled, testRoutesEnabled: flags.testRoutesEnabled } as any;
  await registerPreStartRoutes(ctx, createAiCircuitBreaker());
  await registerPostStartRoutes(ctx);
  const routes: RouteRow[] = [];
  walk((app as any).router?.stack ?? (app as any)._router?.stack ?? [], '', routes);

  const map = buildPrefixMap();
  const rows = routes.filter((r) => r.path.startsWith('/api')).map((r) => ({ ...r, verdict: launchScopeApiVerdict(r.path, map, NEVER_GATED) }));
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;

  const { reached } = checkLaunchScopeApi(REAL, map, LAUNCH_SURFACE_IDS);
  const reachedRel = new Map([...reached].map(([f, s]) => [path.relative(REAL.root, f), [...s]]));
  const claimedTwo = new Set(rows.filter((r) => r.verdict !== 'unmapped').map((r) => r.path.split('/').slice(0, 3).join('/')));
  const groups = new Map<string, typeof rows>();
  for (const r of rows.filter((r) => r.verdict === 'unmapped')) {
    const segs = r.path.split('/');
    let g = segs.slice(0, 3).join('/');
    if (claimedTwo.has(g) && segs.length > 3 && !segs[3].startsWith(':')) g = segs.slice(0, 4).join('/');
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }
  const clientFiles = execSync("git ls-files 'client/src/*.ts' 'client/src/*.tsx' 'client/src/**/*.ts' 'client/src/**/*.tsx'", { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !/__tests__|\.test\.|\.spec\./.test(f));
  const src = new Map(clientFiles.map((f) => [f, fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')]));
  const unmapped = [...groups]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([g, rs]) => {
      const re = new RegExp(`${g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[/'"\`?$]|$)`, 'm');
      const callers = clientFiles.filter((f) => re.test(src.get(f)!));
      return {
        namespace: g,
        routes: rs.length,
        writes: rs.filter((r) => r.methods.some((m) => m !== 'get' && m !== 'head')).length,
        clientCallers: callers,
        launchCallers: callers.filter((f) => reachedRel.has(f)).map((f) => ({ file: f, surfaces: reachedRel.get(f) })),
        sample: rs.slice(0, 3).map((r) => `${r.methods.join(',').toUpperCase()} ${r.path}`),
      };
    });
  const report = { flags, routes: rows.length, counts, unmappedNamespaces: unmapped.length, unmappedCalledByLaunch: unmapped.filter((u) => u.launchCallers.length), unmapped };
  fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ routes: rows.length, counts, unmappedNamespaces: unmapped.length, calledByLaunch: report.unmappedCalledByLaunch.length }));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
