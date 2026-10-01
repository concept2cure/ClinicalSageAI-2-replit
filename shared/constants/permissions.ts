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
