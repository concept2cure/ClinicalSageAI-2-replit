/**
 * A member's role change and removal, each with its audit record (P1-41,
 * DP-49).
 *
 * An administrator's change to who holds access, and with what role, is the
 * change an access review (POLICY-AC-002 §4a; 21 CFR 11.10(d)/(e)) has to be
 * able to read back. Neither wrote an audit row: the administrative changes
 * report said so ("not recorded") and the access review could not show a
 * removal at all.
 *
 * Each function here runs on the CALLER'S transaction client
 * (server/db/runtime.ts `transaction`, inside the verified organisation's
 * scope): the change, then one sha256-chained row on the organisation's own
 * chain via writeChainedAuditRow. A refused audit row throws, and the caller's
 * transaction rolls the change back — a change with no record of it does not
 * happen. The stated reason is written to the reason column and carried in
 * `details` too, so the chain protects it.
 *
 * The action names are the ones the administrative changes report reads
 * (services/audit/compliance-reports/queries/administrative-changes.ts).
 */
import { z } from 'zod';
import { writeChainedAuditRow } from '../auditService';

/** The administrator's stated reason: required, non-empty once trimmed. */
export const memberChangeReason = z.string().trim().min(1).max(500);

export const MEMBER_ROLE_CHANGED = 'member_role_changed';
export const MEMBER_REMOVED = 'member_removed';

export interface MembershipTxClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Who made the change, from where. */
export interface MembershipActor {
  userId: number | null;
  ipAddress: string | null;
  userAgent?: string;
}

interface MembershipChange {
  organizationId: number;
  userId: number;
  reason: string;
}

async function recordMembershipChange(
  client: MembershipTxClient,
  actor: MembershipActor,
  change: MembershipChange & { action: string; previousRole: string; newRole: string | null }
): Promise<void> {
  await writeChainedAuditRow(client, {
    tenantId: change.organizationId,
    userId: actor.userId ?? undefined,
    action: change.action,
    resourceType: 'organization_users',
    resourceId: String(change.userId),
    reason: change.reason,
    ipAddress: actor.ipAddress ?? undefined,
    userAgent: actor.userAgent,
    details: {
      targetUserId: change.userId,
      previousRole: change.previousRole,
      newRole: change.newRole,
      reason: change.reason,
    },
  });
}

/**
 * The member's role before (locked), the change, and its audit row. An
 * unchanged role writes nothing and records nothing: there is no change.
 *
 * `onlyFrom` makes the change conditional on the role held: a SCIM group
 * removal (routes/scim.ts PATCH /Groups/:id) sets 'member' only for a member
 * who holds that group's role (P1-49). Any other role is left, unrecorded.
 */
export async function changeMemberRole(
  client: MembershipTxClient,
  actor: MembershipActor,
  change: MembershipChange & { role: string; onlyFrom?: string }
): Promise<'changed' | 'unchanged' | 'not_found'> {
  const current = await client.query(
    'SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2 FOR UPDATE',
    [change.organizationId, change.userId]
  );
  const previousRole = current.rows[0]?.role;
  if (typeof previousRole !== 'string') return 'not_found';
  if (change.onlyFrom !== undefined && previousRole !== change.onlyFrom) return 'unchanged';
  if (previousRole === change.role) return 'unchanged';
  await client.query(
    'UPDATE organization_users SET role = $1, updated_at = NOW() WHERE organization_id = $2 AND user_id = $3',
    [change.role, change.organizationId, change.userId]
  );
  await recordMembershipChange(client, actor, {
    ...change,
    action: MEMBER_ROLE_CHANGED,
    previousRole,
    newRole: change.role,
  });
  return 'changed';
}

/** The removal and its audit row, which records the role the member held. False when not a member. */
export async function removeMember(
  client: MembershipTxClient,
  actor: MembershipActor,
  change: MembershipChange
): Promise<boolean> {
  const removed = await client.query(
    'DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2 RETURNING role',
    [change.organizationId, change.userId]
  );
  if (removed.rows.length === 0) return false;
  await recordMembershipChange(client, actor, {
    ...change,
    action: MEMBER_REMOVED,
    previousRole: String(removed.rows[0].role),
    newRole: null,
  });
  return true;
}
