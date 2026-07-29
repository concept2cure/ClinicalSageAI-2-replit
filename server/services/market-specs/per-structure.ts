/**
 * Performance Evaluation Report (PER) structure — the IVDR (2017/746) Annex XIII
 * performance-evaluation model: the three pillars (scientific validity, analytical
 * performance, clinical performance), their metrics, the PER report sections with
 * reviewer questions, and a deterministic completeness assessment.
 *
 * WHY THIS EXISTS (audit gap): the platform tracks IVDR class and a PER slot but
 * has NO internal PER structure — analytical metrics (LoD/LoQ/precision/trueness…),
 * clinical metrics (sensitivity/specificity/PPV/NPV…), and scientific validity were
 * unmodelled, so an assembled IVD technical file would fail Notified Body review on
 * performance completeness. This is the IVD counterpart of `cer-structure.ts`.
 *
 * HONESTY: pillars/metrics/sections reflect IVDR Annex XIII Part A and Annex I. This
 * is the regulated structure + reviewer questions, NOT the NB's decision and not
 * drafted performance data — the manufacturer supplies the evidence.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/per-structure
 */

export type PerPillar = 'scientific_validity' | 'analytical' | 'clinical';

export interface PerPillarInfo {
  id: PerPillar;
  title: string;
  purpose: string;
}

/** The three IVDR performance-evaluation pillars. */
export const PER_PILLARS: PerPillarInfo[] = [
  {
    id: 'scientific_validity',
    title: 'Scientific Validity',
    purpose: 'Demonstrate the association of the analyte/marker with the targeted clinical condition or physiological state.',
  },
  {
    id: 'analytical',
    title: 'Analytical Performance',
    purpose: 'Demonstrate the ability of the device to correctly detect or measure the analyte.',
  },
  {
    id: 'clinical',
    title: 'Clinical Performance',
    purpose: 'Demonstrate the ability of the device to yield results correlated with the clinical condition in the intended population.',
  },
];

export interface PerMetric {
  id: string;
  label: string;
  pillar: PerPillar;
  description: string;
}

/** Analytical-performance characteristics (IVDR Annex I §9.1; Annex XIII). */
export const ANALYTICAL_METRICS: PerMetric[] = [
  { id: 'trueness', label: 'Trueness (bias)', pillar: 'analytical', description: 'Closeness of agreement between the average measured value and a reference value.' },
  { id: 'precision', label: 'Precision (repeatability & reproducibility)', pillar: 'analytical', description: 'Closeness of agreement between replicate measurements (within-run and between-run/site/operator/lot).' },
  { id: 'analytical_sensitivity', label: 'Analytical sensitivity (LoB/LoD/LoQ)', pillar: 'analytical', description: 'Limit of blank, limit of detection, and limit of quantitation.' },
  { id: 'analytical_specificity', label: 'Analytical specificity (interference & cross-reactivity)', pillar: 'analytical', description: 'Ability to measure the target analyte in the presence of interferents and cross-reactants.' },
  { id: 'linearity', label: 'Linearity', pillar: 'analytical', description: 'Ability to give results proportional to the analyte concentration across the range.' },
  { id: 'measuring_range', label: 'Measuring/measuring interval', pillar: 'analytical', description: 'The range over which the device provides validated results.' },
  { id: 'cutoff', label: 'Cut-off determination', pillar: 'analytical', description: 'Determination of the assay cut-off (for qualitative/semi-quantitative assays).' },
  { id: 'specimen_stability', label: 'Specimen & reagent stability', pillar: 'analytical', description: 'Stability of specimens and reagents (incl. on-board/in-use and shelf life).' },
  { id: 'traceability', label: 'Metrological traceability', pillar: 'analytical', description: 'Traceability of calibrators and control materials to reference materials/methods.' },
];

/** Clinical-performance characteristics (IVDR Annex I §9.1(b); Annex XIII). */
export const CLINICAL_METRICS: PerMetric[] = [
  { id: 'diagnostic_sensitivity', label: 'Diagnostic sensitivity', pillar: 'clinical', description: 'Ability to identify subjects with the target condition.' },
  { id: 'diagnostic_specificity', label: 'Diagnostic specificity', pillar: 'clinical', description: 'Ability to identify subjects without the target condition.' },
  { id: 'predictive_values', label: 'Positive/negative predictive value (PPV/NPV)', pillar: 'clinical', description: 'Probability of (not) having the condition given a (negative) positive result, at the relevant prevalence.' },
  { id: 'likelihood_ratios', label: 'Likelihood ratios', pillar: 'clinical', description: 'Positive and negative likelihood ratios.' },
  { id: 'expected_values', label: 'Expected values / reference intervals', pillar: 'clinical', description: 'Expected values in normal and affected populations.' },
];

export interface PerSection {
  id: string;
  number: string;
  title: string;
  purpose: string;
  required: boolean;
  pillar?: PerPillar;
  reviewerQuestions: string[];
}

