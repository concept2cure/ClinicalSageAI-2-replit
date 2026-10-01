/**
 * Controlled document register — the organisation's QMS controlled documents
 * as of the chosen date, each with the electronic signature that approved its
 * current version and, when retired, the signature that retired it; and every
 * change control raised by that date with its approval signature.
 *
 * A signature is shown only while it stands — `is_valid`, not
 * `verification_status = 'revoked'`, no `superseded_by` (signature-persistence.ts
 * marks a revoked one with all three) — so a revoked approval is never
 * presented as the approval; the revoked ones are counted beside it.
 *
 * Signatures are found the way their writers anchor them
 * (services/qms/document-approval-signature.ts, change-approval-signature.ts):
 * `signed_target` 'qms-document:<id>' with type 'qms-document-approval' (the
 * version is in the signature manifest) or 'qms-document-retirement', and
 * 'qms-change:<id>' with type 'qms-change-approval'. The retirement time is
 * the one the retirement wrote to metadata.retired.at.
 *
 * @module server/services/audit/compliance-reports/queries/controlled-documents
 */
import type { ReportDefinition, RunContext, SectionResult } from '../types';
import { actorJoin, cappedSection, columns, isoNaiveUtc, isoUtc, naiveUtcNote, utcWallClock } from './section';

/** A signature that stands now: valid, not revoked, not superseded. */
const STANDING = (a: string) =>
  `${a}.is_valid IS TRUE AND ${a}.verification_status IS DISTINCT FROM 'revoked' AND ${a}.superseded_by IS NULL`;

/** The retirement stamp is ISO text in metadata; rendered like every other time when it parses as one. */
const RETIRED_AT = `CASE WHEN d.metadata->'retired'->>'at' ~ '^\\d{4}-\\d{2}-\\d{2}T'
            THEN ${isoUtc(`(d.metadata->'retired'->>'at')::timestamptz`)}
            ELSE d.metadata->'retired'->>'at' END`;

/* $1 organisation, $2 the end of the as-of day. */
const DOCUMENTS_SQL = `
SELECT d.id,
       d.doc_number,
       d.title,
       d.doc_type,
       d.version,
       d.status,
       d.effective_date::text AS effective_date,
       d.next_review_date::text AS next_review_date,
       au.name AS author,
       ap.name AS approver,
       ${isoUtc('d.approved_at')} AS approved_at,
       sa.id AS approval_signature_id,
       ${isoNaiveUtc('sa.signed_at')} AS approval_signed_at,
       sa.signer_name AS approval_signer_name,
       sa.signature_meaning AS approval_meaning,
       sa.bound_payload_digest AS approval_digest,
       (SELECT count(*)::int
          FROM electronic_signatures r
         WHERE r.organization_id = $1
           AND r.signed_target = 'qms-document:' || d.id
           AND r.signature_type = 'qms-document-approval'
           AND r.signature_manifest->>'version' = d.version
           AND (r.verification_status = 'revoked' OR r.superseded_by IS NOT NULL)
           AND r.signed_at < ${utcWallClock(2)}) AS revoked_approval_signatures,
       (d.status = 'retired') AS retired,
       ${RETIRED_AT} AS retired_at,
       sr.id AS retirement_signature_id,
       d.superseded_by_id,
       ${isoUtc('d.deleted_at')} AS deleted_at
  FROM qms_documents d
  ${actorJoin('d.author_id', 'au')}
  ${actorJoin('d.approver_id', 'ap')}
  LEFT JOIN LATERAL (
        SELECT s.id, s.signed_at, s.signer_name, s.signature_meaning, s.bound_payload_digest
          FROM electronic_signatures s
         WHERE s.organization_id = $1
           AND s.signed_target = 'qms-document:' || d.id
           AND s.signature_type = 'qms-document-approval'
           AND s.signature_manifest->>'version' = d.version
           AND ${STANDING('s')}
           AND s.signed_at < ${utcWallClock(2)}
         ORDER BY s.signed_at DESC, s.id DESC
         LIMIT 1) sa ON TRUE
  LEFT JOIN LATERAL (
        SELECT s.id
          FROM electronic_signatures s
         WHERE s.organization_id = $1
           AND s.signed_target = 'qms-document:' || d.id
           AND s.signature_type = 'qms-document-retirement'
           AND ${STANDING('s')}
           AND s.signed_at < ${utcWallClock(2)}
         ORDER BY s.signed_at DESC, s.id DESC
         LIMIT 1) sr ON TRUE
 WHERE d.organization_id = $1
   AND d.created_at < $2::timestamptz
   AND (d.deleted_at IS NULL OR d.deleted_at >= $2::timestamptz)
 ORDER BY d.doc_number, d.version, d.id`;

