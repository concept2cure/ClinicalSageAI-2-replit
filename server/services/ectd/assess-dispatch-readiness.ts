/**
 * Server-side dispatch-readiness assessor (the tamper-proof gate inputs).
 *
 * Binds the pure validators to the canonical core: it loads a sequence's
 * tenant-scoped leaves, computes the structural error count with
 * `computeDispatchReadiness`, counts OPEN CRITICAL Shadow Review findings for the
 * sequence from the database, and runs `evaluateDispatchGate` over both. Every
 * input to the hard gate is therefore computed from server state — a client can
 * no longer pass `validationErrors: 0` to talk the gate out of a blocker.
 *
 * Required-section context comes from the region profile (Module-1), used only
 * for non-blocking warnings.
 *
 * Tenant-scoped + DB-bound. Running it needs a database.
 *
 * @module server/services/ectd/assess-dispatch-readiness
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { submissionLeaves, ectdSequences } from '../../../shared/schema/submissions';
import { shadowReviewFindings, shadowReviewRuns } from '../../../shared/schema/shadow-review';
import { getSubmissionRegionProfile } from '../region-profiles/region-profile-service';
import { computeDispatchReadiness, type DispatchReadinessReport } from './dispatch-readiness';
import { evaluateDispatchGate, type DispatchGateResult } from './dispatch-gate';

export interface AssessDispatchReadinessParams {
  sequenceId: number;
  organizationId: number;
}

export interface DispatchReadinessAssessment {
  sequenceId: number;
  region: string;
  sequenceStatus: string;
  /** Authoritative, server-computed gate inputs. */
  validationErrors: number;
  unacknowledgedShadowCriticals: number;
  /** Hard gate verdict over the server-computed inputs. */
  gate: DispatchGateResult;
  /** Full structural breakdown (errors + non-blocking warnings/infos). */
  readiness: DispatchReadinessReport;
  leafCount: number;
}

/** Flatten a region profile's Module-1 tree to the section codes marked required. */
function requiredModule1Codes(region: string): string[] {
  const profile = getSubmissionRegionProfile(region);
  if (!profile) return [];
  const out: string[] = [];
  const walk = (sections: typeof profile.module1Sections): void => {
    for (const s of sections) {
      if (s.required) out.push(s.number);
      if (s.childSections?.length) walk(s.childSections);
    }
  };
  walk(profile.module1Sections);
  return out;
}

/**
 * Assess whether a sequence is clear to dispatch, computing every gate input from
 * server-side truth. Throws if the sequence is not found in the tenant.
 */
export async function assessSequenceDispatchReadiness(
  params: AssessDispatchReadinessParams
): Promise<DispatchReadinessAssessment> {
  const { sequenceId, organizationId } = params;

  // 1. Tenant-scoped sequence (region + status).
  const [sequence] = await db
    .select()
    .from(ectdSequences)
    .where(and(eq(ectdSequences.id, sequenceId), eq(ectdSequences.organizationId, organizationId)))
    .limit(1);
  if (!sequence) {
    throw Object.assign(new Error('Sequence not found in this organization.'), { code: 'NOT_FOUND' });
  }

  // 2. Tenant-scoped, non-deleted leaves.
  const leaves = await db
    .select()
    .from(submissionLeaves)
    .where(
      and(
        eq(submissionLeaves.sequenceId, sequenceId),
        eq(submissionLeaves.organizationId, organizationId),
        isNull(submissionLeaves.deletedAt)
      )
    );

  // 3. Deterministic structural validation over the canonical core.
  const readiness = computeDispatchReadiness(
    leaves.map(l => ({
      sectionCode: l.sectionCode,
      title: l.title,
      lifecycleOp: l.lifecycleOp,
      documentTable: l.documentTable,
      documentId: l.documentId,
    })),
    {
      requiredSections: requiredModule1Codes(sequence.region),
      // An original is type 'original' or sequence number '0000'.
      isOriginalSequence: sequence.type === 'original' || sequence.sequenceNumber === '0000',
    }
  );

  // 4. Open CRITICAL Shadow Review findings for this sequence (server truth).
  const [{ value: criticalCount }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(shadowReviewFindings)
    .innerJoin(shadowReviewRuns, eq(shadowReviewFindings.runId, shadowReviewRuns.id))
    .where(
      and(
        eq(shadowReviewRuns.sequenceId, sequenceId),
        eq(shadowReviewFindings.organizationId, organizationId),
        eq(shadowReviewFindings.severity, 'critical'),
        eq(shadowReviewFindings.status, 'open'),
        isNull(shadowReviewFindings.deletedAt),
        isNull(shadowReviewRuns.deletedAt)
      )
    );

  const unacknowledgedShadowCriticals = criticalCount ?? 0;

  // 5. Hard gate over the server-computed inputs.
  const gate = evaluateDispatchGate({
    validationErrors: readiness.errors,
    unacknowledgedShadowCriticals,
  });

  return {
    sequenceId,
    region: sequence.region,
    sequenceStatus: sequence.status,
    validationErrors: readiness.errors,
    unacknowledgedShadowCriticals,
    gate,
    readiness,
    leafCount: leaves.length,
  };
}

export default { assessSequenceDispatchReadiness };
