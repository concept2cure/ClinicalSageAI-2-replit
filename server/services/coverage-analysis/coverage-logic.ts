/**
 * Medicare Coverage Analysis deterministic logic (Capability C2C-15)
 *
 * Pure, DB-free, LLM-free: the "qualifying clinical trial" determination, the
 * per-item Medicare billing-designation classifier, the analysis readiness gate,
 * and the exportable billing grid. This is the legal core — the billing
 * designation is always the output of these deterministic functions; any LLM
 * text is advisory rationale only.
 *
 * Grounded in Medicare NCD 310.1 ("Routine Costs in Clinical Trials"), the
 * Medicare National Coverage Determinations Manual §310.1, and 42 CFR 405.211.
 * Cited where it matters.
 *
 * NOTE: this advises an institution's coverage analysis; it is not a billing
 * guarantee. Final billing / False Claims Act compliance remains the AMC's
 * responsibility.
 *
 * @module server/services/coverage/coverage-logic
 */

export const NCD_310_1 = 'NCD 310.1 — Routine Costs in Clinical Trials';
export const CFR_405_211 = '42 CFR 405.211 — coverage of routine costs in a qualifying clinical trial';

// ─── Qualifying clinical trial determination (NCD 310.1) ─────────────────────

export interface QualifyingCriteriaInput {
  /** Required: evaluates a therapeutic/diagnostic intervention, not solely safety/dosing. */
  hasTherapeuticIntent: boolean;
  /** Required: enrolls patients with the diagnosis/condition under study (not solely healthy volunteers). */
  enrollsDiagnosisTreatment: boolean;
  /** Required: principal purpose falls within a Medicare benefit category. */
  hasMedicareBenefitCategory: boolean;
  /** "Deemed" qualifying: IND trial, IDE Category B device trial, or AHRQ/federally funded — auto-qualifies. */
  deemedQualifying?: boolean;
  /** Count of the 7 desirable characteristics met (0..7). Advisory only — never blocks. */
  desirableCharacteristicsCount?: number;
}

export interface QualifyingCriterion {
  key: string;
  label: string;
  met: boolean;
  basis: string;
}

export interface QualifyingTrialResult {
  determination: 'qualifying' | 'non_qualifying';
  /** True when qualifying status came from the "deemed" short-circuit. */
  deemed: boolean;
  /** The three required criteria and whether each is met. */
  requiredCriteria: QualifyingCriterion[];
  /** Keys of the required criteria not met (empty when deemed or all met). */
  unmetCriteria: string[];
  /** Echoed advisory count (0..7), clamped. */
  desirableCharacteristicsCount: number;
  rationale: string;
}

/**
 * Determine whether a clinical trial is a "qualifying clinical trial" under
 * NCD 310.1, the gate for Medicare coverage of routine costs. A trial that is
 * deemed (IND / IDE Cat B / AHRQ- or federally-funded) automatically qualifies;
 * otherwise all three required characteristics must hold. The seven desirable
 * characteristics are advisory and never block the determination. Pure.
 */
