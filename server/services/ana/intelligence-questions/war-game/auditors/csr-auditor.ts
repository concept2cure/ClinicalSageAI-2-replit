/**
 * CSR (Clinical Study Report) War Game Auditor
 *
 * Simulates the combined scrutiny of an FDA statistical reviewer and medical
 * officer evaluating a Clinical Study Report against ICH E3, ICH E9,
 * ICH E6(R2), ICH E9(R1), and 21 CFR 314.50.
 *
 * Covers: ICH E3 structure compliance, synopsis-body-appendices consistency,
 * statistical analysis integrity (SAP deviations), efficacy-safety balance,
 * missing data impact, protocol amendment justification, GCP compliance,
 * DMC independence, subgroup analysis pre-specification, and multiplicity
 * adjustment.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/csr-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* ─── Helpers ──────────────────────────────────────────────────────────── */

const rid = (suffix: string) => 'csr_' + suffix;

/** Returns true when a value is null, undefined, or a blank/whitespace-only string. */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

/** Safely coerce a value to a number, returning null on failure. */
function toNumber(val: unknown): number | null {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Shorthand factory for a fully-populated WarGameFinding. */
function makeFinding(
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
  return {
    id, dimension, severity, title, question,
    observation, requirement, reference, recommendation, relatedFields,
  };
}

/* ─── Rules ────────────────────────────────────────────────────────────── */

const rules: AuditRule[] = [

  /* ════════════════════════════════════════════════════════════════════════
   *  1. Study Identification & ICH E3 Section 1 Compliance
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('study_identification'),
    dimension: 'completeness',
    title: 'Study identification missing or incomplete',
    question:
      'Per ICH E3 Section 1, every CSR must include a unique study identifier and a ' +
      'descriptive title on the title page. Can you confirm that both the protocol ' +
      'number and full title — including phase, design, indication, and investigational ' +
      'product — are present and unambiguous?',
    check(answers) {
      if (isBlank(answers.study_id) || isBlank(answers.study_title)) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'The study identifier and/or study title is missing from the CSR. An FDA reviewer ' +
          'cannot cross-reference this report with the IND application without proper identification.',
          'ICH E3 Section 1 requires a unique study identifier and a descriptive title that conveys ' +
          'the study phase, design, population, and investigational product.',
          'ICH E3, Section 1; 21 CFR 314.50(d)(5)(ii)',
          'Provide the sponsor-assigned protocol number and a title following the convention: ' +
          '"A Phase X, [Design], [Blinding], [Control] Study of [Drug] in [Population] with [Indication]."',
          ['study_id', 'study_title'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  2. Study Phase Identification
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('study_phase'),
    dimension: 'regulatory_alignment',
    title: 'Study phase not identified',
    question:
      'Per 21 CFR 312.21 and ICH E3 Section 1, the development phase determines ' +
      'the regulatory expectations for endpoint selection, sample size, and safety ' +
      'monitoring. Is the study phase clearly stated in the title page and synopsis?',
    check(answers) {
      if (isBlank(answers.study_phase)) {
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'The study phase is not identified. FDA statistical and medical reviewers require ' +
          'the phase designation to calibrate their review standards.',
          'The study phase (I, II, III, or IV) must be stated; it governs expectations for ' +
          'confirmatory evidence, safety exposure requirements (ICH E1), and endpoint rigor.',
          '21 CFR 312.21; ICH E3, Section 1; ICH E8',
          'Clearly state the study phase in the title page, synopsis, and body of the CSR. ' +
          'For adaptive or seamless designs, document both phases and the transition criteria.',
          ['study_phase'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  3. Study Design Description (ICH E3 Section 9.1)
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('study_design'),
    dimension: 'scientific_rigor',
    title: 'Study design insufficiently described',
    question:
      'ICH E3 Section 9.1 and ICH E9 Section 2 require a clear description of the ' +
      'study design, including randomization scheme, blinding method, control selection, ' +
      'and treatment period structure. Is the design adequately documented so an FDA ' +
      'reviewer can independently assess the validity of the trial?',
    check(answers) {
      if (isBlank(answers.study_design)) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'The study design description is absent. Without this, the FDA cannot evaluate whether ' +
          'the trial architecture adequately controls for bias.',
          'ICH E3 Section 9.1 mandates a clear summary of the overall design including type ' +
          '(parallel, crossover, factorial), randomization ratio, stratification factors, blinding, ' +
          'and comparator selection rationale.',
          'ICH E3, Section 9.1; ICH E9, Section 2; 21 CFR 314.126',
          'Describe the study type, randomization scheme (including stratification factors and ' +
          'block size), blinding procedure, comparator (placebo or active), and treatment period ' +
          'structure with planned duration.',
          ['study_design'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  4. Primary Objective Statement
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('primary_objective'),
    dimension: 'completeness',
    title: 'Primary objective not stated',
    question:
      'ICH E3 Sections 2 and 6 require a clear statement of the primary study ' +
      'objective in unambiguous, testable terms that link the intervention to the ' +
      'endpoint and the target population. Is the primary objective present?',
    check(answers) {
      if (isBlank(answers.primary_objective)) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'No primary objective statement is provided. The FDA requires a single, clearly ' +
          'articulated primary objective to anchor the review of efficacy evidence.',
          'The primary objective must be stated in the synopsis and protocol summary, and it ' +
          'must correspond directly to the primary endpoint and the statistical hypothesis.',
          'ICH E3, Sections 2 & 6; ICH E9, Section 2.1',
          'State the primary objective using language that specifies the intervention, ' +
          'the comparator, the primary endpoint, and the target population.',
          ['primary_objective'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  5. Sample Size Discrepancy (Planned vs. Enrolled)
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('sample_size_discrepancy'),
    dimension: 'consistency',
    title: 'Enrolled sample size deviates from planned',
    question:
      'ICH E9 Section 3.5 requires a pre-specified sample size calculation with ' +
      'stated assumptions. When the enrolled population deviates materially from ' +
      'the planned sample, the impact on statistical power must be assessed. Does ' +
      'enrollment match the target, and if not, is the shortfall addressed?',
    check(answers) {
      const planned = toNumber(answers.sample_size_planned);
      const enrolled = toNumber(answers.sample_size_enrolled);
      if (planned === null || enrolled === null || planned === 0) return null;
      if (enrolled < planned * 0.9) {
        const pctShortfall = ((1 - enrolled / planned) * 100).toFixed(1);
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          `Enrolled sample (n=${enrolled}) is ${pctShortfall}% below the planned size ` +
          `(N=${planned}). Under-enrollment may compromise the study's ability to detect ` +
          'the pre-specified treatment effect at the planned alpha and power.',
          'ICH E9 Section 3.5 requires that any material deviation from the planned sample ' +
          'size be justified, and the impact on statistical power must be discussed.',
          'ICH E9, Section 3.5; ICH E3, Section 11.1',
          'Provide a post-hoc power analysis reflecting the actual enrollment. Discuss ' +
          'whether the study remains adequately powered and whether a protocol amendment ' +
          'for sample size re-estimation was considered.',
          ['sample_size_planned', 'sample_size_enrolled'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  6. High Discontinuation Rate
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('discontinuation_rate'),
    dimension: 'risk_identification',
    title: 'Discontinuation rate exceeds acceptable threshold',
    question:
      'Per ICH E9 Section 5.3 and the NRC/FDA report on missing data (2010), a ' +
      'discontinuation rate above 20% raises concerns about informative censoring ' +
      'and potential bias in the ITT analysis. What is the observed rate, and how ' +
      'was differential dropout handled analytically?',
    check(answers) {
      const rate = toNumber(answers.discontinuation_rate);
      if (rate === null) return null;
      const pct = rate > 1 ? rate : rate * 100; // accept both 0.25 and 25
      if (pct > 20) {
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          `Discontinuation rate of ${pct.toFixed(1)}% exceeds the 20% threshold commonly ` +
          'flagged by FDA reviewers. High attrition may introduce bias, particularly if ' +
          'dropout is differential between treatment arms.',
          'High dropout biases ITT analyses and may invalidate efficacy conclusions. The ' +
          'estimand framework (ICH E9(R1)) requires explicit handling of intercurrent events ' +
          'including treatment discontinuation.',
          'ICH E9, Section 5.3; NRC Report on Missing Data (2010); ICH E9(R1)',
          'Conduct sensitivity analyses (tipping-point, pattern-mixture, delta-adjustment) ' +
          'to assess robustness of the primary result under varying dropout assumptions. ' +
          'Present discontinuation reasons by treatment arm in a CONSORT diagram.',
          ['discontinuation_rate', 'missing_data_handling', 'sample_size_enrolled', 'sample_size_completed'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  7. Completion Rate Consistency Check
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('completion_consistency'),
    dimension: 'consistency',
    title: 'Enrolled/completed/discontinued figures inconsistent',
    question:
      'Per ICH E3 Section 10, the patient disposition figures in the synopsis, body, ' +
      'and appendices must be internally consistent. Do the enrolled, completed, and ' +
      'discontinued numbers reconcile?',
    check(answers) {
      const enrolled = toNumber(answers.sample_size_enrolled);
      const completed = toNumber(answers.sample_size_completed);
      const discRate = toNumber(answers.discontinuation_rate);
      if (enrolled === null || completed === null) return null;
      if (completed > enrolled) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          `Completed subjects (${completed}) exceeds enrolled subjects (${enrolled}). ` +
          'This is a data integrity issue that an FDA reviewer would flag immediately.',
          'Patient disposition numbers must be internally consistent across the synopsis, ' +
          'Section 10 (disposition), and Appendix 16.2 (patient data listings).',
          'ICH E3, Section 10; ICH E3, Appendix 16.2',
          'Reconcile enrollment, randomization, treatment, completion, and discontinuation ' +
          'numbers. Verify consistency between the synopsis table, CONSORT diagram, and ' +
          'Section 10 narrative.',
          ['sample_size_enrolled', 'sample_size_completed', 'discontinuation_rate'],
        );
      }
      // Cross-check discontinuation rate vs. enrolled/completed gap
      if (discRate !== null && enrolled > 0 && completed > 0) {
        const impliedRate = ((enrolled - completed) / enrolled) * 100;
        const reportedRate = discRate > 1 ? discRate : discRate * 100;
        if (Math.abs(impliedRate - reportedRate) > 5) {
          return makeFinding(
            this.id, this.dimension, 'warning', this.title, this.question,
            `The reported discontinuation rate (${reportedRate.toFixed(1)}%) does not match ` +
            `the rate implied by enrolled (${enrolled}) minus completed (${completed}) = ` +
            `${impliedRate.toFixed(1)}%. This inconsistency will be identified during FDA review.`,
            'All disposition figures must reconcile across the CSR. Discrepancies suggest ' +
            'either arithmetic errors or inconsistent data sources.',
            'ICH E3, Section 10; ICH E3, Section 2 (Synopsis)',
            'Audit all disposition figures for internal consistency. Clarify the population ' +
            'denominator used for discontinuation rate calculation.',
            ['sample_size_enrolled', 'sample_size_completed', 'discontinuation_rate'],
          );
        }
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  8. Primary Endpoint Specification
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('primary_endpoint'),
    dimension: 'scientific_rigor',
    title: 'Primary endpoint not defined',
    question:
      'ICH E3 Section 9.5 and ICH E9 Section 2.2 require a single, clearly defined ' +
      'primary efficacy endpoint that is clinically meaningful and linked to the ' +
      'primary objective. Is the primary endpoint specified with its measurement ' +
      'instrument, time point, and responder definition (if applicable)?',
    check(answers) {
      if (isBlank(answers.primary_endpoint)) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'No primary efficacy endpoint is specified. Without a defined primary endpoint, ' +
          'the FDA cannot evaluate the statistical evidence for efficacy.',
          'Every confirmatory trial must designate a single primary endpoint that is clinically ' +
          'meaningful, reproducible, and aligned with the primary objective.',
          'ICH E3, Section 9.5; ICH E9, Section 2.2; 21 CFR 314.126',
          'Define the primary endpoint including: (1) the clinical variable measured, ' +
          '(2) the assessment time point, (3) the measurement instrument/method, and ' +
          '(4) the clinically meaningful difference used for sample size calculation.',
          ['primary_endpoint', 'primary_objective'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  9. Primary Analysis Method
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('analysis_method'),
    dimension: 'scientific_rigor',
    title: 'Primary analysis method not described',
    question:
      'ICH E9 Section 5 requires complete pre-specification of the primary statistical ' +
      'analysis in the SAP, including the model, covariates, analysis population, and ' +
      'handling of multiplicity. Is the analysis method described in the CSR, and does ' +
      'it match the SAP?',
    check(answers) {
      if (isBlank(answers.primary_analysis_method)) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'The primary statistical analysis method is not described. An FDA statistical ' +
          'reviewer cannot evaluate the validity of the efficacy conclusions without ' +
          'knowing the analytical approach.',
          'The statistical method must be pre-specified in the SAP and described in ' +
          'ICH E3 Section 11.4, including the model, primary analysis population ' +
          '(ITT/mITT/PP), covariates, and significance threshold.',
          'ICH E9, Section 5; ICH E3, Section 11.4; 21 CFR 314.50(d)(5)',
          'Specify the statistical model (e.g., ANCOVA, MMRM, Cox PH, logistic regression), ' +
          'the primary analysis population, pre-specified covariates, and confirm alignment ' +
          'with the SAP.',
          ['primary_analysis_method'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  10. P-value Reported Without Confidence Interval
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('p_value_without_ci'),
    dimension: 'scientific_rigor',
    title: 'P-value reported without confidence interval',
    question:
      'ICH E9 Section 5.5 emphasizes that p-values alone are insufficient for ' +
      'clinical interpretation. Confidence intervals and effect sizes are essential ' +
      'for the FDA to assess clinical significance, not merely statistical significance. ' +
      'Is a confidence interval provided alongside the p-value?',
    check(answers) {
      const pVal = toNumber(answers.p_value);
      if (pVal === null) return null;
      if (isBlank(answers.confidence_interval)) {
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          `A p-value of ${pVal} is reported but no corresponding confidence interval is ` +
          'provided. FDA statistical reviewers require both for assessment of the treatment ' +
          'effect magnitude and its clinical relevance.',
          'ICH E9 Section 5.5 states that confidence intervals should accompany all efficacy ' +
          'results. The FDA considers the CI essential for distinguishing a statistically ' +
          'significant result from a clinically meaningful one.',
          'ICH E9, Section 5.5; FDA Guidance on Statistical Principles for Clinical Trials',
          'Report the 95% confidence interval for the primary treatment difference. Discuss ' +
          'whether the lower bound of the CI exceeds the clinically meaningful threshold.',
          ['p_value', 'confidence_interval', 'primary_result_value'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  11. Safety Population Reconciliation
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('safety_population'),
    dimension: 'consistency',
    title: 'Safety analysis population not reported',
    question:
      'ICH E3 Section 12 requires that safety analyses be conducted on all subjects ' +
      'who received at least one dose of study treatment. Is the safety population ' +
      'defined, and does its size reconcile with the enrollment figures?',
    check(answers) {
      if (isBlank(answers.safety_population_size)) {
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'The safety analysis population size is not reported. Without this, the FDA ' +
          'cannot verify that safety data are analyzed on the appropriate population.',
          'The safety population must include every subject who received at least one dose ' +
          'of study treatment. Its size should be reconciled with enrollment and ' +
          'randomization figures.',
          'ICH E3, Section 12.1; ICH E6(R2), Section 4.11',
          'State the number of subjects in the safety population and reconcile with the ' +
          'total enrolled population. Note any subjects excluded from the safety population ' +
          'with reasons.',
          ['safety_population_size', 'sample_size_enrolled'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  12. Adverse Events Summary (ICH E3 Section 12.2)
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('ae_summary'),
    dimension: 'completeness',
    title: 'Adverse events summary missing',
    question:
      'Per ICH E3 Section 12.2 and 21 CFR 312.32, the CSR must include a ' +
      'comprehensive summary of adverse events tabulated by system organ class, ' +
      'preferred term, severity grade, and relationship to study treatment. Is this ' +
      'summary present for all treatment arms?',
    check(answers) {
      if (isBlank(answers.adverse_events_summary)) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'No adverse events summary is provided. This is a fundamental deficiency that ' +
          'would halt FDA review of the safety profile.',
          'ICH E3 Section 12.2 requires tabulation of all AEs by SOC, preferred term, ' +
          'severity grade, and investigator-assessed causality, presented by treatment arm.',
          'ICH E3, Section 12.2; 21 CFR 312.32; ICH E2A',
          'Provide a tabular AE summary including incidence by treatment arm, SOC, ' +
          'preferred term (MedDRA), severity (CTCAE grade or mild/moderate/severe), ' +
          'and causality assessment. Include AEs occurring in >= 5% of any treatment group.',
          ['adverse_events_summary'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  13. Serious Adverse Events and Deaths
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('sae_deaths'),
    dimension: 'risk_identification',
    title: 'SAEs and deaths inadequately reported',
    question:
      'ICH E3 Section 12.3 requires individual case narratives for all deaths and ' +
      'serious adverse events, regardless of the investigator\'s causality assessment. ' +
      'Are SAEs and deaths fully documented with narratives, causality adjudication, ' +
      'and sponsor assessment?',
    check(answers) {
      if (isBlank(answers.serious_adverse_events) && isBlank(answers.deaths_reported)) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'Neither serious adverse events nor deaths have been documented. An FDA medical ' +
          'officer cannot assess the safety profile without this information.',
          'Every SAE and death must have an individual narrative per ICH E3 Section 12.3.3, ' +
          'including subject demographics, event timeline, diagnostic workup, interventions, ' +
          'outcome, and causality assessment.',
          'ICH E3, Sections 12.3.1 & 12.3.3; ICH E6(R2), Section 4.11; 21 CFR 312.32(c)',
          'Provide individual SAE/death narratives. For each, include: subject ID, demographics, ' +
          'medical history, treatment details, event timeline, interventions, outcome, ' +
          'investigator causality, and sponsor adjudication.',
          ['serious_adverse_events', 'deaths_reported'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  14. Protocol Amendment Documentation
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('protocol_amendments'),
    dimension: 'documentation',
    title: 'Protocol amendments not described',
    question:
      'ICH E3 Section 9.8 requires listing all protocol amendments with dates, ' +
      'rationale, and affected sections. Were amendments documented? Did any change ' +
      'the primary endpoint, sample size, or analysis plan — and if so, were these ' +
      'changes made before or after unblinding?',
    check(answers) {
      if (isBlank(answers.protocol_amendments)) {
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'Protocol amendments are not described. FDA reviewers will question whether ' +
          'unblinding, endpoint switching, or sample size changes occurred mid-study ' +
          'without documentation.',
          'All amendments must be listed chronologically with date, affected sections, and ' +
          'scientific or operational justification. Post-unblinding amendments are viewed ' +
          'with heightened scrutiny.',
          'ICH E3, Section 9.8; ICH E6(R2), Section 4.5.2',
          'List each amendment chronologically, noting: (1) date, (2) description of change, ' +
          '(3) rationale, (4) whether implemented before or after unblinding, and ' +
          '(5) impact on primary analysis.',
          ['protocol_amendments'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  15. Protocol Deviations Catalogue
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('protocol_deviations'),
    dimension: 'regulatory_alignment',
    title: 'Protocol deviations not catalogued',
    question:
      'Per ICH E3 Section 10.2 and ICH E6(R2) Section 4.5.3, all significant protocol ' +
      'deviations must be catalogued and classified by type and impact on data integrity. ' +
      'Are deviations listed, and were subjects with major deviations excluded from the ' +
      'per-protocol population?',
    check(answers) {
      if (isBlank(answers.protocol_deviations)) {
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'Protocol deviations are not catalogued. This omission may lead the FDA to ' +
          'question data integrity and GCP compliance across study sites.',
          'ICH E3 Section 10.2 requires listing all important deviations with their impact ' +
          'on data quality. Deviations must be classified as major or minor.',
          'ICH E3, Section 10.2; ICH E6(R2), Section 4.5.3; 21 CFR 312.62',
          'Catalogue all deviations (I/E criteria violations, prohibited concomitant ' +
          'medications, visit window breaches, dosing errors). Classify each as major or ' +
          'minor and assess the impact on the per-protocol population definition.',
          ['protocol_deviations'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  16. GCP Compliance Statement
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('gcp_compliance'),
    dimension: 'regulatory_alignment',
    title: 'GCP compliance statement absent',
    question:
      'ICH E6(R2) and 21 CFR 312.120 require an explicit statement confirming the ' +
      'study was conducted in accordance with GCP, applicable regulations, and the ' +
      'ethical principles of the Declaration of Helsinki. Is this statement present?',
    check(answers) {
      if (isBlank(answers.gcp_compliance_statement)) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'No GCP compliance statement is included. The absence of this statement is a ' +
          'fundamental regulatory deficiency that could render the CSR non-approvable.',
          'The CSR must include an explicit statement attesting GCP compliance, IRB/IEC ' +
          'approval at each investigational site, and confirmation that informed consent ' +
          'was obtained per 21 CFR 50.',
          'ICH E6(R2), Section 1.34; 21 CFR 312.120; ICH E3, Section 9.6; 21 CFR 50',
          'Add a statement attesting GCP compliance. Reference the specific ICH E6 version ' +
          'followed, confirm IRB/IEC approval at each site, and confirm written informed ' +
          'consent was obtained from all subjects.',
          ['gcp_compliance_statement'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  17. Data Monitoring Committee Independence
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('dmc_independence'),
    dimension: 'scientific_rigor',
    title: 'DMC charter or independence not documented',
    question:
      'FDA Guidance on Data Monitoring Committees (2006) and ICH E9 Section 4.5 ' +
      'require that the DMC operate under a written charter with documented statistical ' +
      'and clinical independence from the sponsor. Is the DMC described, and is ' +
      'independence from the sponsor assured?',
    check(answers) {
      if (isBlank(answers.data_monitoring_committee)) {
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'No DMC information is provided. For trials with interim analyses, mortality ' +
          'endpoints, or large safety databases, FDA expects independent data monitoring.',
          'FDA guidance recommends DMC use for controlled trials with mortality/morbidity ' +
          'endpoints. The charter must specify member qualifications, voting procedures, ' +
          'and separation of unblinded and blinded analyses.',
          'FDA Guidance on Establishment and Operation of Clinical Trial DMCs (2006); ICH E9, Section 4.5',
          'Describe the DMC composition (names and qualifications), charter provisions, ' +
          'meeting schedule, and confirm statistical independence. Reference the DMC ' +
          'charter as a CSR appendix.',
          ['data_monitoring_committee', 'interim_analyses_performed'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  18. Interim Analysis Without DMC Oversight
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('interim_without_dmc'),
    dimension: 'risk_identification',
    title: 'Interim analyses performed without documented DMC',
    question:
      'ICH E9 Section 4.5 requires that interim analyses be pre-specified and ' +
      'conducted under DMC oversight with alpha-spending rules to preserve Type I ' +
      'error. Were interim analyses performed, and if so, is DMC oversight documented?',
    check(answers) {
      const performed = answers.interim_analyses_performed;
      if (performed === true || performed === 'yes' || performed === 'Yes') {
        if (isBlank(answers.data_monitoring_committee)) {
          return makeFinding(
            this.id, this.dimension, 'critical', this.title, this.question,
            'Interim analyses were performed but no DMC oversight is documented. This ' +
            'raises serious concerns about the integrity of the interim analysis and ' +
            'the preservation of the Type I error rate.',
            'Interim analyses must be overseen by an independent DMC operating under a ' +
            'pre-specified alpha-spending function (e.g., O\'Brien-Fleming, Lan-DeMets). ' +
            'Unmonitored interim analyses create bias risk.',
            'ICH E9, Section 4.5; FDA Guidance on DMCs (2006); ICH E3, Section 11.4.6',
            'Document: (1) the alpha-spending function used, (2) number and timing of ' +
            'interim looks, (3) stopping boundaries, (4) DMC composition and charter, ' +
            'and (5) all DMC recommendations and sponsor actions.',
            ['interim_analyses_performed', 'data_monitoring_committee'],
          );
        }
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  19. SAP Deviations
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('sap_deviations'),
    dimension: 'consistency',
    title: 'Deviations from the Statistical Analysis Plan not addressed',
    question:
      'ICH E9 Section 2.3 requires that any deviation from the pre-specified SAP be ' +
      'documented, justified, and characterized as pre- or post-unblinding. Is there ' +
      'a statement on SAP adherence, and are all deviations enumerated?',
    check(answers) {
      if (isBlank(answers.statistical_analysis_plan_deviations)) {
        return makeFinding(
          this.id, this.dimension, 'info', this.title, this.question,
          'No SAP deviations section is provided. It is unclear whether the analysis was ' +
          'conducted exactly per the SAP or whether deviations occurred but were not ' +
          'documented. FDA statistical reviewers routinely compare the CSR analysis with ' +
          'the SAP and will identify undisclosed deviations.',
          'All post-hoc changes to the SAP must be described with rationale. The timing ' +
          'relative to unblinding is critical: post-unblinding changes are presumed to ' +
          'be outcome-driven and are viewed with extreme skepticism.',
          'ICH E9, Section 2.3; ICH E3, Section 11.4.1',
          'Include an explicit statement confirming full SAP adherence, or document each ' +
          'deviation with: (1) the original SAP specification, (2) the actual analysis ' +
          'performed, (3) the rationale, and (4) the timing relative to unblinding.',
          ['statistical_analysis_plan_deviations'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  20. Missing Data Handling Strategy
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('missing_data'),
    dimension: 'scientific_rigor',
    title: 'Missing data handling strategy not described',
    question:
      'Per the NRC/FDA report "The Prevention and Treatment of Missing Data in ' +
      'Clinical Trials" (2010), ICH E9(R1), and FDA Guidance (2020), the CSR must ' +
      'describe the estimand framework, the primary imputation method, the assumed ' +
      'missing data mechanism, and sensitivity analyses. Is this strategy described?',
    check(answers) {
      if (isBlank(answers.missing_data_handling)) {
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'No missing data handling strategy is described. FDA considers this a significant ' +
          'omission, particularly for trials with discontinuation rates above 10%.',
          'The missing data approach must be pre-specified in the SAP. The CSR must describe ' +
          'the primary assumption (e.g., MAR, MNAR), the analytical method, and at least ' +
          'two sensitivity analyses under alternative assumptions.',
          'ICH E9(R1) Addendum on Estimands; NRC Report (2010); FDA Guidance on Missing Data (2020)',
          'Describe: (1) the estimand (treatment policy, composite, hypothetical, or ' +
          'principal stratum), (2) the primary imputation/modeling approach, (3) the missing ' +
          'data rate by treatment arm, (4) whether missingness was differential, and ' +
          '(5) sensitivity analyses under MNAR assumptions (tipping-point, delta-adjustment).',
          ['missing_data_handling', 'discontinuation_rate'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  21. Subgroup Analysis Pre-specification
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('subgroup_prespecification'),
    dimension: 'scientific_rigor',
    title: 'Subgroup analyses may lack pre-specification',
    question:
      'ICH E9 Section 5.7 warns that unplanned subgroup analyses inflate the ' +
      'familywise error rate and may produce spurious findings. Were the subgroup ' +
      'analyses pre-specified in the SAP, and were treatment-by-subgroup interaction ' +
      'tests performed?',
    check(answers) {
      if (isBlank(answers.subgroup_analyses)) {
        return makeFinding(
          this.id, this.dimension, 'info', this.title, this.question,
          'No subgroup analysis information is provided. If subgroup analyses were performed ' +
          'but not documented, FDA will identify this as a transparency deficiency. If they ' +
          'were not performed, the FDA may request them during review.',
          'All subgroup analyses should be identified in the SAP. Post-hoc subgroup analyses ' +
          'must be clearly labeled as exploratory with appropriate caveats.',
          'ICH E9, Section 5.7; FDA Guidance on Subgroup Analyses (2019)',
          'List all subgroup analyses performed. For each, state: (1) whether it was ' +
          'pre-specified or post-hoc, (2) the treatment-by-subgroup interaction p-value, ' +
          '(3) the subgroup-specific treatment effect with CI, and (4) present results in ' +
          'a forest plot. Label all post-hoc analyses as exploratory.',
          ['subgroup_analyses'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  22. Sensitivity Analyses
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('sensitivity_analyses'),
    dimension: 'scientific_rigor',
    title: 'Sensitivity analyses not performed or reported',
    question:
      'Per ICH E9 Section 5.2.3 and ICH E9(R1), at least one pre-specified ' +
      'sensitivity analysis is required to assess the robustness of the primary ' +
      'efficacy result under alternative assumptions. Were sensitivity analyses ' +
      'conducted, and do their conclusions align with the primary analysis?',
    check(answers) {
      if (isBlank(answers.sensitivity_analyses)) {
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'No sensitivity analyses are documented. The primary efficacy result cannot be ' +
          'assessed for robustness without supporting analyses under alternative assumptions.',
          'At least one sensitivity analysis must be pre-specified in the SAP. Common ' +
          'approaches include per-protocol analysis, alternative imputation methods, and ' +
          'covariate-adjusted analyses.',
          'ICH E9, Section 5.2.3; ICH E9(R1) Addendum; ICH E3, Section 11.4.3',
          'Report at minimum: (1) per-protocol population analysis, (2) tipping-point or ' +
          'pattern-mixture analysis for missing data, (3) covariate-adjusted analysis, and ' +
          '(4) results excluding subjects with major protocol deviations. Present a ' +
          'concordance summary showing alignment with the primary analysis.',
          ['sensitivity_analyses', 'primary_result_value'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  23. Efficacy Conclusions Consistency
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('efficacy_conclusions'),
    dimension: 'consistency',
    title: 'Efficacy conclusions absent or potentially inconsistent with data',
    question:
      'ICH E3 Section 11.4 requires that efficacy conclusions be anchored to the ' +
      'pre-specified primary analysis — not to secondary or post-hoc analyses. Are ' +
      'efficacy conclusions stated, and are they consistent with the reported primary ' +
      'endpoint result, p-value, and confidence interval?',
    check(answers) {
      if (isBlank(answers.efficacy_conclusions)) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'No efficacy conclusions are stated. The FDA medical and statistical reviewers ' +
          'independently formulate efficacy conclusions; the absence of sponsor conclusions ' +
          'prevents comparison and may signal uncertainty about the data.',
          'The CSR must include an integrated efficacy summary with conclusions that flow ' +
          'directly from the primary analysis results. Conclusions must address whether ' +
          'the primary objective was achieved.',
          'ICH E3, Section 11.4; 21 CFR 314.50(d)(5)(v)',
          'State efficacy conclusions that explicitly reference: (1) the primary endpoint, ' +
          '(2) the treatment effect estimate, (3) the p-value and CI, (4) clinical ' +
          'significance, and (5) consistency with sensitivity and secondary analyses.',
          ['efficacy_conclusions', 'primary_result_value', 'p_value', 'confidence_interval'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  24. Safety Conclusions
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('safety_conclusions'),
    dimension: 'completeness',
    title: 'Safety conclusions missing',
    question:
      'ICH E3 Section 12.5 requires an integrated safety summary with conclusions ' +
      'addressing the overall tolerability profile, dose-response for AEs, and any ' +
      'safety signals warranting label language. Are safety conclusions present?',
    check(answers) {
      if (isBlank(answers.safety_conclusions)) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'No safety conclusions are provided. The FDA cannot formulate the benefit-risk ' +
          'assessment without an explicit sponsor safety summary.',
          'Safety conclusions must address overall tolerability, the AE profile relative to ' +
          'comparator, identified safety signals, and any risks requiring mitigation strategies ' +
          'or label warnings.',
          'ICH E3, Section 12.5; ICH E2E; 21 CFR 314.50(d)(5)(vi)',
          'Provide integrated safety conclusions covering: (1) overall AE profile and ' +
          'tolerability, (2) SAE patterns, (3) laboratory and vital sign abnormalities, ' +
          '(4) identified safety signals with proposed label language, and (5) an overall ' +
          'benefit-risk statement.',
          ['safety_conclusions', 'adverse_events_summary', 'serious_adverse_events'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  25. Efficacy-Safety Imbalance (Deaths Without Safety Conclusions)
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('efficacy_safety_balance'),
    dimension: 'risk_identification',
    title: 'Potential efficacy-safety imbalance: deaths without benefit-risk discussion',
    question:
      'The FDA benefit-risk framework (PDUFA VI) requires explicit weighing of ' +
      'efficacy benefits against safety signals. When deaths have occurred on study, ' +
      'the CSR must include a structured benefit-risk assessment. Is this provided?',
    check(answers) {
      const deaths = toNumber(answers.deaths_reported);
      if (deaths !== null && deaths > 0 && isBlank(answers.safety_conclusions)) {
        return makeFinding(
          this.id, this.dimension, 'critical', this.title, this.question,
          `${deaths} death(s) reported on study but no safety conclusions are provided. ` +
          'The FDA medical officer will demand an explicit benefit-risk justification ' +
          'when deaths occur in a clinical trial.',
          'When deaths occur, the CSR must include a detailed benefit-risk assessment ' +
          'addressing whether the drug\'s benefits outweigh the observed mortality signal, ' +
          'with comparison to background rates and the comparator arm.',
          'FDA Benefit-Risk Framework (PDUFA VI); ICH E3, Section 12.5; 21 CFR 314.50(d)(5)(vi)',
          'Provide: (1) a structured benefit-risk analysis using the FDA five-dimension ' +
          'framework, (2) an individual narrative for each death, (3) causality adjudication ' +
          'by the sponsor, and (4) comparison with expected background mortality rates.',
          ['deaths_reported', 'safety_conclusions', 'efficacy_conclusions'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  26. Secondary Results with Multiplicity Handling
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('secondary_results'),
    dimension: 'completeness',
    title: 'Secondary results not summarized despite secondary objectives',
    question:
      'ICH E3 Section 11.4.2 and ICH E9 Section 5.6 require reporting of all ' +
      'pre-specified secondary endpoints with appropriate multiplicity adjustment. ' +
      'Secondary objectives are specified — are the corresponding results summarized?',
    check(answers) {
      if (!isBlank(answers.secondary_objectives) && isBlank(answers.secondary_results_summary)) {
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'Secondary objectives are specified but no secondary results summary is provided. ' +
          'FDA will question whether secondary endpoints were analyzed and, if so, why ' +
          'results are omitted — potentially suggesting unfavorable findings.',
          'All secondary endpoints must be analyzed and reported. If confirmatory claims ' +
          'are intended, a multiplicity adjustment method must be applied.',
          'ICH E3, Section 11.4.2; ICH E9, Section 5.6; FDA Guidance on Multiple Endpoints (2022)',
          'Summarize results for each secondary endpoint with effect size, CI, and p-value. ' +
          'Specify the multiplicity adjustment method (fixed-sequence, graphical, Hochberg). ' +
          'Label any post-hoc or exploratory analyses explicitly.',
          ['secondary_objectives', 'secondary_results_summary'],
        );
      }
      return null;
    },
  },

  /* ════════════════════════════════════════════════════════════════════════
   *  27. Study Population Description
   * ════════════════════════════════════════════════════════════════════════ */

  {
    id: rid('study_population'),
    dimension: 'completeness',
    title: 'Study population not described',
    question:
      'ICH E3 Section 10 and 21 CFR 314.50(d)(5)(ii) require a description of ' +
      'the study population including demographics, baseline characteristics, and ' +
      'eligibility criteria. Is the target population adequately described?',
    check(answers) {
      if (isBlank(answers.study_population)) {
        return makeFinding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'The study population is not described. Without baseline demographics and ' +
          'disease characteristics, the generalizability of the results cannot be assessed.',
          'The CSR must describe the study population including key inclusion/exclusion ' +
          'criteria, demographics (age, sex, race/ethnicity), and baseline disease ' +
          'characteristics by treatment arm.',
          'ICH E3, Section 10; 21 CFR 314.50(d)(5)(ii); FDA Guidance on Diversity (2020)',
          'Provide a demographics and baseline characteristics table by treatment arm. ' +
          'Include age, sex, race/ethnicity, geographic region, baseline disease severity, ' +
          'and relevant medical history.',
          ['study_population'],
        );
      }
      return null;
    },
  },
];

/* ─── Factory ──────────────────────────────────────────────────────────── */

export function createCsrAuditor(): WarGameAuditor {
  return {
    category: 'csr',
    name: 'FDA CSR Reviewer Simulation',
    description:
      'Simulates the combined scrutiny of an FDA statistical reviewer and medical ' +
      'officer evaluating a Clinical Study Report per ICH E3, ICH E9, ICH E9(R1), ' +
      'ICH E6(R2), and 21 CFR 314.50. Checks ICH E3 structural completeness, ' +
      'synopsis-body-appendices consistency, SAP adherence, efficacy-safety balance, ' +
      'missing data impact, protocol amendment justification, GCP compliance, DMC ' +
      'independence, subgroup analysis pre-specification, and multiplicity adjustment.',
    rules,
  };
}
