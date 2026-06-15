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
import { getLatestValidationReport } from './external-validator/validation-report-persistence';
import {
  assessExternalValidationReadiness,
  externalValidationRequiredFromEnv,
  type ExternalValidationGateResult,
} from './external-validator/evaluate-external-validation';
import type { ExternalValidationReport } from './external-validator/types';

export interface AssessDispatchReadinessParams {
  sequenceId: number;
  organizationId: number;
  /**
   * Opt-in external-validation enforcement. ADDITIVE + FLAG-GATED: when omitted
   * the value is read from `ECTD_REQUIRE_EVALIDATOR` (default off), so the
   * default dispatch behaviour is unchanged. When required (and production), the
   * latest external validation report's error count is folded into the gate and
   * a missing report blocks. Pass `false` to disable regardless of the env flag.
   */
  requireExternalValidation?: boolean;
  /** Submission environment; only 'production' can be blocked by the external gate. */
  environment?: 'staging' | 'production';
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
  /** Hard gate verdict over the server-computed inputs. */
  gate: DispatchGateResult;
  /** Full structural breakdown (errors + non-blocking warnings/infos). */
  readiness: DispatchReadinessReport;
  leafCount: number;
  /**
   * External-validation gate result, present only when external validation is in
   * effect for this assessment (the `ECTD_REQUIRE_EVALIDATOR` flag or an explicit
   * `requireExternalValidation`). Undefined preserves the default-off shape.
   */
  externalValidation?: ExternalValidationGateResult;
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

  // ADDITIVE + FLAG-GATED: external validation is off by default. When omitted,
  // the requirement comes from ECTD_REQUIRE_EVALIDATOR (default false), so the
  // legacy path (no env flag, no explicit param) does ZERO extra work and the
  // gate inputs are unchanged.
  const requireExternalValidation =
    params.requireExternalValidation ?? externalValidationRequiredFromEnv();
  const environment: 'staging' | 'production' =
    params.environment ?? (process.env.NODE_ENV === 'production' ? 'production' : 'staging');

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

  // 4c. External validation (ADDITIVE + FLAG-GATED). Only when enforcement is in
  //     effect do we load the latest persisted report and evaluate its gate —
  //     the default-off path skips this entirely, leaving the gate inputs
  //     unchanged so existing behaviour/tests are untouched.
  let externalValidation: ExternalValidationGateResult | undefined;
  let externalErrorCount = 0;
  if (requireExternalValidation) {
    let latest: ExternalValidationReport | null;
    try {
      const row = await getLatestValidationReport(sequenceId, { organizationId });
      latest = (row?.report as ExternalValidationReport | undefined) ?? null;
    } catch {
      // A missing report surfaces as a blocker below; never a false green.
      latest = null;
    }
    externalValidation = assessExternalValidationReadiness({
      report: latest,
      requireExternalValidation,
      environment,
    });
    externalErrorCount = externalValidation.errorCount;
  }

  // 5. Hard gate over the server-computed inputs. When external validation is in
  //    effect, its error count is folded into validationErrors so a failing
  //    external validation blocks dispatch through the same hard gate.
  const gate = evaluateDispatchGate({
    validationErrors: readiness.errors + externalErrorCount,
    unacknowledgedShadowCriticals,
  });

  // Fold any external-validation "missing report" blocker into the gate verdict
  // (folding error counts above only covers reports that exist with errors).
  if (externalValidation && !externalValidation.cleared) {
    gate.cleared = false;
    for (const b of externalValidation.blockers) {
      if (!gate.blockers.includes(b)) gate.blockers.push(b);
    }
  }

  return {
    sequenceId,
    region: sequence.region,
    sequenceStatus: sequence.status,
    validationErrors: readiness.errors + externalErrorCount,
    unacknowledgedShadowCriticals,
    shadowReviewRunCount,
    /** True when the gate is clear but no Shadow Review has run — dispatch is
     *  permitted, but the dossier was never adversarially reviewed. */
    shadowReviewMissing: gate.cleared && shadowReviewRunCount === 0,
    gate,
    readiness,
    leafCount: leaves.length,
    externalValidation,
  };
}

export default { assessSequenceDispatchReadiness };
