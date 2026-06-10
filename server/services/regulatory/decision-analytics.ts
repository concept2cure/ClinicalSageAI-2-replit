/**
 * Decision analytics for IVD evidence planning.
 *
 * Composes the (deterministic) reviewer-simulation engine to answer the
 * planning questions a sponsor actually asks:
 *   - Sensitivity / tornado: which missing evidence element moves submission
 *     readiness the most?
 *   - Expected value of evidence: which study gives the most readiness gain per
 *     week of effort (the ROI of evidence generation)?
 *
 * Deterministic; no I/O.
 */

import {
  simulateIvdReview,
  type ReviewProfile,
  type EvidencePresence,
} from './reviewer-simulation-ivd';

/** Rough effort (weeks) to complete each evidence element — for ROI ranking. */
const EVIDENCE_EFFORT_WEEKS: Record<keyof EvidencePresence, number> = {
  scientificValidity: 3,
  analyticalPrecision: 4,
  detectionCapability: 3,
  linearity: 2,
  interference: 2,
  methodComparison: 3,
  stability: 12,
  traceability: 3,
  cutoffValidation: 3,
  clinicalPerformance: 18,
  intendedUseMatchesPredicate: 1,
  pmpfPlan: 2,
  softwareValidation: 6,
  cybersecurity: 4,
  bioinformaticsValidation: 4,
  manufacturingProcessValidation: 8,
  benefitRiskAnalysis: 3,
  specialControlsProposed: 3,
  euReferenceLabReady: 6,
  qmsCertified: 12,
};

const ALL_EVIDENCE_KEYS = Object.keys(EVIDENCE_EFFORT_WEEKS) as (keyof EvidencePresence)[];

/** Rough fully-loaded cost (USD) to generate each evidence element. Planning-grade. */
export const EVIDENCE_COST_USD: Record<keyof EvidencePresence, number> = {
  scientificValidity: 20000,
  analyticalPrecision: 40000,
  detectionCapability: 35000,
  linearity: 20000,
  interference: 25000,
  methodComparison: 50000,
  stability: 80000,
  traceability: 25000,
  cutoffValidation: 60000,
  clinicalPerformance: 500000,
  intendedUseMatchesPredicate: 5000,
  pmpfPlan: 15000,
  softwareValidation: 120000,
  cybersecurity: 80000,
  bioinformaticsValidation: 90000,
  manufacturingProcessValidation: 200000,
  benefitRiskAnalysis: 20000,
  specialControlsProposed: 25000,
  euReferenceLabReady: 60000,
  qmsCertified: 150000,
};

/** Human labels for evidence elements (for UI/report rendering). */
const EVIDENCE_LABEL: Record<keyof EvidencePresence, string> = {
  scientificValidity: 'Scientific validity report',
  analyticalPrecision: 'Precision / reproducibility (EP05)',
  detectionCapability: 'Detection capability LoB/LoD/LoQ (EP17)',
  linearity: 'Linearity / measuring range (EP06)',
  interference: 'Interference / specificity (EP07)',
  methodComparison: 'Method comparison / bias (EP09)',
  stability: 'Stability (EP25 / ISO 23640)',
  traceability: 'Metrological traceability (ISO 17511)',
  cutoffValidation: 'Independent cut-off validation',
  clinicalPerformance: 'Clinical performance study',
  intendedUseMatchesPredicate: 'Intended-use alignment with predicate',
  pmpfPlan: 'Post-market performance follow-up (PMPF) plan',
  softwareValidation: 'Software lifecycle (IEC 62304)',
  cybersecurity: 'Premarket cybersecurity (SPDF)',
  bioinformaticsValidation: 'Bioinformatics pipeline validation',
  manufacturingProcessValidation: 'Manufacturing / process validation (QS)',
  benefitRiskAnalysis: 'Benefit-risk determination',
  specialControlsProposed: 'Proposed special controls',
  euReferenceLabReady: 'EU reference-laboratory readiness',
  qmsCertified: 'ISO 13485 / QMS certification',
};

export interface EvidenceImpact {
  element: keyof EvidencePresence;
  label: string;
  /** Readiness-score gain (0–100 points) from adding this element. */
  readinessGain: number;
  /** Whether adding this element clears at least one major finding. */
  removesMajor: boolean;
  /** Estimated effort to complete (weeks). */
  effortWeeks: number;
  /** Readiness-gain per week of effort (the time-ROI metric). */
  gainPerWeek: number;
  /** Estimated cost to complete (USD). */
  costUsd: number;
  /** Readiness-gain per $100k of spend (the cost-ROI metric). */
  gainPer100k: number;
}

