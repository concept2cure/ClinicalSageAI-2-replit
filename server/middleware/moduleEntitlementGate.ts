/**
 * Module entitlement enforcement — the gate that makes licensing real.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 *
 * Everything in the entitlement stack was presentation. The rail greys a locked
 * destination, the Apps catalog shows an upgrade path, `requireModule()` has
 * existed in license-manager.ts since it was written — and it gates NO route.
 * db/migrations/20260810 said so plainly ("requireModule() gates no route
 * today") and it was still true. So an organization that is not licensed for
 * `pv-cockpit` types the URL, the surface renders, its API calls succeed, and
 * they use it. The lock was a suggestion.
 *
 * ── Why this is not just "mount requireModule everywhere" ────────────────────
 *
 * Two things make the naive version an outage.
 *
 * FIRST, API PREFIXES ARE SHARED. `shared/constants/ui-surface-registry.ts`
 * gives each surface its `apiPrefixes`, and the same prefix serves several
 * surfaces: `/api/projects` belongs to both `projects` and `project-home`;
 * `/api/document-authoring` to both `document-authoring` and
 * `regulatory-workspace`. Gating a prefix on ONE module would deny a customer
 * who holds entitlement through another. So the rule here is: a request to a
 * prefix is allowed when the organization is entitled to ANY module that
 * declares it. Denying requires being unentitled to all of them.
 *
 * SECOND, canAccessModule FAILS CLOSED. When `getLicenseInfo` cannot read the
 * organizations row it returns null and canAccessModule answers
 * `{ allowed: false, reason: 'Organization not found' }`. That is the right
 * default for a security boundary. This is not one — it is commercial packaging
 * — and a transient database error 403-ing every paying customer at once is a
 * far worse outcome than briefly serving a module somebody has not bought. So
 * an entitlement resolution that THROWS is allowed through and logged at error
 * level; only a clean, confident "not entitled" denies.
 *
 * ── Ships in report-only mode ────────────────────────────────────────────────
 *
 * MODULE_ENFORCEMENT: 'off' (default) | 'report' | 'enforce'.
 *
 * Turning hard enforcement on across a live product as the first act would be
 * reckless: nobody knows today which real, paying, working requests would start
 * failing, because nothing has ever measured it. `report` resolves the verdict
 * and logs every request it WOULD have denied — org, module set, path — and
 * serves it anyway. Run it, read the log, then flip to `enforce` knowing the
 * blast radius instead of discovering it from customers.
 *
 * This is deliberately the one place in the stack that is allowed to be
 * permissive, and it is permissive on purpose rather than by omission.
 *
 * @module server/middleware/moduleEntitlementGate
 */

import type { Request, Response, NextFunction } from 'express';
import { UI_SURFACES } from '../../shared/constants/ui-surface-registry';
import { canAccessModule } from '../services/license-manager.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('module-entitlement-gate');

export type EnforcementMode = 'off' | 'report' | 'enforce';

export function enforcementMode(): EnforcementMode {
  const raw = (process.env.MODULE_ENFORCEMENT ?? '').trim().toLowerCase();
  if (raw === 'enforce') return 'enforce';
  if (raw === 'report') return 'report';
  return 'off';
}

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

/**
 * Express middleware. Mount ONCE, high, after authentication.
 *
 * Skips silently when the mode is 'off', when the path is not gated, and when
 * there is no organization context (an unauthenticated request is somebody
 * else's 401 to issue, not this middleware's 403).
 */
export function moduleEntitlementGate(
  prefixMap: Map<string, Set<string>> = buildPrefixMap(),
) {
  return async function gate(req: Request, res: Response, next: NextFunction) {
    const mode = enforcementMode();
    if (mode === 'off') return next();

    const pathname = (req.path || req.originalUrl || '').split('?')[0];
    const modules = modulesForPath(pathname, prefixMap);
    if (!modules || modules.size === 0) return next();

    const orgId =
      (req as any).tenantContext?.organizationId ?? (req as any).user?.organizationId ?? null;
    if (orgId == null) return next();

    let entitled = false;
    let reasons: string[] = [];
    try {
      // Entitled to ANY module that claims this prefix is enough — see the
      // header. Sequential rather than Promise.all so a customer entitled via
      // the first module costs one query, which is the common case.
      for (const moduleId of modules) {
        const verdict = await canAccessModule(Number(orgId), moduleId);
        if (verdict.allowed) {
          entitled = true;
          break;
        }
        if (verdict.reason) reasons.push(`${moduleId}: ${verdict.reason}`);
      }
    } catch (err) {
      // Fail OPEN, loudly. A resolution failure is an infrastructure problem,
      // and taking every paying customer offline over one is worse than
      // briefly serving an unlicensed module. Never silent.
      logger.error('entitlement resolution failed — allowing request', {
        path: pathname,
        organizationId: orgId,
        modules: [...modules],
        err: err instanceof Error ? err.message : String(err),
      });
      return next();
    }

    if (entitled) return next();

    if (mode === 'report') {
      // The measurement this mode exists for: what enforcement WOULD cost.
      logger.warn('would deny (report mode)', {
        path: pathname,
        organizationId: orgId,
        modules: [...modules],
        reasons,
      });
      return next();
    }

    logger.warn('module access denied', {
      path: pathname,
      organizationId: orgId,
      modules: [...modules],
      reasons,
    });
    // Shape matches requireModule()'s existing 403 so a client that already
    // handles MODULE_NOT_LICENSED needs no second code path.
    return res.status(403).json({
      error: 'Module access denied',
      code: 'MODULE_NOT_LICENSED',
      module: [...modules][0],
      modules: [...modules],
      reason: reasons[0] ?? 'Not included in this plan',
    });
  };
}
