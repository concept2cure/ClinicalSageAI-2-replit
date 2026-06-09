/**
 * Expedited-pathway eligibility engine — the deterministic criteria for the major
 * accelerated/special regulatory designations, and a gap assessment against them.
 *
 * Each designation is a fixed checklist of criteria drawn from the published
 * program definition. `assessEligibility` takes yes/no answers and returns whether
 * the criteria are met — eligible only when EVERY criterion is satisfied; any
 * unanswered criterion leaves eligibility undetermined (never silently "eligible").
 *
 * HONESTY ABOUT CONTENT: criteria reflect the cited published program definitions
 * (FDA expedited-programs guidance; EU PRIME / Orphan / Conditional MA; PMDA
 * SAKIGAKE / Orphan). This is a structured eligibility CHECK, not legal advice and
 * not a substitute for the agency's own designation decision.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/pathway-eligibility
 */

export type Designation =
  | 'fda_breakthrough' | 'fda_fast_track' | 'fda_accelerated_approval' | 'fda_priority_review' | 'fda_orphan'
  | 'eu_prime' | 'eu_orphan' | 'eu_conditional_ma'
  | 'pmda_sakigake' | 'pmda_orphan';

export interface EligibilityCriterion {
  id: string;
  question: string;
}

export interface DesignationProfile {
  id: Designation;
  label: string;
  market: string;
  basis: string;
  /** ALL criteria must be met for eligibility. */
  criteria: EligibilityCriterion[];
}

export const DESIGNATIONS: DesignationProfile[] = [
  {
    id: 'fda_breakthrough',
    label: 'FDA Breakthrough Therapy Designation',
    market: 'us',
    basis: 'FDA Expedited Programs guidance; FDASIA §902',
    criteria: [
      { id: 'serious', question: 'Does the drug treat a serious or life-threatening condition?' },
      { id: 'preliminary_substantial', question: 'Does preliminary clinical evidence indicate substantial improvement over available therapy on a clinically significant endpoint?' },
    ],
  },
  {
    id: 'fda_fast_track',
    label: 'FDA Fast Track Designation',
    market: 'us',
    basis: 'FDA Expedited Programs guidance; FDAMA §112',
    criteria: [
      { id: 'serious', question: 'Does the drug treat a serious condition?' },
      { id: 'unmet_need', question: 'Does it address an unmet medical need (or show potential to, via nonclinical/clinical data)?' },
    ],
  },
  {
    id: 'fda_accelerated_approval',
    label: 'FDA Accelerated Approval',
    market: 'us',
    basis: 'FDA 21 CFR 314 Subpart H / 601 Subpart E',
    criteria: [
      { id: 'serious', question: 'Does the drug treat a serious condition?' },
      { id: 'advantage', question: 'Does it provide a meaningful advantage over available therapies?' },
      { id: 'surrogate', question: 'Does it have an effect on a surrogate/intermediate endpoint reasonably likely to predict clinical benefit?' },
    ],
  },
  {
    id: 'fda_priority_review',
    label: 'FDA Priority Review',
    market: 'us',
    basis: 'FDA Expedited Programs guidance; PDUFA',
    criteria: [
      { id: 'significant_improvement', question: 'Would the product, if approved, significantly improve the safety or effectiveness of treatment, diagnosis, or prevention of a serious condition?' },
    ],
  },
  {
    id: 'fda_orphan',
    label: 'FDA Orphan Drug Designation',
    market: 'us',
    basis: 'FDA 21 CFR 316; Orphan Drug Act',
    criteria: [
      { id: 'rare', question: 'Does the disease/condition affect fewer than 200,000 people in the US (or meet the cost-recovery criterion)?' },
    ],
  },
  {
    id: 'eu_prime',
    label: 'EU PRIME (PRIority MEdicines)',
    market: 'eu',
    basis: 'EMA PRIME scheme',
    criteria: [
      { id: 'unmet_need', question: 'Does the medicine target a condition with an unmet medical need / offer a major therapeutic advantage?' },
      { id: 'early_evidence', question: 'Is there early clinical (or compelling nonclinical + tolerability) evidence of potential to benefit patients?' },
    ],
  },
  {
    id: 'eu_orphan',
    label: 'EU Orphan Designation',
    market: 'eu',
    basis: 'Regulation (EC) 141/2000',
    criteria: [
      { id: 'prevalence', question: 'Is the condition life-threatening or chronically debilitating with prevalence ≤ 5 in 10,000 in the EU?' },
      { id: 'no_satisfactory', question: 'Is there no satisfactory authorised method, or would the product be of significant benefit?' },
    ],
  },
  {
    id: 'eu_conditional_ma',
    label: 'EU Conditional Marketing Authorisation',
    market: 'eu',
    basis: 'Regulation (EC) 507/2006',
    criteria: [
      { id: 'serious', question: 'Is it for a seriously debilitating or life-threatening disease (or emergency/orphan)?' },
      { id: 'benefit_risk', question: 'Is the benefit-risk balance positive?' },
      { id: 'unmet_need', question: 'Does it address an unmet medical need?' },
      { id: 'immediate_availability', question: 'Does the benefit of immediate availability outweigh the risk of less-complete data?' },
    ],
  },
  {
    id: 'pmda_sakigake',
    label: 'PMDA SAKIGAKE Designation',
    market: 'jp',
    basis: 'MHLW/PMDA SAKIGAKE scheme',
    criteria: [
      { id: 'serious', question: 'Is the product for a serious/life-threatening disease?' },
      { id: 'prominent_effect', question: 'Is prominent effectiveness expected (based on mechanism and early data)?' },
      { id: 'japan_first', question: 'Is it intended for early development in Japan (ideally first-in-world)?' },
    ],
  },
  {
    id: 'pmda_orphan',
    label: 'PMDA Orphan Drug/Device Designation',
    market: 'jp',
    basis: 'Japan PMD Act; MHLW orphan criteria',
    criteria: [
      { id: 'population', question: 'Is the Japanese patient population fewer than 50,000?' },
      { id: 'high_need', question: 'Is there a high medical need (serious disease, no alternative)?' },
      { id: 'rationale', question: 'Is there a scientific rationale supporting development feasibility?' },
    ],
  },
];

