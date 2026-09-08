/**
 * Package an eCTD sequence FROM the canonical core (backbone unification).
 *
 * Reads the canonical `ectd_sequences` + `submissions` + `submission_leaves`
 * (tenant-scoped), maps them through the pure `core-to-packager` adapter, and
 * drives the live `packageEctdSubmission` publisher. This is the orchestrator
 * that makes the canonical core — not the orphaned `reg_*` model and not
 * hand-supplied leaves — the source of truth for packaging.
 *
 * The one storage-specific concern (resolving a leaf's polymorphic
 * documentTable/documentId to an on-disk file) is INJECTED as `resolveFile`, so
 * this module stays free of storage assumptions and the pure mapping is testable
 * in `core-to-packager.test.ts`. Running it needs a database + a real resolver.
 *
 * @module server/services/ectd/package-from-core
 */

import { eq, and, isNull } from 'drizzle-orm';
import { db, pool } from '../../db';
import { submissions, ectdSequences, submissionLeaves } from '../../../shared/schema';
import { packageEctdSubmission } from '../submission-gateways/regional-packager';
import type { SubmissionBundle } from '../submission-gateways/types';
import { buildPackagerInputFromCore, type LeafFileResolver } from './core-to-packager';
import { loadLatestPriorManifestBySubmission } from './prior-sequence-loader';
import { computeLifecycleOperations, type DesiredLeaf } from './lifecycle-operator';
import { computeSequencePrefix } from './sequence-manifest';
import auditService from '../auditService';

export interface PackageFromCoreParams {
  sequenceId: number;
  organizationId: number;
  userId: number;
  outputDir: string;
  applicationId: string;
  sponsorId: string;
  sponsorName: string;
  /** Resolves each leaf's document to an on-disk file (storage-specific). */
  resolveFile: LeafFileResolver;
  emitUnzipped?: boolean;
}

export interface PackageFromCoreResult {
  bundle: SubmissionBundle;
  skipped: Array<{ sectionCode: string; reason: string }>;
}

/**
 * A declared delete with nothing on file to point at cannot ship as a backbone
 * leaf; it is reported rather than silently packaged as a delete of nothing.
 */
function dropUnshippableDeletes(
  input: { leaves: Array<{ ctdSection: string; operation?: string }> },
  skipped: Array<{ sectionCode: string; reason: string }>,
  reason: string,
): void {
  const kept = input.leaves.filter((l) => l.operation !== 'delete');
  for (const l of input.leaves) {
    if (l.operation === 'delete') skipped.push({ sectionCode: l.ctdSection, reason });
  }
  input.leaves = kept as typeof input.leaves;
}

/**
 * Assemble + package a sequence's leaves from the canonical core. Tenant-scoped:
 * the sequence, submission, and leaves must all belong to `organizationId`.
 *
 * @throws if the sequence or submission is not found in the organization.
 */
