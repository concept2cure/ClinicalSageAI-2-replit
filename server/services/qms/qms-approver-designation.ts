/**
 * Who approves a QMS controlled document: the organization's designated QMS
 * approvers (decision D-Q of docs/design/REVIEW_ROUTING_2026-10-23.md, §7.8;
 * NEW-4, §4; slice RR4).
 *
 * NEW-4 requires a QMS approver "who holds a quality designation" (21 CFR
 * 211.22(c), 21 CFR 820.40, ISO 13485 §4.2.4). The role model has no quality
 * role (shared/constants/org-roles.ts ASSIGNABLE_ORG_ROLES), and D-Q decided
 * not to add one: the designation is per organization, held as membership data
 * (organization_users.qms_approver_designated_at / _by,
 * migrations/20261029f_qms_approver_designation.sql), given and taken by an
 * administrator with a reason, each a governed, chained ledger pair
 * (recordGovernedAction: `qms-approver.designate` / `qms-approver.remove` on
 * `organization-member:<userId>`) on the same transaction.
 *
 *   - A designee already holds signing authority (checkSigningAuthority, the
 *     platform's one policy, read from the persisted membership). A member
 *     whose role later loses it stays designated but cannot be named: the route
 *     validator asks signing authority first (MEMBER_CANNOT_SIGN).
 *   - Until an organization designates anyone, members holding the `approver`
 *     org role stand in (D-Q: "until RR4 ships the designation, members with
 *     the existing approver org role count as designated"). Once one member is
 *     designated, the designation is the only source: the stand-in is per
 *     organization, not per member, so designating a first approver is the
 *     organization's cutover and is visible as such.
 *   - An administrator does not designate, or remove, themselves (the
 *     membership routes' own rule: SELF_ROLE_CHANGE), so the one who decides
 *     who approves quality records is never only themselves.
 *
 * This module is the one writer of the two columns. Every statement carries
 * the organization.
 *
 * @module server/services/qms/qms-approver-designation
 */
import { recordGovernedAction } from '../../routes/c2c/actions';
import { checkSigningAuthority } from '../part11/signing-authority-gate';
import { holdsQmsApproval, type QmsApproverPolicy } from '../../../shared/qms/qms-approver-policy';

export { holdsQmsApproval, QMS_APPROVER_STAND_IN_ROLE, type QmsApproverPolicy } from '../../../shared/qms/qms-approver-policy';

export interface DesignationQueryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class QmsApproverDesignationRefusal extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message);
    this.name = 'QmsApproverDesignationRefusal';
  }
}

export async function readQmsApproverPolicy(q: DesignationQueryable, organizationId: number): Promise<QmsApproverPolicy> {
  const { rows } = await q.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 AND qms_approver_designated_at IS NOT NULL`,
    [organizationId],
  );
  const designated = new Set<number>(rows.map((r) => Number(r.user_id)));
  return { standIn: designated.size === 0, designated };
}

/** Whether this member may approve a QMS controlled document in this organization now. Throws on a read failure. */
export async function isQmsDesignatedApprover(q: DesignationQueryable, organizationId: number, userId: number): Promise<boolean> {
  const policy = await readQmsApproverPolicy(q, organizationId);
  if (!policy.standIn) return policy.designated.has(userId);
  const { rows } = await q.query(`SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2`, [organizationId, userId]);
  return holdsQmsApproval(policy, userId, rows[0]?.role);
}

/** The sentence a member who is not a QMS approver is refused with, in the policy's terms. */
export function notQmsApproverMessage(printedName: string, policy: QmsApproverPolicy): string {
  return policy.standIn
    ? `${printedName} is not a QMS approver: until an administrator designates QMS approvers, members with the Approver role approve controlled documents.`
    : `${printedName} is not designated as a QMS approver in this organization. An administrator designates QMS approvers in Admin and access.`;
}

interface DesignationChange {
  organizationId: number;
  /** The administrator. */
  actorId: number;
  userId: number;
  reason: string;
}

async function lockMembership(client: DesignationQueryable, p: DesignationChange) {
  const { rows } = await client.query(
    `SELECT ou.role, ou.qms_approver_designated_at, u.name, u.email
       FROM organization_users ou JOIN users u ON u.id = ou.user_id
      WHERE ou.organization_id = $1 AND ou.user_id = $2
      FOR UPDATE OF ou`,
    [p.organizationId, p.userId],
  );
  if (!rows[0]) throw new QmsApproverDesignationRefusal(404, 'MEMBER_NOT_FOUND', 'That person is not a member of this organization. Nothing was changed.');
  const r = rows[0];
  return { role: String(r.role ?? ''), designated: r.qms_approver_designated_at != null, name: String(r.name || (r.email ? String(r.email).split('@')[0] : `Account #${p.userId}`)) };
}

