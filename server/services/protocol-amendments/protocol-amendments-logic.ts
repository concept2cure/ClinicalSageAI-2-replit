/**
 * Protocol Amendments deterministic logic (Capability C2C-18a)
 *
 * Pure, DB-free, LLM-free. For an amendment to approved research this reports
 * three separate things, because they are decided by different bodies under
 * different rules and must not be collapsed into one answer:
 *
 *   1. IRB review. ALWAYS required. No US regulation lets a change to approved
 *      research be implemented without IRB review and approval; the only
 *      exception is a change needed to eliminate apparent immediate hazards,
 *      which is made first and reported promptly (45 CFR 46.108(a)(3)(iii);
 *      21 CFR 56.108(a)(4); 21 CFR 312.66). What varies is the PROCEDURE:
 *      expedited review is available for "minor changes in previously approved
 *      research" (45 CFR 46.110(b)(1)(ii); 21 CFR 56.110(b)(2)), and everything
 *      else goes to a convened meeting (45 CFR 46.108(b); 21 CFR 56.108(c)).
 *      Whether a change is minor is the IRB's determination, not the sponsor's.
 *   2. Re-consent. Never decided here. Neither regulation uses the term; the
 *      consent element is a promise that significant new findings relating to
 *      willingness to continue will be provided (45 CFR 46.116(c)(5); 21 CFR
 *      50.25(b)(5)), and the IRB decides whether and how enrolled subjects are
 *      told (45 CFR 46.109(b); 21 CFR 56.109(b); FDA, Informed Consent guidance,
 *      August 2023). So there is no "required" and no "not required" value.
 *   3. FDA protocol amendment, for an IND study only (21 CFR 312.30(b)). An
 *      IRB-minor change can still require one: adding a safety-monitoring test
 *      is a listed 312.30(b)(1)(iii) example.
 *
 * ── Rewritten 2026-09-22 from primary-source research ────────────────────────
 * The previous version returned a reviewPath of 'administrative' meaning no
 * IRB review, which no regulation supports; the ICH E6(R2) 3.3.7/4.5.2
 * "logistical or administrative" carve-out is guidance and cannot override
 * the regulations above. It forced convened review for any consent change
 * (a consent change can be minor), returned `requiresReconsent: true/false` as
 * if the engine could decide it, and cited 45 CFR 46.109(c) — documentation
 * of consent — for amendment review. Research record:
 * docs/evidence/REGULATORY-SME/2026-09-22/.
 *
 * @module server/services/protocol-amendments/protocol-amendments-logic
 */

/** The sponsor's own label. Not a regulatory category in any jurisdiction. */
export type AmendmentType = 'major' | 'minor' | 'administrative';
export type AmendmentStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'implemented';

// ─── Citations ───────────────────────────────────────────────────────────────

export const IRB_REVIEW_REQUIRED_BASIS =
  '45 CFR 46.108(a)(3)(iii); 21 CFR 56.108(a)(4); 21 CFR 312.66 — a change to approved research must be reviewed and approved by the IRB before it is implemented, except when necessary to eliminate apparent immediate hazards to subjects';
const EXPEDITED_BASIS =
  '45 CFR 46.110(b)(1)(ii); 21 CFR 56.110(b)(2) — minor changes in previously approved research during the period for which approval is authorized may be reviewed by expedited procedure (the IRB chair or a designated experienced member). Whether the change is minor is the IRB\'s determination, and an expedited reviewer may not disapprove: disapproval needs the convened IRB';
const CONVENED_BASIS =
  '45 CFR 46.108(b); 21 CFR 56.108(c) — except when an expedited review procedure is used, research is reviewed at a convened meeting with a majority of members present, including at least one member whose primary concerns are nonscientific, and approved by a majority of those present. Expedited review of a change is available only for minor changes (45 CFR 46.110(b)(1)(ii); 21 CFR 56.110(b)(2)), so a change that is not minor goes to the convened IRB';
