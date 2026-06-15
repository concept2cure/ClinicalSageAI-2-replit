/**
 * Pediatric study-plan obligations expert — the PLAN duty per market.
 *
 * Distinct from pediatric designation / eligibility (handled in
 * special-designations.ts), this service encodes the pediatric study-PLAN
 * obligation that attaches to a development/marketing program: which instrument
 * is required, when it is due relative to the development timeline, what waiver
 * and deferral routes exist, and which voluntary incentives are on offer. It is
 * the lifecycle judgement an RA pediatric lead makes when a new application
 * triggers a pediatric plan duty.
 *
 * Markets: FDA (US — PREA initial Pediatric Study Plan / iPSP + BPCA written
 * request), EMA (EU — Paediatric Investigation Plan / PIP agreed with the PDCO,
 * plus PUMA for off-patent products), PMDA (JP — no mandatory plan at the same
 * stage; pediatric development encouraged and discussable with PMDA).
 *
 * Pure / deterministic — no DB, no IO. The obligation catalog is a readiness
 * aid; the sponsor's regulatory affairs function and the agency remain the
 * authority for scope, exact timing, and waiver/deferral grants
 * (honest-by-construction). Where a market carries no mandatory plan duty the
 * assessor says so plainly rather than inventing one, and it throws rather than
 * guess for an unmodeled market.
 *
 * References:
 *  - FDA PREA: 21 USC 355c — pediatric assessment required for an NDA/BLA (or
 *    supplement) involving a new active ingredient, new indication, new dosage
 *    form, new dosing regimen, or new route of administration, unless a full or
 *    partial waiver or a deferral is granted; an initial Pediatric Study Plan
 *    (iPSP) is due no later than 60 days after the end-of-Phase-2 meeting.
 *  - FDA BPCA: 21 USC 355a — voluntary written-request pediatric studies earn a
 *    6-month pediatric-exclusivity incentive.
 *  - FDA iPSP guidance: "Pediatric Study Plans: Content of and Process for
 *    Submitting Initial PSPs and Amended Initial PSPs."
 *  - EMA PIP: Regulation (EC) No 1901/2006 — a Paediatric Investigation Plan is
 *    required for a marketing-authorisation application (and certain line
 *    extensions) unless covered by a class waiver, a product-specific waiver, or
 *    a deferral; the PIP application is submitted not later than completion of
 *    the human pharmacokinetic studies in adults (≈ end of Phase 1) and agreed
 *    with the Paediatric Committee (PDCO). PUMA supports off-patent products
 *    developed for children.
 *  - PMDA: PMD Act / MHLW — no mandatory PIP/PSP at the same development stage;
 *    pediatric development is encouraged, may be discussed with PMDA, and can
 *    inform the re-examination period. Confirm local requirements.
 *
 * @module server/services/global-ri/pediatric-requirements
 */

export type PediatricMarket = 'FDA' | 'EMA' | 'PMDA';

/** The set of modeled markets for pediatric plan obligations. */
export const PEDIATRIC_MARKETS: PediatricMarket[] = ['FDA', 'EMA', 'PMDA'];

export interface PediatricObligation {
  /** Program / framework name for the market. */
  program: string;
  /** The pediatric plan instrument (e.g. an iPSP, a PIP). */
  instrument: string;
  /** When the plan is due relative to the development timeline. */
  timing: string;
  /** Short name of the plan document. */
  planName: string;
  /** The available waiver routes for the market. */
  waiverOptions: string[];
  /** Whether a deferral of pediatric studies is available. */
  deferralAvailable: boolean;
  /** The voluntary incentive (if any) tied to pediatric studies. */
  incentive: string;
  /** Legal citation(s). */
  citation: string;
}