function refuseSelf(p: DesignationChange): void {
  if (p.actorId === p.userId) {
    throw new QmsApproverDesignationRefusal(400, 'SELF_DESIGNATION', 'Your own QMS approver designation is changed by another administrator. Nothing was changed.');
  }
}

/**
 * Designate a member as a QMS approver, on the caller's transaction. Refused,
 * with nothing written: the administrator's own row; someone who is not a
 * member; a member without signing authority; a member already designated.
 */
export async function designateQmsApprover(client: DesignationQueryable, p: DesignationChange): Promise<{ actionId: string; name: string }> {
  refuseSelf(p);
  const member = await lockMembership(client, p);
  if (member.designated) {
    throw new QmsApproverDesignationRefusal(409, 'ALREADY_DESIGNATED', `${member.name} is already a designated QMS approver. Nothing was changed.`);
  }
  const authority = await checkSigningAuthority(p.userId, p.organizationId, client);
  if (authority?.status === 503) throw new QmsApproverDesignationRefusal(503, authority.code, 'Signing authority could not be checked, so nothing was changed. Try again.');
  if (authority) {
    throw new QmsApproverDesignationRefusal(409, 'MEMBER_CANNOT_SIGN',
      `${member.name} does not hold signing authority (role ${member.role}), so cannot be a QMS approver. Give them a signing role first. Nothing was changed.`);
  }
  const policy = await readQmsApproverPolicy(client, p.organizationId);
  await client.query(
    `UPDATE organization_users SET qms_approver_designated_at = now(), qms_approver_designated_by = $3, updated_at = now()
      WHERE organization_id = $1 AND user_id = $2`,
    [p.organizationId, p.userId, p.actorId],
  );
  const gov = await recordGovernedAction(client, {
    orgId: p.organizationId, userId: p.actorId, command: 'qms-approver.designate', target: `organization-member:${p.userId}`,
    reason: p.reason,
    payload: { userId: p.userId, printedName: member.name, role: member.role, endsStandIn: policy.standIn },
    domain: 'qms', surface: 'admin',
  });
  return { actionId: gov.actionId, name: member.name };
}

/** Remove a member's QMS approver designation, on the caller's transaction. Refused when they are not designated, or are the administrator. */
export async function removeQmsApproverDesignation(client: DesignationQueryable, p: DesignationChange): Promise<{ actionId: string; name: string }> {
  refuseSelf(p);
  const member = await lockMembership(client, p);
  if (!member.designated) {
    throw new QmsApproverDesignationRefusal(409, 'NOT_DESIGNATED', `${member.name} is not a designated QMS approver. Nothing was changed.`);
  }
  await client.query(
    `UPDATE organization_users SET qms_approver_designated_at = NULL, qms_approver_designated_by = NULL, updated_at = now()
      WHERE organization_id = $1 AND user_id = $2`,
    [p.organizationId, p.userId],
  );
  const after = await readQmsApproverPolicy(client, p.organizationId);
  const gov = await recordGovernedAction(client, {
    orgId: p.organizationId, userId: p.actorId, command: 'qms-approver.remove', target: `organization-member:${p.userId}`,
    reason: p.reason,
    payload: { userId: p.userId, printedName: member.name, role: member.role, restoresStandIn: after.standIn },
    domain: 'qms', surface: 'admin',
  });
  return { actionId: gov.actionId, name: member.name };
}