export function evaluateQualifyingTrial(input: QualifyingCriteriaInput): QualifyingTrialResult {
  const desirable = Math.max(0, Math.min(7, Math.trunc(input.desirableCharacteristicsCount ?? 0)));
  const requiredCriteria: QualifyingCriterion[] = [
    { key: 'therapeutic_intent', label: 'Evaluates an item/service within a Medicare benefit category with therapeutic intent (not solely safety/dose-finding)', met: !!input.hasTherapeuticIntent, basis: NCD_310_1 },
    { key: 'diagnosis_treatment', label: 'Enrolls patients with a diagnosed condition rather than healthy volunteers (except diagnostic trials)', met: !!input.enrollsDiagnosisTreatment, basis: NCD_310_1 },
    { key: 'medicare_benefit_category', label: 'Principal purpose is to test whether the intervention improves outcomes within a Medicare benefit category', met: !!input.hasMedicareBenefitCategory, basis: CFR_405_211 },
  ];

  if (input.deemedQualifying) {
    return {
      determination: 'qualifying',
      deemed: true,
      requiredCriteria,
      unmetCriteria: [],
      desirableCharacteristicsCount: desirable,
      rationale: `Trial is deemed a qualifying clinical trial (IND / IDE Category B / AHRQ- or federally-funded) and automatically meets the qualifying criteria (${NCD_310_1}).`,
    };
  }

  const unmetCriteria = requiredCriteria.filter((c) => !c.met).map((c) => c.key);
  const determination = unmetCriteria.length === 0 ? 'qualifying' : 'non_qualifying';
  const rationale = determination === 'qualifying'
    ? `All three required qualifying characteristics are met — routine costs are coverable (${NCD_310_1}; ${CFR_405_211}).`
    : `Trial is not a qualifying clinical trial — unmet required criteria: ${unmetCriteria.join(', ')}. Medicare does not cover routine costs in a non-qualifying trial (${NCD_310_1}).`;

  return { determination, deemed: false, requiredCriteria, unmetCriteria, desirableCharacteristicsCount: desirable, rationale };
}

// ─── Per-item billing-designation classifier ─────────────────────────────────

export type ItemClassification = 'routine_cost' | 'research_paid' | 'standard_of_care' | 'unclear';
export type BillingDesignation = 'bill_medicare' | 'bill_sponsor' | 'bill_standard_of_care' | 'do_not_bill' | 'hold';

export interface ItemClassificationInput {
  /** Whether the parent trial is a qualifying clinical trial (from evaluateQualifyingTrial). */
  trialQualifies: boolean;
  /** Would this item be furnished as conventional care absent the trial? */
  isStandardOfCare: boolean;
  /** Is this item promised free / paid by the sponsor per the CTA or informed consent? */
  sponsorPaidInBudget: boolean;
  itemDescription?: string;
}

export interface ItemClassificationResult {
  classification: ItemClassification;
  billingDesignation: BillingDesignation;
  citation: string;
  rationale: string;
}

/**
 * Classify a single protocol item to a Medicare billing designation. Deterministic
 * decision table (the high-liability core):
 *  1. Sponsor-paid → research cost, bill the sponsor. Billing Medicare for an item
 *     the sponsor already pays for is double-billing / False Claims Act exposure.
 *  2. Standard-of-care (and not sponsor-paid) → bill the patient's usual payer as
 *     it would be billed absent the trial.
 *  3. Qualifying trial (and not SOC / sponsor-paid) → routine cost, billable to
 *     Medicare under NCD 310.1.
 *  4. Otherwise (non-qualifying trial, not SOC, not sponsor-paid) → unclear; hold.
 *     Medicare does not cover routine costs in a non-qualifying trial.
 * Pure. The order of evaluation is itself the rule and must not be reordered.
 */
export function classifyCoverageItem(input: ItemClassificationInput): ItemClassificationResult {
  if (input.sponsorPaidInBudget) {
    return {
      classification: 'research_paid',
      billingDesignation: 'bill_sponsor',
      citation: NCD_310_1,
      rationale: `Item is paid by the sponsor (promised free in the study budget / informed consent). Bill the sponsor — billing Medicare would be double-billing (${NCD_310_1}; False Claims Act exposure).`,
    };
  }
  if (input.isStandardOfCare) {
    return {
      classification: 'standard_of_care',
      billingDesignation: 'bill_standard_of_care',
      citation: NCD_310_1,
      rationale: `Item is standard of care that would be furnished absent the trial. Bill the patient's usual payer as conventional care (${NCD_310_1}).`,
    };
  }
  if (input.trialQualifies) {
    return {
      classification: 'routine_cost',
      billingDesignation: 'bill_medicare',
      citation: `${NCD_310_1}; ${CFR_405_211}`,
      rationale: `Routine cost of a qualifying clinical trial (conventional care, administration/monitoring of the investigational item, or complication management). Billable to Medicare (${NCD_310_1}; ${CFR_405_211}).`,
    };
  }
  return {
    classification: 'unclear',
    billingDesignation: 'hold',
    citation: NCD_310_1,
    rationale: `Trial is not a qualifying clinical trial and the item is neither standard of care nor sponsor-paid — Medicare does not cover routine costs here. Hold and resolve before billing (${NCD_310_1}).`,
  };
}

