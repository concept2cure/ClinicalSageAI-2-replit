/**
 * Promotional compliance expert — prescription-medicine promotion & advertising,
 * per region.
 *
 * Once a medicine is approved, the sponsor's promotional labeling and advertising
 * (to healthcare professionals and, where permitted, to the public) is regulated
 * to ensure claims are truthful, consistent with the approved labeling, fairly
 * balanced as to benefit and risk, and not extended to unapproved uses. This
 * service encodes, per region, the mandatory promotional-compliance controls and
 * assesses a sponsor's prepared controls against that checklist — surfacing exactly
 * which controls are not yet in place before a promotional piece is disseminated.
 *
 * Regions:
 *   - FDA (US): the FD&C Act and FDA's Office of Prescription Drug Promotion (OPDP)
 *     govern prescription-drug promotional labeling and advertising — fair balance,
 *     no off-label promotion, substantial-evidence support for efficacy claims,
 *     adequate disclosure of material risk, submission of promotional materials on
 *     Form FDA 2253 at first use, and consistency with the approved labeling.
 *   - EU: Directive 2001/83/EC Title VIII / VIIIa (Art 86–100) governs advertising
 *     of medicinal products — advertising must comply with the Summary of Product
 *     Characteristics (SmPC), prescription-only medicines may not be advertised to
 *     the general public, only authorised products/indications may be advertised,
 *     advertising must encourage rational use and be presented objectively, must
 *     carry the essential information compatible with the SmPC, and must meet the
 *     national competent authority's controls / record-keeping requirements.
 *
 * Pure / deterministic — no DB, no IO. This is a readiness aid, honest by
 * construction: promotion rules are context- and channel-specific (direct-to-consumer
 * vs healthcare-professional; product launch vs accelerated-approval / boxed-warning
 * products; reminder vs help-seeking ads), and national implementing measures vary
 * across EU Member States; the authority's current guidance is controlling.
 *
 * References:
 *   - Federal Food, Drug, and Cosmetic Act §502(n) (21 U.S.C. 352(n)) —
 *     prescription-drug advertising / misbranding.
 *   - 21 CFR 202.1 — prescription-drug advertisements (fair balance, brief summary,
 *     true statement of information).
 *   - FDA Office of Prescription Drug Promotion (OPDP) guidance; Form FDA 2253
 *     (Transmittal of Advertisements and Promotional Labeling for Drugs and
 *     Biologics for Human Use) per 21 CFR 314.81(b)(3)(i).
 *   - Directive 2001/83/EC, Title VIII (Art 86–88) and Title VIIIa (Art 88a–100) —
 *     advertising of medicinal products for human use; Art 87 (consistency with
 *     SmPC / authorised products), Art 88 (ban on advertising prescription-only
 *     medicines to the general public), Art 89–90 (mandatory information / content).
 *
 * @module server/services/global-ri/promotional-compliance
 */

export type PromoRegion = 'FDA' | 'EU';

/** Regions with a modeled promotional-compliance framework. */
export const PROMO_REGIONS: PromoRegion[] = ['FDA', 'EU'];

export interface PromotionalRule {
  /** Stable rule id (e.g. 'fair_balance', 'no_public_pom_advertising'). */
  id: string;
  /** Human label. */
  title: string;
  /** What the promotional piece / process must satisfy for this rule. */
  requirement: string;
  /** Governing citation. */
  citation: string;
}

export interface PromotionalRuleSet {
  region: PromoRegion;
  /** The mandatory promotional-compliance rules. */
  rules: PromotionalRule[];
  /** Top-level governing citation for the regime. */
  citation: string;
  /** Honest caveats / scope notes. */
  notes: string[];
}

/**
 * Encoded promotional-compliance rules by region. Each region lists the major
 * mandatory controls for prescription-medicine promotion; the rule citations
 * point to the specific governing instrument (FD&C Act section / 21 CFR / OPDP;
 * Directive 2001/83/EC article).
 */
