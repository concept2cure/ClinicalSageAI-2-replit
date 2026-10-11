/**
 * The organisation roles an administrator assigns, and the one rule that
 * relates the two signing roles to the rest (product decision P-18,
 * docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08).
 *
 * The signing policy names `admin`, `approver` and `reviewer`
 * (server/services/part11/signing-authority.ts, P1-44b): a manager's password
 * does not make a signature. Until P-18 neither signing role could be assigned,
 * so only an administrator could sign anything. They are assignable now, and:
 *
 *   approver — everything a manager may, and sign;
 *   reviewer — everything a member may, and sign.
 *
 * So every allow-list that admits `manager` admits `approver`, and every one
 * that admits `member` admits `reviewer`. That is said once, here, and each
 * list is built through `withExtendingRoles` (or a single role is read through
 * `rolesHeldBy`) instead of naming the signing roles by hand at forty sites.
 * The rule only ever widens a signing role: a manager or a member gains
 * nothing, and signing stays where the policy puts it.
 */

/** Each signing role, and the role whose permissions it carries. */
export const ROLE_EXTENDS: Readonly<Record<string, string>> = Object.freeze({
  approver: 'manager',
  reviewer: 'member',
});

/**
 * The roles an organization administrator assigns (POST and PATCH
 * /api/tenant-users, Admin and access). `organization_users.role` has no CHECK
 * constraint; this list is where the assignable vocabulary is decided.
 */
export const ASSIGNABLE_ORG_ROLES = ['admin', 'approver', 'manager', 'reviewer', 'member', 'viewer'] as const;
export type AssignableOrgRole = (typeof ASSIGNABLE_ORG_ROLES)[number];

/** `role`, lowercased, followed by the role it extends: approver → [approver, manager]. Empty for none. */
export function rolesHeldBy(role: string | null | undefined): string[] {
  const r = String(role ?? '').trim().toLowerCase();
  if (!r) return [];
  const base = ROLE_EXTENDS[r];
  return base ? [r, base] : [r];
}

/** An allow-list widened to every role that extends a role it admits, in its own order. */
export function withExtendingRoles(roles: readonly string[]): string[] {
  const out = [...roles];
  for (const [extending, base] of Object.entries(ROLE_EXTENDS)) {
    if (roles.includes(base) && !out.includes(extending)) out.push(extending);
  }
  return out;
}
