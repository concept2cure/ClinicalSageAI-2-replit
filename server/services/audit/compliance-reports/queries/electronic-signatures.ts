/**
 * Electronic signature register — every electronic signature applied in this
 * organisation in the period: who signed, the meaning (§11.50), what record it
 * is bound to and how (§11.70), how the signer was authenticated (§11.200), and
 * whether it has since been revoked or superseded.
 *
 * `meaning` is `signature_meaning` exactly as stored: a signature that
 * declared no meaning shows none, never its type (review round 1). The signed
 * version is the one the signature manifest names, when it names one.
 *
 * `superseded_by_type` and `superseded_at` are the superseding signature's own
 * type and signing time (signature-persistence.ts marks the revoked row with
 * `superseded_by` and `verification_status = 'revoked'`); electronic_signatures
 * has no column of either name.
 *
 * @module server/services/audit/compliance-reports/queries/electronic-signatures
 */
import type { ReportDefinition, RunContext, SectionResult } from '../types';
import { cappedSection, columns, isoNaiveUtc, naiveUtcNote, utcWallClock } from './section';

/* $1 organisation, $2 period start, $3 period end (exclusive). */
const SIGNATURES_SQL = `
SELECT s.id,
       ${isoNaiveUtc('s.signed_at')} AS signed_at,
       s.signer_id,
       s.signer_name,
       s.signer_email,
       s.signer_title,
       s.signature_meaning AS meaning,
       s.signature_type,
       s.signature_purpose,
       s.signature_manifest->>'version' AS signed_version,
       CASE WHEN strpos(s.signed_target, ':') > 0 THEN split_part(s.signed_target, ':', 1)
            WHEN s.version_id IS NOT NULL THEN 'document_version'
            WHEN s.document_id IS NOT NULL THEN 'document'
            WHEN s.signed_target IS NOT NULL THEN 'target' END AS record_type,
       CASE WHEN strpos(s.signed_target, ':') > 0 THEN substr(s.signed_target, strpos(s.signed_target, ':') + 1)
            WHEN s.version_id IS NOT NULL THEN s.version_id::text
            WHEN s.document_id IS NOT NULL THEN s.document_id::text
            ELSE s.signed_target END AS record_id,
       s.signature_hash,
       s.bound_payload_digest,
       s.binding_basis,
       s.authentication_method,
       s.second_factor_verified,
       s.is_valid,
       (s.verification_status IS NOT DISTINCT FROM 'revoked') AS revoked,
       s.superseded_by,
       sup.signature_type AS superseded_by_type,
       ${isoNaiveUtc('sup.signed_at')} AS superseded_at
  FROM electronic_signatures s
  LEFT JOIN electronic_signatures sup
    ON sup.id = s.superseded_by AND sup.organization_id = $1
 WHERE s.organization_id = $1
   AND COALESCE(s.signed_at, s.created_at) >= ${utcWallClock(2)}
   AND COALESCE(s.signed_at, s.created_at) < ${utcWallClock(3)}
 ORDER BY COALESCE(s.signed_at, s.created_at), s.id`;

async function run(ctx: RunContext): Promise<Record<string, SectionResult>> {
  return {
    signatures: {
      ...(await cappedSection(ctx.client, SIGNATURES_SQL, [ctx.orgId, ctx.bounds.start, ctx.bounds.end])),
      notes: [
        'The meaning is the one the signer declared, as stored; a signature that declared none shows none.',
        naiveUtcNote('Signing times'),
      ],
    },
  };
}

export const electronicSignatures: ReportDefinition = {
  id: 'electronic-signatures',
  title: 'Electronic signature register',
  purpose: 'Lists every electronic signature applied in this organisation in the period, with its signer, meaning, the record it is bound to, how the signer was authenticated, and whether it was later revoked or superseded.',
  basis: ['21 CFR 11.50', '21 CFR 11.70', '21 CFR 11.100', '21 CFR 11.200', 'EU GMP Annex 11 §14'],
  period: 'range',
  sections: [
    {
      key: 'signatures',
      title: 'Signatures',
      columns: columns([
        ['id', 'Signature id'],
        ['signed_at', 'Signed'],
        ['signer_id', 'Signer user id'],
        ['signer_name', 'Signer'],
        ['signer_email', 'Signer email'],
        ['signer_title', 'Signer title'],
        ['meaning', 'Meaning'],
        ['signature_type', 'Signature type'],
        ['signature_purpose', 'Purpose'],
        ['signed_version', 'Signed version'],
        ['record_type', 'Record type'],
        ['record_id', 'Record'],
        ['signature_hash', 'Signature hash'],
        ['bound_payload_digest', 'Bound content digest'],
        ['binding_basis', 'Binding basis'],
        ['authentication_method', 'Authentication'],
        ['second_factor_verified', 'Second factor verified'],
        ['is_valid', 'Valid'],
        ['revoked', 'Revoked'],
        ['superseded_by', 'Superseded by signature'],
        ['superseded_by_type', 'Superseding signature type'],
        ['superseded_at', 'Superseded'],
      ]),
    },
  ],
  notRecorded: [
    'Signatures written before the organisation column existed carry no organisation and cannot be attributed, so they do not appear here.',
  ],
  run,
};
