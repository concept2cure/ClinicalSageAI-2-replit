import { getTenantScope, runWithTenantScope } from '../../db/tenantStore';

/**
 * Run a membership write in the organization the caller was just verified to
 * administer (authorizeOrgAccess), when that is not the organization their
 * session is scoped to. organization_users is written only in the membership's
 * own organization or the platform scope (D3, 2026-09-26;
 * docs/evidence/D3/2026-09-26-memberships/), so an administrator of two
 * organizations acting on the one they are not signed into wrote nothing and
 * was told "User not found". The scope carries their verified role there.
 *
 * Also used for an invitee answering an invitation to another organization:
 * once the invitation is confirmed as theirs (invitations_for_member, D3
 * 2026-09-28; docs/evidence/D3/2026-09-28-invitation-acceptance/), the accept
 * or decline is written in the inviting organization's scope, as `member`.
 */
export function inVerifiedOrgScope<T>(
  req: { method?: string; baseUrl?: string; path?: string },
  organizationId: number,
  verifiedRole: string,
  write: () => Promise<T>
): Promise<T> {
  if (Number(getTenantScope()?.tenantId) === organizationId) return write();
  return runWithTenantScope(
    {
      tenantId: String(organizationId),
      role: verifiedRole,
      source: 'request',
      caller: `tenant-users:${req.method} ${req.baseUrl ?? ''}${req.path ?? ''}`,
    },
    write
  );
}
