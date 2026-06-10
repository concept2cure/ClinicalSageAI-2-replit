/**
 * Shadow Review — RTF Benchmark Dataset (WO-8)
 *
 * A labeled benchmark for the deterministic Refuse-to-File / Refuse-to-Accept
 * (RTF/RTA) administrative gate, used to measure the existing RTF risk model
 * (`server/services/intelligence/risk-model.ts`) — we benchmark the model we
 * have, we do not build a new one.
 *
 * PROVENANCE & HONESTY
 * --------------------
 * This is a CRITERIA-GROUNDED benchmark, not licensed patient/sponsor data and
 * not a copy of the Chahal et al. dataset. Each example is a submission profile
 * whose features are real RTF/RTA risk factors and whose label follows the
 * PUBLIC refuse grounds enumerated below. Sources:
 *   - FDA "Refuse to Accept Policy for 510(k)s" (administrative RTA checklist)
 *   - FDA NDA/BLA Refuse-to-File standard — 21 CFR 314.101(d); FDA MAPP 6025.4
 *   - 21 CFR 54 (financial disclosure / certification)
 *   - Reason taxonomy informed by the PUBLIC categories in Chahal et al.,
 *     "Analysis of FDA Refuse-to-File Letters" (JAMA Intern Med, 2022).
 * The generator is deterministic (fixed seed) so the benchmark is reproducible.
 * Replacing this with real adjudicated RTF outcomes is a drop-in: keep the
 * feature schema, swap the examples.
 */

/** Feature schema — real RTF/RTA risk factors (0 = absent/ok, 1 = present/defect). */
export const RTF_FEATURE_NAMES = [
  'missing_required_forms', // FDA 1571/356h or eSTAR forms absent
  'unsigned_forms', // forms present but unsigned
  'missing_cover_letter',
  'missing_financial_certification', // 21 CFR 54
  'missing_clinical_overview', // CTD 2.5 absent for a marketing app
  'missing_integrated_summaries', // ISS/ISE absent
  'open_validation_errors', // normalized count of error-severity eCTD findings (0..1)
  'pdf_format_defects', // encrypted/bad-version PDFs
  'inadequate_efficacy_evidence', // no adequate well-controlled study
  'cmc_incomplete', // Module 3 materially incomplete
] as const;

export type RtfFeatureName = (typeof RTF_FEATURE_NAMES)[number];

export interface RtfGround {
  id: string;
  feature: RtfFeatureName;
  gate: 'administrative' | 'substantive';
  description: string;
  publicSource: string;
}

/** The public refuse grounds each feature maps to (the label rationale). */
export const RTF_GROUNDS: RtfGround[] = [
  { id: 'RTA-FORMS', feature: 'missing_required_forms', gate: 'administrative', description: 'Required application forms (FDA 1571/356h or eSTAR) are absent.', publicSource: 'FDA RTA Policy; 21 CFR 314.101(d)(3)' },
  { id: 'RTA-SIGN', feature: 'unsigned_forms', gate: 'administrative', description: 'Required forms are present but unsigned.', publicSource: 'FDA RTA Policy' },
  { id: 'RTA-COVER', feature: 'missing_cover_letter', gate: 'administrative', description: 'Cover letter / administrative transmittal absent.', publicSource: 'FDA eCTD Module 1 requirements' },
  { id: 'RTF-FIN', feature: 'missing_financial_certification', gate: 'administrative', description: 'Financial disclosure certification/ disclosure absent.', publicSource: '21 CFR 54; FDA MAPP 6025.4' },
  { id: 'RTF-2.5', feature: 'missing_clinical_overview', gate: 'administrative', description: 'Clinical Overview (CTD 2.5) absent for a marketing application.', publicSource: 'ICH M4E; 21 CFR 314.101(d)(2)' },
  { id: 'RTF-ISS', feature: 'missing_integrated_summaries', gate: 'substantive', description: 'Integrated Summary of Safety/Effectiveness (ISS/ISE) absent.', publicSource: 'FDA Guidance: Integrated Summaries; 21 CFR 314.101(d)(3)' },
  { id: 'RTA-VAL', feature: 'open_validation_errors', gate: 'administrative', description: 'Open error-severity eCTD technical validation findings.', publicSource: 'FDA eCTD Technical Conformance Guide' },
  { id: 'RTA-PDF', feature: 'pdf_format_defects', gate: 'administrative', description: 'Encrypted / out-of-spec PDFs the review tools cannot process.', publicSource: 'FDA eCTD Technical Conformance Guide' },
  { id: 'RTF-EFF', feature: 'inadequate_efficacy_evidence', gate: 'substantive', description: 'No adequate and well-controlled study supporting effectiveness.', publicSource: '21 CFR 314.101(d)(2)–(d)(5)' },
  { id: 'RTF-CMC', feature: 'cmc_incomplete', gate: 'substantive', description: 'Module 3 (CMC) is materially incomplete.', publicSource: '21 CFR 314.101(d)(3)' },
];

