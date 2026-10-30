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

/** The signing transaction's actual executor, never a request/body role. */
export interface SignerRoleExec {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Resolve the signer's organization role (lowercased) from the membership
 * record, or null when the user is not a member of the organization. Pass the
 * result to `isSigningAuthorized`.
 */
export async function resolveSignerOrgRole(
  userId: number,
  organizationId: number,
  executor?: SignerRoleExec,
  /** The organisation statuses a signer may sign from: active, unless the act is the custody act (part11/custody-signature.ts). */
  opts: { organizationStatuses?: readonly string[] } = {},
): Promise<string | null> {
  if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(organizationId) || organizationId <= 0) {
    return null;
  }
  if (executor) {
    // The caller owns BEGIN/tenant context and reserves its domain parent first.
    // FOR SHARE holds membership role and active user/org rows until that
    // transaction commits or rolls back. No independent sharing policy is claimed.
    const { rows } = await executor.query(
      `SELECT ou.role FROM organization_users ou
         JOIN users u ON u.id=ou.user_id JOIN organizations o ON o.id=ou.organization_id
        WHERE ou.user_id=$1 AND ou.organization_id=$2 AND u.status=$3 AND o.status = ANY($4::text[])
        FOR SHARE OF ou,u,o`,
      [userId, organizationId, 'active', [...(opts.organizationStatuses ?? ['active'])]],
    );
    if (rows.length !== 1 || typeof rows[0].role !== 'string') return null;
    const role = rows[0].role.trim().toLowerCase();
    return role || null;
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