export interface SensitivityAnalysisResult {
  baselineReadiness: number;
  baselineMajors: number;
  /** All currently-missing elements, ranked by absolute readiness impact (tornado). */
  tornado: EvidenceImpact[];
  /** Same elements ranked by readiness-gain per week of effort (best time-ROI first). */
  byRoi: EvidenceImpact[];
  /** Same elements ranked by readiness-gain per dollar (best cost-ROI first). */
  byCostRoi: EvidenceImpact[];
  /** Total remaining cost to complete all missing relevant evidence (USD). */
  totalRemainingCostUsd: number;
  /** The single highest-impact next action. */
  highestImpact: EvidenceImpact | null;
  /** The single best-ROI (per-week) next action. */
  bestRoi: EvidenceImpact | null;
}

/** Evidence elements relevant to a given profile (so we don't suggest N/A items). */
function relevantKeys(profile: ReviewProfile): (keyof EvidencePresence)[] {
  return ALL_EVIDENCE_KEYS.filter(k => {
    if (k === 'intendedUseMatchesPredicate') return profile.pathway === '510k';
    if (k === 'pmpfPlan' || k === 'euReferenceLabReady') return profile.pathway === 'eu_ivdr';
    if (k === 'specialControlsProposed') return profile.pathway === 'de_novo';
    if (k === 'manufacturingProcessValidation') return profile.pathway === 'pma';
    if (k === 'benefitRiskAnalysis') return profile.pathway === 'pma' || profile.pathway === 'de_novo';
    if (k === 'bioinformaticsValidation') return profile.assayType === 'ngs';
    if (k === 'softwareValidation' || k === 'cybersecurity') return !!profile.hasSoftware || profile.assayType === 'ngs';
    if (k === 'traceability') return profile.assayType === 'quantitative';
    if (k === 'cutoffValidation') return profile.assayType === 'qualitative' || profile.assayType === 'ihc';
    if (k === 'qmsCertified') return profile.pathway === 'pma' || profile.pathway === 'eu_ivdr';
    return true;
  });
}

/**
 * One-at-a-time sensitivity analysis: for each missing-but-relevant evidence
 * element, add it and measure the readiness gain (and whether it clears a major).
 */
export function sensitivityAnalysis(profile: ReviewProfile): SensitivityAnalysisResult {
  const baseline = simulateIvdReview(profile);
  const evidence = profile.evidence ?? {};

  const impacts: EvidenceImpact[] = [];
  for (const key of relevantKeys(profile)) {
    if (evidence[key] === true) continue; // already present
    const variantProfile: ReviewProfile = { ...profile, evidence: { ...evidence, [key]: true } };
    const variant = simulateIvdReview(variantProfile);
    const readinessGain = variant.readinessScore - baseline.readinessScore;
    const effortWeeks = EVIDENCE_EFFORT_WEEKS[key];
    const costUsd = EVIDENCE_COST_USD[key];
    impacts.push({
      element: key,
      label: EVIDENCE_LABEL[key],
      readinessGain,
      removesMajor: variant.counts.major < baseline.counts.major,
      effortWeeks,
      gainPerWeek: effortWeeks > 0 ? Math.round((readinessGain / effortWeeks) * 100) / 100 : readinessGain,
      costUsd,
      gainPer100k: costUsd > 0 ? Math.round((readinessGain / (costUsd / 100000)) * 100) / 100 : readinessGain,
    });
  }

  const tornado = [...impacts].sort((a, b) => b.readinessGain - a.readinessGain || a.effortWeeks - b.effortWeeks);
  const byRoi = [...impacts].sort((a, b) => b.gainPerWeek - a.gainPerWeek || b.readinessGain - a.readinessGain);
  const byCostRoi = [...impacts].sort((a, b) => b.gainPer100k - a.gainPer100k || b.readinessGain - a.readinessGain);
  const totalRemainingCostUsd = impacts.reduce((s, i) => s + i.costUsd, 0);

  return {
    baselineReadiness: baseline.readinessScore,
    baselineMajors: baseline.counts.major,
    tornado,
    byRoi,
    byCostRoi,
    totalRemainingCostUsd,
    highestImpact: tornado.find(i => i.readinessGain > 0) ?? null,
    bestRoi: byRoi.find(i => i.gainPerWeek > 0) ?? null,
  };
}