export interface BenchmarkExample {
  id: string;
  features: { readonly [k in RtfFeatureName]?: number };
  /** Ground truth: would the submission be refused (RTF/RTA)? */
  label: boolean;
  /** Public grounds that drove the label (empty when accepted). */
  groundIds: string[];
}

/**
 * Criteria label rule (grounded in the public refuse grounds above):
 *   - ANY administrative ground present → refuse (a single completeness failure
 *     is sufficient for RTA/RTF).
 *   - OR the substantive combination (inadequate efficacy AND CMC incomplete) →
 *     refuse. A single substantive weakness alone is treated as not-refused at
 *     the filing gate (it becomes a review-cycle issue), which keeps the
 *     administrative vs substantive boundary realistic.
 */
export function labelFor(features: { readonly [k in RtfFeatureName]?: number }): {
  label: boolean;
  groundIds: string[];
} {
  const on = (f: RtfFeatureName, thresh = 0.5) => (features[f] ?? 0) > thresh;
  const grounds: string[] = [];
  for (const g of RTF_GROUNDS) {
    if (g.gate === 'administrative' && on(g.feature)) grounds.push(g.id);
  }
  const substantiveRefuse = on('inadequate_efficacy_evidence') && on('cmc_incomplete');
  if (substantiveRefuse) {
    grounds.push('RTF-EFF', 'RTF-CMC');
  }
  return { label: grounds.length > 0, groundIds: grounds };
}

/** Deterministic Mulberry32 PRNG for reproducible example generation. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a reproducible labeled dataset. Each feature is sampled at a realistic
 * base prevalence (most submissions are administratively clean; defects are the
 * minority), then labeled by the public-grounds rule.
 */
export function generateRtfBenchmark(n = 240, seed = 0x5caffe1): BenchmarkExample[] {
  const rand = mulberry32(seed);
  // Base prevalence of each defect (administrative defects are rarer than
  // substantive weaknesses; chosen to give a non-degenerate positive rate).
  const prevalence: Record<RtfFeatureName, number> = {
    missing_required_forms: 0.08,
    unsigned_forms: 0.06,
    missing_cover_letter: 0.05,
    missing_financial_certification: 0.10,
    missing_clinical_overview: 0.07,
    missing_integrated_summaries: 0.12,
    open_validation_errors: 0.18,
    pdf_format_defects: 0.10,
    inadequate_efficacy_evidence: 0.20,
    cmc_incomplete: 0.18,
  };
  const examples: BenchmarkExample[] = [];
  for (let i = 0; i < n; i++) {
    const features: { [k in RtfFeatureName]?: number } = {};
    for (const f of RTF_FEATURE_NAMES) {
      if (f === 'open_validation_errors') {
        // continuous-ish: occasional defect with a normalized magnitude
        features[f] = rand() < prevalence[f] ? Number((0.5 + rand() * 0.5).toFixed(3)) : 0;
      } else {
        features[f] = rand() < prevalence[f] ? 1 : 0;
      }
    }
    const { label, groundIds } = labelFor(features);
    examples.push({ id: `rtf-${i.toString().padStart(4, '0')}`, features, label, groundIds });
  }
  return examples;
}

/** The default benchmark dataset (deterministic). */
export const RTF_BENCHMARK_DATASET: BenchmarkExample[] = generateRtfBenchmark();

export const RTF_BENCHMARK_PROVENANCE = {
  name: 'RTF/RTA criteria-grounded benchmark',
  version: '1.0.0',
  licensed: false,
  syntheticButCriteriaGrounded: true,
  sources: [
    'FDA Refuse to Accept Policy for 510(k)s',
    'FDA NDA/BLA Refuse-to-File standard (21 CFR 314.101(d); FDA MAPP 6025.4)',
    '21 CFR 54 (financial disclosure)',
    'Chahal et al., Analysis of FDA Refuse-to-File Letters, JAMA Intern Med 2022 (public reason taxonomy)',
  ],
  note: 'Labels follow the public refuse grounds enumerated in RTF_GROUNDS. Replace examples with real adjudicated RTF outcomes without changing the feature schema or harness.',
} as const;
