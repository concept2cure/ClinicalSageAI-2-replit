/**
 * Study Archetype Registry — versioned catalogue of device and IVD study
 * types (MDX-STUDY-01).
 *
 * The pharma world already has `shared/constants/domain/study-designs.ts`
 * (a flat list of trial designs). The device / IVD world had no equivalent:
 * rich knowledge lived only inside scattered engines
 * (server/services/stats/*, server/services/regulatory/*,
 * server/services/gspr-postmarket/*) with no single registry to drive
 * protocol scaffolding, filing mapping, or study-type pickers.
 *
 * This module is that registry — a versioned, read-only data module. It
 * describes *what a study of each type must contain* (sections, design
 * questions, endpoints, acceptance criteria, statistics, supporting plans),
 * *where it maps in a filing*, and *what its approval prerequisites are*.
 * It is NOT a protocol editor (that is MDX-STUDY-02) and holds no tenant
 * data — pure static content, safe to import anywhere.
 *
 * Content accuracy anchors:
 *   - Device clinical investigations → ISO 14155:2020, 21 CFR 812 (IDE),
 *     IEC 62366-1 (human factors / usability), MDCG 2020-7/8 (PMCF).
 *   - IVD performance studies → CLSI EP-series (EP05 precision, EP06
 *     linearity, EP09 method comparison, EP12 qualitative, EP17 LoB/LoD/LoQ,
 *     EP25 stability), CLSI EP12/EP24 for diagnostic accuracy, and
 *     EU IVDR 2017/746 Annex XIII (performance evaluation) + Annex I
 *     (analytical + clinical performance). FDA CLIA-waiver studies follow
 *     the "Recommendations: Clinical Laboratory Improvement Amendments of
 *     1988 (CLIA) Waiver Applications" guidance.
 *
 * @module shared/regulatory/study-archetypes
 */

/** Semantic version of this registry. Bump on any content change. */
export const REGISTRY_VERSION = '1.0.0';

/**
 * The MDX specializations an archetype applies to. Mirrors
 * `MdxSpecialization` in server/services/industry-context/resolver.ts;
 * `'both'` means device + IVD generally.
 */
export type StudySpecialization =
  | 'medical_device'
  | 'ivd_diagnostics'
  | 'samd'
  | 'companion_diagnostic'
  | 'combination_product'
  | 'both';

export type StudyDomain = 'device' | 'ivd';

export type StudyArchetypeId =
  // device
  | 'feasibility'
  | 'pivotal_clinical_investigation'
  | 'human_factors_validation'
  | 'pmcf'
  // ivd
  | 'precision'
  | 'reproducibility'
  | 'lod_loq'
  | 'method_comparison'
  | 'clinical_performance'
  | 'lay_user'
  | 'cdx_concordance'
  | 'pmpf';

export interface StudyArchetype {
  /** Stable identifier — safe to persist as a foreign key from protocols. */
  id: StudyArchetypeId;
  /** Human-readable name. */
  label: string;
  /** Broad family the archetype belongs to. */
  domain: StudyDomain;
  /** Specializations for which this archetype is applicable. */
  applicability: StudySpecialization[];
  /** Protocol / report sections a study of this type must contain. */
  requiredSections: string[];
  /** The design decisions a study author must answer before running it. */
  designQuestions: string[];
  /** Primary and secondary endpoints / measured quantities. */
  endpoints: string[];
  /** Representative pass/fail thresholds a sponsor typically pre-specifies. */
  typicalAcceptanceCriteria: string[];
  /** Statistical methods appropriate to the endpoints. */
  statisticalMethods: string[];
  /** Companion plans this study depends on or feeds. */
  supportingPlans: string[];
  /** Where the study's evidence lands in a regulatory filing. */
  filingMappings: string[];
  /** Prerequisites / approvals needed before the study may start. */
  approvalRequirements: string[];
}

