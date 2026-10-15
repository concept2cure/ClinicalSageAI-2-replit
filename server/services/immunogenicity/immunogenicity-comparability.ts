/**
 * Immunogenicity Intelligence — comparability after a change, or for a biosimilar
 * ================================================================================
 *
 * Deterministic: no LLM, no network, no database. Split out of
 * immunogenicity-knowledge.ts on 2026-10-15 when that file crossed the
 * repository size ceiling; it re-exports this tool, so importers of the
 * knowledge module are unchanged.
 *
 * @module server/services/immunogenicity/immunogenicity-comparability
 */

import { CITATIONS, dedupeCitations, type Citation, type RiskTier } from './immunogenicity-reference';

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 6 — assessImmunogenicityComparability
 * ════════════════════════════════════════════════════════════════════════ */

/** Context that triggers a comparability assessment. */
export type ComparabilityContext = 'biosimilar' | 'manufacturing_change' | 'formulation_change' | 'site_transfer' | 'scale_up';

/** Categorization of the change's potential impact on immunogenicity. */
export type ChangeImpact = 'minor' | 'moderate' | 'major';

export interface ComparabilityParams {
  /** What triggered the comparability evaluation. */
  context: ComparabilityContext;
  /** Whether analytical/structural comparability (primary structure, PTMs,
   *  charge variants, aggregates) was demonstrated. */
  analyticalComparable?: boolean;
  /** Whether the change could alter aggregate/particle levels. */
  affectsAggregation?: boolean;
  /** Whether the change could alter glycosylation/PTMs. */
  affectsGlycosylation?: boolean;
  /** Whether the change affects the formulation / container-closure
   *  (leachables, particles). */
  affectsFormulation?: boolean;
  /** Whether new or different process-related impurities are introduced. */
  affectsImpurities?: boolean;
  /** The product's intrinsic immunogenicity risk tier. */
  productRiskTier?: RiskTier;
  /** For biosimilars: whether a comparative clinical immunogenicity study is
   *  planned (typically required unless justified). */
  comparativeClinicalStudyPlanned?: boolean;
  /** Free-text drug name (echoed). */
  drugName?: string;
}

export interface ComparabilityResult {
  drugName: string;
  context: ComparabilityContext;
  changeImpact: ChangeImpact;
  clinicalImmunogenicityStudyRequired: boolean;
  studyRecommendation: string;
  analyticalExpectations: string[];
  bridgingDataNeeds: string[];
  riskFactorsTriggered: string[];
  decisionRationale: string;
  citations: Citation[];
  summary: string;
}

/**
 * assessImmunogenicityComparability — Assesses immunogenicity comparability
 * after a manufacturing/formulation change (ICH Q5E) or for a biosimilar
 * (FDA 2015 biosimilarity considerations / EMA 2017). Determines whether a
 * comparative clinical immunogenicity study is warranted and what analytical
 * and bridging data are needed.
 */
