/**
 * Who counts as a QMS approver, as a pure rule (decision D-Q of
 * docs/design/REVIEW_ROUTING_2026-10-23.md, §7.8; RR4). The designation itself
 * is read and written by server/services/qms/qms-approver-designation.ts; this
 * is the rule both the server and the Admin surface apply to what was read.
 *
 * While an organization has designated nobody, members holding the `approver`
 * org role stand in. Once anyone is designated, the designation is the only
 * source.
 */

/** The org role that stands in until an organization designates its first QMS approver. */
export const QMS_APPROVER_STAND_IN_ROLE = 'approver';

/** How an organization's QMS approvers are decided, read once. */
export interface QmsApproverPolicy {
  /** True while nobody is designated: members with the `approver` role stand in. */
  standIn: boolean;
  /** The designated members' ids (empty while the stand-in applies). */
  designated: ReadonlySet<number>;
}

/** Whether a member with this role counts as a QMS approver under the policy. */
export function holdsQmsApproval(policy: QmsApproverPolicy, userId: number, role: string | null | undefined): boolean {
  if (!policy.standIn) return policy.designated.has(userId);
  return String(role ?? '').trim().toLowerCase() === QMS_APPROVER_STAND_IN_ROLE;
}