const REGISTRY: StudyArchetype[] = [
  /* ─── DEVICE ──────────────────────────────────────────────────────── */
  {
    id: 'feasibility',
    label: 'Feasibility / Early Feasibility Study (EFS)',
    domain: 'device',
    applicability: ['medical_device', 'samd', 'combination_product'],
    requiredSections: [
      'Synopsis',
      'Background and device description',
      'Objectives and hypotheses',
      'Investigational plan / study design',
      'Subject selection (inclusion/exclusion)',
      'Risk analysis and risk-benefit rationale',
      'Statistical considerations',
      'Data monitoring and safety oversight',
      'Ethics and informed consent',
    ],
    designQuestions: [
      'Is this a first-in-human / early feasibility or a traditional feasibility study?',
      'What is the minimum sample size to inform the pivotal design?',
      'Which device iterations / design changes are permitted mid-study?',
      'What is the follow-up duration needed to observe the key safety signals?',
    ],
    endpoints: [
      'Primary safety: incidence of serious adverse device effects (SADE)',
      'Preliminary performance / proof-of-concept measures',
      'Device deficiency and malfunction rate',
    ],
    typicalAcceptanceCriteria: [
      'No unexpected serious adverse device effects attributable to the device',
      'Acceptable acute technical success rate to justify a pivotal study',
    ],
    statisticalMethods: [
      'Descriptive statistics with exact (Clopper-Pearson) confidence intervals',
      'Bayesian modeling to inform pivotal sample size',
    ],
    supportingPlans: [
      'Clinical Investigation Plan (CIP)',
      'Risk Management Plan (ISO 14971)',
      'Data Management Plan',
      'Monitoring Plan',
    ],
    filingMappings: [
      'FDA IDE (early feasibility / feasibility)',
      'EU MDR Annex XV clinical investigation',
      'Design History File / Clinical Evaluation Report input',
    ],
    approvalRequirements: [
      'IDE approval (FDA) or Competent Authority authorization (EU)',
      'IRB / Ethics Committee approval',
      'Informed consent per 21 CFR 50 / ISO 14155',
    ],
  },
  {
    id: 'pivotal_clinical_investigation',
    label: 'Pivotal Clinical Investigation',
    domain: 'device',
    applicability: ['medical_device', 'samd', 'combination_product'],
    requiredSections: [
      'Synopsis',
      'Background and rationale',
      'Objectives and endpoints',
      'Investigational plan / study design',
      'Subject selection and randomization',
      'Statistical analysis plan',
      'Risk-benefit analysis',
      'Adverse event definitions and reporting',
      'Data monitoring committee charter reference',
      'Ethics, consent, and GCP compliance',
    ],
    designQuestions: [
      'Superiority, non-inferiority, or objective-performance-criterion (OPC) design?',
      'What is the primary endpoint and its clinically meaningful margin?',
      'Is randomization, blinding, or a concurrent control feasible?',
      'What is the powered sample size and expected dropout rate?',
    ],
    endpoints: [
      'Primary effectiveness endpoint at the pre-specified timepoint',
      'Primary safety endpoint (major adverse event composite)',
      'Secondary and exploratory clinical endpoints',
    ],
    typicalAcceptanceCriteria: [
      'Primary effectiveness meets the pre-specified success threshold (p or CI)',
      'Safety event rate below the objective performance criterion',
      'Non-inferiority margin not crossed by the CI lower bound',
    ],
    statisticalMethods: [
      'Sample-size / power calculation for the primary endpoint',
      'Non-inferiority or superiority hypothesis testing',
      'Kaplan-Meier survival and Cox proportional hazards for time-to-event',
      'Multiplicity control across secondary endpoints',
    ],
    supportingPlans: [
      'Clinical Investigation Plan (CIP)',
      'Statistical Analysis Plan (SAP)',
      'Risk Management Plan (ISO 14971)',
      'Data Monitoring Committee (DMC) charter',
    ],
    filingMappings: [
      'FDA PMA / De Novo clinical section',
      'EU MDR Annex XV / Clinical Evaluation Report',
      'FDA IDE (significant risk device)',
    ],
    approvalRequirements: [
      'IDE approval (FDA) or Competent Authority authorization (EU)',
      'IRB / Ethics Committee approval at each site',
      'GCP-compliant informed consent (21 CFR 50 / ISO 14155)',
    ],
  },
  {
    id: 'human_factors_validation',
    label: 'Human Factors / Usability Validation Study',
    domain: 'device',
    applicability: ['medical_device', 'samd', 'combination_product'],
    requiredSections: [
      'Device user interface description',
      'Intended users, use environments, and use scenarios',
      'Known and foreseeable use-related risks (use-error analysis)',
      'Critical tasks identification',
      'Test protocol (simulated-use scenarios)',
      'Participant demographics and sample composition',
      'Data collection and interview method',
      'Residual risk analysis of use errors',
    ],
    designQuestions: [
      'Which tasks are critical (could cause harm if performed incorrectly)?',
      'How many distinct user groups must be represented, and at what N each?',
      'What are the pass criteria for critical-task success and close-call rates?',
      'Is the validation summative, following adequate formative testing?',
    ],
    endpoints: [
      'Critical-task success / failure rate',
      'Use errors, close calls, and use difficulties per task',
      'Root cause of each observed use error (knowledge/design-based)',
    ],
    typicalAcceptanceCriteria: [
      'No unmitigated use errors on critical tasks that could cause serious harm',
      'Minimum 15 participants per distinct user group',
      'All residual use-related risks reduced to acceptable per risk analysis',
    ],
    statisticalMethods: [
      'Qualitative root-cause analysis of use errors',
      'Descriptive summary of task success rates (no hypothesis test required)',
    ],
    supportingPlans: [
      'Human Factors Engineering / Usability Engineering File (IEC 62366-1)',
      'Use-Related Risk Analysis (URRA)',
      'Risk Management Plan (ISO 14971)',
    ],
    filingMappings: [
      'FDA Human Factors report (FDA HFE guidance 2016)',
      'EU MDR usability / IEC 62366-1 evidence',
      'Design Validation records in the Design History File',
    ],
    approvalRequirements: [
      'IRB / Ethics Committee approval for simulated-use testing',
      'Informed consent from test participants',
      'Completed formative studies and use-related risk analysis',
    ],
  },
  {
    id: 'pmcf',
    label: 'Post-Market Clinical Follow-up (PMCF)',
    domain: 'device',
    applicability: ['medical_device', 'samd', 'combination_product'],
    requiredSections: [
      'PMCF objectives and rationale',
      'Link to Clinical Evaluation Report residual risks/gaps',
      'PMCF methods (registry, survey, study, literature)',
      'Endpoints and success/failure criteria',
      'Data sources and collection plan',
      'Analysis and reporting schedule',
      'Feedback loop into risk management and CER',
    ],
    designQuestions: [
      'Which residual risks or open clinical questions drive this PMCF activity?',
      'Is real-world evidence collected via registry, survey, or prospective study?',
      'What is the reporting cadence (PMCF Evaluation Report frequency)?',
      'How do findings feed the CER and PSUR update cycle?',
    ],
    endpoints: [
      'Long-term safety event rate in real-world use',
      'Sustained clinical performance / benefit over time',
      'Emergence of previously unknown side effects or misuse',
    ],
    typicalAcceptanceCriteria: [
      'Real-world safety consistent with the pre-market benefit-risk profile',
      'No new or increased-severity risks beyond the CER assumptions',
    ],
    statisticalMethods: [
      'Descriptive real-world outcome rates with confidence intervals',
      'Trend / signal detection over successive reporting periods',
    ],
    supportingPlans: [
      'PMCF Plan (MDCG 2020-7)',
      'Post-Market Surveillance (PMS) Plan',
      'Clinical Evaluation Report (CER) and its update plan',
      'Risk Management Plan (ISO 14971)',
    ],
    filingMappings: [
      'EU MDR Annex XIV Part B PMCF Plan / PMCF Evaluation Report (MDCG 2020-8)',
      'Periodic Safety Update Report (PSUR) input',
      'FDA post-market study / 522 order (where applicable)',
    ],
    approvalRequirements: [
      'Approved device (CE mark / cleared / approved) already on market',
      'Ethics approval where PMCF involves prospective data collection',
      'Alignment with the notified body PMS/PMCF expectations',
    ],
  },

  /* ─── IVD ─────────────────────────────────────────────────────────── */
  {
    id: 'precision',
    label: 'Precision (Repeatability & Within-Laboratory)',
    domain: 'ivd',
    applicability: ['ivd_diagnostics', 'companion_diagnostic'],
    requiredSections: [
      'Study objective and precision claim',
      'Samples / analyte levels and matrix',
      'Nested experimental design (days, runs, replicates)',
      'Instruments, lots, and operators',
      'Data analysis and variance-component method',
      'Acceptance criteria',
    ],
    designQuestions: [
      'Which precision components are claimed (repeatability, within-lab, between-lot)?',
      'How many days, runs per day, and replicates per run (e.g. 20x2x2)?',
      'What analyte concentrations bracket the medical decision points?',
    ],
    endpoints: [
      'Repeatability standard deviation / %CV',
      'Within-laboratory (total) standard deviation / %CV',
      'Between-day and between-run variance components',
    ],
    typicalAcceptanceCriteria: [
      'Observed %CV at each level within the pre-specified precision goal',
      'Upper confidence bound of imprecision below the claim',
    ],
    statisticalMethods: [
      'Variance-component analysis (ANOVA / nested random-effects, CLSI EP05)',
      'Confidence intervals on SD/CV estimates',
    ],
    supportingPlans: [
      'Analytical Performance Plan',
      'Performance Evaluation Plan (IVDR Annex XIII)',
    ],
    filingMappings: [
      'FDA 510(k) / De Novo analytical performance section',
      'EU IVDR Performance Evaluation Report (PER) — analytical performance',
    ],
    approvalRequirements: [
      'Locked assay design and finalized reagent lots',
      'Validated instrument and software',
    ],
  },
  {
    id: 'reproducibility',
    label: 'Reproducibility (Multi-Site / Between-Laboratory)',
    domain: 'ivd',
    applicability: ['ivd_diagnostics', 'companion_diagnostic'],
    requiredSections: [
      'Study objective and reproducibility claim',
      'Site selection and operator training',
      'Sample panel across the measuring range',
      'Cross-site experimental design',
      'Data pooling and variance decomposition',
      'Acceptance criteria',
    ],
    designQuestions: [
      'How many sites, operators, instruments, and lots are included?',
      'Are all sites external, or a mix of internal and external?',
      'How are site-to-site and lot-to-lot components separated?',
    ],
    endpoints: [
      'Total reproducibility SD / %CV across sites',
      'Site-to-site and lot-to-lot variance components',
    ],
    typicalAcceptanceCriteria: [
      'Total reproducibility %CV within the pre-specified goal at each level',
      'No single site driving disproportionate variance',
    ],
    statisticalMethods: [
      'Nested / crossed variance-component analysis (CLSI EP05, multi-site)',
      'Confidence intervals on reproducibility SD/CV',
    ],
    supportingPlans: [
      'Analytical Performance Plan',
      'Performance Evaluation Plan (IVDR Annex XIII)',
      'Site Monitoring Plan',
    ],
    filingMappings: [
      'FDA 510(k) / De Novo / PMA analytical performance section',
      'EU IVDR Performance Evaluation Report (PER) — analytical performance',
    ],
    approvalRequirements: [
      'Locked assay design and finalized reagent lots',
      'Trained operators and qualified instruments at all sites',
    ],
  },
  {
    id: 'lod_loq',
    label: 'Detection Capability (LoB / LoD / LoQ)',
    domain: 'ivd',
    applicability: ['ivd_diagnostics', 'companion_diagnostic'],
    requiredSections: [
      'Study objective (LoB, LoD, LoQ claims)',
      'Blank and low-level sample preparation',
      'Replicate and measurement design',
      'LoB / LoD estimation approach',
      'LoQ / functional sensitivity determination',
      'Acceptance criteria',
    ],
    designQuestions: [
      'Which limits are claimed (LoB, LoD, and/or LoQ)?',
      'How many blank and low-level samples, replicates, days, and lots?',
      'Is the classical or precision-profile approach used for LoQ?',
    ],
    endpoints: [
      'Limit of Blank (LoB)',
      'Limit of Detection (LoD)',
      'Limit of Quantitation (LoQ) / functional sensitivity',
    ],
    typicalAcceptanceCriteria: [
      'LoD supports the claimed lowest reportable concentration',
      'LoQ meets the pre-specified total-error / imprecision goal',
    ],
    statisticalMethods: [
      'Parametric / non-parametric LoB and LoD estimation (CLSI EP17)',
      'Precision-profile modeling for LoQ',
    ],
    supportingPlans: [
      'Analytical Performance Plan',
      'Performance Evaluation Plan (IVDR Annex XIII)',
    ],
    filingMappings: [
      'FDA 510(k) / De Novo analytical sensitivity section',
      'EU IVDR Performance Evaluation Report (PER) — analytical sensitivity',
    ],
    approvalRequirements: [
      'Locked assay design and calibration',
      'Characterized low-level reference materials',
    ],
  },
  {
    id: 'method_comparison',
    label: 'Method Comparison / Bias Estimation',
    domain: 'ivd',
    applicability: ['ivd_diagnostics', 'companion_diagnostic'],
    requiredSections: [
      'Study objective and comparative claim',
      'Comparator method / predicate identification',
      'Sample range spanning the measuring interval',
      'Paired-measurement design',
      'Regression and bias analysis',
      'Acceptance criteria',
    ],
    designQuestions: [
      'What is the comparator (predicate device or reference method)?',
      'Do samples span the full clinically relevant measuring range?',
      'Is a quantitative (regression) or qualitative (agreement) comparison used?',
    ],
    endpoints: [
      'Slope, intercept, and correlation vs. comparator',
      'Bias at medical decision points',
      'Positive/negative percent agreement (for qualitative comparison)',
    ],
    typicalAcceptanceCriteria: [
      'Bias at decision points within pre-specified allowable limits',
      'Regression slope and intercept confidence intervals within acceptance',
    ],
    statisticalMethods: [
      'Passing-Bablok / Deming regression (CLSI EP09)',
      'Bland-Altman bias analysis',
      'Percent-agreement analysis for qualitative assays (CLSI EP12)',
    ],
    supportingPlans: [
      'Analytical Performance Plan',
      'Performance Evaluation Plan (IVDR Annex XIII)',
    ],
    filingMappings: [
      'FDA 510(k) substantial-equivalence comparison to predicate',
      'EU IVDR Performance Evaluation Report (PER) — analytical performance',
    ],
    approvalRequirements: [
      'Available and characterized comparator method / predicate',
      'Locked assay design and calibration',
    ],
  },
  {
    id: 'clinical_performance',
    label: 'Clinical Performance (Sensitivity / Specificity)',
    domain: 'ivd',
    applicability: ['ivd_diagnostics', 'companion_diagnostic'],
    requiredSections: [
      'Clinical objective and intended-use population',
      'Reference standard / clinical truth definition',
      'Prospective vs. retrospective sampling strategy',
      'Sample size justification',
      'Diagnostic accuracy analysis',
      'Handling of indeterminate / invalid results',
      'Acceptance criteria',
    ],
    designQuestions: [
      'What is the reference standard defining true disease status?',
      'Is enrollment prospective, or from banked/archived specimens?',
      'What prevalence and predictive values apply to the intended use?',
    ],
    endpoints: [
      'Clinical / diagnostic sensitivity',
      'Clinical / diagnostic specificity',
      'Positive and negative predictive values (at claimed prevalence)',
    ],
    typicalAcceptanceCriteria: [
      'Lower confidence bound of sensitivity above the pre-specified minimum',
      'Lower confidence bound of specificity above the pre-specified minimum',
    ],
    statisticalMethods: [
      'Sensitivity/specificity with exact (Clopper-Pearson) confidence intervals',
      'ROC / AUC analysis where a cutoff is derived',
      'Predictive-value estimation across prevalence scenarios',
    ],
    supportingPlans: [
      'Clinical Performance Study Plan',
      'Performance Evaluation Plan (IVDR Annex XIII)',
      'Statistical Analysis Plan (SAP)',
    ],
    filingMappings: [
      'FDA 510(k) / De Novo / PMA clinical performance section',
      'EU IVDR Performance Evaluation Report (PER) — clinical performance',
    ],
    approvalRequirements: [
      'IRB / Ethics Committee approval',
      'Informed consent / specimen-use authorization',
      'Established reference standard and adjudication process',
    ],
  },
  {
    id: 'lay_user',
    label: 'Lay-User / CLIA Waiver Study',
    domain: 'ivd',
    applicability: ['ivd_diagnostics'],
    requiredSections: [
      'Intended untrained-user population and setting',
      'Flex / robustness study summary',
      'Lay-user performance study design',
      'Comparison to trained-operator or reference result',
      'Labeling comprehension / usability assessment',
      'Acceptance criteria',
    ],
    designQuestions: [
      'Does the test meet the "simple" and "insignificant risk of erroneous result" bar?',
      'How representative is the untrained-user cohort of the CLIA-waived setting?',
      'What flex studies demonstrate robustness to user and environmental variation?',
    ],
    endpoints: [
      'Agreement between lay-user results and the reference / trained result',
      'Rate of user errors and invalid results by untrained operators',
      'Labeling comprehension success',
    ],
    typicalAcceptanceCriteria: [
      'Lay-user accuracy comparable to trained-operator / reference performance',
      'Acceptably low invalid-result and user-error rate',
    ],
    statisticalMethods: [
      'Percent-agreement analysis with confidence intervals',
      'Descriptive analysis of user errors and invalid rates',
    ],
    supportingPlans: [
      'CLIA Waiver Study Plan',
      'Flex / robustness study protocol',
      'Human Factors / labeling comprehension plan',
    ],
    filingMappings: [
      'FDA CLIA Waiver by Application (CW) or Dual 510(k)/CLIA-waiver',
      'FDA CLIA-waiver guidance evidence package',
    ],
    approvalRequirements: [
      'Cleared or concurrently submitted 510(k) for the test system',
      'IRB / Ethics approval for the lay-user study',
      'Completed flex studies demonstrating robustness',
    ],
  },
  {
    id: 'cdx_concordance',
    label: 'Companion Diagnostic Concordance / Bridging',
    domain: 'ivd',
    applicability: ['companion_diagnostic', 'ivd_diagnostics'],
    requiredSections: [
      'CDx intended use and linked therapeutic claim',
      'Clinical trial assay (CTA) vs. proposed CDx description',
      'Concordance / bridging study design',
      'Sample sourcing from the pivotal drug trial',
      'Concordance and clinical-outcome analysis',
      'Discordant-case investigation',
      'Acceptance criteria',
    ],
    designQuestions: [
      'Is this a prospective co-development or a retrospective bridging study?',
      'Are specimens available from the drug pivotal trial for bridging?',
      'How are discordant CTA-vs-CDx results adjudicated and outcome-linked?',
    ],
    endpoints: [
      'Positive / negative / overall percent agreement (PPA/NPA/OPA) vs. CTA',
      'Clinical-outcome concordance in CDx-selected patients',
      'Prevalence and impact of discordant results',
    ],
    typicalAcceptanceCriteria: [
      'PPA and NPA lower confidence bounds above pre-specified thresholds',
      'Drug benefit preserved in the CDx-positive population',
    ],
    statisticalMethods: [
      'PPA/NPA/OPA with confidence intervals',
      'Sensitivity analyses on discordant cases and missing specimens',
      'Subgroup efficacy analysis in CDx-defined populations',
    ],
    supportingPlans: [
      'CDx-Drug Co-Development Plan',
      'Clinical Performance Study Plan',
      'Statistical Analysis Plan (SAP)',
    ],
    filingMappings: [
      'FDA PMA (companion diagnostic) coordinated with the drug NDA/BLA',
      'EU IVDR Annex XIII PER with mandatory companion-diagnostic consultation',
    ],
    approvalRequirements: [
      'IRB / Ethics approval and specimen-use authorization',
      'Access to pivotal drug-trial specimens and outcomes',
      'Coordinated review with the linked therapeutic submission',
    ],
  },
  {
    id: 'pmpf',
    label: 'Post-Market Performance Follow-up (PMPF)',
    domain: 'ivd',
    applicability: ['ivd_diagnostics', 'companion_diagnostic'],
    requiredSections: [
      'PMPF objectives and rationale',
      'Link to Performance Evaluation Report gaps/residual risks',
      'PMPF methods (registry, proficiency data, real-world study)',
      'Endpoints and acceptance criteria',
      'Data sources and collection plan',
      'Reporting cadence and CER/PER feedback loop',
    ],
    designQuestions: [
      'Which open performance questions or residual risks drive this PMPF?',
      'What real-world data sources (EQA/PT, registries, lab data) are used?',
      'What is the PMPF Evaluation Report cadence?',
    ],
    endpoints: [
      'Sustained real-world analytical and clinical performance',
      'Emergence of new interferences, variants, or failure modes',
      'Real-world invalid / error rates over time',
    ],
    typicalAcceptanceCriteria: [
      'Real-world performance consistent with the pre-market PER claims',
      'No new performance risks beyond the PER assumptions',
    ],
    statisticalMethods: [
      'Descriptive real-world performance rates with confidence intervals',
      'Trend / signal detection across reporting periods',
    ],
    supportingPlans: [
      'PMPF Plan (IVDR Annex XIII Part B)',
      'Post-Market Surveillance (PMS) Plan',
      'Performance Evaluation Report (PER) update plan',
    ],
    filingMappings: [
      'EU IVDR Annex XIII Part B PMPF Plan / PMPF Evaluation Report',
      'Periodic Safety Update Report (PSUR) input',
      'FDA post-market study commitment (where applicable)',
    ],
    approvalRequirements: [
      'IVD already on market (CE-marked / cleared / approved)',
      'Ethics approval where PMPF involves prospective data collection',
      'Alignment with notified body PMS/PMPF expectations',
    ],
  },
];