const ADMIN_LABEL_NOTE =
  'The sponsor labelled this change administrative. No US regulation exempts a change to approved research from IRB review (45 CFR 46.108(a)(3)(iii); 21 CFR 56.108(a)(4); 21 CFR 312.66). ICH E6, which FDA has adopted as guidance, describes changes involving only logistical or administrative aspects of the trial (for example a new monitor or telephone number) as not needing prior IRB/IEC approval; guidance does not override the regulations, and whether such an item is a change in approved research at all is for the IRB\'s written procedures. Otherwise the IRB may review it as a minor change by expedited procedure.';
const RISK_NOT_MINOR_NOTE =
  'The sponsor declared that the change increases risk to subjects or adversely alters the risk/benefit balance. This platform treats such a change as not minor and routes it to the convened IRB — a conservative reading consistent with SACHRP\'s advisory definition of a minor change (one that does not materially increase risk), not a rule stated in the regulations. The IRB decides, and must find the approval criteria still met (45 CFR 46.111(a)(1)-(2); 21 CFR 56.111(a)(1)-(2)).';
const MAJOR_NOTE =
  'The sponsor labelled this change major. Routed to the convened IRB as this platform\'s conservative default, not a regulatory requirement: if the research as amended is minimal risk and falls in an expedited-review category (45 CFR 46.110(b)(1)(i); 21 CFR 56.110(b)(1)) the IRB may still expedite it. This classifier has no input for that and does not assume it.';
const RECONSENT_BASIS =
  '45 CFR 46.116(c)(5); 21 CFR 50.25(b)(5) — when appropriate, the consent includes a statement that significant new findings developed during the research that may relate to the subject\'s willingness to continue will be provided. Whether and how currently enrolled subjects are informed or re-consented is the IRB\'s determination (45 CFR 46.109(b); 21 CFR 56.109(b); FDA, Informed Consent: Guidance for IRBs, Clinical Investigators, and Sponsors, August 2023). Revised consent materials need IRB approval before use (21 CFR 56.108(a)(4); 45 CFR 46.108(a)(3)(iii)).';
const FDA_312_30_B1 =
  '21 CFR 312.30(b)(1) — a protocol amendment is required for any change in a Phase 1 protocol that significantly affects the safety of subjects, or any change in a Phase 2 or 3 protocol that significantly affects the safety of subjects, the scope of the investigation, or the scientific quality of the study';
const FDA_IMPLEMENT =
  '21 CFR 312.30(b)(2)(i), (e) — submitted to FDA before implementation; the change may be made once it has been submitted to FDA and approved by the IRB, in either order. FDA does not approve a protocol amendment, and can still place the investigation on clinical hold (21 CFR 312.42). A change to eliminate an apparent immediate hazard may be made first, then reported (312.30(b)(2)(ii))';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AmendmentImpactInput {
  /** The sponsor's label; null when not recorded. */
  amendmentType: AmendmentType | null;
  /** Does the change affect the informed-consent content? null = not declared. */
  affectsConsent: boolean | null;
  /**
   * Does the change INCREASE risk to subjects or adversely alter the
   * risk/benefit balance? A risk-reducing change is not this. null = not declared.
   */
  affectsRisk: boolean | null;
  /** Conducted under a US IND? null / omitted = not recorded. */
  isIndStudy?: boolean | null;
  /** Clinical phase as recorded ('1', '2', '3', '1/2', 'Phase 1' ...). */
  phase?: string | null;
}

export type IrbReviewPath = 'convened' | 'expedited_eligible' | 'undetermined';
export type ReconsentStatus = 'irb_determination_required' | 'no_indicator_declared' | 'undetermined';
export type FdaAmendmentStatus =
  | 'required'
  | 'sponsor_determination_required'
  | 'not_required_per_sponsor_label'
  | 'not_applicable'
  | 'undetermined';

export interface AmendmentImpactResult {
  irbReview: {
    /** Always true: there is no US path that skips IRB review. */
    required: true;
    path: IrbReviewPath;
    decidedBy: 'IRB';
    basis: string;
    notes: string[];
  };
  reconsent: {
    status: ReconsentStatus;
    decidedBy: 'IRB';
    message: string;
    basis: string;
  };
  fdaSubmission: {
    status: FdaAmendmentStatus;
    /** The 21 CFR 312.30(d) title the submission must carry, when one is required. */
    label: 'Protocol Amendment: Change in Protocol' | null;
    basis: string;
  };
  sponsorLabel: AmendmentType | null;
}

