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
import { db } from '../../db';
import { submissions, ectdSequences, submissionLeaves } from '../../../shared/schema';
import { packageEctdSubmission } from '../submission-gateways/regional-packager';
import type { SubmissionBundle } from '../submission-gateways/types';
import { buildPackagerInputFromCore, type LeafFileResolver } from './core-to-packager';
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
    sequence: { sequenceNumber: sequence.sequenceNumber, region: sequence.region },
    submission: { applicationType: submission.applicationType, productName: submission.productName },
    leaves: leafRows.map((l) => ({
      sectionCode: l.sectionCode,
      title: l.title,
      lifecycleOp: l.lifecycleOp,
      checksum: l.checksum,
      documentTable: l.documentTable,
      documentId: l.documentId,
      granularity: l.granularity,
    })),
    resolveFile: params.resolveFile,
    applicationId: params.applicationId,
    sponsorId: params.sponsorId,
    sponsorName: params.sponsorName,
    outputDir: params.outputDir,
    emitUnzipped: params.emitUnzipped,
  });

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
