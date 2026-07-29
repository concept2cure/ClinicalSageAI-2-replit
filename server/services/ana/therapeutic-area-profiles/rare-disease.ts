/**
 * Rare disease therapeutic-area profile (Feature 2.7).
 *
 * Covers:
 *   - Natural history benchmarking
 *   - Small-sample statistical methods
 *   - Orphan drug designation (FDA + EMA)
 *   - Patient-focused drug development (PFDD)
 *   - Real-world data / external control acceptability
 *
 * @module server/services/ana/therapeutic-area-profiles/rare-disease
 */
import type { TherapeuticAreaProfile } from './types.js';

export const rareDiseaseProfile: TherapeuticAreaProfile = {
  id: 'rare-disease',
  displayName: 'Rare Disease',
  description:
    'Adapts AnA for rare-disease submissions: natural-history benchmarking, ' +
    'small-sample statistical methods, orphan-drug pathway awareness, and ' +
    'patient-focused drug development integration.',

  contextRules: [
    {
      id: 'rare-natural-history-benchmarking',
      scope: 'section',
      appliesTo: '2.5',
      triggerKeywords: ['natural history', 'historical control', 'external control'],
      instruction:
        'When efficacy is benchmarked against natural history (rather than concurrent placebo), Module 2.5 must (a) characterize the natural-history dataset, (b) document selection criteria + propensity-matching method, and (c) discuss known reliability/comparability limitations. Cite FDA Real-World Evidence framework.',
      severity: 'critical',
      guidanceRef: 'FDA Guidance: Considerations for the Use of Real-World Data and Real-World Evidence (2022)',
    },
    {
      id: 'rare-small-sample-statistics',
      scope: 'section',
      appliesTo: '2.7.3',
      triggerKeywords: ['small sample', 'effective sample', 'bayesian', 'pivotal'],
      instruction:
        'Small samples (<100) require a documented statistical strategy: Bayesian borrowing from natural history, exact tests, or stratified meta-analysis. Naive frequentist analysis on n<30 should be flagged as insufficient. The statistical analysis plan must justify sample size with feasibility argument.',
      severity: 'major',
      guidanceRef: 'FDA Guidance: Rare Diseases: Common Issues in Drug Development (2019)',
    },
    {
      id: 'rare-orphan-designation',
      scope: 'module',
      appliesTo: '1',
      triggerKeywords: ['orphan', 'designation', 'rare'],
      instruction:
        'Confirm orphan-drug designation status (FDA + EMA separately). FDA orphan = <200K US patients; EMA orphan = <5/10K EU. Designation grants 7-yr (US) / 10-yr (EU) market exclusivity + tax credits + fee waivers. Designate BEFORE marketing application.',
      severity: 'major',
      guidanceRef: 'Orphan Drug Act 1983 (FDA); Regulation (EC) 141/2000 (EMA)',
    },
    {
      id: 'rare-pfdd',
      scope: 'always',
      triggerKeywords: ['patient', 'PRO', 'quality of life', 'PFDD'],
      instruction:
        'For rare disease, FDA strongly encourages Patient-Focused Drug Development input — patient-experience data, qualitative interview data, validated PROs specific to the rare condition. Generic HRQoL instruments (SF-36) often inadequate; flag if used as primary PRO.',
      severity: 'major',
      guidanceRef: 'FDA PFDD Guidance Series (Guidance 1-4)',
    },
    {
      id: 'rare-extrapolation-pediatric-adult',
      scope: 'module',
      appliesTo: '5',
      instruction:
        'Adult-to-pediatric extrapolation (or vice-versa) is acceptable in rare disease IF the PK/PD/disease pathophysiology supports it. Document the extrapolation framework explicitly. ICH E11(R1) is the reference.',
      severity: 'major',
      guidanceRef: 'ICH E11(R1) — Pediatric Drug Development',
    },
    {
      id: 'rare-confirmatory-not-required',
      scope: 'always',
      instruction:
        "FDA accepts a single adequate and well-controlled (A&WC) trial in rare diseases when supported by external evidence (natural history, biomarker, mechanistic). Two pivotal trials are NOT a hard requirement — but the single trial's robustness, internal consistency, and statistical persuasiveness must be high.",
      severity: 'major',
      guidanceRef: 'FDA Guidance: Demonstrating Substantial Evidence of Effectiveness (2019)',
    },
  ],

  riskFactors: [
    'Small sample size limits power for any individual subgroup analysis',
    'Heterogeneous disease presentation may make matched-control analyses non-comparable',
    'Natural-history dataset reliability varies — registry quality must be characterized',
    'PFDD evidence may be qualitative; reviewers expect a structured analysis framework',
    'Pediatric extrapolation requires PK/PD bridging that may not exist',
    'Diagnostic criteria evolution over the natural-history collection window may bias historical control',
    'Ascertainment bias in registries (severe phenotypes over-represented)',
    'Site-effect contamination when only 1-2 expert centers enroll the trial',
  ],

  commonGaps: [
    {
      ctdSection: '2.5',
      patterns: ['natural history', 'historical control', 'external control'],
      description:
        'Clinical Overview lacks formal characterization of the natural-history comparator population (selection criteria, ascertainment, propensity matching)',
      severity: 'critical',
      guidanceRef: 'FDA RWD/RWE framework',
    },
    {
      ctdSection: '5.3.5.1',
      prefix: true,
      patterns: ['endpoint', 'primary endpoint', 'feasibility'],
      description:
        'Pivotal study endpoint not validated for the rare disease population (generic instrument used; lack of disease-specific PRO)',
      severity: 'major',
      guidanceRef: 'FDA PFDD Guidance 3',
    },
    {
      ctdSection: '11.4',
      prefix: true,
      patterns: ['statistical', 'analysis plan', 'bayesian'],
      description:
        'Statistical analysis plan does not address small-sample inference (Bayesian, exact tests, or stratified meta-analysis)',
      severity: 'major',
      guidanceRef: 'FDA Rare Diseases Guidance',
    },
    {
      ctdSection: '1.7',
      patterns: ['orphan', 'designation'],
      description: 'Orphan drug designation status not documented (FDA + EMA separately)',
      severity: 'major',
      guidanceRef: 'Orphan Drug Act',
    },
    {
      ctdSection: '5.3.5.4',
      prefix: true,
      patterns: ['pediatric', 'extrapolation', 'PK'],
      description: 'Pediatric extrapolation framework not documented',
      severity: 'major',
      guidanceRef: 'ICH E11(R1)',
    },
  ],

  guidanceRefs: [
    {
      code: 'FDA Guidance: Rare Diseases',
      authority: 'FDA',
      title: 'Rare Diseases: Common Issues in Drug Development (2019)',
      why: 'Definitive FDA framework for small-sample design, natural history, single-trial sufficiency',
    },
    {
      code: 'FDA RWD/RWE',
      authority: 'FDA',
      title: 'Considerations for the Use of Real-World Data and Real-World Evidence (2022)',
      why: 'External-control evidence framework; reviewer expectations for RWD-supported submissions',
    },
    {
      code: 'EMA Orphan Designation',
      authority: 'EMA',
      title: 'Regulation (EC) 141/2000 — Orphan Medicinal Products',
      why: 'EU orphan designation criteria + 10-year market exclusivity',
    },
    {
      code: 'ICH E11(R1)',
      authority: 'ICH',
      title: 'Pediatric Drug Development — Addendum',
      why: 'Extrapolation framework when adult-to-pediatric or pediatric-to-adult bridging is needed',
    },
    {
      code: 'FDA PFDD',
      authority: 'FDA',
      title: 'Patient-Focused Drug Development Guidance Series',
      why: 'Methodologies for collecting + integrating patient experience data',
    },
  ],

  reviewerExpectations: [
    'Natural-history comparator characterized + matched',
    'Statistical strategy appropriate for the actual sample size (Bayesian / exact / stratified)',
    'Single A&WC trial defensible with external evidence',
    'PFDD evidence incorporated with structured analysis (qualitative coding, weighted importance)',
    'Disease-specific (not generic) PRO instrument validated for the indication',
    'Orphan drug designation documented with both FDA and EMA where applicable',
    'Pediatric extrapolation framework documented if pediatric indication is sought',
    'Long-term follow-up plan to capture rare safety signals',
    'Patient-registry partnership for post-marketing surveillance',
  ],

  pathwayHints: [
    {
      pathway: 'orphan_drug',
      applicability: 'Disease prevalence < 200,000 US (FDA) / < 5/10,000 EU (EMA)',
      impactedSections: ['1.7', '2.5'],
      reviewerNotes: 'Apply for designation BEFORE the marketing application.',
    },
    {
      pathway: 'fast_track',
      applicability: 'Serious condition + unmet medical need',
      impactedSections: ['1.7', '2.5'],
      reviewerNotes: 'Rolling review; common in rare disease combined with breakthrough.',
    },
    {
      pathway: 'breakthrough_therapy',
      applicability:
        'Preliminary clinical evidence of substantial improvement over existing therapies on a clinically significant endpoint',
      impactedSections: ['1.7', '2.5'],
      reviewerNotes:
        'In rare disease, "preliminary" can be very early — case series may suffice if the natural history is well-characterized.',
    },
    {
      pathway: 'priority_review',
      applicability:
        'Significant improvement in safety or effectiveness for a serious condition',
      impactedSections: ['1.7'],
      reviewerNotes: '6-month review clock instead of 10-month.',
    },
  ],

  statisticalConsiderations: [
    'Sample size justification: feasibility argument is acceptable; document why a larger sample is impractical',
    'Bayesian analysis with prior elicited from natural history is reviewer-accepted with a documented prior + sensitivity analysis',
    'Exact tests (Fisher / permutation) for binary outcomes when n < 30',
    'Stratification + random-effects meta-analysis for multi-center small-trial pooling',
    'Tipping-point analysis for missing data (imputation worst-case)',
    'External control: propensity-score matching or Mahalanobis-distance with full overlap diagnostics',
    'Single-arm trial: pre-specify response thresholds with literature/natural-history justification',
  ],

  endpointConsiderations: [
    'Disease-specific functional endpoint (e.g. 6MWT for muscular disorders, MFM for spinal muscular atrophy)',
    'PRO must be validated FOR the rare disease, not adapted from a general instrument',
    'Composite endpoints with patient-derived weighting (PFDD)',
    'Time-to-event endpoints in slowly-progressing diseases need long follow-up — interim analyses with surrogate biomarkers',
    'Biomarker endpoints acceptable if mechanistic linkage to clinical benefit is documented',
  ],

  retrievalKeywords: [
    'rare disease',
    'orphan drug',
    'natural history',
    'real-world evidence',
    'external control',
    'small sample',
    'bayesian',
    'patient-focused drug development',
    'PFDD',
    'patient-reported outcome',
    'PRO',
    'pediatric extrapolation',
    'ICH E11',
    'breakthrough therapy',
    'fast track',
    'priority review',
    'registry',
    'propensity matching',
    'MAIC',
  ],
};