// ─── Classification ──────────────────────────────────────────────────────────

function irbReview(input: AmendmentImpactInput): AmendmentImpactResult['irbReview'] {
  const base = { required: true as const, decidedBy: 'IRB' as const };
  if (input.affectsRisk === true) {
    return { ...base, path: 'convened', basis: `${IRB_REVIEW_REQUIRED_BASIS}. ${CONVENED_BASIS}`, notes: [RISK_NOT_MINOR_NOTE] };
  }
  if (input.amendmentType === 'major') {
    return { ...base, path: 'convened', basis: `${IRB_REVIEW_REQUIRED_BASIS}. ${CONVENED_BASIS}`, notes: [MAJOR_NOTE] };
  }
  if (input.amendmentType === null || input.affectsRisk === null) {
    const missing = [input.amendmentType === null ? 'the amendment type' : null, input.affectsRisk === null ? 'whether it increases risk to subjects' : null]
      .filter(Boolean).join(' and ');
    return {
      ...base,
      path: 'undetermined',
      basis: IRB_REVIEW_REQUIRED_BASIS,
      notes: [`IRB review is required either way. Whether expedited review is available turns on ${missing}, which is not recorded, so the procedure is not decided here (${EXPEDITED_BASIS.split(' — ')[0]}; ${CONVENED_BASIS.split(' — ')[0]}).`],
    };
  }
  // minor or administrative, risk declared not increased. A consent change does
  // not by itself make a change non-minor.
  const notes = input.amendmentType === 'administrative' ? [ADMIN_LABEL_NOTE] : [];
  return { ...base, path: 'expedited_eligible', basis: `${IRB_REVIEW_REQUIRED_BASIS}. ${EXPEDITED_BASIS}`, notes };
}

function reconsent(input: AmendmentImpactInput): AmendmentImpactResult['reconsent'] {
  const base = { decidedBy: 'IRB' as const, basis: RECONSENT_BASIS };
  if (input.affectsConsent === true || input.affectsRisk === true) {
    return {
      ...base,
      status: 'irb_determination_required',
      message:
        'The IRB determines whether currently enrolled, actively participating subjects to whom the change applies must be given this information and an opportunity to affirm their willingness to continue, and by what method (a revised consent document, or an alternative such as an addendum or information sheet). Document the communication of the new information (ICH E6(R2) 4.8.2).',
    };
  }
  if (input.affectsConsent === null || input.affectsRisk === null) {
    const missing = [input.affectsConsent === null ? 'consent impact' : null, input.affectsRisk === null ? 'risk impact' : null].filter(Boolean).join(' and ');
    return { ...base, status: 'undetermined', message: `Not assessed: ${missing} not declared. An undeclared impact is not a "no".` };
  }
  return {
    ...base,
    status: 'no_indicator_declared',
    message:
      'The sponsor declared no consent or risk impact. This is NOT a determination that enrolled subjects need not be informed: the trigger is new information relevant to willingness to continue (for example added costs or visit burden), which these two declarations do not fully capture, and the IRB may still require it.',
  };
}

/** '1', 'Phase 1', 'I' → true; '1/2', '2', '3' → false; unrecorded → null. */
function isPhaseOneOnly(phase: string | null | undefined): boolean | null {
  if (!phase || !phase.trim()) return null;
  const p = phase.trim().toLowerCase().replace(/^phase\s*/, '');
  if (/^(1|i)$/.test(p)) return true;
  return false;
}

/** A combined Phase 1/2 (or I/II) study: no primary text says which 312.30(b)(1) test applies. */
function isCombinedPhaseOne(phase: string | null | undefined): boolean {
  if (!phase) return false;
  return /^(phase\s*)?(1|i)\s*[/-]\s*(2|ii)\b/i.test(phase.trim());
}