export async function packageSequenceFromCore(params: PackageFromCoreParams): Promise<PackageFromCoreResult> {
  const { sequenceId, organizationId, userId } = params;

  const [sequence] = await db
    .select()
    .from(ectdSequences)
    .where(
      and(
        eq(ectdSequences.id, sequenceId),
        eq(ectdSequences.organizationId, organizationId),
        isNull(ectdSequences.deletedAt)
      )
    )
    .limit(1);
  if (!sequence) {
    throw new Error('Sequence not found for this organization.');
  }

  const [submission] = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.id, sequence.submissionId),
        eq(submissions.organizationId, organizationId),
        isNull(submissions.deletedAt)
      )
    )
    .limit(1);
  if (!submission) {
    throw new Error('Submission not found for this organization.');
  }

  const leafRows = await db
    .select()
    .from(submissionLeaves)
    .where(
      and(
        eq(submissionLeaves.sequenceId, sequenceId),
        eq(submissionLeaves.organizationId, organizationId),
        isNull(submissionLeaves.deletedAt)
      )
    );

  const { input, skipped } = buildPackagerInputFromCore({
    sequence: { sequenceNumber: sequence.sequenceNumber, region: sequence.region, type: sequence.type },
    submission: { applicationType: submission.applicationType, productName: submission.productName },
    leaves: leafRows.map((l) => ({
      sectionCode: l.sectionCode,
      title: l.title,
      lifecycleOp: l.lifecycleOp,
      checksum: l.checksum,
      documentTable: l.documentTable,
      documentId: l.documentId,
      granularity: l.granularity,
      documentType: l.documentType,
    })),
    resolveFile: params.resolveFile,
    applicationId: params.applicationId,
    sponsorId: params.sponsorId,
    sponsorName: params.sponsorName,
    outputDir: params.outputDir,
    emitUnzipped: params.emitUnzipped,
  });

  // Lifecycle: for a FOLLOW-UP sequence (not 0000), diff the leaves against the
  // prior sequence's published manifest so each leaf carries a REAL operator
  // (new/replace/append/delete) + ICH modified-file pointer — instead of the
  // all-`new` set that submission_leaves.lifecycle_op yields. Keyed on the stable
  // submission id (application_number was not reliable across sequences). Absent a
  // prior manifest (first sequence, or none persisted yet) the leaves stay `new`.
  if (sequence.sequenceNumber !== '0000') {
    const prior = await loadLatestPriorManifestBySubmission(pool, {
      organizationId,
      submissionId: submission.id,
      currentSequence: sequence.sequenceNumber,
    });
    if (prior.leaves.length > 0) {
      const desired: DesiredLeaf[] = [];
      for (const leaf of input.leaves) {
        // The operator computes new/replace/append from the checksum diff. The
        // one operation it cannot compute is a WITHDRAWAL, which is the author's
        // declared intent — that used to be thrown away here with the rest of
        // the placeholder operation, so submission_leaves.lifecycle_op='delete'
        // was decorative. md5 is the diff input — when unknown a leaf present in
        // prior conservatively becomes `replace` (re-ships content).
        const { operation, ...rest } = leaf;
        if (operation !== 'delete') {
          desired.push({ ...rest, md5: leaf.md5 ?? '' });
          continue;
        }
        // A declared delete carries a section code and, when the row still
        // names a document, a file name. Bind it to the prior leaf by full
        // identity when possible, else by section when that is unambiguous —
        // and never by guessing.
        let fileName = leaf.fileName;
        if (!fileName) {
          const inSection = prior.leaves.filter((pl) => pl.ctdSection === leaf.ctdSection);
          if (inSection.length === 1) fileName = inSection[0].fileName;
          else {
            skipped.push({
              sectionCode: leaf.ctdSection,
              reason:
                inSection.length === 0
                  ? 'withdrawal names a section with no leaf in the prior sequence'
                  : `withdrawal is ambiguous: ${inSection.length} prior leaves share section ${leaf.ctdSection}`,
            });
            continue;
          }
        }
        desired.push({ ...rest, fileName, md5: '', withdraw: true });
      }
      const life = computeLifecycleOperations(prior.leaves, desired, {
        priorSequencePrefix: computeSequencePrefix(prior.priorSequenceNumber),
      });
      // life.leaves carries the declared withdrawals as backbone-only `delete`
      // leaves and OMITS unchanged leaves — exactly the delta the packager ships.
      // A prior leaf this sequence does not mention is still on file, unchanged.
      input.leaves = life.leaves;
    } else {
      dropUnshippableDeletes(input, skipped, 'no prior sequence manifest to withdraw from');
    }
  } else {
    dropUnshippableDeletes(input, skipped, 'a first sequence has nothing on file to withdraw');
  }

  const bundle = await packageEctdSubmission(input);

  await auditService.logAction({
    organizationId,
    userId,
    action: 'ECTD_PACKAGED_FROM_CORE',
    resourceType: 'ectd_sequence',
    resourceId: sequenceId,
    details: {
      region: input.region,
      sequence: input.sequence,
      leafCount: input.leaves.length,
      skipped: skipped.length,
    },
  });

  return { bundle, skipped };
}

export default { packageSequenceFromCore };