/* $1 organisation, $2 the end of the as-of day: every change control raised by then and not deleted before it. */
const CHANGES_SQL = `
SELECT c.id,
       c.change_number,
       c.title,
       c.description,
       c.reason,
       c.change_type,
       c.classification,
       c.risk_level,
       c.status,
       ${isoUtc('c.created_at')} AS raised_at,
       pn.name AS proposed_by,
       ${isoUtc('c.approved_at')} AS approved_at,
       an.name AS approved_by,
       sg.id AS approval_signature_id,
       ${isoNaiveUtc('sg.signed_at')} AS approval_signed_at,
       sg.bound_payload_digest AS approval_digest,
       ${isoUtc('c.implemented_at')} AS implemented_at,
       ${isoUtc('c.verified_at')} AS verified_at,
       ${isoUtc('c.closed_at')} AS closed_at,
       c.qms_document_id
  FROM qms_change_controls c
  ${actorJoin('c.proposed_by', 'pn')}
  ${actorJoin('c.approved_by', 'an')}
  LEFT JOIN LATERAL (
        SELECT s.id, s.signed_at, s.bound_payload_digest
          FROM electronic_signatures s
         WHERE s.organization_id = $1
           AND s.signed_target = 'qms-change:' || c.id
           AND s.signature_type = 'qms-change-approval'
           AND ${STANDING('s')}
           AND s.signed_at < ${utcWallClock(2)}
         ORDER BY s.signed_at DESC, s.id DESC
         LIMIT 1) sg ON TRUE
 WHERE c.organization_id = $1
   AND c.created_at < $2::timestamptz
   AND (c.deleted_at IS NULL OR c.deleted_at >= $2::timestamptz)
 ORDER BY c.created_at, c.id`;

async function run(ctx: RunContext): Promise<Record<string, SectionResult>> {
  const currentState =
    'Status is the record as it is at generation time. The signatures shown are the latest applied by the end of the date that are not revoked or superseded at generation time.';
  const times = naiveUtcNote('Signing times');
  return {
    documents: {
      ...(await cappedSection(ctx.client, DOCUMENTS_SQL, [ctx.orgId, ctx.bounds.end])),
      notes: [
        'Documents created by the end of the chosen date and not deleted before it.',
        currentState,
        'Revoked approval signatures counts the approval signatures of this version that were revoked or superseded.',
        times,
      ],
    },
    changes: {
      ...(await cappedSection(ctx.client, CHANGES_SQL, [ctx.orgId, ctx.bounds.end])),
      notes: ['Every change control raised by the end of the chosen date and not deleted before it, open or closed.', currentState, times],
    },
  };
}

export const controlledDocuments: ReportDefinition = {
  id: 'controlled-documents',
  title: 'Controlled document register',
  purpose: "Lists this organisation's controlled documents as of the chosen date with the electronic signature that approved each current version, and every change control raised by that date with its approval signature.",
  basis: ['21 CFR 11.10(k)', '21 CFR 820 (QMSR: ISO 13485:2016 by reference, since 2026-02-02)', 'ISO 13485 §4.2.4', 'EU GMP Annex 11 §10'],
  period: 'as-of',
  sections: [
    {
      key: 'documents',
      title: 'Controlled documents',
      columns: columns([
        ['id', 'Document id'],
        ['doc_number', 'Document number'],
        ['title', 'Title'],
        ['doc_type', 'Type'],
        ['version', 'Version'],
        ['status', 'Status'],
        ['effective_date', 'Effective date'],
        ['next_review_date', 'Next review'],
        ['author', 'Author'],
        ['approver', 'Approver'],
        ['approved_at', 'Approved'],
        ['approval_signature_id', 'Approval signature'],
        ['approval_signed_at', 'Approval signed'],
        ['approval_signer_name', 'Approval signed by'],
        ['approval_meaning', 'Approval meaning'],
        ['approval_digest', 'Approved content digest'],
        ['revoked_approval_signatures', 'Revoked approval signatures'],
        ['retired', 'Retired'],
        ['retired_at', 'Retired at'],
        ['retirement_signature_id', 'Retirement signature'],
        ['superseded_by_id', 'Superseded by document'],
        ['deleted_at', 'Deleted'],
      ]),
    },
    {
      key: 'changes',
      title: 'Change controls raised by the date',
      columns: columns([
        ['id', 'Change id'],
        ['change_number', 'Change number'],
        ['title', 'Title'],
        ['description', 'Description'],
        ['reason', 'Reason for change'],
        ['change_type', 'Type'],
        ['classification', 'Classification'],
        ['risk_level', 'Risk'],
        ['status', 'Status'],
        ['raised_at', 'Raised'],
        ['proposed_by', 'Proposed by'],
        ['approved_at', 'Approved'],
        ['approved_by', 'Approved by'],
        ['approval_signature_id', 'Approval signature'],
        ['approval_signed_at', 'Approval signed'],
        ['approval_digest', 'Approved content digest'],
        ['implemented_at', 'Implemented'],
        ['verified_at', 'Verified'],
        ['closed_at', 'Closed'],
        ['qms_document_id', 'Controlled document'],
      ]),
    },
  ],
  notRecorded: [
    'A document approval, document retirement or change approval made before these became electronic signatures has no signature, so its signature columns are empty.',
    'The register does not reconstruct a past status: for a past date it shows each record as it is now, with the signatures applied by that date.',
    'Documents deleted before the date do not appear.',
    'Distribution of a controlled document — who received which version, and when — is not recorded.',
    'Read-and-understood training is recorded per person and document version in the QMS training records, not in this register. Whether the effective version was consulted at the point of use is not recorded.',
  ],
  run,
};
