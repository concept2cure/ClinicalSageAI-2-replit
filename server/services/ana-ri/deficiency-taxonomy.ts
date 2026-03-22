/**
 * AnA RI — Rejection Risk & Deficiency Taxonomy
 *
 * Comprehensive knowledge base of common regulatory deficiency patterns,
 * rejection reasons, and reviewer challenge areas across submission types.
 *
 * @module server/services/ana-ri/deficiency-taxonomy
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'major' | 'minor';
export type Likelihood = 'very_likely' | 'likely' | 'possible' | 'unlikely';
export type SubmissionType = 'ind' | 'nda' | 'bla' | '510k' | 'pma' | 'de_novo' | 'cer' | 'ectd' | 'general';
export type ReviewPhase = 'filing' | 'substantive' | 'advisory_committee' | 'labeling' | 'post_market';
export type Agency = 'fda' | 'ema' | 'pmda' | 'health_canada' | 'tga' | 'general';

export interface DeficiencyPattern {
  id: string;
  category: string;
  subcategory: string;
  title: string;
  description: string;
  severity: Severity;
  likelihood: Likelihood;
  submissionTypes: SubmissionType[];
  agencies: Agency[];
  reviewPhase: ReviewPhase[];
  /** Common reviewer language when raising this deficiency */
  reviewerLanguage: string[];
  /** Specific mitigations to address or preempt this deficiency */
  mitigations: string[];
  /** Regulatory references */
  references: string[];
  /** Related deficiency IDs */
  relatedDeficiencies: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Deficiency Taxonomy
// ─────────────────────────────────────────────────────────────────────────────

