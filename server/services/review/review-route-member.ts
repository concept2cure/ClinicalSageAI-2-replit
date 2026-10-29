/**
 * The one validator for a person named on a review route — at send, and (RR3)
 * at adding a member and at reassignment (docs/design/REVIEW_ROUTING_2026-10-23.md
 * §2.5, finding B9). It refuses, in this order, each with nothing written:
 *
 *   1. not an active member of this organization  (MEMBER_NOT_IN_ORGANIZATION)
 *   2. no signing authority, from the membership role (MEMBER_CANNOT_SIGN)
 *   2a. (RR4, NEW-4, D-Q) a QMS document's approver who is not one of the
 *       organization's QMS approvers           (MEMBER_NOT_QMS_APPROVER)
 *   3. no access to the subject's project           (MEMBER_NO_PROJECT_ACCESS)
 *   4. separation of duties over the stage round:
 *        an author, contributor or uploader          (MEMBER_IS_AUTHOR)
 *        the sender                                   (MEMBER_IS_SENDER)
 *        for an approver, anyone with a review signature on this subject's
 *        content digest from ANY route, a withdrawn one included
 *                                                     (MEMBER_REVIEWED_THIS_CONTENT)
 *        the actor doing the naming                   (MEMBER_IS_ACTOR)
 *   5. already on this route in any role             (MEMBER_ALREADY_NAMED)
 *
 * Every statement carries the organization; the project comes from the one
 * anchor reader (readProgramAnchorRow) and access from the admission
 * assignTask uses (canAccessReportProject).
 *
 * @module server/services/review/review-route-member
 */
import { isSigningAuthorized } from '../part11/signing-authority';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { canAccessReportProject } from '../report-os/project-access';
import { resolveTargetAuthors } from '../governance/separation-of-duties';
import { ROUTE_SIGN_MEANING, type RouteQueryable, type RouteRole } from './review-route-standing';
import { holdsQmsApproval, notQmsApproverMessage, readQmsApproverPolicy } from '../qms/qms-approver-designation';

export class ReviewRouteRefusal extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReviewRouteRefusal';
  }
}

const NOTHING = 'Nothing was sent.';

export interface ValidatedMember {
  userId: number;
  role: RouteRole;
  /** The printed name at naming (users.name, else the e-mail's local part). */
  printedName: string;
}

/** NEW-4 and D-Q (RR4): a QMS document's approver is one of the organization's QMS approvers. */
async function refuseNonQmsApprover(
  q: RouteQueryable,
  p: { organizationId: number; subjectTarget: string; role: RouteRole; candidateId: number },
  membershipRole: string | null | undefined,
  printedName: string,
): Promise<void> {
  if (p.role !== 'approver' || !p.subjectTarget.startsWith('qms-document:')) return;
  const policy = await readQmsApproverPolicy(q, p.organizationId);
  if (!holdsQmsApproval(policy, p.candidateId, membershipRole)) {
    throw new ReviewRouteRefusal(409, 'MEMBER_NOT_QMS_APPROVER', `${notQmsApproverMessage(printedName, policy)} ${NOTHING}`);
  }
}

export async function validateRouteMember(
  q: RouteQueryable,
  p: {
    organizationId: number;
    subjectTarget: string;
    /** The regulatory program the subject belongs to, whose project anchors access. */
    programId: string | null;
    contentDigest: string;
    role: RouteRole;
    candidateId: number;
    senderId: number;
    actorId: number;
    /** People already named on this route, in any role. */
    named: ReadonlySet<number>;
    /**
     * The subject's authorship when the caller has it and the subject's own
     * record does not exist yet: the picker's read of a Vault version nobody
     * has started (review-route-candidates.ts), whose authors are its uploader
     * and the sender who will start it. Absent, it is read from the subject.
     */
    authorship?: { authors: readonly number[]; sources: readonly string[] };
  },
): Promise<ValidatedMember> {
  const { rows } = await q.query(
    `SELECT u.id, u.name, u.email, ou.role FROM organization_users ou JOIN users u ON u.id = ou.user_id
      WHERE ou.organization_id = $1 AND ou.user_id = $2 AND u.status = 'active'`,
    [p.organizationId, p.candidateId],
  );
  if (rows.length !== 1) {
    throw new ReviewRouteRefusal(409, 'MEMBER_NOT_IN_ORGANIZATION', `Account #${p.candidateId} is not an active member of this organization. ${NOTHING}`);
  }
  const member = rows[0];
  const printedName = String(member.name || (member.email ? String(member.email).split('@')[0] : `Account #${p.candidateId}`));
  if (!isSigningAuthorized(member.role)) {
    throw new ReviewRouteRefusal(409, 'MEMBER_CANNOT_SIGN', `${printedName} does not hold signing authority, so cannot be named to review or approve. ${NOTHING}`);
  }
  await refuseNonQmsApprover(q, p, member.role, printedName);
  if (p.programId) {
    const anchor = await readProgramAnchorRow(q, { programId: p.programId, orgId: p.organizationId, context: 'review-route-member' });
    if (anchor && !(await canAccessReportProject(p.organizationId, { userId: p.candidateId, role: member.role }, anchor.id, q))) {
      throw new ReviewRouteRefusal(409, 'MEMBER_NO_PROJECT_ACCESS', `${printedName} cannot open this document's project. ${NOTHING}`);
    }
  }
  const authorship = p.authorship ?? await resolveTargetAuthors(p.subjectTarget, p.organizationId, q);
  if (authorship.authors.includes(p.candidateId)) {
    throw new ReviewRouteRefusal(409, 'MEMBER_IS_AUTHOR', `${printedName} is an author of this document (${authorship.sources.join(', ')}), so cannot review or approve it. ${NOTHING}`);
  }
  if (p.candidateId === p.senderId) {
    throw new ReviewRouteRefusal(409, 'MEMBER_IS_SENDER', `You are sending this document, so you cannot also review or approve it. ${NOTHING}`);
  }
  if (p.role === 'approver') {
    const reviewed = await q.query(
      `SELECT 1 FROM electronic_signatures
        WHERE organization_id = $1 AND signed_target = $2 AND bound_payload_digest = $3
          AND upper(signature_meaning) = $4 AND signer_id = $5 LIMIT 1`,
      [p.organizationId, p.subjectTarget, p.contentDigest, ROUTE_SIGN_MEANING.reviewer, p.candidateId],
    );
    if (reviewed.rows.length > 0) {
      throw new ReviewRouteRefusal(409, 'MEMBER_REVIEWED_THIS_CONTENT', `${printedName} signed a review of this content, so a different person approves it. ${NOTHING}`);
    }
  }
  if (p.candidateId === p.actorId) {
    throw new ReviewRouteRefusal(409, 'MEMBER_IS_ACTOR', `You cannot name yourself on this route. ${NOTHING}`);
  }
  if (p.named.has(p.candidateId)) {
    throw new ReviewRouteRefusal(409, 'MEMBER_ALREADY_NAMED', `${printedName} is already named on this route. ${NOTHING}`);
  }
  return { userId: p.candidateId, role: p.role, printedName };
}
