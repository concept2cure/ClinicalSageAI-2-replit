/**
 * The existing cross-organization invitation handoff: self-only discovery and
 * a consent record on the mutation's client. The route verifies ownership
 * before any inviting-organization scope is entered; no new granting policy.
 */
import type { Request } from 'express';
import { pool, transaction } from '../../db';
import { writeChainedAuditRow } from '../auditService';
import { clientIpOf } from '../../utils/client-ip';
import { inVerifiedOrgScope } from './verified-org-scope';

interface ConsentActor { userId: number; ipAddress?: string; userAgent?: string }
interface Consent {
  invitationId: number;
  organizationId: number;
  status: 'accepted' | 'declined';
  invitationRole: string;
  membershipCreated: boolean;
  persistedRole?: string;
}
interface ConsentClient { query: (sql: string, params?: unknown[]) => Promise<unknown> }

/** Audit and consent share one transaction; a refused row propagates. */
export async function recordInvitationConsent(client: ConsentClient, actor: ConsentActor, consent: Consent): Promise<void> {
  const newRole = consent.status === 'accepted' ? consent.persistedRole ?? null : null;
  await writeChainedAuditRow(client, {
    tenantId: consent.organizationId,
    userId: actor.userId,
    action: consent.status === 'accepted' ? 'organization_invitation_accepted' : 'organization_invitation_declined',
    resourceType: 'organization_invitations',
    resourceId: String(consent.invitationId),
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    details: {
      targetUserId: actor.userId,
      previousStatus: 'pending', newStatus: consent.status,
      invitationRole: consent.invitationRole,
      membershipCreated: consent.membershipCreated,
      previousRole: consent.membershipCreated ? null : newRole,
      newRole,
    },
  });
}

/** Names only organizations reached by the session caller's own pending invitation. */
export async function listOwnPendingInvitations(req: Request, callerId: number): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(
    `SELECT id, organization_id as "organizationId", email, role, status,
            invited_by_id as "invitedById", created_at as "createdAt"
       FROM public.invitations_for_member($1)
      WHERE status = 'pending' ORDER BY created_at DESC`,
    [callerId],
  );
  // The self-only lookup proves the cross-tenant read before entering that
  // invitation's scope. No request field chooses an organization here.
  return Promise.all(result.rows.map(async (invitation: Record<string, unknown>) => {
    const organizationId = Number(invitation.organizationId);
    if (!Number.isInteger(organizationId) || organizationId <= 0) throw new Error('Invalid invitation organization');
    const organizationName = await inVerifiedOrgScope(req, organizationId, 'member', async () => {
      const names = await pool.query('SELECT name FROM organizations WHERE id = $1', [organizationId]);
      const name = names.rows[0]?.name;
      return typeof name === 'string' && name.trim() ? name : null;
    });
    return { ...invitation, organizationName };
  }));
}

/** Called only after the route's self-only invitation lookup proves this target. */
export function declineOwnInvitation(req: Request, callerId: number, invitationId: number, organizationId: number): Promise<boolean> {
  return inVerifiedOrgScope(req, organizationId, 'member', () => transaction(async (client) => {
    const changed = await client.query(
      `UPDATE organization_invitations SET status = 'declined', responded_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND user_id = $3 AND status = 'pending'
        RETURNING role`,
      [invitationId, organizationId, callerId],
    );
    if (changed.rowCount !== 1) return false;
    await recordInvitationConsent(client, {
      userId: callerId, ipAddress: clientIpOf(req) ?? undefined, userAgent: req.get('user-agent'),
    }, { invitationId, organizationId, status: 'declined', invitationRole: changed.rows[0]?.role || 'member', membershipCreated: false });
    return true;
  }));
}
