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
import { evaluateDispatchGate, mergeDispatchGates, type DispatchGateResult } from './dispatch-gate';
import {
  resolveExternalValidator,
  evaluateExternalValidationGate,
  evalidatorRequiredFromEnv,
  type ExternalValidationReport,
} from './external-validator';

export interface AssessDispatchReadinessParams {
  sequenceId: number;
  organizationId: number;
  /**
   * An already-run external (agency-grade) validation report for this sequence,
   * if the caller materialized + validated the unzipped package. This DB-bound
   * assessor cannot run the validator itself (no package dir), so when absent the
   * fail-closed rule applies under ECTD_REQUIRE_EVALIDATOR in production.
   */
  externalValidationReport?: ExternalValidationReport | null;
}

export interface DispatchReadinessAssessment {
  sequenceId: number;
  region: string;
  sequenceStatus: string;
  /** Authoritative, server-computed gate inputs. */
  validationErrors: number;
  unacknowledgedShadowCriticals: number;
  /** Completed Shadow Review runs for this sequence. */
  shadowReviewRunCount: number;
  /** Gate clear but no Shadow Review has run — dispatch allowed, never reviewed. */
  shadowReviewMissing: boolean;
  /** External agency-grade (eValidator) gate contribution (P0-4). */
  externalValidation: {
    /** A licensed engine is configured. */
    configured: boolean;
    /** An external validation actually ran (report supplied). */
    ran: boolean;
    /** Error-severity findings from the external (agency-grade) validator. */
    errorCount: number;
    /** This gate adds no blocker. */
    cleared: boolean;
    blockers: string[];
  };
  /** Hard gate verdict — structural + shadow + external, composed. */
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
      sequenceNumber: sequence.sequenceNumber,
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

  // 4b. Has this sequence ever been Shadow-Reviewed? Zero open criticals means
  //     nothing different whether the dossier is clean OR was never reviewed —
  //     surface that blind spot so a never-reviewed dossier isn't dispatched blind.
  const [{ value: shadowRunCount }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(shadowReviewRuns)
    .where(
      and(
        eq(shadowReviewRuns.sequenceId, sequenceId),
        eq(shadowReviewRuns.organizationId, organizationId),
        eq(shadowReviewRuns.status, 'complete'),
        isNull(shadowReviewRuns.deletedAt)
      )
    );
  const shadowReviewRunCount = shadowRunCount ?? 0;

  // 5. External agency-grade validation gate (P0-4), composed with the structural
  //    + shadow gate. Default-off: behavior is identical to before unless
  //    ECTD_REQUIRE_EVALIDATOR is set in production. The external validator runs
  //    against an unzipped package (not available in this DB-bound assessor), so a
  //    caller that already ran it passes the report in; otherwise the fail-closed
  //    "could not run" rule blocks a required production dispatch.
  const externalValidator = await resolveExternalValidator();
  const externalConfigured = externalValidator.name !== 'noop';
  const externalGate = evaluateExternalValidationGate({
    report: params.externalValidationReport ?? null,
    configured: externalConfigured,
    requireEvalidator: evalidatorRequiredFromEnv(),
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'staging',
  });

  // 6. Hard gate over the server-computed inputs, composed with the external gate.
  const structuralGate = evaluateDispatchGate({
    validationErrors: readiness.errors,
    unacknowledgedShadowCriticals,
  });
  const gate = mergeDispatchGates(structuralGate, {
    cleared: externalGate.cleared,
    blockers: externalGate.blockers,
  });

  return {
    sequenceId,
    region: sequence.region,
    sequenceStatus: sequence.status,
    validationErrors: readiness.errors,
    unacknowledgedShadowCriticals,
    shadowReviewRunCount,
    externalValidation: {
      configured: externalConfigured,
      ran: externalGate.ran,
      errorCount: externalGate.externalErrorCount,
      cleared: externalGate.cleared,
      blockers: externalGate.blockers,
    },
    /** True when the gate is clear but no Shadow Review has run — dispatch is
     *  permitted, but the dossier was never adversarially reviewed. */
    shadowReviewMissing: gate.cleared && shadowReviewRunCount === 0,
    gate,
    readiness,
    leafCount: leaves.length,
  };
}

export default { assessSequenceDispatchReadiness };
