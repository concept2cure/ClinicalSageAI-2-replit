/**
 * Platform staff acting on ANOTHER organization run in the system scope.
 *
 * Some organization routes let platform staff name any organization in the
 * URL (organizations-routes.ts PATCH /:id/profile and /:id/settings,
 * tenant-config.ts's super_admin branches). Their request scope is still the
 * staff member's OWN organization, opened by the auth gate from the verified
 * session. So a write to the named organization ran as the wrong tenant: under
 * public.organizations' own-org write policy it wrote nothing, and the
 * settings route answered success regardless (D3, 2026-09-26;
 * docs/evidence/D3/2026-09-26-organizations-writes/).
 *
 * The cross-organization consoles already solve this by path:
 * `/api/admin/master` and `/api/tenants` are in SYSTEM_SCOPE_PREFIXES. These
 * routes cannot be, because an organization's own administrators use them for
 * their own organization, and must stay in their tenant scope. So this opens
 * the system scope per request, only when both hold:
 *
 *   - the router's own staff test passes (the router keeps its rule; this does
 *     not widen who counts as staff), and
 *   - the organization named in the URL is not the one the request is scoped
 *     to.
 *
 * Its staff test must be exactly the route's own rule for acting on another
 * organization, and it must run after authentication, so it never opens the
 * system scope for a caller the route would refuse. It reuses
 * establishRequestSystemScope, which nests the scope and replaces the
 * request's DB client, exactly as the system-prefixed consoles get it.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getTenantScope } from '../db/tenantStore.js';
import { establishRequestSystemScope } from './establishRequestTenantScope.js';

export function staffCrossOrgScope(opts: {
  /** The route parameter that names the target organization. */
  param: string;
  /** The router's own platform-staff test. */
  isStaff: (req: Request<Record<string, string>>) => boolean;
}): RequestHandler<Record<string, string>> {
  // Typed on string params: a default-typed handler in a route's chain widens
  // the route's inferred `req.params` to string | string[] for every handler.
  return (req: Request<Record<string, string>>, res: Response, next: NextFunction) => {
    if (!opts.isStaff(req)) return next();
    const target = Number(req.params[opts.param]);
    const scoped = Number(getTenantScope()?.tenantId);
    if (!Number.isInteger(target) || target === scoped) return next();
    establishRequestSystemScope(req, res, next);
  };
}
