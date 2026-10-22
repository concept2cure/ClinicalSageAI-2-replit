/** The existing sequence branch of governed signature derivation, extracted to
 *  keep the canonical persistence module within its unchanged size ceiling. */
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';
import { readSubmissionPackageIdentity, recordedPackageIdentitySnapshot } from '../ectd/package-identity';
import type { BindingBasis, GovernedBinding, SignatureDbClient } from './signature-persistence';

interface BindingContext {
  basis: BindingBasis;
  hashPayload: (value: unknown) => string;
  ledgerFallback: (reason: string) => GovernedBinding;
}
async function sequenceLeaves(client: SignatureDbClient, id: string, organizationId: number) {
  const leaves = await client.query(
    `SELECT id, section_code, lifecycle_op, document_table, document_id, document_uuid,
            document_content_sha256, checksum, title, study_id, stf_file_tag
       FROM submission_leaves
      WHERE sequence_id = $1::int AND organization_id = $2 AND deleted_at IS NULL
      ORDER BY section_code, id`,
    [id, organizationId],
  );
  // Preserve the pre-STF recipe for untagged leaves. A document pointer, UUID
  // and source content pin always belong to the signed content.
  return leaves.rows.map(({ study_id, stf_file_tag, ...leaf }) =>
    study_id == null && stf_file_tag == null ? leaf : { ...leaf, study_id: study_id ?? null, stf_file_tag: stf_file_tag ?? null });
}

export async function deriveEctdSequenceBinding(
  client: SignatureDbClient, id: string, organizationId: number, context: BindingContext,
): Promise<GovernedBinding> {
  // Workflow status/frozen_at/dispatch_status/updated_at are deliberately not
  // signed: dispatch must not invalidate the signature that authorized it.
  // This preserves the 2026-09-21/22 recipe and its source-pin correction.
  const sequence = (await client.query(
    `SELECT id, submission_id, region, sequence_number, type
       FROM ectd_sequences
      WHERE id = $1::int AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1`, [id, organizationId],
  )).rows[0];
  if (!sequence) return context.ledgerFallback('sequence row not readable at signing time');
  const leaves = await sequenceLeaves(client, id, organizationId);
  const legacyDigest = context.hashPayload({ sequence, leaves });
  const recordedPackageIdentity = canonicalRegionOf(sequence.region) === 'US'
    ? recordedPackageIdentitySnapshot(await readSubmissionPackageIdentity(client, organizationId, Number(sequence.submission_id)))
    : undefined;
  return {
    digest: recordedPackageIdentity ? context.hashPayload({ sequence, leaves, recordedPackageIdentity }) : legacyDigest,
    basis: context.basis,
    note: `sha256 over the ectd_sequences identity (id, submission, region, sequence number, type — not its workflow status) and its ${leaves.length} submission_leaves row(s) (ordered by section_code, id; each with its document pointer, uuid, content pin and non-null study metadata)${recordedPackageIdentity ? ', plus version 1 of its recorded FDA application and applicant identity' : ''} at signing time.`,
    ...(recordedPackageIdentity ? { recordedPackageIdentity, sequenceContentDigest: legacyDigest } : {}),
  };
}
