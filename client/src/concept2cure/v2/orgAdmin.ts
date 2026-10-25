/**
 * Does this viewer hold an organization-administrator role?
 *
 * One implementation (moved from Shell.tsx when Home's setup checklist became a
 * third reader, CLIENT_JOURNEY pass 5), because several entry points consume it. It began inline
 * in `Rail` — the account menu offers Admin and Access requests only to admins — and
 * ⌘K needs the same answer: both open {@link NavUnlockPanel} for a locked
 * destination, and that panel's copy branches on it (an admin is offered the
 * Plan & features or workspace setup; a member is told to ask an administrator).
 * A second copy of this role list would let one customer get two different next
 * steps for one lock depending on whether they came from the rail or the
 * palette, which is exactly the inconsistency the panel exists to prevent.
 *
 * `String(r)` rather than trusting the declared `string[]`: roles arrive from a
 * JWT claim, and a numeric or null entry there must not throw inside the shell.
 */
export function isOrgAdminRole(roles: readonly string[] | undefined): boolean {
  return (roles ?? []).some((r) =>
    ['admin', 'owner', 'super_admin', 'platform_admin', 'business_admin'].includes(String(r).toLowerCase()),
  );
}
