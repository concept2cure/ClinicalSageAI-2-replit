# WO-11 — Tenant settings mutations enforce no role check

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** external pilot on real customer data
**Found by:** the WO-0 lint cleanup, from an unused import

---

## What the code actually says

`server/routes/tenant-config.ts` carries this docblock:

```
/**
 * Update tenant settings
 * Only organization admins and super admins can update settings
 */
```

The route under it, and the two after it, are guarded like this:

| Route | Chain |
|---|---|
| `PATCH /:tenantId/settings` | `authMiddleware`, `requireOrganizationContext` |
| `POST /:tenantId/settings/reset` | `authMiddleware`, `requireOrganizationContext` |
| `PATCH /:tenantId/settings/:section` | `authMiddleware`, `requireOrganizationContext` |

`requireOrganizationContext` (`server/middleware/tenantContext.ts`) performs **no
role check** — grep for `role|admin|permission|isAdmin|requireRole` across it
returns nothing. `requireAdminRole` exists (`server/auth.ts:251`) and is not
applied on any of the three.

**So any authenticated member of an organization can change that organization's
tenant settings, including a full reset.** The comment claims a control the code
does not implement.

## How it was found

`tenant-config.ts` imported `requireAdminRole` and never used it. The import was
removed on 2026-09-10 while paying down the eslint ratchet for WO-0 — an unused
import in a route file is usually dead weight, but here it was the fossil of a
guard someone meant to wire and did not. A sweep of every authorization-shaped
symbol removed in that cleanup found this was the only one, so the pattern
appears isolated to this file.

## Why it blocks the real-data pilot

This is not cross-tenant — `requireOrganizationContext` does scope the caller to
their own organization, so member-of-org-A cannot edit org-B's settings. It is a
**privilege escalation within a tenant**: on a pilot where a sponsor invites
read-only collaborators, reviewers, or a CRO, any of them can silently reset the
organization's configuration. For a customer evaluating whether their governance
model survives contact with the product, that is the wrong first discovery.

## Scope

1. Decide the intended authority for each of the three routes. They may not be
   the same — a section-level PATCH is a different act from a full reset.
2. Apply `requireAdminRole` (or the correct role guard) to each.
3. **Check role provisioning first.** Turning the guard on will 403 anyone whose
   role was never set. Establish what roles existing organizations actually
   carry before enabling it, or the fix reads as an outage.
4. Add a test asserting a non-admin member is refused on all three.
5. Consider a gate: a route file that imports a role guard and never applies it
   is a detectable shape, and this repo already has the machinery for exactly
   this class of check (`ci:action-overclaim`, `ci:fabricated-identity`).

## Exit criteria

```bash
npm run test:security          # non-admin member refused on all three routes
grep -n "requireAdminRole" server/routes/tenant-config.ts   # imported AND applied
```

Prove it fails: authenticate as a non-admin member of the organization, PATCH
`/:tenantId/settings`, confirm 403. Before the fix that request succeeds — run it
first so the change is demonstrated, not assumed.

## Blast radius

Medium. Three routes, but the failure mode of the fix is locking out legitimate
users, which is why step 3 comes before step 2.

## Estimate

2–3 days, most of it establishing what roles are actually provisioned.