/** Encoded pediatric study-plan obligations, by market. */
export const PEDIATRIC_REFERENCE: Record<PediatricMarket, PediatricObligation> = {
  FDA: {
    program: 'Pediatric Research Equity Act (PREA), with Best Pharmaceuticals for Children Act (BPCA)',
    instrument: 'Initial Pediatric Study Plan (iPSP)',
    timing:
      'iPSP due no later than 60 days after the end-of-Phase-2 meeting; applies to an NDA/BLA (or supplement) for a new active ingredient, new indication, new dosage form, new dosing regimen, or new route of administration.',
    planName: 'Initial Pediatric Study Plan (iPSP)',
    waiverOptions: ['Full waiver', 'Partial waiver'],
    deferralAvailable: true,
    incentive:
      'BPCA voluntary written-request pediatric studies earn 6 months of additional market exclusivity (pediatric exclusivity).',
    citation: 'PREA (21 USC 355c); BPCA (21 USC 355a); FDA iPSP guidance',
  },
  EMA: {
    program: 'Paediatric Regulation (EU) — Paediatric Investigation Plan (PIP)',
    instrument: 'Paediatric Investigation Plan (PIP)',
    timing:
      'PIP application submitted not later than completion of the human pharmacokinetic studies in adults (≈ end of Phase 1) and agreed with the Paediatric Committee (PDCO); required for a marketing-authorisation application and certain line extensions.',
    planName: 'Paediatric Investigation Plan (PIP)',
    waiverOptions: ['Class waiver', 'Product-specific waiver'],
    deferralAvailable: true,
    incentive:
      'A completed agreed PIP can earn rewards (e.g. a 6-month SPC extension); PUMA (Paediatric-Use Marketing Authorisation) supports off-patent products developed for children.',
    citation: 'Regulation (EC) No 1901/2006',
  },
  PMDA: {
    program: 'PMDA / MHLW pediatric development (encouraged; no mandatory plan at the same stage)',
    instrument: 'No mandatory pediatric study plan (development plan discussable with PMDA)',
    timing:
      'No mandatory PIP/PSP at the same development stage; pediatric development is encouraged, may be discussed with PMDA, and can inform the re-examination period. Confirm local requirements.',
    planName: 'No mandatory plan (voluntary pediatric development plan)',
    waiverOptions: [],
    deferralAvailable: false,
    incentive:
      'Pediatric development is encouraged and can inform/extend the re-examination period; confirm applicable incentives with PMDA.',
    citation: 'PMD Act; MHLW',
  },
};

export type PediatricPlanStatus =
  | 'satisfied'
  | 'plan_outstanding'
  | 'waiver_or_deferral_pending'
  | 'not_applicable';

export interface PediatricPlanInput {
  market: PediatricMarket;
  /**
   * Whether the application triggers the pediatric-plan requirement (e.g. a new
   * active ingredient, new indication, new dosage form, new dosing regimen, or
   * new route of administration). Defaults to true for FDA/EMA.
   */
  triggersRequirement?: boolean;
  /** Whether the pediatric plan (iPSP/PIP) has been submitted/agreed. */
  planSubmitted?: boolean;
  /** Whether a waiver of pediatric studies has been requested. */
  waiverRequested?: boolean;
  /** Whether a deferral of pediatric studies has been requested. */
  deferralRequested?: boolean;
}

export interface PediatricPlanAssessment {
  market: PediatricMarket;
  required: boolean;
  planName: string;
  dueTiming: string;
  status: PediatricPlanStatus;
  /** Concrete, ordered next-step actions. */
  actions: string[];
  /** Deterministic, ordered advisory notes. */
  notes: string[];
}

/**
 * Return the encoded pediatric study-plan obligation for a market (for a
 * reference/checklist UI). Throws for an unmodeled market.
 */
export function getPediatricObligation(market: PediatricMarket): PediatricObligation {
  const ref = PEDIATRIC_REFERENCE[market];
  if (!ref) throw new Error(`No pediatric obligation modeled for market "${market}".`);
  return ref;
}

