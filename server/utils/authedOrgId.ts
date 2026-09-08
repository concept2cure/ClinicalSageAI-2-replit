/**
 * Tenant-context helpers.
 *
 * Every tenant-scoped HTTP handler in this codebase must source the
 * organization id from the verified JWT, never from query strings,
 * request bodies, or arbitrary headers. The patterns that motivated
 * this module — `req.query.organizationId`, `req.body.organizationId`,
 * `Number(req.query.org_id)`, the `?? 1` fallback — were each
 * cross-tenant IDORs that let an authenticated user from one org act
 * as another by passing the target org's id in user-controlled input.
 *
 * Usage:
 *
 *   const orgId = authedOrgId(req);
 *   if (orgId == null) {
 *     return res.status(403).json({ error: 'Tenant context required' });
 *   }
 *   // ...use orgId as a `number`.
 *
 * Or the response-binding form:
 *
 *   const guard = requireAuthedOrgId(req, res);
 *   if (!guard.ok) return;       // 403 already sent
 *   const orgId = guard.orgId;
 *
 * Reads, in order:
 *   1. req.user.organizationId        (JWT payload, populated by auth)
 *   2. req.tenantContext.organizationId
 *   3. req.organizationId             (set by validateTenantContext)
 *
 * Returns null when none of those are present or aren't a finite number.
 * The router-level auth + tenant guards normally ensure they are set,
 * so a null return indicates either misconfigured middleware order or
 * a token issued without an org claim — both warrant 403.
 */

import type { Request, Response } from 'express';

export function authedOrgId(req: Request): number | null {
  const raw =
    (req as any).user?.organizationId ??
    (req as any).tenantContext?.organizationId ??
    (req as any).organizationId;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Narrow an untrusted organization id to a USABLE one, or null.
 *
 * `authedOrgId` accepts any finite number, which is right for its callers.
 * This is the stricter form, for code paths where a non-positive id is not an
 * inert default but an actual grant: `Number(null)` is `0` and
 * `Number.isFinite(0)` is true, and `organization_id = 0` is an explicit global
 * carve-out in the artifacts RLS policy
 * (db/migrations/20260128_concept2cure_foundation.sql:161). So an org that
 * arrives as 0 is a resolution failure wearing a valid-looking value, and a
 * predicate built from it widens rather than narrows.
 *
 * Deliberately additive: `authedOrgId` and `requireAuthedOrgId` keep their
 * existing behaviour, because callers depend on it.
 */
export function usableOrgId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

interface RequireOk {
  ok: true;
  orgId: number;
}
interface RequireFail {
  ok: false;
}

/**
 * Convenience wrapper that sends a 403 response when no org context is
 * present. Lets handlers compose:
 *
 *   const guard = requireAuthedOrgId(req, res);
 *   if (!guard.ok) return;
 *   // guard.orgId is a number
 */
export function requireAuthedOrgId(req: Request, res: Response): RequireOk | RequireFail {
  const orgId = authedOrgId(req);
  if (orgId == null) {
    res.status(403).json({ error: 'Tenant context required' });
    return { ok: false };
  }
  return { ok: true, orgId };
}
