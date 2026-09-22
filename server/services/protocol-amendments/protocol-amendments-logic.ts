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
/* Citations corrected 2026-09-22. FULL_BASIS cited 45 CFR 46.109(c), which is
   documentation of informed consent; the requirement that a change to approved
   research be reviewed before it is initiated is 46.108(a)(3)(iii) /
   21 CFR 56.108(a)(4), as lifecycle.ts already cites. ADMIN_BASIS cited
   46.103, which is assurances of compliance. No regulation defines an
   "administrative" amendment, so the basis now says that instead of citing a
   clause that does not. OPEN QUESTION for regulatory review, not settled here:
   the Common Rule reviews every change to approved research, so whether an
   "administrative" path can mean "no IRB review" is an IRB-procedure judgment.
   This classifier has no production caller today; do not wire it into anything
   user-facing until that is decided. */
const FULL_BASIS = '45 CFR 46.108(a)(3)(iii) / 21 CFR 56.108(a)(4) — a change to approved research requires IRB review and approval before it is initiated; substantive changes (major, or affecting consent or risk) go to the convened board, and 45 CFR 46.116 / 21 CFR 50.25 may require re-consent';
const ADMIN_BASIS = 'Sponsor-classified administrative change. No regulation defines this category; whether it needs IRB review, and by what procedure, is for the IRB under 45 CFR 46.108(a)(3)(iii) / 21 CFR 56.108(a)(4)';

export interface AmendmentImpactInput {
  amendmentType: AmendmentType;
  /** null = not declared. Never default it to false. */
  affectsConsent: boolean | null;
  affectsRisk: boolean | null;
}

export interface AmendmentImpactResult {
  /** 'undetermined' when the path turns on a declaration nobody made. */
  reviewPath: 'full' | 'expedited' | 'administrative' | 'undetermined';
  /** null when consent or risk impact was not declared and nothing declared settles it. */
  requiresReconsent: boolean | null;
  basis: string;
}

const UNDECLARED_BASIS =
  'Consent and/or risk impact not declared. Whether this amendment needs convened-board review and re-consent (45 CFR 46.109 / 46.116; 21 CFR 56.110) turns on that declaration, so it is not decided here.';

/**
 * Classify an amendment's review path and re-consent requirement. A major
 * amendment, or any amendment that affects informed consent or subject risk,
 * requires full convened-board review; changes affecting consent or risk also
 * require re-consent of enrolled subjects. Minor changes qualify for expedited
 * review. Administrative changes need neither (unless flagged consent/risk, which
 * escalates them). Pure — cited to 45 CFR 46 / 21 CFR 56.
 */
export function classifyAmendmentImpact(input: AmendmentImpactInput): AmendmentImpactResult {
  // A declared `true` settles it. An undeclared flag is not a `false`.
  const substantive = input.affectsConsent === true || input.affectsRisk === true;
  const undeclared = input.affectsConsent === null || input.affectsRisk === null;

  if (input.amendmentType === 'major' || substantive) {
    return {
      reviewPath: 'full',
      requiresReconsent: substantive ? true : undeclared ? null : false,
      basis: FULL_BASIS,
    };
  }
  if (undeclared) {
    return { reviewPath: 'undetermined', requiresReconsent: null, basis: UNDECLARED_BASIS };
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
