/**
 * Launch scope at the API — the one decision about whether a request path
 * belongs to what ships.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `docs/LAUNCH_DEFINITION_OF_DONE.md` row D2: every surface outside the launch
 * catalog is behind a flag that is off in production. Until 2026-09-25 that
 * flag (`LAUNCH_SCOPE_ENFORCE`, services/entitlements/launch-scope.ts) was read
 * by navigation only — the rail, the Apps catalog and a deep link. The one
 * API-level check, middleware/moduleEntitlementGate.ts, never read it, and
 * defaults to `MODULE_ENFORCEMENT=off`. So in production a signed-in
 * organisation could call every write route of every surface the product had
 * hidden from it. The 2026-09-24 audit-outcome measurement
 * (docs/evidence/D5-AUDIT-OUTCOMES/2026-09-24/) found 118 audited write sites in
 * that position.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * A path is attributed to surfaces through `UI_SURFACES[].apiPrefixes`
 * (longest prefix wins, at a segment boundary — the same map and matcher the
 * entitlement gate uses). It is:
 *   - `never-gated`  — sign-in, billing, audit, admin and the other paths the
 *                      entitlement gate never gates (`NEVER_GATED`);
 *   - `launch`       — at least one surface claiming it is a launch or shell
 *                      surface (shared/constants/launch-scope.ts), or it is on
 *                      the platform list below (`LAUNCH_PLATFORM_API`);
 *   - `infrastructure` — a non-screen caller: `LAUNCH_INFRASTRUCTURE_API`, or a
 *                      path the auth boundary serves unauthenticated
 *                      (`PUBLIC_API_ALLOWLIST`, middleware/public-api-allowlist.ts);
 *   - `out-of-scope` — every surface claiming it is outside the launch scope;
 *   - `unmapped`     — nothing claims it.
 * `out-of-scope` is refused. `unmapped` is refused too in production
 * (LAUNCH_SCOPE_API_UNATTRIBUTED, unset = enforce there; the gate decides — see
 * its header). That default rests on a measurement: every route production
 * mounts was listed from the running registration and classified
 * (docs/evidence/D2-API-SCOPE/2026-09-25/, Stage 3). The callers no screen's
 * code shows were the public paths and the `/api/user` alias, both attributed
 * here; nothing a launch screen, a credentialed server self-call, a seed or an
 * external system calls is left unmapped.
 *
 * The rule is only as true as the registry. `scripts/ci/check-launch-scope-api.ts`
 * holds the registry to it: every API path a launch or shell surface's client
 * code names must not be `out-of-scope`, or a launch screen would be refused in
 * production.
 *
 * PURE. No I/O, no environment reads; the middleware decides whether scope is
 * enforced.
 */

import { LAUNCH_SURFACE_IDS } from '../../../shared/constants/launch-scope';
import { isPublicApiPath } from '../../middleware/public-api-allowlist';
import { modulesForPath } from './api-prefix-map.js';

export type LaunchScopeApiVerdict = 'never-gated' | 'infrastructure' | 'launch' | 'out-of-scope' | 'unmapped';

/**
 * API prefixes the shell uses whatever app is open, and which therefore belong
 * to no one surface. Each carries the reason it is here so the list cannot grow
 * by convenience; the same rule as LAUNCH_SHELL_SURFACES.
 */
export const LAUNCH_PLATFORM_API: Readonly<Record<string, string>> = {
  '/api/ana-ri': 'AnA: the stream, governed actions, agent activity and live-drive state, from every host',
  '/api/v1/auth': 'the session the shell reads on load',
  '/api/tenants': 'tenant context (TenantContext.tsx) on load',
  '/api/clients': 'the client workspace list tenant context reads on load',
  '/api/organizations': "the shell's organisation read (V2App.tsx), Setup's profile and settings, onboarding",
  '/api/user': 'identity: the users router mounted a second time (register-platform-routes.ts), beside /api/users, which NEVER_GATED already passes',
};

/**
 * API prefixes called by something other than a screen: a partner's system, a
 * webhook, an operator's tooling. Never refused by launch scope, in any mode,
 * because nothing in the product's UI would notice their loss until an
 * integration failed in production. Each carries its caller.
 */
export const LAUNCH_INFRASTRUCTURE_API: Readonly<Record<string, string>> = {
  '/api/v1': 'the public X-API-Key API (routes/public-api) and its session route',
  '/api/firecrawl-webhooks': "Firecrawl's crawl-completion webhook",
  '/api/_ops': 'operator tooling, authenticated separately',
};

function onPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function launchScopeApiVerdict(
  pathname: string,
  prefixMap: Map<string, Set<string>>,
  neverGated: readonly string[],
  launchSurfaceIds: ReadonlySet<string> = LAUNCH_SURFACE_IDS,
): LaunchScopeApiVerdict {
  const path = pathname.split('?')[0];
  if (neverGated.some((n) => onPrefix(path, n))) return 'never-gated';
  if (Object.keys(LAUNCH_INFRASTRUCTURE_API).some((p) => onPrefix(path, p))) return 'infrastructure';
  if (isPublicApiPath(path)) return 'infrastructure';
  if (Object.keys(LAUNCH_PLATFORM_API).some((p) => onPrefix(path, p))) return 'launch';
  const surfaces = modulesForPath(path, prefixMap);
  if (!surfaces || surfaces.size === 0) return 'unmapped';
  for (const id of surfaces) if (launchSurfaceIds.has(id)) return 'launch';
  return 'out-of-scope';
}
