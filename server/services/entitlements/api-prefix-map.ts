/**
 * The pure half of the entitlement gate: which API prefixes belong to which
 * surfaces. Moved out of server/middleware/moduleEntitlementGate.ts on
 * 2026-09-25 so the launch-scope API verdict (launch-scope-api.ts) and its CI
 * gate can use the same map and matcher without loading the gate's database
 * dependencies. The gate re-exports all three, so its importers are unchanged.
 */
import { UI_SURFACES } from '../../../shared/constants/ui-surface-registry';

/**
 * Prefixes that must NEVER be gated, whatever the registry says.
 *
 * Each of these is either how a customer discovers they are locked, how they
 * unlock themselves, or a compliance control that may not be switched off.
 * Gating any of them produces a trap: a locked organization that cannot see
 * why it is locked or do anything about it.
 *
 * `/api/module-subscriptions` is the sharpest case — it serves the very
 * endpoint the nav rail reads to learn what is locked. Gate it and the rail
 * gets no verdict, renders no locks (rule 1 in navEntitlements.tsx), and the
 * customer sees a full menu where every entry 403s.
 */
export const NEVER_GATED: readonly string[] = [
  '/api/module-subscriptions', // how the client learns what it is entitled to
  '/api/licensing', // plans, entitlement summary, EULA acceptance
  '/api/billing', // how they upgrade
  '/api/auth', // sign-in must never depend on packaging
  '/api/admin', // admin + master admin, incl. the licensing console itself
  '/api/audit', // 21 CFR §11.10(e) — not licensable, never switchable
  '/api/part11', // the compliance record itself
  '/api/health', // liveness
  '/api/tenant', // tenant context resolution
  '/api/users', // identity
  '/api/notifications',
];

/**
 * PURE: build the prefix → module-set map from the surface registry.
 *
 * Exported for its own test. The multi-module value is the whole point: see
 * the header on why a prefix maps to a SET and not a single module.
 */
export function buildPrefixMap(
  surfaces: ReadonlyArray<{ id: string; apiPrefixes?: readonly string[] | null }> = UI_SURFACES,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const s of surfaces) {
    for (const prefix of s.apiPrefixes ?? []) {
      if (typeof prefix !== 'string' || !prefix.startsWith('/api/')) continue;
      if (NEVER_GATED.some((n) => prefix === n || prefix.startsWith(`${n}/`))) continue;
      const set = map.get(prefix) ?? new Set<string>();
      set.add(s.id);
      map.set(prefix, set);
    }
  }
  return map;
}

/**
 * PURE: the modules that could authorize this path, or null when the path is
 * not gated at all.
 *
 * Longest-prefix wins, so a more specific registration is not shadowed by a
 * broader one. A path matches a prefix only at a segment boundary — `/api/risk`
 * must not gate `/api/risk-assessment-unrelated`.
 */
export function modulesForPath(
  pathname: string,
  prefixMap: Map<string, Set<string>>,
): Set<string> | null {
  let best: { len: number; modules: Set<string> } | null = null;
  for (const [prefix, modules] of prefixMap) {
    const atBoundary =
      pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`);
    if (!atBoundary) continue;
    if (!best || prefix.length > best.len) best = { len: prefix.length, modules };
  }
  return best ? best.modules : null;
}
