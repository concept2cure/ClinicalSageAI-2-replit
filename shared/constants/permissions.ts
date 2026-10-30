import { withExtendingRoles } from './org-roles';

/**
 * The one permission the session derives from the organisation role.
 *
 * `requireEditorAccess` refuses a governed write to any role outside
 * GOVERNED_WRITE_ROLES (server/middleware/orgMembership.ts). The session told
 * the client nothing it could act on: a viewer and a member both arrived as
 * `roles: ['user']`, and `permissions` was `[]` for everyone. So the task board
 * offered a viewer "New task", move, archive and sign, and the server refused
 * each one after the click (T2, docs/evidence/reviews/2026-09-22). The server
 * now derives this permission from the same set; the client mirrors no role
 * list.
 */
export const GOVERNED_WRITE_PERMISSION = 'governed:write';

/**
 * Whether to offer a governed write control to `user`.
 *
 * A user object with no `permissions` array (a session stored before the field
 * was populated) is unknown, and the control is offered: the server still
 * refuses a viewer, and hiding a writer's controls on a guess would be the
 * worse failure. A permissions array is authoritative.
 */
export function canGovernedWrite(user: { permissions?: unknown } | null | undefined): boolean {
  const perms = user?.permissions;
  return !Array.isArray(perms) || perms.includes(GOVERNED_WRITE_PERMISSION);
}

/**
 * The organisation roles that may finalize (sign and seal) a report: the
 * `requireRole` on POST /api/report-os/runs/:id/finalize (review round 1,
 * DP-47). The server's guard reads this list, and the session derives
 * REPORT_FINALIZE_PERMISSION from it, so the canvas offers Finalize to exactly
 * the roles the server admits (reporting review 2026-10-01). A member writes
 * reports and cannot finalize them; `roles: ['user']` could not tell the two
 * apart.
 */
export const REPORT_FINALIZE_ROLES: readonly string[] = withExtendingRoles(['owner', 'admin', 'manager']);
export const REPORT_FINALIZE_PERMISSION = 'report:finalize';

/** Whether to offer Finalize to `user`. Unknown permissions offer it, as canGovernedWrite does; the server decides. */
export function canFinalizeReport(user: { permissions?: unknown } | null | undefined): boolean {
  const perms = user?.permissions;
  return !Array.isArray(perms) || perms.includes(REPORT_FINALIZE_PERMISSION);
}

/**
 * The organisation roles that may pull a signed audit-trail attestation: the
 * `isAdmin` gate on GET /api/tenant-export/attestation
 * (server/routes/tenant-export.ts), which admits admin and owner and nothing
 * else.
 *
 * ── THE DEFECT THIS CLOSES (coverage review C-24) ───────────────────────────
 * The Compliance Reports surface offered "Run attestation" on `canRun`, which
 * the catalog derives from `canReadAuditTrail` — owner, admin, manager,
 * approver, or a platform admin. So a MANAGER was offered a control the route
 * then refused with 403 "Admin role required for attestation". A doomed click,
 * and the third instance of the same shape: the task board offered a viewer
 * "New task" (GOVERNED_WRITE_PERMISSION), and the canvas offered Finalize to a
 * member (REPORT_FINALIZE_PERMISSION).
 *
 * Reading the audit trail and ATTESTING to it are different acts and the server
 * always treated them so — an attestation is an HMAC-signed statement about the
 * chain, recorded as its own audit event. The client may not mirror either role
 * list; the server derives the permission and the client reads it.
 */
export const AUDIT_ATTEST_ROLES: readonly string[] = withExtendingRoles(['owner', 'admin']);
export const AUDIT_ATTEST_PERMISSION = 'audit:attest';

/** Whether to offer the attestation to `user`. Unknown permissions offer it, as the two above do; the server decides. */
export function canAttestAuditTrail(user: { permissions?: unknown } | null | undefined): boolean {
  const perms = user?.permissions;
  return !Array.isArray(perms) || perms.includes(AUDIT_ATTEST_PERMISSION);
}

/**
 * The organisation roles that administer billing: the `requireRole` on the
 * invoice read (GET /api/billing/invoices) and on the seat, weekly-limit and
 * credit auto-reload writes (PUT /api/billing/seats, /weekly-limits/:metric,
 * /credits/auto-reload), all in server/routes/billing-dashboard.ts.
 *
 * The invoice read used to answer any authenticated member, and the account
 * menu offered every member a Billing entry, while the writes beside it were
 * already admin and owner (D2, fold billing into Licensing, 2026-10-29). The
 * guards read this list and the session derives BILLING_ADMIN_PERMISSION from
 * it, so Licensing shows the invoice list, and the menu its Billing entry, to
 * exactly the roles the server admits. The client mirrors no role list.
 */
export const BILLING_ADMIN_ROLES: readonly string[] = withExtendingRoles(['owner', 'admin']);
export const BILLING_ADMIN_PERMISSION = 'billing:admin';

/** Whether to offer billing administration to `user`. Unknown permissions offer it, as the three above do; the server decides. */
export function canAdministerBilling(user: { permissions?: unknown } | null | undefined): boolean {
  const perms = user?.permissions;
  return !Array.isArray(perms) || perms.includes(BILLING_ADMIN_PERMISSION);
}
