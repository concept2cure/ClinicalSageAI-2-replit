/**
 * Protocol Amendments deterministic logic (Capability C2C-18a)
 *
 * Pure, DB-free, LLM-free: classify an amendment's IRB review path and re-consent
 * requirement from its type + consent/risk flags, and evaluate submission
 * readiness. Grounded in 45 CFR 46.110 / 21 CFR 56.110 (expedited review of minor
 * changes to approved research), 45 CFR 46.109(c) (continuing/amendment review),
 * and 45 CFR 46.116 (re-consent when changes affect a subject's willingness to
 * continue). These are the deterministic gates the service and routes enforce.
 *
 * @module server/services/protocol-amendments/protocol-amendments-logic
 */

export type AmendmentType = 'major' | 'minor' | 'administrative';
export type AmendmentStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'implemented';

const EXPEDITED_BASIS = '45 CFR 46.110 / 21 CFR 56.110 — minor changes to previously approved research may be reviewed by expedited procedure';
const FULL_BASIS = '45 CFR 46.109(c) / 46.116 — substantive changes (major, or affecting consent or risk) require convened-board review and may require re-consent';
const ADMIN_BASIS = '45 CFR 46.103 — administrative/non-substantive changes are tracked but do not alter the risk/benefit assessment';

export interface AmendmentImpactInput {
  amendmentType: AmendmentType;
  affectsConsent: boolean;
  affectsRisk: boolean;
}

export interface AmendmentImpactResult {
  reviewPath: 'full' | 'expedited' | 'administrative';
  requiresReconsent: boolean;
  basis: string;
}

/**
 * Classify an amendment's review path and re-consent requirement. A major
 * amendment, or any amendment that affects informed consent or subject risk,
 * requires full convened-board review; changes affecting consent or risk also
 * require re-consent of enrolled subjects. Minor changes qualify for expedited
 * review. Administrative changes need neither (unless flagged consent/risk, which
 * escalates them). Pure — cited to 45 CFR 46 / 21 CFR 56.
 */
export function classifyAmendmentImpact(input: AmendmentImpactInput): AmendmentImpactResult {
  const substantive = input.affectsConsent || input.affectsRisk;

  if (input.amendmentType === 'major' || substantive) {
    return {
      reviewPath: 'full',
      requiresReconsent: substantive,
      basis: FULL_BASIS,
    };
  }
  if (input.amendmentType === 'minor') {
    return { reviewPath: 'expedited', requiresReconsent: false, basis: EXPEDITED_BASIS };
  }
  return { reviewPath: 'administrative', requiresReconsent: false, basis: ADMIN_BASIS };
}

export interface AmendmentReadinessInput {
  status: AmendmentStatus;
  changeCount: number;
}

export interface AmendmentReadinessResult {
  readyToSubmit: boolean;
  blockers: string[];
}

/**
 * Evaluate whether a draft amendment is ready to submit: it must be in `draft`
 * status and carry at least one change line item. Pure — the gate the service
 * enforces on the draft → submitted transition.
 */
export function evaluateAmendmentReadiness(input: AmendmentReadinessInput): AmendmentReadinessResult {
  const blockers: string[] = [];
  if (input.status !== 'draft') {
    blockers.push(`Amendment is "${input.status.replace('_', ' ')}"; only a draft can be submitted.`);
  }
  if (input.changeCount < 1) {
    blockers.push('Amendment has no change items; add at least one change before submitting.');
  }
  return { readyToSubmit: blockers.length === 0, blockers };
}