const PROMOTIONAL_RULE_SETS: Record<PromoRegion, PromotionalRuleSet> = {
  FDA: {
    region: 'FDA',
    citation:
      'FD&C Act §502(n) (21 U.S.C. 352(n)); 21 CFR 202.1; FDA Office of Prescription Drug Promotion (OPDP) guidance',
    rules: [
      {
        id: 'fair_balance',
        title: 'Fair balance',
        requirement:
          'Present a fair balance between information on effectiveness and information on risk — risk information must be presented with a prominence and readability reasonably comparable to the benefit/effectiveness claims.',
        citation: '21 CFR 202.1(e)(5)(ii) (fair balance); FD&C Act §502(n)',
      },
      {
        id: 'no_off_label',
        title: 'No off-label promotion',
        requirement:
          'Do not promote the product for any use, indication, dosage, route or patient population that is not within the FDA-approved labeling (no promotion of unapproved/"off-label" uses).',
        citation: 'FD&C Act §502(a)/(f) & §505; 21 CFR 202.1(e)(4) (consistency with approved use)',
      },
      {
        id: 'substantial_evidence',
        title: 'Substantial evidence for efficacy claims',
        requirement:
          'Support every efficacy claim with substantial evidence — adequate and well-controlled studies — and do not represent a drug as effective for a use not so supported.',
        citation: 'FD&C Act §505(d); 21 CFR 202.1(e)(6)(i)-(ii) (lack of substantial evidence / unsupported claims)',
      },
      {
        id: 'risk_disclosure',
        title: 'Material risk disclosure (brief summary / major statement)',
        requirement:
          'Provide adequate disclosure of material risks — the brief summary of side effects, warnings, precautions and contraindications for print ads, or the major statement of major risks for broadcast ads.',
        citation: '21 CFR 202.1(e)(1) (brief summary); 21 CFR 202.1(e)(1) (broadcast major statement / adequate provision)',
      },
      {
        id: 'form_2253_submission',
        title: 'Submission to OPDP on Form FDA 2253',
        requirement:
          'Submit promotional labeling and advertising materials to FDA (OPDP) on Form FDA 2253 at the time of initial dissemination (advertisements) or initial publication (labeling).',
        citation: '21 CFR 314.81(b)(3)(i); Form FDA 2253 (OPDP transmittal)',
      },
      {
        id: 'accurate_not_misleading',
        title: 'Accurate and not false or misleading',
        requirement:
          'Make no false or misleading representation; the promotion must be consistent with the FDA-approved labeling and must not omit material facts in light of the representations made.',
        citation: 'FD&C Act §502(a) & §502(n); 21 CFR 202.1(e)(3)-(e)(7) (false, misleading or lacking fair balance)',
      },
    ],
    notes: [
      'This is a readiness aid; FDA/OPDP current guidance is controlling and may exceed the modeled rules.',
      'Promotion rules are context- and channel-specific (direct-to-consumer vs healthcare-professional; print vs broadcast; reminder vs help-seeking ads; products with boxed warnings or accelerated approval) — confirm the applicable requirements with FDA OPDP.',
    ],
  },
  EU: {
    region: 'EU',
    citation:
      'Directive 2001/83/EC, Title VIII & VIIIa (Art 86–100) — advertising of medicinal products for human use',
    rules: [
      {
        id: 'smpc_consistency',
        title: 'Consistency with the Summary of Product Characteristics',
        requirement:
          'All parts of the advertising must comply with the particulars listed in the Summary of Product Characteristics (SmPC).',
        citation: 'Directive 2001/83/EC Art 87(2)',
      },
      {
        id: 'no_public_pom_advertising',
        title: 'No advertising of prescription-only medicines to the public',
        requirement:
          'Do not advertise to the general public any medicinal product that is available on medical prescription only (prohibition on POM advertising to the public).',
        citation: 'Directive 2001/83/EC Art 88(1)',
      },
      {
        id: 'only_authorised',
        title: 'Only authorised products / indications',
        requirement:
          'Do not advertise a medicinal product for which a marketing authorisation has not been granted, nor for any use outside the authorised indications.',
        citation: 'Directive 2001/83/EC Art 87(1)',
      },
      {
        id: 'encourage_rational_use',
        title: 'Encourage rational use; objective and not misleading',
        requirement:
          'Advertising must encourage the rational use of the product by presenting it objectively and without exaggerating its properties, and must not be misleading.',
        citation: 'Directive 2001/83/EC Art 87(3)',
      },
      {
        id: 'mandatory_information',
        title: 'Mandatory essential information compatible with the SmPC',
        requirement:
          'Include the essential information required for the audience — for advertising to the public, the minimum statutory particulars; for advertising to prescribers, information compatible with the SmPC, classification and (where applicable) selling price/reimbursement.',
        citation: 'Directive 2001/83/EC Art 89 (public) & Art 91 (healthcare professionals)',
      },
      {
        id: 'records_member_state',
        title: 'National competent-authority controls & record-keeping',
        requirement:
          "Comply with the Member State's national controls — maintain available records/samples of advertising disseminated, identify recipients, method and date, and operate the marketing-authorisation holder's scientific service for information about the product.",
        citation: 'Directive 2001/83/EC Art 97 & Art 98 (Member State controls; records; scientific service)',
      },
    ],
    notes: [
      'This is a readiness aid; the national competent authority of each EU Member State implements Title VIII and its current guidance is controlling.',
      'Promotion rules are context- and channel-specific (advertising to the general public vs to healthcare professionals; vaccination campaigns and certain exceptions under Art 88(4)); national implementing measures vary across Member States — confirm with the relevant national competent authority.',
    ],
  },
};