export function assessImmunogenicityComparability(params: ComparabilityParams): ComparabilityResult {
  const drugName = params.drugName ?? '(unnamed product)';
  const analyticalComparable = params.analyticalComparable ?? false;
  const productRisk = params.productRiskTier ?? 'moderate';

  const triggered: string[] = [];
  if (params.affectsAggregation) triggered.push('Change may alter aggregate/subvisible-particle levels (a primary immunogenicity driver).');
  if (params.affectsGlycosylation) triggered.push('Change may alter glycosylation/PTMs (potential new glycan epitopes / effector-function shifts).');
  if (params.affectsFormulation) triggered.push('Change affects formulation or container-closure (leachables, silicone oil, particle formation).');
  if (params.affectsImpurities) triggered.push('Change may introduce new or different process-related impurities (potential adjuvant effect).');
  if (!analyticalComparable) triggered.push('Analytical/structural comparability not yet demonstrated.');

  // ── Determine change impact ─────────────────────────────────────────────
  let impact: ChangeImpact = 'minor';
  const triggerCount = triggered.length;
  if (params.context === 'biosimilar') {
    impact = 'major'; // biosimilars carry an inherent immunogenicity comparison expectation
  } else if (!analyticalComparable || triggerCount >= 2) {
    impact = 'major';
  } else if (triggerCount === 1) {
    impact = 'moderate';
  }
  // High-risk products escalate the impact one level (capped at major).
  if (productRisk === 'high' && impact === 'moderate') impact = 'major';
  if (productRisk === 'high' && impact === 'minor') impact = 'moderate';

  // ── Clinical study determination ────────────────────────────────────────
  let clinicalRequired: boolean;
  let studyRecommendation: string;
  let rationale: string;

  if (params.context === 'biosimilar') {
    clinicalRequired = params.comparativeClinicalStudyPlanned ?? true;
    studyRecommendation = clinicalRequired
      ? 'Conduct a comparative clinical immunogenicity study (biosimilar vs reference product) with a pre-specified margin on ADA/NAb incidence, unless a robust analytical and clinical-pharmacology data package justifies a waiver. Include a single-switch evaluation where the totality-of-evidence approach requires it.'
      : 'A standalone comparative clinical immunogenicity study is not planned; justification must rest on a strong analytical similarity package plus comparative PK/PD immunogenicity data (totality-of-evidence).';
    rationale =
      'For a biosimilar, immunogenicity comparability is a core element of the totality-of-the-evidence demonstration of biosimilarity; comparative immunogenicity assessment is expected (FDA 2015; EMA 2017), typically as a head-to-head comparison using a single validated assay applied to both products.';
  } else {
    // Manufacturing/formulation change under ICH Q5E.
    if (impact === 'major') {
      clinicalRequired = true;
      studyRecommendation =
        'Analytical comparability alone is insufficient. Generate comparative immunogenicity data — at minimum bridging non-clinical and PK/immunogenicity data, and a clinical immunogenicity comparison (pre- vs post-change) when residual uncertainty remains, especially for moderate/high-risk products.';
      rationale =
        'Under ICH Q5E, when a manufacturing change has a meaningful potential to affect immunogenicity-relevant quality attributes (aggregates, glycosylation, impurities, formulation) and analytical comparability is uncertain, additional non-clinical and/or clinical immunogenicity data are required to conclude comparability.';
    } else if (impact === 'moderate') {
      clinicalRequired = false;
      studyRecommendation =
        'Demonstrate comparability primarily through enhanced analytical characterization focused on immunogenicity-relevant attributes; supplement with bridging immunogenicity data if residual risk remains. A dedicated clinical immunogenicity study may be avoidable if analytical comparability is robust.';
      rationale =
        'Under ICH Q5E, a change with a single immunogenicity-relevant trigger and otherwise comparable analytics can often be supported analytically, with clinical immunogenicity data reserved for residual uncertainty.';
    } else {
      clinicalRequired = false;
      studyRecommendation =
        'Comparability can be concluded on the basis of analytical/structural comparability of immunogenicity-relevant quality attributes; no dedicated clinical immunogenicity study is anticipated.';
      rationale =
        'Under ICH Q5E, a low-impact change with demonstrated analytical comparability and no immunogenicity-relevant triggers does not warrant a dedicated clinical immunogenicity study.';
    }
  }

  const analyticalExpectations: string[] = [
    'Primary structure and post-translational modification comparison (sequence, disulfides, glycosylation, deamidation/oxidation).',
    'Higher-order structure (HOS) comparison (e.g., circular dichroism, DSC, HDX-MS, NMR fingerprinting).',
    'Aggregate and subvisible/submicron particle comparison (SEC-MALS, AUC, MFI, HIAC, nanoparticle tracking).',
    'Charge-variant and size-variant profiles (cIEF/icIEF, CE-SDS).',
    'Process-related impurity comparison (HCP, residual DNA, leachables).',
    'Binding and potency comparison reflecting the mechanism of action.',
  ];

  const bridgingDataNeeds: string[] = [
    'A single, validated ADA assay applied to pre- and post-change (or biosimilar and reference) samples to avoid assay-driven differences.',
    'Comparable cut points, sensitivity, drug tolerance, and specificity across the compared products.',
    'NAb comparison where neutralization is clinically relevant.',
    'PK/PD bridging data interpreted alongside immunogenicity to detect exposure-mediated effects.',
  ];

  if (params.context === 'biosimilar') {
    bridgingDataNeeds.push('Demonstrate the assay equally detects ADA against both the biosimilar and the reference product (assay capable of detecting antibodies to both).');
  }

  const citations: Citation[] = dedupeCitations(
    params.context === 'biosimilar'
      ? [CITATIONS.FDA_BIOSIM, CITATIONS.EMA_2017, CITATIONS.ICH_Q5E, CITATIONS.FDA_2019_TIERS]
      : [CITATIONS.ICH_Q5E, CITATIONS.FDA_2014_RISKBASED, CITATIONS.EMA_2017, CITATIONS.FDA_2019_TIERS],
  );

  const summary =
    `${drugName}: ${params.context.replace(/_/g, ' ')} immunogenicity comparability — change impact ${impact.toUpperCase()}. ` +
    `Comparative clinical immunogenicity study ${clinicalRequired ? 'IS' : 'is NOT'} recommended. ` +
    `${triggered.length} immunogenicity-relevant trigger(s) identified. ` +
    `Demonstration rests on ${analyticalComparable ? 'demonstrated' : 'pending'} analytical comparability${params.context === 'biosimilar' ? ' within a totality-of-evidence approach' : ' under ICH Q5E'}.`;

  return {
    drugName,
    context: params.context,
    changeImpact: impact,
    clinicalImmunogenicityStudyRequired: clinicalRequired,
    studyRecommendation,
    analyticalExpectations,
    bridgingDataNeeds,
    riskFactorsTriggered: triggered,
    decisionRationale: rationale,
    citations,
    summary,
  };
}
