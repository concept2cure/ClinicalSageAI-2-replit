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
