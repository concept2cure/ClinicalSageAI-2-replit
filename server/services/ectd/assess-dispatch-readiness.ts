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
import {
  evaluateDispatchGate,
  mergeDispatchGates,
  evaluateReleaseSignatureGate,
  type DispatchGateResult,
  type ReleaseSignatureGateInput,
  type ReleaseSignatureVerdict,
} from './dispatch-gate';
import {
  resolveReleaseSignatureStatus,
  isReleaseSignatureRequired,
} from './release-signature-status';
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
  /** Release-signature state (21 CFR Part 11 §11.70, §6c). */
  releaseSignature: {
    /** This submission type crosses the §11.70 boundary and must be signed. */
    required: boolean;
    /** Resolved signature state. `undetermined` ≠ `unsigned` — see the gate. */
    verdict: ReleaseSignatureVerdict;
    /** Orchestrator run the verdict came from, when one was found. */
    runId?: string;
    /** electronic_signatures.id when a verifying signature was found. */
    signatureId?: number;
    detail?: string;
    /** This gate adds no blocker. */
    cleared: boolean;
  };
  /** Hard gate verdict for DISPATCH — structural + shadow + external +
   *  release-signature, composed. This is the transmit verdict and the one the
   *  readiness surface reports. */
  gate: DispatchGateResult;
  /** Hard gate verdict for FREEZE — the same gates, except that a release
   *  signature is not REQUIRED to freeze (a tampered one still blocks). Freeze
   *  is not transmit and carries its own Part 11 signature; see
   *  composeDispatchGatesForStep. */
  freezeGate: DispatchGateResult;
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
 * Compose every hard gate into the single dispatch verdict.
 *
 * Extracted as a PURE function so the SET of gates is testable without a
 * database. That matters more than it looks: each gate is individually unit
 * tested, but a gate that is never passed to `mergeDispatchGates` blocks
 * nothing, and a purely-unit-tested gate cannot detect its own absence from
 * the composition. This function is the one place the membership is asserted.
 *
 * Pure + exported for test, same idiom as evaluateShadowPresenceGate.
 */
export function composeDispatchGates(gates: {
  structural: DispatchGateResult;
  external: DispatchGateResult;
  shadowPresence: DispatchGateResult;
  releaseSignature: DispatchGateResult;
}): DispatchGateResult {
  return mergeDispatchGates(
    gates.structural,
    gates.external,
    gates.shadowPresence,
    gates.releaseSignature,
  );
}

/** The two governed sequence transitions this composition can be asked about. */
export type GovernedDispatchStep = 'freeze' | 'dispatch';

/**
 * The gate verdict for a specific governed step.
 *
 * ── Why the step matters ─────────────────────────────────────────────────────
 * `transitionSequenceGoverned` applies a composed gate to BOTH governed
 * transitions. Composing the release-signature gate into that one verdict
 * therefore made a TRANSMIT control block the FREEZE — and a release signature
 * comes from a signed package orchestrator run, so freezing any IND / NDA / BLA
 * / MAA sequence required signing a release first. That inverts the order the
 * product works in, for a control whose own module calls itself "the
 * transmit-time re-check" and "the provable pre-transmit rule".
 *
 * Freeze is not transmit: nothing leaves the building, and the step already
 * carries its own Part 11 signature — bound to this sequence, this step, this
 * actor and this leaf manifest (transitionSequenceGoverned Gate 1). So the
 * REQUIREMENT for a release signature governs `dispatch` only.
 *
 * What does NOT change is integrity. `evaluateReleaseSignatureGate` blocks an
 * `invalid` verdict unconditionally, including when a signature is not
 * required, because requiredness governs whether a signature must be PRESENT
 * and never whether a broken one may be ignored. Expressing the freeze case as
 * "not required" rather than "gate omitted" is what keeps that rule intact: a
 * tampered signature still blocks a freeze.
 *
 * Every other gate governs both steps, and the membership is pinned by test —
 * a gate added later cannot be dropped from the freeze verdict by omission.
 */
export function composeDispatchGatesForStep(
  parts: {
    structural: DispatchGateResult;
    external: DispatchGateResult;
    shadowPresence: DispatchGateResult;
    releaseSignature: ReleaseSignatureGateInput;
  },
  step: GovernedDispatchStep,
): DispatchGateResult {
  return composeDispatchGates({
    structural: parts.structural,
    external: parts.external,
    shadowPresence: parts.shadowPresence,
    releaseSignature: evaluateReleaseSignatureGate({
      ...parts.releaseSignature,
      required: step === 'dispatch' && parts.releaseSignature.required,
    }),
  });
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

  // 6c. Release-signature gate (21 CFR Part 11 §11.70). Until this landed, the
  //     entire dispatch path had no signature awareness at all: a sequence
  //     could be transmitted to the agency having never been e-signed, or
  //     having been signed over a DIFFERENT package than the one dispatching.
  //     The orchestrator's package.sign step proves a signature existed at
  //     BUILD time; dispatch is a separate, later act, so it re-checks — which
  //     is exactly the re-check the e-sig design doc reserves for transmit.
  //     Same shape as §6b: unsigned is not signature-clean, it is unsigned, and
  //     an undetermined lookup is not an absent requirement.
  const releaseSignature = await resolveReleaseSignatureStatus({
    submissionId: sequence.submissionId,
    organizationId,
  });
  const signatureRequired = isReleaseSignatureRequired(submissionApplicationType);
  const signatureInput = {
    required: signatureRequired,
    verdict: releaseSignature.verdict,
    detail: releaseSignature.detail,
  };
  const releaseSignatureGate = evaluateReleaseSignatureGate(signatureInput);

  // One set of parts, composed for each governed step. Dispatch is the transmit
  // verdict (every gate). Freeze drops only the REQUIREMENT for a release
  // signature — a control the §11.70 design reserves for transmit — and keeps
  // every other gate, including an integrity failure on a signature that does
  // exist. See composeDispatchGatesForStep.
  const gateParts = {
    structural: structuralGate,
    external: { cleared: externalGate.cleared, blockers: externalGate.blockers },
    shadowPresence: shadowPresenceGate,
    releaseSignature: signatureInput,
  };
  const gate = composeDispatchGatesForStep(gateParts, 'dispatch');
  const freezeGate = composeDispatchGatesForStep(gateParts, 'freeze');

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
    /** Release-signature state (§6c). `required` reports whether this
     *  submission type crosses the §11.70 boundary; `verdict` is the resolved
     *  state. Informational on the response — the blocking happens in `gate`. */
    releaseSignature: {
      required: signatureRequired,
      verdict: releaseSignature.verdict,
      runId: releaseSignature.runId,
      signatureId: releaseSignature.signatureId,
      detail: releaseSignature.detail,
      cleared: releaseSignatureGate.cleared,
    },
    gate,
    freezeGate,
    readiness,
    leafCount: leaves.length,
  };
}

export default { assessSequenceDispatchReadiness };
