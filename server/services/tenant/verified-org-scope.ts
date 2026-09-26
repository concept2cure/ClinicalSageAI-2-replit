import { getTenantScope, runWithTenantScope } from '../../db/tenantStore';

/**
 * Run a membership write in the organization the caller was just verified to
 * administer (authorizeOrgAccess), when that is not the organization their
 * session is scoped to. organization_users is written only in the membership's
 * own organization or the platform scope (D3, 2026-09-26;
 * docs/evidence/D3/2026-09-26-memberships/), so an administrator of two
 * organizations acting on the one they are not signed into wrote nothing and
 * was told "User not found". The scope carries their verified role there.
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
