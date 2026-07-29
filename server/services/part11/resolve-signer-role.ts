/**
 * Authoritative signer org-role lookup for the 21 CFR Part 11 §11.10(g)
 * signing-authority gate.
 *
 * The signer's role is read from `organization_users` keyed by (userId, orgId)
 * — the SAME source `requireTenantContext` trusts — not from `req.user.role`
 * (which is not reliably populated on every signing route) and NEVER from the
 * request body (which a caller controls). This keeps the authority decision
 * grounded in the persisted membership record, so a gate applied on any signing
 * path resolves the same authoritative role.
 *
 * @module server/services/part11/resolve-signer-role
 * @compliance 21 CFR Part 11 §11.10(g)
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { organizationUsers } from '../../../shared/schema';

/**
 * Resolve the signer's organization role (lowercased) from the membership
 * record, or null when the user is not a member of the organization. Pass the
 * result to `isSigningAuthorized`.
 */
export async function resolveSignerOrgRole(
  userId: number,
  organizationId: number,
): Promise<string | null> {
  if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(organizationId) || organizationId <= 0) {
    return null;
  }
  const rows = await db
    .select({ role: organizationUsers.role })
    .from(organizationUsers)
    .where(
      and(
        eq(organizationUsers.userId, userId),
        eq(organizationUsers.organizationId, organizationId),
      ),
    )
    .limit(1);
  const role = rows[0]?.role;
  return role ? String(role).trim().toLowerCase() : null;
}