function fdaSubmission(input: AmendmentImpactInput): AmendmentImpactResult['fdaSubmission'] {
  if (input.isIndStudy === false) {
    return { status: 'not_applicable', label: null, basis: '21 CFR 312.30 applies to studies under a US IND; this study is recorded as not an IND study. IRB review of the change is still required.' };
  }
  if (input.isIndStudy !== true) {
    return { status: 'undetermined', label: null, basis: 'Whether this study is conducted under a US IND is not recorded, so whether an FDA protocol amendment (21 CFR 312.30(b)) is needed is not decided here.' };
  }
  const phaseOne = isPhaseOneOnly(input.phase);
  const phaseNote = phaseOne === null
    ? ' Phase is not recorded, so the Phase 2/3 test (safety, scope or scientific quality) is applied as the conservative default.'
    : isCombinedPhaseOne(input.phase)
      ? ' This is a combined Phase 1/2 study; no regulatory text settles which test applies, so the Phase 2/3 test is applied as the conservative default.'
      : '';
  if (input.affectsRisk === true) {
    return {
      status: 'required',
      label: 'Protocol Amendment: Change in Protocol',
      basis: `${FDA_312_30_B1}. The sponsor declared the change increases risk to subjects, which this platform treats as significantly affecting subject safety (a conservative default; the determination is the sponsor's). ${FDA_IMPLEMENT}.`,
    };
  }
  if (input.amendmentType === 'major') {
    if (phaseOne === true) {
      return {
        status: 'sponsor_determination_required',
        label: null,
        basis: `${FDA_312_30_B1}. For a Phase 1 protocol only a change that significantly affects subject safety requires an amendment; the sponsor must record whether this one does. A significant Phase 1 modification not submitted as an amendment goes in the next IND annual report (21 CFR 312.33(e)).`,
      };
    }
    return {
      status: 'required',
      label: 'Protocol Amendment: Change in Protocol',
      basis: `${FDA_312_30_B1}. The sponsor labelled the change major, which this platform treats as meeting the test (a conservative default; the label alone does not establish it).${phaseNote} ${FDA_IMPLEMENT}.`,
    };
  }
  if (input.amendmentType === 'minor') {
    return {
      status: 'sponsor_determination_required',
      label: null,
      basis: `${FDA_312_30_B1}. An IRB-minor change can still require an FDA amendment — the listed examples are any increase in dose or in duration of exposure (312.30(b)(1)(i)), adding or dropping a control group (312.30(b)(1)(ii)), and adding or dropping a safety-monitoring test (312.30(b)(1)(iii)); for a Phase 1 protocol only changes that significantly affect safety count. The sponsor must record whether the change meets the test.${phaseNote}`,
    };
  }
  if (input.amendmentType === 'administrative') {
    return {
      status: 'not_required_per_sponsor_label',
      label: null,
      basis: `${FDA_312_30_B1}. No regulation defines "administrative"; on the sponsor's label this change affects none of these, and a change that genuinely affects none of them does not require a protocol amendment; the sponsor may still submit one, and must keep the IND's protocols current (21 CFR 312.30).${phaseOne === true ? ' For Phase 1, a significant protocol modification not submitted as an amendment is described in the IND annual report (21 CFR 312.33(e)).' : ''} If the change alters dose, exposure, a control group or a safety test, the "administrative" label is wrong and an amendment is required.`,
    };
  }
  return { status: 'undetermined', label: null, basis: `${FDA_312_30_B1}. The amendment type is not recorded, so this is not decided here.` };
}

/**
 * Classify an amendment: IRB review (always required; the procedure varies),
 * re-consent (always the IRB's determination), and FDA protocol-amendment
 * status (IND studies only). Pure. Undeclared inputs are never read as "no".
 */
export function classifyAmendmentImpact(input: AmendmentImpactInput): AmendmentImpactResult {
  return {
    irbReview: irbReview(input),
    reconsent: reconsent(input),
    fdaSubmission: fdaSubmission(input),
    sponsorLabel: input.amendmentType,
  };
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