// ─── Readiness gate ──────────────────────────────────────────────────────────

export interface ReadinessItemView {
  classification: ItemClassification;
  billingDesignation: BillingDesignation;
  icd10Validated: boolean;
}

export interface CoverageReadinessInput {
  qualifyingDetermination: 'pending' | 'qualifying' | 'non_qualifying';
  items: ReadinessItemView[];
}

export interface CoverageReadiness {
  readyToFinalize: boolean;
  blockers: string[];
  warnings: string[];
  itemCount: number;
  unclassifiedCount: number;
}

/**
 * Readiness gate for finalizing a coverage analysis / exporting the billing grid.
 * Blockers: qualifying determination still pending, no items, or any item left
 * unclear / on hold. Warnings: items whose ICD-10 indication is not validated.
 * Pure; the deterministic floor the service enforces before finalize.
 */
export function evaluateCoverageReadiness(input: CoverageReadinessInput): CoverageReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const itemCount = input.items.length;
  const unclassifiedCount = input.items.filter((i) => i.classification === 'unclear' || i.billingDesignation === 'hold').length;

  if (input.qualifyingDetermination === 'pending') {
    blockers.push(`Qualifying clinical trial determination not made (${NCD_310_1}).`);
  }
  if (itemCount === 0) {
    blockers.push('No coverage items have been added to the analysis.');
  }
  if (unclassifiedCount > 0) {
    blockers.push(`${unclassifiedCount} item(s) are still unclear / on hold — classify them before finalizing (${NCD_310_1}).`);
  }
  const unvalidated = input.items.filter((i) => !i.icd10Validated).length;
  if (unvalidated > 0) {
    warnings.push(`${unvalidated} item(s) have an unvalidated ICD-10 indication.`);
  }

  return { readyToFinalize: blockers.length === 0, blockers, warnings, itemCount, unclassifiedCount };
}

// ─── Billing grid assembly ───────────────────────────────────────────────────

export interface BillingGridItemView {
  itemDescription: string;
  category?: string | null;
  cptHcpcsCode?: string | null;
  icd10Code?: string | null;
  classification: ItemClassification;
  billingDesignation: BillingDesignation;
  ncdCitation?: string | null;
  rationale?: string | null;
}

export interface BillingGridRow {
  description: string;
  category: string | null;
  cptHcpcs: string | null;
  icd10: string | null;
  classification: ItemClassification;
  billingDesignation: BillingDesignation;
  citation: string | null;
  rationale: string | null;
}

export interface BillingGrid {
  rows: BillingGridRow[];
  /** Count of rows per billing designation. */
  summary: Record<BillingDesignation, number>;
  readiness: CoverageReadiness;
}

/**
 * Assemble the exportable Medicare Coverage Analysis billing grid from already-
 * loaded items plus the readiness verdict. Pure — the service loads the pieces
 * and calls this; the route/tool serializes it.
 */
export function buildBillingGrid(items: BillingGridItemView[], readiness: CoverageReadiness): BillingGrid {
  const summary: Record<BillingDesignation, number> = {
    bill_medicare: 0, bill_sponsor: 0, bill_standard_of_care: 0, do_not_bill: 0, hold: 0,
  };
  const rows: BillingGridRow[] = items.map((i) => {
    summary[i.billingDesignation] += 1;
    return {
      description: i.itemDescription,
      category: i.category ?? null,
      cptHcpcs: i.cptHcpcsCode ?? null,
      icd10: i.icd10Code ?? null,
      classification: i.classification,
      billingDesignation: i.billingDesignation,
      citation: i.ncdCitation ?? null,
      rationale: i.rationale ?? null,
    };
  });
  return { rows, summary, readiness };
}