/** Deep copy so callers can never mutate the frozen registry content. */
function cloneArchetype(a: StudyArchetype): StudyArchetype {
  return {
    ...a,
    applicability: [...a.applicability],
    requiredSections: [...a.requiredSections],
    designQuestions: [...a.designQuestions],
    endpoints: [...a.endpoints],
    typicalAcceptanceCriteria: [...a.typicalAcceptanceCriteria],
    statisticalMethods: [...a.statisticalMethods],
    supportingPlans: [...a.supportingPlans],
    filingMappings: [...a.filingMappings],
    approvalRequirements: [...a.approvalRequirements],
  };
}

/** Return every archetype in the registry (defensive copy). */
export function listArchetypes(): StudyArchetype[] {
  return REGISTRY.map(cloneArchetype);
}

/**
 * Return archetypes applicable to a given specialization. `'both'` in an
 * archetype's `applicability` matches any specialization; querying with
 * `'both'` returns the full registry.
 */
export function archetypesForSpecialization(
  spec: StudySpecialization,
): StudyArchetype[] {
  if (spec === 'both') return listArchetypes();
  return REGISTRY.filter(
    (a) => a.applicability.includes(spec) || a.applicability.includes('both'),
  ).map(cloneArchetype);
}

/** Look up a single archetype by id. */
export function getArchetype(id: string): StudyArchetype | undefined {
  const found = REGISTRY.find((a) => a.id === id);
  return found ? cloneArchetype(found) : undefined;
}
