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
import { submissionLeaves, ectdSequences, submissions } from '../../../shared/schema/submissions';
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

/**
 * NODE_ENV values that are RECOGNIZED as non-production. Anything else — unset,
 * misspelled, 'prod' — is treated as production so the fail-closed eValidator
 * rule is not silently disabled by a misconfiguration.
 */
const NON_PRODUCTION_NODE_ENVS = new Set(['development', 'test', 'staging']);

/**
 * Resolve the environment for the fail-closed eValidator rule. Fails toward
 * 'production': only a RECOGNIZED non-production NODE_ENV yields 'staging', so an
 * unset/misspelled value keeps production enforcement on. Pure + exported for test.
 */
export function resolveDispatchEnvironment(
  nodeEnv: string | undefined,
): 'production' | 'staging' {
  return NON_PRODUCTION_NODE_ENVS.has(nodeEnv ?? '') ? 'staging' : 'production';
}

/**
 * Gate on Shadow Review having actually run. Zero completed runs is UNASSESSED,
 * not clean — it must block dispatch, never clear it. Pure + exported for test.
 */
export function evaluateShadowPresenceGate(shadowReviewRunCount: number): DispatchGateResult {
  return shadowReviewRunCount > 0
    ? { cleared: true, blockers: [] }
    : {
        cleared: false,
        blockers: [
          'No completed Shadow Review has run for this sequence. A never-reviewed dossier is not cleared for dispatch — run Shadow Review before transmitting.',
        ],
      };
}

/**
 * Completed Shadow Review runs for a sequence.
 *
 * Zero open criticals means nothing different whether the dossier is clean OR
 * was never reviewed — so the count is read separately and fed to the presence
 * gate, which surfaces that blind spot instead of letting it read as clean.
 *
 * Extracted from assessSequenceDispatchReadiness only to keep that function
 * under the max-lines-per-function ceiling; the query and its filters are
 * unchanged, including `status = 'complete'` and the soft-delete exclusion.
 */
async function countCompletedShadowRuns(
  sequenceId: number,
  organizationId: number,
): Promise<number> {
  const [{ value }] = await db
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
  return value ?? 0;
}

/**
 * Flatten a region profile's Module-1 tree to the section codes marked required
 * for this application type. A section that declares `requiredFor` is required
 * only for those application types (a debarment certification for a marketing
 * application, the general investigational plan for an IND); when the
 * application type is unknown every required section is kept — conservative,
 * as before.
 */
export function requiredModule1Codes(region: string, applicationType?: string | null): string[] {
  const profile = getSubmissionRegionProfile(region);
  if (!profile) return [];
  const app = applicationType ? String(applicationType).toLowerCase() : null;
  const out: string[] = [];
  const walk = (sections: typeof profile.module1Sections): void => {
    for (const s of sections) {
      const applies = !s.requiredFor || !app || s.requiredFor.includes(app);
      if (s.required && applies) out.push(s.number);
      if (s.childSections?.length) walk(s.childSections);
    }
  };
  walk(profile.module1Sections);
  return out;
}

/**
 * The application type decides which Module 1 sections are required (an IND
 * needs its plan and brochure; a marketing application its debarment
 * certification and draft labeling). Tenant-scoped; null when the submission
 * row is not visible to this organization.
 */
async function loadApplicationType(submissionId: number, organizationId: number): Promise<string | null> {
  const [row] = await db
    .select({ applicationType: submissions.applicationType })
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.organizationId, organizationId)))
    .limit(1);
  return row?.applicationType ?? null;
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
  const submissionApplicationType = await loadApplicationType(sequence.submissionId, organizationId);

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
      requiredSections: requiredModule1Codes(sequence.region, submissionApplicationType),
      // An original is type 'original' or sequence number '0000'.
      isOriginalSequence: sequence.type === 'original' || sequence.sequenceNumber === '0000',
      sequenceNumber: sequence.sequenceNumber,
    }
  );

  // Fail-visible on an unrecognized region: requiredModule1Codes returns [] for a
  // region with no registered profile, so NO required-section is checked and the
  // absence of MISSING_REQUIRED_SECTION findings does NOT mean the required
  // sections are present. Surface it as a warning rather than reporting nothing
  // missing.
  if (!getSubmissionRegionProfile(sequence.region)) {
    readiness.findings.push({
      severity: 'warning',
      code: 'UNKNOWN_REGION_PROFILE',
      sectionCode: null,
      message: `No submission region profile is registered for region "${sequence.region}"; required Module 1 section checking could not be performed.`,
    });
    readiness.warnings += 1;
  }

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

  // 4b. Has this sequence ever been Shadow-Reviewed? See countCompletedShadowRuns.
  const shadowReviewRunCount = await countCompletedShadowRuns(sequenceId, organizationId);

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
    environment: resolveDispatchEnvironment(process.env.NODE_ENV),
  });

  // 6. Hard gate over the server-computed inputs, composed with the external gate.
  const structuralGate = evaluateDispatchGate({
    validationErrors: readiness.errors,
    unacknowledgedShadowCriticals,
  });

  // 6b. Never-Shadow-Reviewed is not clean, it is UNASSESSED. A sequence with
  //     zero completed Shadow Review runs has zero open criticals for the same
  //     reason an unread document has zero findings: nothing ran to produce any.
  //     Like an undetermined count in the hard gate, that must not clear
  //     dispatch — otherwise a dossier that was never adversarially reviewed is
  //     transmitted to the agency with a `cleared: true` verdict. Block until at
  //     least one completed Shadow Review run exists.
  const shadowPresenceGate = evaluateShadowPresenceGate(shadowReviewRunCount);

  const gate = mergeDispatchGates(
    structuralGate,
    { cleared: externalGate.cleared, blockers: externalGate.blockers },
    shadowPresenceGate,
  );

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
    /** True when no completed Shadow Review has run for this sequence. This now
     *  also blocks the gate (§6b), so it is informational: it reports WHY the
     *  gate is blocked when that is the only blocker. */
    shadowReviewMissing: shadowReviewRunCount === 0,
    gate,
    readiness,
    leafCount: leaves.length,
  };
}

export default { assessSequenceDispatchReadiness };