/**
 * Assess a program's pediatric study-plan posture for a market.
 *
 * PMDA carries no mandatory plan at the same development stage, so it is
 * reported required=false with status 'not_applicable' and an explanatory note.
 * For FDA/EMA the requirement applies unless the application does not trigger it
 * (triggersRequirement === false). When required, a submitted/agreed plan is
 * 'satisfied'; a requested waiver or deferral is 'waiver_or_deferral_pending';
 * otherwise the plan is 'plan_outstanding'.
 *
 * Pure / deterministic. Actions and notes are sorted for stable output. Throws
 * for an unmodeled market.
 */
export function assessPediatricPlan(input: PediatricPlanInput): PediatricPlanAssessment {
  const ref = PEDIATRIC_REFERENCE[input.market];
  if (!ref) throw new Error(`No pediatric obligation modeled for market "${input.market}".`);

  const actions: string[] = [];
  const notes: string[] = [];

  // PMDA — no mandatory plan obligation at the same development stage.
  if (input.market === 'PMDA') {
    notes.push(
      'PMDA does not require a mandatory pediatric study plan at the same development stage; pediatric development is encouraged.',
    );
    notes.push('Pediatric development may be discussed with PMDA and can inform the re-examination period.');
    notes.push('Confirm local pediatric data requirements with PMDA.');
    actions.push('Consider discussing a voluntary pediatric development plan with PMDA.');
    actions.push(ref.incentive);
    actions.sort((a, b) => a.localeCompare(b));
    notes.sort((a, b) => a.localeCompare(b));
    return {
      market: input.market,
      required: false,
      planName: ref.planName,
      dueTiming: ref.timing,
      status: 'not_applicable',
      actions,
      notes,
    };
  }

  // FDA / EMA — required unless the application does not trigger the duty.
  const required = input.triggersRequirement !== false;

  if (!required) {
    notes.push(
      `The application does not trigger the ${ref.program} pediatric-plan requirement (no new active ingredient/indication/dosage form/dosing regimen/route).`,
    );
    notes.push('Re-assess if the application scope changes.');
    actions.push('Confirm the trigger analysis with regulatory affairs; no pediatric plan is required on current scope.');
    actions.sort((a, b) => a.localeCompare(b));
    notes.sort((a, b) => a.localeCompare(b));
    return {
      market: input.market,
      required: false,
      planName: ref.planName,
      dueTiming: ref.timing,
      status: 'not_applicable',
      actions,
      notes,
    };
  }

  notes.push(`Citation: ${ref.citation}.`);
  notes.push(`Incentive: ${ref.incentive}`);

  let status: PediatricPlanStatus;

  if (input.planSubmitted) {
    status = 'satisfied';
    actions.push(`Maintain the agreed ${ref.planName} and amend it if the development plan changes.`);
    if (input.market === 'EMA') {
      actions.push('Track agreed PIP measures to compliance check at the time of the marketing-authorisation application.');
    } else {
      actions.push('Track agreed iPSP pediatric studies and report progress to FDA.');
    }
  } else if (input.waiverRequested || input.deferralRequested) {
    status = 'waiver_or_deferral_pending';
    if (input.waiverRequested) {
      actions.push(
        `Submit and justify the waiver request (${ref.waiverOptions.join(' or ')}); pediatric assessment is not required if granted.`,
      );
    }
    if (input.deferralRequested) {
      actions.push('Submit and justify the deferral request to conduct pediatric studies after adult approval.');
    }
    notes.push('A waiver or deferral request does not, by itself, satisfy the obligation until the agency grants it.');
  } else {
    status = 'plan_outstanding';
    actions.push(`Prepare and submit the ${ref.planName}: ${ref.timing}`);
    actions.push(
      `Alternatively, request a waiver (${ref.waiverOptions.join(' or ')}) or a deferral if pediatric studies are not warranted now.`,
    );
  }

  actions.sort((a, b) => a.localeCompare(b));
  notes.sort((a, b) => a.localeCompare(b));

  return {
    market: input.market,
    required,
    planName: ref.planName,
    dueTiming: ref.timing,
    status,
    actions,
    notes,
  };
}