/** The PER report sections (IVDR Annex XIII Part A). */
export const PER_SECTIONS: PerSection[] = [
  {
    id: 'pep',
    number: '1',
    title: 'Performance Evaluation Plan (PEP)',
    purpose: 'Define the intended purpose, the analyte/condition, the three-pillar evidence strategy, and the acceptance criteria for performance.',
    required: true,
    reviewerQuestions: [
      'Does the PEP define acceptance criteria for each pillar BEFORE the data were generated?',
      'Is the intended purpose (analyte, condition, population, specimen, setting) stated precisely as in the IFU?',
    ],
  },
  {
    id: 'scientific_validity',
    number: '2',
    title: 'Scientific Validity Report',
    purpose: 'Demonstrate, from literature/consensus/own data, that the analyte is associated with the targeted clinical condition.',
    required: true,
    pillar: 'scientific_validity',
    reviewerQuestions: [
      'Is the analyte–condition association supported by a documented, current evidence base?',
      'Is the source of the scientific validity (consensus, literature, or own data) appropriate to the claim?',
    ],
  },
  {
    id: 'analytical_performance',
    number: '3',
    title: 'Analytical Performance Report',
    purpose: 'Report the analytical characteristics (trueness, precision, LoB/LoD/LoQ, specificity/interference, linearity, range, cut-off, stability, traceability) against the PEP criteria.',
    required: true,
    pillar: 'analytical',
    reviewerQuestions: [
      'Are ALL applicable analytical characteristics reported (LoD/LoQ, precision, trueness, interference, linearity, traceability)?',
      'Do the analytical results meet the pre-specified acceptance criteria?',
      'Is interference/cross-reactivity tested against a justified panel of substances?',
    ],
  },
  {
    id: 'clinical_performance',
    number: '4',
    title: 'Clinical Performance Report',
    purpose: 'Report diagnostic sensitivity/specificity, predictive values, likelihood ratios, and expected values in the intended population, against the PEP criteria.',
    required: true,
    pillar: 'clinical',
    reviewerQuestions: [
      'Are diagnostic sensitivity and specificity reported with confidence intervals in the intended-use population?',
      'Are predictive values presented at the relevant prevalence (not the study prevalence)?',
      'Is the comparator/reference standard appropriate and justified?',
    ],
  },
  {
    id: 'per_conclusion',
    number: '5',
    title: 'Performance Evaluation Report — Integration & Benefit-Risk',
    purpose: 'Integrate the three pillars into an overall benefit-risk conclusion and demonstrate conformity with the relevant GSPR.',
    required: true,
    reviewerQuestions: [
      'Do the three pillars together support the intended purpose and the IFU claims?',
      'Is the overall benefit-risk acceptable given the residual analytical/clinical limitations?',
    ],
  },
  {
    id: 'pmpf',
    number: '6',
    title: 'Post-Market Performance Follow-up (PMPF) Considerations',
    purpose: 'Identify performance uncertainties/residual gaps to be addressed by PMPF and the plan to update the PER.',
    required: true,
    reviewerQuestions: [
      'Does the PMPF plan address the performance gaps and residual uncertainties identified?',
      'Is a justified frequency for updating the performance evaluation defined?',
    ],
  },
  {
    id: 'evaluator_qualification',
    number: '7',
    title: 'Qualification of the Evaluators',
    purpose: 'Document the qualifications and declarations of interest of those who performed the performance evaluation.',
    required: true,
    reviewerQuestions: [
      'Do the evaluators have documented expertise in the assay technology and performance-data appraisal?',
    ],
  },
  {
    id: 'references',
    number: '8',
    title: 'References and Appendices',
    purpose: 'List references and attach study reports, the literature methodology, and supporting data.',
    required: true,
    reviewerQuestions: [
      'Are the study reports and the literature methodology attached and traceable to the claims?',
    ],
  },
];

// ── Lookups + assessment (pure) ───────────────────────────────────────────────

const SECTION_BY_ID = new Map(PER_SECTIONS.map((s) => [s.id, s]));

export function getPerSection(id: string): PerSection | undefined {
  return SECTION_BY_ID.get(id);
}

export function perSectionIds(): string[] {
  return PER_SECTIONS.map((s) => s.id);
}

export function metricsForPillar(pillar: PerPillar): PerMetric[] {
  return [...ANALYTICAL_METRICS, ...CLINICAL_METRICS].filter((m) => m.pillar === pillar);
}

/** Every reviewer question across the PER, flattened (for an oversight checklist). */
export function perReviewerQuestions(): Array<{ sectionId: string; question: string }> {
  return PER_SECTIONS.flatMap((s) => s.reviewerQuestions.map((q) => ({ sectionId: s.id, question: q })));
}

export interface PerAssessment {
  ready: boolean;
  missingRequiredSections: string[];
  /** Which of the three pillars have their section present. */
  pillarsCovered: PerPillar[];
  pillarsMissing: PerPillar[];
  presentCount: number;
  totalRequired: number;
}

/** Assess a PER against the canonical structure + the three-pillar coverage. */
export function assessPerStructure(presentSectionIds: string[]): PerAssessment {
  const present = new Set(presentSectionIds);
  const required = PER_SECTIONS.filter((s) => s.required);
  const missingRequiredSections = required.filter((s) => !present.has(s.id)).map((s) => s.id);

  const pillarSectionByPillar: Record<PerPillar, string> = {
    scientific_validity: 'scientific_validity',
    analytical: 'analytical_performance',
    clinical: 'clinical_performance',
  };
  const pillarsCovered: PerPillar[] = [];
  const pillarsMissing: PerPillar[] = [];
  for (const p of PER_PILLARS) {
    (present.has(pillarSectionByPillar[p.id]) ? pillarsCovered : pillarsMissing).push(p.id);
  }

  return {
    ready: missingRequiredSections.length === 0,
    missingRequiredSections,
    pillarsCovered,
    pillarsMissing,
    presentCount: required.length - missingRequiredSections.length,
    totalRequired: required.length,
  };
}

export default {
  PER_PILLARS,
  ANALYTICAL_METRICS,
  CLINICAL_METRICS,
  PER_SECTIONS,
  getPerSection,
  perSectionIds,
  metricsForPillar,
  perReviewerQuestions,
  assessPerStructure,
};
