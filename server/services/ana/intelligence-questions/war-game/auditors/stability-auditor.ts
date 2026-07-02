/**
 * Stability Auditor -- simulates FDA CMC reviewer scrutiny of a stability
 * study program per ICH Q1A-Q1F.
 *
 * Generates adversarial questions across seven audit dimensions, referencing
 * ICH Q1A(R2), Q1B, Q1C, Q1D, Q1E, Q1F, Q5C, 21 CFR 211.166,
 * 21 CFR 314.81(b)(1), and FDA Guidance on Stability Data (2004).
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/stability-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const rid = (suffix: string) => 'stab_' + suffix;

function isBlank(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

function numericVal(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function finding(
  id: string,
  dimension: AuditDimension,
  severity: 'info' | 'warning' | 'critical',
  title: string,
  question: string,
  observation: string,
  requirement: string,
  reference: string,
  recommendation: string,
  relatedFields: string[],
): WarGameFinding {
  return { id, dimension, severity, title, question, observation, requirement, reference, recommendation, relatedFields };
}

/* ------------------------------------------------------------------ */
/*  Audit Rules                                                       */
/* ------------------------------------------------------------------ */

const rules: AuditRule[] = [
  /* ========== COMPLETENESS (5 rules) ========== */
  {
    id: rid('fewer_than_3_batches'),
    dimension: 'completeness',
    title: 'Fewer Than Three Batches in Stability Program',
    question: 'ICH Q1A(R2) requires stability data on at least three batches. How does the sponsor justify a stability program with fewer than three batches?',
    check(answers) {
      const batches = numericVal(answers.stability_batch_count);
      if (batches !== null && batches < 3) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Only ${batches} batch(es) included in the stability program. ICH Q1A(R2) requires a minimum of three batches.`,
          'ICH Q1A(R2) Section 2.1.2 mandates stability data on at least three batches of the drug substance or drug product to establish a retest period or shelf life.',
          'ICH Q1A(R2) Section 2.1.2; 21 CFR 211.166(a)',
          'Include stability data from at least three production-scale batches (or pilot-scale batches of at least 1/10 production scale) manufactured by the proposed commercial process.',
          ['stability_batch_count', 'batch_scale'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_long_term_data'),
    dimension: 'completeness',
    title: 'No Long-Term Stability Data',
    question: 'The submission does not contain long-term stability data at 25 °C/60% RH (or 30 °C/65% RH for Zone IVa). Without long-term data, how can the Agency evaluate the proposed shelf life?',
    check(answers) {
      if (isBlank(answers.long_term_stability_data)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Long-term stability data are absent from the submission.',
          'ICH Q1A(R2) Section 2.2.7.1 requires long-term stability studies at 25 ± 2 °C / 60 ± 5% RH (or 30 ± 2 °C / 65 ± 5% RH) with a minimum of 12 months of data at time of submission.',
          'ICH Q1A(R2) Section 2.2.7.1; 21 CFR 211.166(a)(3)',
          'Provide long-term stability data covering at least 12 months and commit to ongoing studies through the proposed shelf life. Submit updated data in annual reports per 21 CFR 314.81(b)(2).',
          ['long_term_stability_data', 'storage_conditions', 'proposed_shelf_life'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_accelerated_data'),
    dimension: 'completeness',
    title: 'No Accelerated Stability Data',
    question: 'Accelerated stability data at 40 °C/75% RH are absent. Without accelerated studies, how does the sponsor intend to support shelf-life extrapolation beyond available long-term data per ICH Q1E?',
    check(answers) {
      if (isBlank(answers.accelerated_stability_data)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Accelerated stability data (40 °C/75% RH, 6 months) are not included.',
          'ICH Q1A(R2) Section 2.2.7.2 requires accelerated studies at 40 ± 2 °C / 75 ± 5% RH for a minimum of 6 months to support shelf-life extrapolation.',
          'ICH Q1A(R2) Section 2.2.7.2; ICH Q1E Section 3',
          'Conduct 6-month accelerated stability studies at 40 ± 2 °C / 75 ± 5% RH. If significant change occurs, include intermediate condition data at 30 ± 2 °C / 65 ± 5% RH.',
          ['accelerated_stability_data', 'significant_change_observed'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_photostability'),
    dimension: 'completeness',
    title: 'No Photostability Study per ICH Q1B',
    question: 'The submission does not include photostability data. ICH Q1B requires confirmatory photostability testing. How does the sponsor demonstrate that the product is adequately protected from light exposure?',
    check(answers) {
      if (isBlank(answers.photostability_data)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Photostability studies per ICH Q1B are not provided.',
          'ICH Q1B (Photostability Testing) requires confirmatory studies on at least one batch of drug substance and drug product, both with and without the immediate container closure.',
          'ICH Q1B; ICH Q1A(R2) Section 2.2.6',
          'Conduct photostability testing per ICH Q1B using Option 1 (D65 lamp) or Option 2 (cool white fluorescent + UV lamp), meeting the minimum exposure of 1.2 million lux-hours visible and 200 Wh/m2 UV. Test the drug product both exposed and in the proposed market packaging.',
          ['photostability_data', 'container_closure_system'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_container_closure_testing'),
    dimension: 'completeness',
    title: 'Container Closure System Not Evaluated in Stability',
    question: 'The stability program does not appear to include testing of the product in its final market container closure system. How can the Agency assess whether the packaging adequately protects the product?',
    check(answers) {
      if (isBlank(answers.container_closure_stability)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Stability testing was not conducted on product in its proposed market container closure system.',
          'ICH Q1A(R2) Section 2.2.2 requires that stability studies be conducted on the drug product packaged in the container closure system proposed for marketing.',
          'ICH Q1A(R2) Section 2.2.2; 21 CFR 211.166(a)(2)',
          'Conduct stability studies using the proposed market container closure system, including any secondary packaging that is part of the labeling claim. Evaluate container-related attributes (e.g., extractables/leachables, moisture permeation).',
          ['container_closure_stability', 'container_closure_system', 'packaging_description'],
        );
      }
      return null;
    },
  },

  /* ========== CONSISTENCY (4 rules) ========== */
  {
    id: rid('storage_conditions_mismatch'),
    dimension: 'consistency',
    title: 'Storage Conditions Inconsistent with Product Type',
    question: 'The storage conditions selected for stability testing do not appear consistent with the product type. Can the sponsor justify why the chosen conditions are appropriate for this dosage form?',
    check(answers) {
      const productType = String(answers.product_type ?? '').toLowerCase();
      const storageTemp = String(answers.storage_conditions ?? '').toLowerCase();
      const isBiologic = productType.includes('biolog') || productType.includes('protein') || productType.includes('antibod') || productType.includes('vaccine');
      if (isBiologic && storageTemp.includes('25') && !storageTemp.includes('5') && !storageTemp.includes('2-8') && !storageTemp.includes('refriger')) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Product type "${answers.product_type}" is a biological product but storage conditions ("${answers.storage_conditions}") appear to use room-temperature conditions rather than refrigerated (2-8 °C) conditions typical for biologics.`,
          'ICH Q5C (Stability Testing of Biotechnological/Biological Products) requires that storage conditions reflect the intended storage temperature, typically 5 ± 3 °C for biologics.',
          'ICH Q5C; ICH Q1A(R2) Section 2.2.7',
          'Align storage conditions with the product type. For biologics, conduct studies at 5 ± 3 °C (long-term) and 25 ± 2 °C / 60 ± 5% RH (accelerated). Include stress studies to establish degradation pathways.',
          ['storage_conditions', 'product_type'],
        );
      }
      return null;
    },
  },
  {
    id: rid('nonstandard_testing_intervals'),
    dimension: 'consistency',
    title: 'Non-Standard Testing Intervals',
    question: 'The testing intervals deviate from the ICH Q1A(R2) recommended schedule. How does the sponsor justify this departure and ensure adequate characterization of the stability profile?',
    check(answers) {
      const intervals = String(answers.testing_intervals ?? '').toLowerCase();
      if (!isBlank(intervals) && !intervals.includes('3') && !intervals.includes('6') && !intervals.includes('9') && !intervals.includes('12')) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Testing intervals "${answers.testing_intervals}" do not follow the standard ICH schedule (0, 3, 6, 9, 12 months for the first year, then every 6 months through 24 months, then annually).`,
          'ICH Q1A(R2) Section 2.2.8 recommends testing at intervals sufficient to establish the stability profile: 0, 3, 6, 9, 12 months in the first year, every 6 months in the second year, then annually.',
          'ICH Q1A(R2) Section 2.2.8; ICH Q1D (Bracketing and Matrixing)',
          'Adopt the standard ICH testing schedule or provide scientific justification for deviations. If using matrixing or bracketing per ICH Q1D, document the design and rationale.',
          ['testing_intervals', 'stability_protocol'],
        );
      }
      return null;
    },
  },
  {
    id: rid('batch_size_not_representative'),
    dimension: 'consistency',
    title: 'Batch Sizes Not Representative of Production Scale',
    question: 'The batches used in stability studies are substantially smaller than the proposed commercial batch size. Can the sponsor demonstrate that the stability profile is representative of production-scale manufacturing?',
    check(answers) {
      const batchScale = String(answers.batch_scale ?? '').toLowerCase();
      if (!isBlank(batchScale) && (batchScale.includes('lab') || batchScale.includes('bench') || batchScale.includes('small'))) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Batch scale "${answers.batch_scale}" indicates laboratory or bench-scale batches, which may not be representative of the proposed commercial manufacturing process.`,
          'ICH Q1A(R2) Section 2.1.2 requires batches of at least pilot scale (minimum 1/10 of production scale or 100,000 units, whichever is larger) for drug product stability.',
          'ICH Q1A(R2) Section 2.1.2; 21 CFR 211.166(a)',
          'Include stability data from at least pilot-scale batches manufactured using the proposed commercial process and equipment. Provide a commitment to place the first three commercial-scale batches on stability.',
          ['batch_scale', 'stability_batch_count', 'commercial_batch_size'],
        );
      }
      return null;
    },
  },
  {
    id: rid('spec_limits_inconsistent'),
    dimension: 'consistency',
    title: 'Stability Specification Limits Inconsistent with Release',
    question: 'The acceptance criteria used for stability testing appear to differ from release specifications without scientific justification. How does the sponsor reconcile this inconsistency?',
    check(answers) {
      const stabSpecs = answers.stability_specifications;
      const releaseSpecs = answers.release_specifications;
      if (!isBlank(stabSpecs) && !isBlank(releaseSpecs) && String(stabSpecs) !== String(releaseSpecs) && isBlank(answers.spec_justification)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Stability acceptance criteria differ from release specifications without documented justification.',
          'ICH Q6A/Q6B and Q1A(R2) expect stability specifications to be derived from release specifications with scientifically justified differences where applicable.',
          'ICH Q1A(R2) Section 2.2.5; ICH Q6A; ICH Q6B',
          'Provide scientific justification for any differences between release and stability specifications. Ensure all stability-indicating parameters from the release specification are included in the stability testing program.',
          ['stability_specifications', 'release_specifications', 'spec_justification'],
        );
      }
      return null;
    },
  },

  /* ========== REGULATORY ALIGNMENT (4 rules) ========== */
  {
    id: rid('q1a_testing_not_followed'),
    dimension: 'regulatory_alignment',
    title: 'ICH Q1A(R2) Testing Protocol Not Followed',
    question: 'The stability testing program does not appear to conform to ICH Q1A(R2) requirements. Can the sponsor identify which elements are missing and provide a remediation plan?',
    check(answers) {
      if (isBlank(answers.ich_q1a_compliance) || String(answers.ich_q1a_compliance).toLowerCase() === 'no') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The stability program does not conform to ICH Q1A(R2) requirements or conformance has not been documented.',
          'ICH Q1A(R2) is the foundational guideline for stability testing of new drug substances and products. FDA expects compliance per 21 CFR 211.166.',
          'ICH Q1A(R2); 21 CFR 211.166; FDA Guidance for Industry: Stability Testing (2004)',
          'Conduct a gap analysis against ICH Q1A(R2) and develop a remediation plan addressing all deficiencies including study design, storage conditions, testing parameters, and data evaluation.',
          ['ich_q1a_compliance', 'stability_protocol'],
        );
      }
      return null;
    },
  },
  {
    id: rid('q1e_extrapolation_violated'),
    dimension: 'regulatory_alignment',
    title: 'ICH Q1E Extrapolation Rules Violated',
    question: 'The proposed shelf life appears to extend beyond what is supported by the available data under ICH Q1E extrapolation principles. Can the sponsor provide statistical justification for this claim?',
    check(answers) {
      const dataMonths = numericVal(answers.long_term_data_months);
      const shelfLife = numericVal(answers.proposed_shelf_life_months);
      if (dataMonths !== null && shelfLife !== null && shelfLife > dataMonths * 2) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Proposed shelf life of ${shelfLife} months is more than double the available long-term data (${dataMonths} months), exceeding ICH Q1E extrapolation limits.`,
          'ICH Q1E Section 4 limits shelf-life extrapolation to no more than twice the period covered by long-term data, and only when supported by statistical analysis and accelerated data.',
          'ICH Q1E Sections 3-4; FDA Guidance for Industry: Stability Testing (2004)',
          'Limit the proposed shelf life to a period supportable by ICH Q1E statistical analysis. Submit additional long-term data in annual reports to support future shelf-life extensions.',
          ['proposed_shelf_life_months', 'long_term_data_months', 'statistical_analysis_performed'],
        );
      }
      return null;
    },
  },
  {
    id: rid('q1f_climatic_zone_not_considered'),
    dimension: 'regulatory_alignment',
    title: 'Climatic Zone Not Considered for Target Markets',
    question: 'The stability program does not appear to address climatic zone requirements for all intended markets. ICH Q1F and WHO guidelines require storage conditions appropriate to the distribution climate. How does the sponsor ensure stability in Zone III/IVa/IVb markets?',
    check(answers) {
      const targetMarkets = String(answers.target_markets ?? '').toLowerCase();
      const hasZoneIV = targetMarkets.includes('tropic') || targetMarkets.includes('africa') || targetMarkets.includes('southeast asia') || targetMarkets.includes('brazil') || targetMarkets.includes('india') || targetMarkets.includes('zone iv');
      if (hasZoneIV && isBlank(answers.climatic_zone_studies)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Target markets include tropical/Zone IV regions ("${answers.target_markets}") but no climatic zone-specific stability studies are documented.`,
          'ICH Q1F (withdrawn but referenced by WHO) and WHO Technical Report Series No. 953 require stability testing at 30 ± 2 °C / 65 ± 5% RH (Zone III) or 30 ± 2 °C / 75 ± 5% RH (Zone IVa/IVb) for tropical markets.',
          'ICH Q1F; WHO TRS 953 Annex 2; ICH Q1A(R2) Section 2.2.7',
          'Include long-term stability studies at conditions appropriate for the highest climatic zone among target markets. For Zone IVb markets, conduct studies at 30 ± 2 °C / 75 ± 5% RH.',
          ['target_markets', 'climatic_zone_studies', 'storage_conditions'],
        );
      }
      return null;
    },
  },
  {
    id: rid('biologics_not_q5c'),
    dimension: 'regulatory_alignment',
    title: 'Biologic Product Not Tested per ICH Q5C',
    question: 'This appears to be a biotechnological/biological product, yet the stability program does not reference ICH Q5C. Can the sponsor confirm that potency, purity, and molecular integrity are assessed throughout the study?',
    check(answers) {
      const productType = String(answers.product_type ?? '').toLowerCase();
      const isBiologic = productType.includes('biolog') || productType.includes('protein') || productType.includes('antibod') || productType.includes('vaccine') || productType.includes('cell') || productType.includes('gene');
      if (isBiologic && isBlank(answers.q5c_compliance)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Product type "${answers.product_type}" suggests a biological product, but compliance with ICH Q5C is not documented.`,
          'ICH Q5C requires stability testing of biotechnological/biological products to include potency assays, purity (e.g., SEC, CE-SDS), and characterization of degradation products (aggregates, fragments, charge variants).',
          'ICH Q5C; 21 CFR 211.166; FDA Guidance: Content and Format of Chemistry, Manufacturing and Controls Information for a Therapeutic Recombinant DNA-Derived Product (1996)',
          'Design the stability program per ICH Q5C, including bioassay/potency, size variants (SEC), charge variants (IEX/iCIEF), subvisible and visible particles, and container closure integrity testing at each time point.',
          ['product_type', 'q5c_compliance', 'stability_tests_performed'],
        );
      }
      return null;
    },
  },

  /* ========== SCIENTIFIC RIGOR (4 rules) ========== */
  {
    id: rid('no_stability_indicating_method'),
    dimension: 'scientific_rigor',
    title: 'No Stability-Indicating Analytical Method',
    question: 'The submission does not demonstrate that the analytical methods used are stability-indicating. Without validated stability-indicating methods, how can the Agency rely on the reported stability data?',
    check(answers) {
      if (isBlank(answers.stability_indicating_method)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No stability-indicating analytical method is described or validated.',
          '21 CFR 211.166(a)(3) requires that stability testing use reliable, meaningful, and specific test methods. ICH Q2(R1) requires methods to be validated for specificity, including the ability to detect degradation products.',
          '21 CFR 211.166(a)(3); ICH Q2(R1); ICH Q1A(R2) Section 2.2.4',
          'Develop and validate stability-indicating methods that can resolve the active ingredient from degradation products, impurities, and excipient interferences. Include forced degradation studies to demonstrate specificity.',
          ['stability_indicating_method', 'forced_degradation_data'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_forced_degradation'),
    dimension: 'scientific_rigor',
    title: 'No Forced Degradation Studies',
    question: 'Forced degradation (stress testing) data are absent. Without understanding degradation pathways under acid, base, oxidative, thermal, and photolytic conditions, how does the sponsor validate that analytical methods are stability-indicating?',
    check(answers) {
      if (isBlank(answers.forced_degradation_data)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Forced degradation (stress testing) studies have not been conducted or reported.',
          'ICH Q1A(R2) Section 2.1.6 requires stress testing to elucidate intrinsic degradation pathways and to validate the specificity of stability-indicating methods.',
          'ICH Q1A(R2) Section 2.1.6; ICH Q2(R1)',
          'Conduct stress testing under acid hydrolysis, base hydrolysis, oxidation (H2O2), thermal stress, photolysis (per Q1B), and humidity. Characterize degradation products and demonstrate method specificity.',
          ['forced_degradation_data', 'degradation_pathways', 'stability_indicating_method'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_statistical_analysis'),
    dimension: 'scientific_rigor',
    title: 'Statistical Analysis per ICH Q1E Not Performed',
    question: 'The stability data have not been subjected to statistical analysis per ICH Q1E. How was the shelf life determined without regression analysis of quantitative attributes?',
    check(answers) {
      if (isBlank(answers.statistical_analysis_performed) || String(answers.statistical_analysis_performed).toLowerCase() === 'no') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Statistical analysis of stability data per ICH Q1E has not been performed.',
          'ICH Q1E requires regression analysis of quantitative stability attributes to determine the time at which the 95% one-sided confidence limit intersects the acceptance criterion.',
          'ICH Q1E Sections 2-4; FDA Guidance for Industry: Stability Testing (2004)',
          'Perform regression analysis per ICH Q1E on quantitative stability attributes (e.g., assay, degradation products). Evaluate whether data from multiple batches can be pooled or require individual analysis. Report the statistical shelf life with 95% confidence.',
          ['statistical_analysis_performed', 'proposed_shelf_life_months', 'long_term_data_months'],
        );
      }
      return null;
    },
  },
  {
    id: rid('degradation_pathways_unknown'),
    dimension: 'scientific_rigor',
    title: 'Degradation Pathways Not Characterized',
    question: 'The major degradation pathways have not been identified or characterized. Without this understanding, how does the sponsor ensure that all relevant degradation products are monitored during stability studies?',
    check(answers) {
      if (isBlank(answers.degradation_pathways)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Degradation pathways of the drug substance/product have not been identified or characterized.',
          'ICH Q1A(R2) Section 2.1.6 and ICH Q3A/Q3B require identification of degradation products and understanding of degradation mechanisms.',
          'ICH Q1A(R2) Section 2.1.6; ICH Q3A(R2); ICH Q3B(R2)',
          'Characterize the primary degradation pathways (hydrolysis, oxidation, photolysis, etc.) and identify individual degradation products exceeding ICH Q3B reporting thresholds. Include mass balance analysis.',
          ['degradation_pathways', 'forced_degradation_data', 'stability_tests_performed'],
        );
      }
      return null;
    },
  },

  /* ========== PRACTICAL FEASIBILITY (4 rules) ========== */
  {
    id: rid('chambers_not_qualified'),
    dimension: 'practical_feasibility',
    title: 'Stability Chambers Not Qualified',
    question: 'There is no evidence that the stability storage chambers have been qualified (IQ/OQ/PQ) or that temperature/humidity are continuously monitored. How does the sponsor ensure that storage conditions are maintained throughout the study?',
    check(answers) {
      if (isBlank(answers.chamber_qualification)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Qualification (IQ/OQ/PQ) of stability chambers and continuous environmental monitoring records are not documented.',
          '21 CFR 211.166 requires appropriate storage conditions for stability testing. FDA expects chambers to be qualified and monitored to ensure temperature and humidity uniformity.',
          '21 CFR 211.68; 21 CFR 211.166; FDA Guidance: Equipment Qualification (2004)',
          'Provide IQ/OQ/PQ qualification records for all stability chambers, including temperature/humidity mapping, alarm systems, and continuous monitoring with documented excursion procedures.',
          ['chamber_qualification', 'environmental_monitoring'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_hold_time_studies'),
    dimension: 'practical_feasibility',
    title: 'Hold-Time Studies Missing',
    question: 'No hold-time studies have been conducted for in-process materials or bulk drug substance. How does the sponsor ensure product quality is maintained during manufacturing hold points?',
    check(answers) {
      if (isBlank(answers.hold_time_studies)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Hold-time studies for intermediate/in-process materials or bulk drug substance are not documented.',
          'FDA expects hold-time validation as part of process validation per 21 CFR 211.111 to ensure that materials held during manufacturing do not degrade beyond acceptable limits.',
          '21 CFR 211.111; FDA Guidance: Process Validation (2011); ICH Q1A(R2)',
          'Conduct hold-time studies for all in-process hold points covering worst-case hold conditions (time, temperature, container). Define validated hold times and incorporate into manufacturing batch records.',
          ['hold_time_studies', 'manufacturing_process'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_in_use_stability'),
    dimension: 'practical_feasibility',
    title: 'In-Use Stability Not Evaluated',
    question: 'For multi-dose products, no in-use stability data have been provided. How does the sponsor support the proposed in-use shelf life after the container is first opened or reconstituted?',
    check(answers) {
      const dosageForm = String(answers.dosage_form ?? '').toLowerCase();
      const isMultiDose = dosageForm.includes('multi-dose') || dosageForm.includes('multi dose') || dosageForm.includes('reconstitut') || dosageForm.includes('solution') || dosageForm.includes('suspension') || dosageForm.includes('injection');
      if (isMultiDose && isBlank(answers.in_use_stability_data)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Dosage form "${answers.dosage_form}" may require in-use stability evaluation, but no in-use data are provided.`,
          'ICH Q1A(R2) Section 2.2.9 states that in-use stability studies should be conducted for multi-dose products to simulate patient or healthcare professional use after first opening.',
          'ICH Q1A(R2) Section 2.2.9; FDA Guidance for Industry: Container Closure Systems (1999)',
          'Design in-use stability studies that simulate actual use conditions (repeated opening, withdrawal of doses, reconstitution) and establish a validated in-use period with supporting data.',
          ['in_use_stability_data', 'dosage_form', 'in_use_shelf_life'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_shipping_validation'),
    dimension: 'practical_feasibility',
    title: 'Shipping/Transportation Stability Not Addressed',
    question: 'The submission does not include transportation or shipping validation data. How does the sponsor ensure product quality is maintained during distribution, especially for temperature-sensitive products?',
    check(answers) {
      if (isBlank(answers.shipping_validation)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'Shipping/transportation validation or stress studies simulating distribution conditions are not provided.',
          'FDA expects that the stability program address distribution conditions. 21 CFR 211.150 requires appropriate storage during distribution, and cycling studies may be appropriate to simulate temperature fluctuations.',
          '21 CFR 211.150; ICH Q1A(R2) Section 2.2.7; USP <1079>',
          'Conduct shipping/transportation validation studies including thermal cycling, vibration, and duration representative of the worst-case distribution chain. For cold-chain products, validate the shipping configuration.',
          ['shipping_validation', 'storage_conditions', 'cold_chain_required'],
        );
      }
      return null;
    },
  },

  /* ========== DOCUMENTATION (4 rules) ========== */
  {
    id: rid('no_stability_protocol'),
    dimension: 'documentation',
    title: 'No Stability Protocol',
    question: 'A written stability protocol has not been submitted. How does the sponsor document the study design, acceptance criteria, and testing schedule to ensure reproducibility and regulatory compliance?',
    check(answers) {
      if (isBlank(answers.stability_protocol)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No written stability protocol or study plan is included in the submission.',
          '21 CFR 211.166(a) requires a written testing program designed to assess the stability characteristics of drug products, including sample size, test intervals, storage conditions, and test methods.',
          '21 CFR 211.166(a); ICH Q1A(R2) Section 2.2.1',
          'Develop and submit a comprehensive stability protocol that includes: study design (batches, conditions, time points), test parameters, acceptance criteria, methods references, and data evaluation procedures.',
          ['stability_protocol'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_stability_commitment'),
    dimension: 'documentation',
    title: 'Stability Commitment per 21 CFR 314.81 Missing',
    question: 'The submission lacks a stability commitment for ongoing and post-approval stability studies. Under 21 CFR 314.81(b)(1), how will the sponsor meet its post-approval obligation to continue stability testing?',
    check(answers) {
      if (isBlank(answers.stability_commitment)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No post-approval stability commitment is documented per 21 CFR 314.81(b)(1).',
          '21 CFR 314.81(b)(1) requires the applicant to provide a stability commitment including the number of batches per year to be placed on long-term stability and the protocol to be followed.',
          '21 CFR 314.81(b)(1); FDA Guidance for Industry: Stability Testing (2004)',
          'Include a stability commitment specifying: (1) number of batches per year to be placed on stability (typically 1 per strength per year until 3 production batches are tested), (2) the protocol to follow, and (3) commitment to report results in annual reports.',
          ['stability_commitment', 'annual_report_plan'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_annual_report_plan'),
    dimension: 'documentation',
    title: 'Annual Stability Report Plan Not Defined',
    question: 'The sponsor has not described plans for including stability data in annual reports. How does the sponsor intend to comply with the reporting requirements under 21 CFR 314.81(b)(2)?',
    check(answers) {
      if (isBlank(answers.annual_report_plan)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No plan for reporting ongoing stability data in NDA/ANDA annual reports.',
          '21 CFR 314.81(b)(2) requires that annual reports include results from stability studies and any changes to the stability protocol.',
          '21 CFR 314.81(b)(2); FDA Guidance for Industry: Stability Testing (2004)',
          'Document a plan for including stability data summaries and trend analyses in annual reports, covering both ongoing and post-approval commitment batches. Include out-of-specification/out-of-trend investigation procedures.',
          ['annual_report_plan', 'stability_commitment'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_oos_oot_procedures'),
    dimension: 'documentation',
    title: 'No OOS/OOT Investigation Procedures',
    question: 'The stability protocol does not include procedures for handling out-of-specification (OOS) or out-of-trend (OOT) results. How will the sponsor investigate and manage unexpected stability failures?',
    check(answers) {
      if (isBlank(answers.oos_oot_procedures)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No out-of-specification (OOS) or out-of-trend (OOT) investigation procedures are documented for stability studies.',
          '21 CFR 211.192 requires investigation of any unexplained discrepancy or failure. FDA Guidance on OOS Results (2006) provides a framework for laboratory investigation of unexpected test results.',
          '21 CFR 211.192; FDA Guidance: Investigating Out-of-Specification Test Results (2006); ICH Q1E',
          'Include OOS/OOT investigation procedures in the stability protocol covering: initial data review, laboratory investigation, expanded investigation if needed, root cause analysis, and impact assessment on other batches.',
          ['oos_oot_procedures', 'stability_protocol'],
        );
      }
      return null;
    },
  },

  /* ========== RISK IDENTIFICATION (3 rules) ========== */
  {
    id: rid('significant_change_not_investigated'),
    dimension: 'risk_identification',
    title: 'Significant Change at Accelerated Conditions Not Investigated',
    question: 'The accelerated stability data indicate significant change, yet the submission does not include intermediate condition data or a root cause investigation. How does the sponsor justify the proposed shelf life when the product degrades under stress?',
    check(answers) {
      const sigChange = String(answers.significant_change_observed ?? '').toLowerCase();
      if (sigChange === 'yes' || sigChange === 'true') {
        const hasIntermediate = !isBlank(answers.intermediate_condition_data);
        const hasInvestigation = !isBlank(answers.significant_change_investigation);
        if (!hasIntermediate || !hasInvestigation) {
          return finding(
            this.id,
            this.dimension,
            'critical',
            this.title,
            this.question,
            `Significant change was observed at accelerated conditions but ${!hasIntermediate ? 'intermediate condition data (30 °C/65% RH) are missing' : 'root cause investigation is not documented'}.`,
            'ICH Q1A(R2) Section 2.2.7.2 states that when significant change occurs at accelerated conditions, additional testing at intermediate conditions (30 ± 2 °C / 65 ± 5% RH) must be conducted, and the shelf life should be based on long-term data without extrapolation.',
            'ICH Q1A(R2) Section 2.2.7.2; ICH Q1E Section 4.1',
            'Conduct testing at intermediate conditions (30 ± 2 °C / 65 ± 5% RH) for 12 months minimum. Investigate the degradation mechanism causing significant change. Limit shelf life to available long-term data without extrapolation.',
            ['significant_change_observed', 'intermediate_condition_data', 'significant_change_investigation'],
          );
        }
      }
      return null;
    },
  },
  {
    id: rid('excessive_shelf_life_extrapolation'),
    dimension: 'risk_identification',
    title: 'Shelf Life Extrapolation Exceeds Available Data by More Than 2x',
    question: 'The proposed shelf life is more than double the available long-term stability data. ICH Q1E limits extrapolation to cases where statistical analysis and accelerated data support it. Can the sponsor justify this aggressive extrapolation?',
    check(answers) {
      const dataMonths = numericVal(answers.long_term_data_months);
      const shelfLife = numericVal(answers.proposed_shelf_life_months);
      if (dataMonths !== null && shelfLife !== null && dataMonths > 0 && shelfLife > dataMonths * 2) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Proposed shelf life (${shelfLife} months) exceeds 2x the available long-term data (${dataMonths} months). This extrapolation is ${((shelfLife / dataMonths) * 100).toFixed(0)}% of available data.`,
          'ICH Q1E Section 4 generally limits extrapolation to no more than twice (but no more than 12 months beyond) the period covered by long-term data, conditional on supporting statistical analysis and absence of significant change at accelerated conditions.',
          'ICH Q1E Sections 3-4; FDA Guidance for Industry: Stability Testing (2004)',
          'Reduce the proposed shelf life to align with ICH Q1E limits, or provide additional long-term data. Commit to updating the shelf life in annual reports as more data become available.',
          ['proposed_shelf_life_months', 'long_term_data_months'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_post_approval_stability_commitment'),
    dimension: 'risk_identification',
    title: 'No Post-Approval Stability Commitment',
    question: 'The sponsor has not committed to placing annual production batches on stability post-approval. Without ongoing monitoring, how will the sponsor detect potential manufacturing drift or raw material changes that could impact product quality over time?',
    check(answers) {
      if (isBlank(answers.post_approval_stability_plan)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No post-approval stability monitoring commitment is included in the submission.',
          '21 CFR 314.81(b)(1) requires a stability commitment. FDA expects annual stability batches to be placed on the approved stability protocol as part of ongoing quality assurance.',
          '21 CFR 314.81(b)(1); ICH Q1A(R2) Section 2.1.7; FDA Guidance for Industry: Stability Testing (2004)',
          'Commit to placing at least one batch per year per strength on the approved stability protocol. Define triggers for additional stability studies (e.g., process changes, raw material supplier changes, site transfers).',
          ['post_approval_stability_plan', 'stability_commitment'],
        );
      }
      return null;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createStabilityAuditor(): WarGameAuditor {
  return {
    category: 'stability',
    name: 'FDA CMC Stability Reviewer',
    description:
      'Simulates an FDA CMC reviewer performing a stability program assessment per ICH Q1A-Q1F, ' +
      'evaluating batch selection, storage conditions, testing parameters, statistical analysis, ' +
      'container closure, photostability, regulatory compliance, and post-approval commitments.',
    rules,
  };
}
