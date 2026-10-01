/**
 * Every route the Vault legal-hold router serves is reachable in production
 * (P1-22 remainder, DP-20; ADR-0014 §6).
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * The router (vault-legal-holds.ts, mounted at /api/vault/legal-holds) serves
 * the legal-hold list, place and lift, and the organisation's retention period
 * (vault-retention-period.ts). No surface in shared/constants/ui-surface-registry.ts
 * claimed that prefix. In production the API gate refuses a path nothing claims
 * (LAUNCH_SCOPE_API_UNATTRIBUTED unset = enforce, with LAUNCH_SCOPE_ENFORCE
 * unset = on), so every one of those routes answered 403 LAUNCH_SCOPE: the
 * retention period could not be read or set, and "a legal hold always
 * overrides" had no operable control. ci:launch-scope-api saw only the
 * retention path, because no screen calls the legal-hold routes.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * The routes are read from the router files themselves, so a route added later
 * is checked too. Each is sent through the real gate, built in production
 * posture from the real registry, and must reach the route. The retention
 * period is attributed to Setup, the surface whose card calls it; the rest of
 * the family to the Vault.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/license-manager.js', () => ({ canAccessModule: vi.fn(async () => ({ allowed: true })) }));
const dbQuery = vi.hoisted(() => vi.fn(async () => ({ rows: [] as unknown[] })));
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => dbQuery(...(a as [])) } }));

import { LAUNCH_SURFACE_IDS } from '../../../shared/constants/launch-scope';
import { buildPrefixMap, moduleEntitlementGate, modulesForPath } from '../../middleware/moduleEntitlementGate';
import { invalidateEnforcementModeCache } from '../../services/entitlements/enforcement-mode';
import { readLaunchScopeMode, readUnattributedApiMode } from '../../services/entitlements/launch-scope';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ROUTER = 'server/routes/vault-legal-holds.ts';

interface Route {
  method: string;
  path: string;
}

/** Where production mounts the router (server/bootstrap/register-inline-routes.ts). */
function mountPrefix(): string {
  const m = read('server/bootstrap/register-inline-routes.ts').match(
    /app\.use\(\s*'([^']+)'[^;]*createVaultLegalHoldRoutes\(\)/,
  );
  if (!m) throw new Error('register-inline-routes.ts no longer mounts createVaultLegalHoldRoutes');
  return m[1];
}

const join = (base: string, sub: string) => (sub === '/' ? base : `${base}${sub}`);

/** The file a factory named in `router.use('<sub>', factory())` is imported from. */
function fileOfFactory(src: string, factory: string): string {
  const m = src.match(new RegExp(`import\\s*\\{[^}]*\\b${factory}\\b[^}]*\\}\\s*from\\s*'(\\.[^']+)'`));
  if (!m) throw new Error(`${ROUTER} mounts ${factory} but no relative import names it`);
  return `server/routes/${m[1].replace(/^\.\//, '')}.ts`;
}

/** Every `router.<verb>('<path>'` the file declares, under `base`, following `router.use('<sub>', factory())`. */
function routesOf(rel: string, base: string): Route[] {
  const src = read(rel);
  const out: Route[] = [];
  for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
    out.push({ method: m[1].toUpperCase(), path: join(base, m[2]) });
  }
  for (const m of src.matchAll(/router\.use\(\s*'([^']+)'\s*,\s*(\w+)\(\)/g)) {
    out.push(...routesOf(fileOfFactory(src, m[2]), join(base, m[1])));
  }
  return out;
}

const ROUTES = routesOf(ROUTER, mountPrefix()).map((r) => ({
  ...r,
  path: r.path.replace(/:\w+/g, '0b7c6a52-3f7e-4d4b-9a51-2c5e8f1d9a10'),
}));

/** The gate as production builds it at boot: both modes read from an environment that sets neither. */
const productionGate = () =>
  moduleEntitlementGate(buildPrefixMap(), {
    launchScope: readLaunchScopeMode({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    unattributed: readUnattributedApiMode({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
  });

async function send(route: Route) {
  const res: any = { statusCode: 0, body: null };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  const next = vi.fn();
  const req = { method: route.method, path: route.path, originalUrl: route.path, tenantContext: { organizationId: 42 } };
  await productionGate()(req as any, res, next);
  return { reached: next.mock.calls.length === 1, status: res.statusCode, body: res.body };
}

beforeEach(() => {
  invalidateEnforcementModeCache();
  vi.unstubAllEnvs();
  vi.stubEnv('MODULE_ENFORCEMENT', 'off');
});

describe('Vault legal-hold routes under the production API gate', () => {
  it('reads every route the router declares, the retention period included', () => {
    const named = ROUTES.map((r) => `${r.method} ${r.path.replace(/[0-9a-f-]{36}/, ':id')}`);
    expect(named).toEqual(
      expect.arrayContaining([
        'GET /api/vault/legal-holds',
        'POST /api/vault/legal-holds',
        'POST /api/vault/legal-holds/:id/lift',
        'GET /api/vault/legal-holds/retention',
        'PUT /api/vault/legal-holds/retention',
      ]),
    );
  });

  it.each(ROUTES.map((r) => [`${r.method} ${r.path}`, r] as const))('%s reaches its route, not 403 LAUNCH_SCOPE', async (_n, route) => {
    const out = await send(route);
    expect({ status: out.status, refusal: out.body }, `${route.method} ${route.path} was refused`).toEqual({ status: 0, refusal: null });
    expect(out.reached).toBe(true);
  });

  it('attributes the retention period to Setup, which calls it, and the rest of the family to the Vault', () => {
    const map = buildPrefixMap();
    const owners = (p: string) => [...(modulesForPath(p, map) ?? [])];
    expect(owners('/api/vault/legal-holds/retention')).toEqual(['setup']);
    for (const r of ROUTES.filter((x) => !x.path.endsWith('/retention'))) {
      expect(owners(r.path), r.path).toEqual(['vault']);
    }
    for (const r of ROUTES) expect(owners(r.path).some((id) => LAUNCH_SURFACE_IDS.has(id)), r.path).toBe(true);
  });
});