// ── Lookups + assessment (pure) ───────────────────────────────────────────────

const BY_ID = new Map(DESIGNATIONS.map((d) => [d.id, d]));

export function getDesignation(id: string): DesignationProfile | undefined {
  return BY_ID.get(id as Designation);
}

export function designationsForMarket(market: string): DesignationProfile[] {
  return DESIGNATIONS.filter((d) => d.market === market.toLowerCase());
}

export function designationIds(): Designation[] {
  return DESIGNATIONS.map((d) => d.id);
}

export interface EligibilityAssessment {
  designation: Designation;
  label: string;
  /** True only when every criterion is answered and met. */
  eligible: boolean;
  met: string[];
  unmet: string[];
  /** Criteria with no answer supplied — eligibility is undetermined while any exist. */
  unanswered: string[];
}

/**
 * Assess eligibility from yes/no answers keyed by criterion id. Eligible only when
 * every criterion is explicitly true; any false → not eligible; any missing →
 * undetermined (eligible stays false and the criterion is reported as unanswered).
 */
export function assessEligibility(
  id: string,
  answers: Record<string, boolean>
): EligibilityAssessment | undefined {
  const d = getDesignation(id);
  if (!d) return undefined;

  const met: string[] = [];
  const unmet: string[] = [];
  const unanswered: string[] = [];
  for (const c of d.criteria) {
    const a = answers[c.id];
    if (a === true) met.push(c.id);
    else if (a === false) unmet.push(c.id);
    else unanswered.push(c.id);
  }

  return {
    designation: d.id,
    label: d.label,
    eligible: unmet.length === 0 && unanswered.length === 0,
    met,
    unmet,
    unanswered,
  };
}

export default {
  DESIGNATIONS,
  getDesignation,
  designationsForMarket,
  designationIds,
  assessEligibility,
};