/**
 * Get the promotional-compliance rule set for a region: the mandatory rules
 * (each with its citation), the top-level citation and honest scope caveats.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function getPromotionalRules(region: PromoRegion): PromotionalRuleSet {
  const ruleSet = PROMOTIONAL_RULE_SETS[region];
  if (!ruleSet) throw new Error(`No promotional-compliance rules modeled for region "${region}".`);
  return ruleSet;
}

/**
 * List the promotional rule ids for a region (for a checklist UI). Returns an
 * empty array for an unmodeled region (graceful, like getRegionalModule1Requirements).
 */
export function getPromotionalRuleIds(region: PromoRegion): string[] {
  const ruleSet = PROMOTIONAL_RULE_SETS[region];
  if (!ruleSet) return [];
  return ruleSet.rules.map((r) => r.id);
}

export interface PromotionalReadinessInput {
  region: PromoRegion;
  /** Rule ids the sponsor has controls in place for (from getPromotionalRuleIds). */
  providedControls: string[];
}

export interface PromotionalReadinessResult {
  region: PromoRegion;
  /** ready ⇔ no required rule is missing. */
  ready: boolean;
  /** The required rule ids the sponsor has provided controls for. */
  provided: string[];
  /** The required rule ids the sponsor has not provided controls for. */
  missing: string[];
  /** Fraction of required rules covered, 0..1, rounded to 2 decimals. */
  coverage: number;
  notes: string[];
}

/**
 * Assess a sponsor's prepared promotional-compliance controls against the
 * region's required rule set. ready ⇔ no missing rule ids.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function assessPromotionalReadiness(
  input: PromotionalReadinessInput,
): PromotionalReadinessResult {
  const ruleSet = PROMOTIONAL_RULE_SETS[input.region];
  if (!ruleSet) throw new Error(`No promotional-compliance rules modeled for region "${input.region}".`);

  const requiredIds = ruleSet.rules.map((r) => r.id);
  const providedSet = new Set((input.providedControls ?? []).map((c) => String(c)));

  const provided: string[] = [];
  const missing: string[] = [];
  for (const id of requiredIds) {
    if (providedSet.has(id)) provided.push(id);
    else missing.push(id);
  }

  const coverage =
    requiredIds.length === 0 ? 0 : Math.round((provided.length / requiredIds.length) * 100) / 100;

  const notes: string[] = [
    'This is a readiness aid; promotion rules are context- and channel-specific (DTC vs HCP; launch vs accelerated approval) — confirm with the authority (FDA OPDP / the relevant EU national competent authority).',
    missing.length === 0
      ? 'All modeled promotional-compliance rules are covered — proceed to medical/legal/regulatory (MLR) review of the specific piece.'
      : `Address ${missing.length} uncovered promotional-compliance rule(s) before dissemination.`,
  ];

  return {
    region: input.region,
    ready: missing.length === 0,
    provided,
    missing,
    coverage,
    notes,
  };
}