export const DEFICIENCY_TAXONOMY: DeficiencyPattern[] = [
  // ── Clinical / Efficacy ──────────────────────────────────────────────────
  {
    id: 'CLIN-001',
    category: 'Clinical',
    subcategory: 'Efficacy',
    title: 'Inadequate Primary Endpoint Justification',
    description: 'The primary endpoint is not sufficiently justified as clinically meaningful, or the relationship between the endpoint and clinical benefit is not established.',
    severity: 'critical',
    likelihood: 'very_likely',
    submissionTypes: ['ind', 'nda', 'bla'],
    agencies: ['fda', 'ema'],
    reviewPhase: ['filing', 'substantive'],
    reviewerLanguage: [
      'The clinical relevance of the primary endpoint has not been adequately justified.',
      'The applicant has not provided sufficient evidence that [endpoint] is a reliable measure of clinical benefit.',
      'The relationship between [surrogate endpoint] and clinical outcome is not established.',
    ],
    mitigations: [
      'Provide a systematic review of endpoint validation literature',
      'Include regulatory precedent for endpoint acceptance in similar indications',
      'Present correlation analysis between surrogate and clinical endpoints',
      'Reference ICH E9(R1) estimand framework alignment',
    ],
    references: ['ICH E9(R1)', 'FDA Guidance: Clinical Trial Endpoints', '21 CFR 314.126'],
    relatedDeficiencies: ['CLIN-002', 'STAT-001'],
  },
  {
    id: 'CLIN-002',
    category: 'Clinical',
    subcategory: 'Efficacy',
    title: 'Insufficient Evidence of Clinical Benefit',
    description: 'The totality of evidence does not demonstrate substantial evidence of effectiveness. Effect size may be marginal, clinically insignificant, or not replicated.',
    severity: 'critical',
    likelihood: 'likely',
    submissionTypes: ['nda', 'bla'],
    agencies: ['fda', 'ema'],
    reviewPhase: ['substantive', 'advisory_committee'],
    reviewerLanguage: [
      'The demonstrated effect size does not meet the threshold for clinical significance.',
      'The results from the single adequate and well-controlled study are not sufficient.',
      'The observed treatment difference, while statistically significant, is of uncertain clinical relevance.',
    ],
    mitigations: [
      'Pre-specify clinically meaningful difference thresholds with clinical justification',
      'Include patient-reported outcome measures as supportive endpoints',
      'Provide responder analyses to demonstrate individual-level benefit',
      'Contextualize effect size relative to existing therapies',
    ],
    references: ['21 CFR 314.126', 'ICH E9', 'FDA Guidance: Providing Clinical Evidence of Effectiveness'],
    relatedDeficiencies: ['CLIN-001', 'STAT-002'],
  },
  {
    id: 'CLIN-003',
    category: 'Clinical',
    subcategory: 'Safety',
    title: 'Inadequate Safety Database',
    description: 'The safety database is insufficient in size, duration, or population diversity to support the proposed indication and labeling.',
    severity: 'critical',
    likelihood: 'likely',
    submissionTypes: ['nda', 'bla'],
    agencies: ['fda', 'ema'],
    reviewPhase: ['filing', 'substantive'],
    reviewerLanguage: [
      'The safety database does not meet ICH E1 exposure requirements.',
      'Long-term safety data are insufficient to characterize the safety profile for chronic use.',
      'The safety database lacks adequate representation of [demographic group].',
    ],
    mitigations: [
      'Ensure ICH E1 exposure thresholds are met (300/100/1500 rule)',
      'Include integrated safety summary across all relevant studies',
      'Address specific safety signals with dedicated analyses',
      'Provide post-marketing safety monitoring plan (REMS if needed)',
    ],
    references: ['ICH E1', 'ICH E2E', '21 CFR 312.32'],
    relatedDeficiencies: ['CLIN-004'],
  },
  {
    id: 'CLIN-004',
    category: 'Clinical',
    subcategory: 'Safety',
    title: 'Unresolved Safety Signal',
    description: 'A safety signal identified during clinical development has not been adequately characterized, explained, or mitigated.',
    severity: 'critical',
    likelihood: 'very_likely',
    submissionTypes: ['nda', 'bla', 'ind'],
    agencies: ['fda', 'ema', 'pmda'],
    reviewPhase: ['substantive', 'advisory_committee'],
    reviewerLanguage: [
      'The applicant has not adequately addressed the observed signal of [adverse event].',
      'The mechanism underlying [safety finding] has not been characterized.',
      'Additional data are needed to assess the clinical significance of [finding].',
    ],
    mitigations: [
      'Provide mechanistic analysis of the safety signal',
      'Include dose-response and time-to-onset analyses',
      'Compare signal rates to background rates in the target population',
      'Propose risk mitigation strategy (monitoring, dose modification, REMS)',
    ],
    references: ['ICH E2C(R2)', '21 CFR 312.32', 'FDA Guidance: Premarketing Risk Assessment'],
    relatedDeficiencies: ['CLIN-003'],
  },

  // ── Statistical ─────────────────────────────────────────────────────────
  {
    id: 'STAT-001',
    category: 'Statistical',
    subcategory: 'Design',
    title: 'Inadequate Statistical Analysis Plan',
    description: 'The statistical analysis plan is incomplete, not pre-specified, or does not adequately address multiplicity, missing data, or estimand definition.',
    severity: 'major',
    likelihood: 'likely',
    submissionTypes: ['ind', 'nda', 'bla'],
    agencies: ['fda', 'ema'],
    reviewPhase: ['filing', 'substantive'],
    reviewerLanguage: [
      'The SAP does not adequately address the handling of missing data.',
      'The multiplicity adjustment strategy is not clearly pre-specified.',
      'The estimand is not clearly defined per ICH E9(R1).',
    ],
    mitigations: [
      'Ensure SAP is finalized before database lock',
      'Define estimands per ICH E9(R1) framework',
      'Pre-specify sensitivity analyses for missing data',
      'Include clear multiplicity adjustment hierarchy',
    ],
    references: ['ICH E9', 'ICH E9(R1)', 'FDA Guidance: Adaptive Designs'],
    relatedDeficiencies: ['STAT-002', 'CLIN-001'],
  },
  {
    id: 'STAT-002',
    category: 'Statistical',
    subcategory: 'Analysis',
    title: 'Multiplicity and Type I Error Concerns',
    description: 'Multiple comparisons, endpoints, or interim analyses not properly controlled for familywise error rate.',
    severity: 'major',
    likelihood: 'likely',
    submissionTypes: ['nda', 'bla'],
    agencies: ['fda', 'ema'],
    reviewPhase: ['substantive'],
    reviewerLanguage: [
      'The familywise type I error rate has not been adequately controlled.',
      'The hierarchical testing procedure does not account for all primary and key secondary endpoints.',
      'The interim analysis boundaries do not preserve overall alpha.',
    ],
    mitigations: [
      'Implement a pre-specified hierarchical testing strategy',
      'Use graphical approach for multiplicity adjustment',
      'Document alpha allocation across all comparisons',
      'Include sensitivity analyses under different multiplicity methods',
    ],
    references: ['ICH E9', 'FDA Guidance: Multiple Endpoints in Clinical Trials'],
    relatedDeficiencies: ['STAT-001'],
  },

  // ── CMC ──────────────────────────────────────────────────────────────────
  {
    id: 'CMC-001',
    category: 'CMC',
    subcategory: 'Manufacturing',
    title: 'Insufficient Process Validation',
    description: 'The manufacturing process has not been adequately validated to demonstrate consistent production of product meeting quality attributes.',
    severity: 'critical',
    likelihood: 'likely',
    submissionTypes: ['nda', 'bla'],
    agencies: ['fda', 'ema'],
    reviewPhase: ['filing', 'substantive'],
    reviewerLanguage: [
      'Process validation data are insufficient to demonstrate control of critical process parameters.',
      'The applicant has not demonstrated that the manufacturing process consistently produces product meeting specifications.',
      'Additional process characterization data are needed for [unit operation].',
    ],
    mitigations: [
      'Provide comprehensive process validation reports for commercial scale',
      'Include process capability analyses for critical quality attributes',
      'Demonstrate process understanding through design space characterization',
      'Reference ICH Q8-Q12 framework for process lifecycle approach',
    ],
    references: ['ICH Q8(R2)', 'ICH Q11', 'FDA Guidance: Process Validation'],
    relatedDeficiencies: ['CMC-002'],
  },
  {
    id: 'CMC-002',
    category: 'CMC',
    subcategory: 'Quality',
    title: 'Inadequate Specification Justification',
    description: 'Product specifications are not adequately justified based on clinical, manufacturing, or stability data.',
    severity: 'major',
    likelihood: 'likely',
    submissionTypes: ['nda', 'bla'],
    agencies: ['fda', 'ema'],
    reviewPhase: ['substantive'],
    reviewerLanguage: [
      'The proposed specification limits are not supported by sufficient batch data.',
      'The applicant has not provided adequate justification for the acceptance criteria for [attribute].',
      'The relationship between [quality attribute] and clinical performance has not been established.',
    ],
    mitigations: [
      'Justify specifications using clinical, stability, and batch analysis data',
      'Include statistical analysis of batch data to support limits',
      'Reference ICH Q6A/Q6B for specification-setting approach',
      'Provide clinically relevant specification justification',
    ],
    references: ['ICH Q6A', 'ICH Q6B', 'ICH Q3A/Q3B'],
    relatedDeficiencies: ['CMC-001'],
  },

  // ── Regulatory / Administrative ──────────────────────────────────────────
  {
    id: 'REG-001',
    category: 'Regulatory',
    subcategory: 'Filing',
    title: 'Refuse to File — Incomplete Application',
    description: 'The application is so incomplete or insufficient that a substantive review cannot begin. Missing essential modules, inadequate formatting, or critical data gaps.',
    severity: 'critical',
    likelihood: 'possible',
    submissionTypes: ['nda', 'bla', '510k', 'pma'],
    agencies: ['fda'],
    reviewPhase: ['filing'],
    reviewerLanguage: [
      'The application does not contain sufficient information to permit a substantive review.',
      'Module [X] is incomplete or missing critical sections.',
      'The application does not conform to the content and format requirements.',
    ],
    mitigations: [
      'Conduct internal pre-filing completeness audit against 21 CFR 314.50',
      'Use eCTD validation tools to check format compliance',
      'Ensure all referenced documents are actually included',
      'Verify hyperlinks and cross-references within the eCTD',
    ],
    references: ['21 CFR 314.101', 'FDA Guidance: Refuse to File', 'ICH M4'],
    relatedDeficiencies: ['REG-002'],
  },
  {
    id: 'REG-002',
    category: 'Regulatory',
    subcategory: 'Labeling',
    title: 'Labeling Deficiencies',
    description: 'Proposed labeling does not accurately reflect the clinical data, contains unsupported claims, or does not meet formatting requirements.',
    severity: 'major',
    likelihood: 'very_likely',
    submissionTypes: ['nda', 'bla'],
    agencies: ['fda'],
    reviewPhase: ['labeling'],
    reviewerLanguage: [
      'The proposed labeling includes claims not supported by substantial evidence.',
      'The Indications and Usage section does not accurately reflect the studied population.',
      'The Warnings and Precautions section does not adequately address [safety concern].',
    ],
    mitigations: [
      'Ensure every labeling claim is traceable to clinical data',
      'Follow PLR format requirements precisely',
      'Draft labeling concurrently with clinical study report',
      'Include labeling negotiation strategy in submission plan',
    ],
    references: ['21 CFR 201', 'FDA Guidance: Labeling for Human Prescription Drug'],
    relatedDeficiencies: ['REG-001'],
  },

  // ── Nonclinical ──────────────────────────────────────────────────────────
  {
    id: 'NC-001',
    category: 'Nonclinical',
    subcategory: 'Toxicology',
    title: 'Insufficient Nonclinical Safety Package',
    description: 'The nonclinical safety assessment does not adequately support the proposed clinical program in terms of species, duration, or endpoints.',
    severity: 'critical',
    likelihood: 'likely',
    submissionTypes: ['ind'],
    agencies: ['fda', 'ema'],
    reviewPhase: ['filing', 'substantive'],
    reviewerLanguage: [
      'The nonclinical safety package does not support the proposed duration of clinical dosing.',
      'Adequate reproductive toxicology studies have not been conducted.',
      'The choice of animal species for [study type] has not been adequately justified.',
    ],
    mitigations: [
      'Align nonclinical program with ICH M3(R2) timing requirements',
      'Justify species selection based on pharmacology and metabolism data',
      'Include NOAEL/MABEL-based clinical dose justification',
      'Provide comprehensive toxicokinetic data',
    ],
    references: ['ICH M3(R2)', 'ICH S6(R1)', 'ICH S9'],
    relatedDeficiencies: [],
  },

  // ── Device / 510(k) ─────────────────────────────────────────────────────
  {
    id: 'DEV-001',
    category: 'Device',
    subcategory: 'Predicate',
    title: 'Inadequate Predicate Device Comparison',
    description: 'Substantial equivalence has not been adequately demonstrated. The predicate comparison lacks sufficient detail or the technological differences are not adequately addressed.',
    severity: 'critical',
    likelihood: 'very_likely',
    submissionTypes: ['510k'],
    agencies: ['fda'],
    reviewPhase: ['substantive'],
    reviewerLanguage: [
      'The applicant has not adequately demonstrated substantial equivalence to the predicate device.',
      'The technological differences between the subject and predicate devices raise new questions of safety and effectiveness.',
      'The comparison table does not address all relevant characteristics.',
    ],
    mitigations: [
      'Provide comprehensive feature-by-feature comparison table',
      'Address every technological difference with performance data',
      'Include clinical or bench testing to bridge differences',
      'Select predicates strategically — consider multiple predicates if needed',
    ],
    references: ['21 CFR 807.92', 'FDA Guidance: 510(k) Program', 'FDA Guidance: Substantial Equivalence'],
    relatedDeficiencies: ['DEV-002'],
  },
  {
    id: 'DEV-002',
    category: 'Device',
    subcategory: 'Performance',
    title: 'Insufficient Performance Testing',
    description: 'Bench, biocompatibility, or clinical performance data are insufficient to support the intended use and safety profile.',
    severity: 'major',
    likelihood: 'likely',
    submissionTypes: ['510k', 'pma', 'de_novo'],
    agencies: ['fda'],
    reviewPhase: ['substantive'],
    reviewerLanguage: [
      'The bench testing protocol does not adequately assess [performance characteristic].',
      'Biocompatibility testing is not complete per ISO 10993 requirements.',
      'The clinical data are insufficient to demonstrate safety and effectiveness for the intended use.',
    ],
    mitigations: [
      'Align testing with recognized consensus standards',
      'Complete ISO 10993 biocompatibility evaluation',
      'Include worst-case testing conditions',
      'Provide statistical justification for sample sizes',
    ],
    references: ['21 CFR 860', 'ISO 10993', 'FDA Guidance: Use of ISO 10993-1'],
    relatedDeficiencies: ['DEV-001'],
  },

  // ── CER / EU MDR ────────────────────────────────────────────────────────
  {
    id: 'CER-001',
    category: 'CER',
    subcategory: 'Clinical Evaluation',
    title: 'Insufficient Clinical Evidence in CER',
    description: 'The Clinical Evaluation Report does not demonstrate sufficient clinical evidence to support conformity with General Safety and Performance Requirements.',
    severity: 'critical',
    likelihood: 'very_likely',
    submissionTypes: ['cer'],
    agencies: ['ema'],
    reviewPhase: ['substantive'],
    reviewerLanguage: [
      'The clinical data identified and appraised are insufficient to demonstrate conformity.',
      'The equivalence claim lacks sufficient justification.',
      'The literature search strategy does not meet MEDDEV 2.7/1 Rev 4 requirements.',
    ],
    mitigations: [
      'Conduct systematic literature review per MEDDEV 2.7/1 Rev 4',
      'Justify equivalence with technical, biological, and clinical comparisons',
      'Include PMCF plan addressing residual uncertainties',
      'Ensure state-of-the-art analysis is comprehensive',
    ],
    references: ['MEDDEV 2.7/1 Rev 4', 'EU MDR Annex XIV', 'EU MDR Article 61'],
    relatedDeficiencies: [],
  },

  // ── Document Quality ─────────────────────────────────────────────────────
  {
    id: 'DOC-001',
    category: 'Document Quality',
    subcategory: 'Writing',
    title: 'Poor Narrative Quality',
    description: 'The regulatory narrative is unclear, poorly structured, or fails to present a coherent argument for approval.',
    severity: 'major',
    likelihood: 'likely',
    submissionTypes: ['ind', 'nda', 'bla', '510k', 'pma', 'cer'],
    agencies: ['fda', 'ema', 'pmda'],
    reviewPhase: ['substantive'],
    reviewerLanguage: [
      'The benefit-risk discussion does not clearly articulate the clinical significance.',
      'The integrated summary lacks a coherent narrative structure.',
      'Cross-references between modules are incomplete or inconsistent.',
    ],
    mitigations: [
      'Develop a clear narrative arc: problem → evidence → conclusion → benefit-risk',
      'Ensure consistency across all modules and summaries',
      'Have medical writing team review for clarity and persuasion',
      'Use structured templates for key summary documents',
    ],
    references: ['ICH M4(E)', 'ICH E1', 'FDA Guidance: Format and Content of ISS/ISE'],
    relatedDeficiencies: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Query Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get deficiencies relevant to a specific submission type.
 */
export function getDeficienciesBySubmissionType(type: SubmissionType): DeficiencyPattern[] {
  return DEFICIENCY_TAXONOMY.filter(d => d.submissionTypes.includes(type));
}

/**
 * Get deficiencies by category.
 */
export function getDeficienciesByCategory(category: string): DeficiencyPattern[] {
  return DEFICIENCY_TAXONOMY.filter(d => d.category.toLowerCase() === category.toLowerCase());
}

/**
 * Get critical deficiencies for a submission type — these are must-address items.
 */
export function getCriticalDeficiencies(type: SubmissionType): DeficiencyPattern[] {
  return DEFICIENCY_TAXONOMY.filter(
    d => d.submissionTypes.includes(type) && d.severity === 'critical'
  );
}

/**
 * Get deficiency by ID.
 */
export function getDeficiencyById(id: string): DeficiencyPattern | undefined {
  return DEFICIENCY_TAXONOMY.find(d => d.id === id);
}

/**
 * Build a deficiency context block for the system prompt — injected when
 * the user is working on a specific submission type.
 */
export function buildDeficiencyContext(submissionType: SubmissionType): string {
  const relevant = getDeficienciesBySubmissionType(submissionType);
  if (relevant.length === 0) return '';

  const critical = relevant.filter(d => d.severity === 'critical');
  const major = relevant.filter(d => d.severity === 'major');

  const lines: string[] = [
    `## DEFICIENCY INTELLIGENCE FOR ${submissionType.toUpperCase()} SUBMISSIONS`,
    '',
    `### Critical Risks (${critical.length})`,
  ];

  for (const d of critical) {
    lines.push(`- **${d.id}: ${d.title}** — ${d.description}`);
    lines.push(`  Reviewer signal: "${d.reviewerLanguage[0]}"`);
    lines.push(`  Key mitigation: ${d.mitigations[0]}`);
  }

  lines.push('', `### Major Risks (${major.length})`);
  for (const d of major) {
    lines.push(`- **${d.id}: ${d.title}** — ${d.description}`);
    lines.push(`  Key mitigation: ${d.mitigations[0]}`);
  }

  return lines.join('\n');
}

/**
 * Get all categories with counts.
 */
export function getDeficiencyCategories(): Array<{ category: string; count: number; criticalCount: number }> {
  const categories = new Map<string, { count: number; criticalCount: number }>();
  for (const d of DEFICIENCY_TAXONOMY) {
    const existing = categories.get(d.category) || { count: 0, criticalCount: 0 };
    existing.count++;
    if (d.severity === 'critical') existing.criticalCount++;
    categories.set(d.category, existing);
  }
  return Array.from(categories.entries()).map(([category, stats]) => ({
    category,
    ...stats,
  }));
}
