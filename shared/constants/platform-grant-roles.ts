/** Roles in the platform access-grant store, distinct from tenant membership. */
export const PLATFORM_GRANT_ROLES = ['super_admin', 'platform_admin', 'support', 'business_admin', 'owner'] as const;
export type PlatformGrantRole = (typeof PLATFORM_GRANT_ROLES)[number];
export const FINANCE_GRANT_ROLES: readonly PlatformGrantRole[] = ['owner', 'business_admin', 'super_admin'];
export const PLATFORM_GRANT_LABELS: Record<PlatformGrantRole, string> = {
  super_admin: 'Super admin · platform and finance', platform_admin: 'Platform admin',
  support: 'Support', business_admin: 'Business admin · finance', owner: 'Platform owner · finance',
};
