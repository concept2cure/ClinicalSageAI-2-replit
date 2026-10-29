/**
 * An approval signature's share of its route's approval (RR2 records,
 * 2026-10-29; docs/design/REVIEW_ROUTING_2026-10-23.md §2.12, §3, NEW-4).
 *
 * A route names every approver who must sign, and only the last signature
 * approves the subject (a Vault version or a QMS controlled document). Every
 * earlier one is signed with the meaning APPROVED, because that is what its
 * signer declared, but the subject is still in review after it. Until
 * 2026-10-29 that earlier signature was written with the same signature type
 * as the last one, so the audit trail called it "Controlled document approved"
 * and the controlled-document register could name it as the approval of an SOP
 * still under review. RR2's README raised it as design issue 2.
 *
 * Two parts, one rule:
 *
 *   - **What is written now.** An earlier approval is its own record: its own
 *     signature type (QMS_INTERIM_APPROVAL_TYPE, VAULT_INTERIM_APPROVAL_TYPE),
 *     and its manifest states its share, `approvalsRecorded` of
 *     `approvalsRequired`, inside the bytes the §11.200 hash covers. The last
 *     approval keeps the type every reader of "the approval" reads, and states
 *     its share too. The meaning stays APPROVED: the route verifies a member's
 *     signature by its meaning (review-route-standing.ts), and the signer did
 *     approve.
 *   - **What is already stored.** Signatures are immutable and are never
 *     rewritten. An approval stored before 2026-10-29 has the final type and no
 *     share in its manifest, so a reader derives its share from the route it
 *     was stamped on (unified_tasks.route_signature_id): k is the number of the
 *     route's approvers whose stamped signature was signed at or before this
 *     one, n is the number of approvers the route names. It is interim when
 *     k < n: when it was signed, another named approver had still to sign.
 *     The route's member rows are the record of who was named and who signed
 *     (the route guard, migrations/20261023_review_routes.sql, lets only the
 *     route write them; a reassignment keeps the row; no approver is added
 *     after an approval has started), so the count is stable after signing.
 *     The same derivation serves the Vault and QMS, whose ledger never
 *     recorded the share (Vault) or recorded it only in the action payload
 *     (QMS).
 *
 * Every SQL reader takes `approvalShareJoin`, so there is one derivation.
 *
 * @module server/services/review/approval-share
 */
import type { RouteStanding } from './review-route-standing';

/** electronic_signatures.signature_type of a QMS approval that is not the last one its route requires. */
export const QMS_INTERIM_APPROVAL_TYPE = 'qms-document-interim-approval';
/** electronic_signatures.signature_type of a Vault lifecycle approval that is not the last one its route requires. */
export const VAULT_INTERIM_APPROVAL_TYPE = 'regulated-document-lifecycle-interim-approval';

/** A signature's share of its route's approval: the k-th of the n approvals the route requires. */
export interface ApprovalShare {
  approvalsRecorded: number;
  approvalsRequired: number;
}

/** Whether a share leaves the subject unapproved: another named approver is still to sign. */
export const isInterimShare = (share: ApprovalShare): boolean => share.approvalsRecorded < share.approvalsRequired;

/**
 * The share of the approval about to be signed on `standing` (read under the
 * subject's row lock): every named approver signs (NEW-4), so this one is the
 * signed count plus one, of all the route's approvers.
 */
export function shareOfNextApproval(standing: RouteStanding): ApprovalShare {
  const approvers = standing.members.filter((m) => m.role === 'approver');
  return { approvalsRecorded: approvers.filter((m) => m.outcome === 'signed').length + 1, approvalsRequired: approvers.length };
}

/** "1 of 2 required": the words every reader uses for a share. */
export const shareWords = (share: ApprovalShare): string => `${share.approvalsRecorded} of ${share.approvalsRequired} required`;

const COUNT = `'^[0-9]+$'`;

/**
 * SQL: `LEFT JOIN LATERAL (…) <as> ON TRUE`, giving for the electronic_signatures
 * row aliased `sig` its `<as>.approvals_recorded`, `<as>.approvals_required`
 * (both null for a signature on no route) and `<as>.interim_approval` (true
 * only for an approval that was not the last one its route required). The
 * share is the manifest's when the signature states one, else its route's
 * (see the module header). `sig` and `as` are fixed aliases from the caller's
 * own SQL, never a value.
 */
export function approvalShareJoin(sig: string, as: string): string {
  return `LEFT JOIN LATERAL (
    SELECT share.recorded AS approvals_recorded, share.required AS approvals_required,
           (${sig}.signature_type IN ('${QMS_INTERIM_APPROVAL_TYPE}', '${VAULT_INTERIM_APPROVAL_TYPE}')
             OR COALESCE(share.recorded < share.required, FALSE)) AS interim_approval
      FROM (
        SELECT CASE WHEN stated.recorded IS NOT NULL AND stated.required IS NOT NULL THEN stated.recorded ELSE routed.recorded END AS recorded,
               CASE WHEN stated.recorded IS NOT NULL AND stated.required IS NOT NULL THEN stated.required ELSE routed.required END AS required
          FROM (
            SELECT CASE WHEN ${sig}.signature_manifest->>'approvalsRecorded' ~ ${COUNT}
                        THEN (${sig}.signature_manifest->>'approvalsRecorded')::int END AS recorded,
                   CASE WHEN ${sig}.signature_manifest->>'approvalsRequired' ~ ${COUNT}
                        THEN (${sig}.signature_manifest->>'approvalsRequired')::int END AS required
          ) stated,
          (
            SELECT CASE WHEN count(*) > 0 THEN (count(*) FILTER (
                     WHERE peer_sig.id IS NOT NULL AND (peer_sig.signed_at, peer_sig.id) <= (${sig}.signed_at, ${sig}.id)))::int END AS recorded,
                   NULLIF(count(*), 0)::int AS required
              FROM unified_tasks own
              JOIN unified_tasks peer
                ON peer.organization_id = own.organization_id AND peer.review_route_id = own.review_route_id
               AND peer.review_role = 'approver' AND peer.deleted_at IS NULL
              LEFT JOIN electronic_signatures peer_sig
                ON peer_sig.id = peer.route_signature_id AND peer_sig.organization_id = own.organization_id
             WHERE own.organization_id = ${sig}.organization_id AND own.route_signature_id = ${sig}.id
               AND own.review_role = 'approver' AND own.deleted_at IS NULL
          ) routed
      ) share
  ) ${as} ON TRUE`;
}
