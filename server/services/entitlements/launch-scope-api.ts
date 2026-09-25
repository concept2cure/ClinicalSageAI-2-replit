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
 *                      surface (shared/constants/launch-scope.ts);
 *   - `out-of-scope` — every surface claiming it is outside the launch scope;
 *   - `unmapped`     — no surface claims it.
 * Only `out-of-scope` is refused. `unmapped` passes, because refusing what the
 * registry does not name would refuse sign-in callbacks, webhooks and the
 * public API along with the product; closing the unmapped remainder takes an
 * inventory of mounted prefixes, recorded as the next step in the evidence.
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
import { modulesForPath } from './api-prefix-map.js';

export type LaunchScopeApiVerdict = 'never-gated' | 'launch' | 'out-of-scope' | 'unmapped';

export function launchScopeApiVerdict(
  pathname: string,
  prefixMap: Map<string, Set<string>>,
  neverGated: readonly string[],
  launchSurfaceIds: ReadonlySet<string> = LAUNCH_SURFACE_IDS,
): LaunchScopeApiVerdict {
  const path = pathname.split('?')[0];
  if (neverGated.some((n) => path === n || path.startsWith(`${n}/`))) return 'never-gated';
  const surfaces = modulesForPath(path, prefixMap);
  if (!surfaces || surfaces.size === 0) return 'unmapped';
  for (const id of surfaces) if (launchSurfaceIds.has(id)) return 'launch';
  return 'out-of-scope';
}
