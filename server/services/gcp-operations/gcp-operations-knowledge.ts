/**
 * GCP & Clinical Trial Operations Intelligence — Deterministic Knowledge Base
 *
 * Pure, in-code reference data and decision engines for Good Clinical Practice
 * (GCP) and clinical-trial operations: risk-based monitoring plan design,
 * sponsor/FDA BIMO inspection readiness, GCP compliance assessment against the
 * ICH E6(R3) unifying quality-by-design principles, informed-consent design,
 * protocol-deviation classification, and Trial Master File / essential-document
 * planning.
 *
 * NO LLM, NO network, NO database, NO cross-service imports. Every exported
 * function is closed-form and reproducible: identical input always yields
 * identical output.
 *
 * Regulatory grounding (citations are returned verbatim in the engine output):
 *   - ICH E6(R3) Good Clinical Practice (Step 4, 2023; FDA adoption 2025),
 *     including the Annex on data governance and computerised systems.
 *   - ICH E8(R1) General Considerations for Clinical Studies (2021) —
 *     quality-by-design, critical-to-quality (CtQ) factors.
 *   - FDA Guidance: Oversight of Clinical Investigations — A Risk-Based
 *     Approach to Monitoring (2013) and "A Risk-Based Approach to Monitoring
 *     of Clinical Investigations: Q&A" (2023).
 *   - 21 CFR Part 50 (Protection of Human Subjects / Informed Consent),
 *     21 CFR Part 54 (Financial Disclosure), 21 CFR Part 56 (IRBs),
 *     21 CFR Part 312 (IND / sponsor & investigator responsibilities).
 *   - FDA Bioresearch Monitoring (BIMO) Program — Compliance Program
 *     Guidance Manuals 7348.810 (sponsors/CROs), 7348.811 (clinical
 *     investigators), 7348.809 (IRBs).
 *   - TransCelerate BioPharma Risk-Based Monitoring / Quality methodology.
 *   - DIA Trial Master File (TMF) Reference Model (v3.x zone/section concepts).
 *
 * @module server/services/gcp-operations/gcp-operations-knowledge
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitive types
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type TrialPhase = 'phase1' | 'phase2' | 'phase3' | 'phase4' | 'device' | 'other';
export type MonitoringApproach = 'centralized' | 'on_site' | 'remote' | 'triggered';
export type Severity = 'minor' | 'moderate' | 'major' | 'critical';

/** Coerce an arbitrary numeric input into a finite number with a default. */
function num(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp a number into [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Deterministic round to n decimal places. */
function round(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Stable de-duplication preserving first-seen order. */
function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. ICH E6(R3) Unifying Principles — Reference Data
// ─────────────────────────────────────────────────────────────────────────────

export interface E6Principle {
  id: string;
  title: string;
  statement: string;
  citation: string;
}

/**
 * The ICH E6(R3) "Principles of ICH GCP." R3 reorganises the historic 13
 * principles of E6(R2) into a set of overarching, media-neutral principles
 * built on quality-by-design and proportionate effort. The statements below
 * are paraphrased operational summaries, each carrying its own citation.
 */
const E6R3_PRINCIPLES: E6Principle[] = [
  {
    id: 'P1',
    title: 'Ethical conduct',
    statement:
      'Clinical trials are conducted in accordance with ethical principles originating in the Declaration of Helsinki, consistent with GCP and applicable regulatory requirements.',
    citation: 'ICH E6(R3) Principle 1; Declaration of Helsinki',
  },
  {
    id: 'P2',
    title: 'Informed consent & rights of participants',
    statement:
      'Freely given informed consent is obtained from every participant prior to participation; the rights, safety and well-being of participants prevail over the interests of science and society.',
    citation: 'ICH E6(R3) Principle 2; 21 CFR 50.20',
  },
  {
    id: 'P3',
    title: 'Independent ethics review',
    statement:
      'Trials are subject to objective review by an IRB/IEC that is adequately constituted and operates independently of the investigator and sponsor.',
    citation: 'ICH E6(R3) Principle 3; 21 CFR Part 56',
  },
  {
    id: 'P4',
    title: 'Scientific soundness & quality by design',
    statement:
      'Trials are scientifically sound and described in a clear, detailed protocol; quality is built into the design and conduct by identifying factors critical to quality (CtQ) and managing risks to those factors proportionately.',
    citation: 'ICH E6(R3) Principle 4; ICH E8(R1)',
  },
  {
    id: 'P5',
    title: 'Proportionate, fit-for-purpose processes',
    statement:
      'Trial processes and the effort applied to them are proportionate to the risks to participants and to the reliability of trial results; activities that do not add value are avoided.',
    citation: 'ICH E6(R3) Principle 5',
  },
  {
    id: 'P6',
    title: 'Roles, responsibilities & oversight',
    statement:
      'Roles and responsibilities are clear; the sponsor maintains oversight of delegated activities and service providers; investigators retain responsibility for the trial at their site.',
    citation: 'ICH E6(R3) Principle 6; 21 CFR 312.50; 312.60',
  },
  {
    id: 'P7',
    title: 'Qualified personnel',
    statement:
      'Persons conducting the trial are qualified by education, training and experience to perform their respective tasks.',
    citation: 'ICH E6(R3) Principle 7; 21 CFR 312.53(c)',
  },
  {
    id: 'P8',
    title: 'Investigational product quality & handling',
    statement:
      'Investigational products are manufactured under GMP and handled and stored in accordance with the protocol and product specifications, with accountability maintained.',
    citation: 'ICH E6(R3) Principle 8; ICH E6(R3) §3.16 (IP management)',
  },
  {
    id: 'P9',
    title: 'Reliable results & data governance',
    statement:
      'Trial processes and data governance support the generation of reliable results; data are attributable, legible, contemporaneous, original, accurate and complete (ALCOA+) throughout the data life cycle, regardless of medium.',
    citation: 'ICH E6(R3) Principle 9; ICH E6(R3) Annex (computerised systems)',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. RISK-BASED MONITORING PLAN DESIGN
// ─────────────────────────────────────────────────────────────────────────────

export interface CriticalToQualityFactor {
  id: string;
  area: string;
  factor: string;
  rationale: string;
  riskLevel: RiskLevel;
  citation: string;
}

export interface KeyRiskIndicator {
  kri: string;
  metric: string;
  thresholdGuidance: string;
  monitoringApproach: MonitoringApproach;
  triggersAction: string;
}

export interface MonitoringPlanParams {
  phase?: TrialPhase;
  therapeuticArea?: string;
  numberOfSites?: number;
  plannedEnrollment?: number;
  isFirstInHuman?: boolean;
  isMultiRegional?: boolean;
  usesInvestigationalDevice?: boolean;
  blinded?: boolean;
  vulnerablePopulation?: boolean;
  complexProtocol?: boolean;
  noveltyOfIntervention?: 'established' | 'novel' | 'first_in_class';
  endpointObjectivity?: 'objective' | 'subjective' | 'mixed';
  electronicDataCapture?: boolean;
  experiencedSites?: boolean;
  priorInspectionFindings?: boolean;
  organizationId?: string | number;
}

export interface MonitoringMix {
  centralizedPercent: number;
  onSitePercent: number;
  remotePercent: number;
  sourceDataVerificationStrategy: string;
  sourceDataReviewStrategy: string;
  samplingApproach: string;
  onSiteVisitFrequencyGuidance: string;
  rationale: string[];
}

export interface MonitoringPlanResult {
  overallRiskLevel: RiskLevel;
  riskScore: number;
  criticalToQualityFactors: CriticalToQualityFactor[];
  monitoringMix: MonitoringMix;
  keyRiskIndicators: KeyRiskIndicator[];
  triggeredVisitCriteria: string[];
  centralMonitoringActivities: string[];
  planComponents: string[];
  regulatoryCitations: string[];
  warnings: string[];
  notes: string[];
}

interface RiskContributor {
  label: string;
  weight: number;
  active: boolean;
  citation: string;
}

/** Base library of critical-to-quality factors per ICH E8(R1) / E6(R3). */
const CTQ_LIBRARY: CriticalToQualityFactor[] = [
  {
    id: 'CTQ-CONSENT',
    area: 'Participant protection',
    factor: 'Valid informed consent obtained and documented before any trial procedures',
    rationale:
      'Consent is the foundational ethical and legal safeguard; absence or invalidity is among the most frequent and serious inspection findings.',
    riskLevel: 'critical',
    citation: 'ICH E8(R1) Annex (CtQ); 21 CFR 50.20; 50.27',
  },
  {
    id: 'CTQ-ELIGIBILITY',
    area: 'Participant protection',
    factor: 'Eligibility criteria correctly applied at enrollment',
    rationale:
      'Enrolling ineligible participants exposes them to undue risk and undermines the interpretability of safety and efficacy data.',
    riskLevel: 'high',
    citation: 'ICH E8(R1) Annex; ICH E6(R3) §2.3 (investigator)',
  },
  {
    id: 'CTQ-SAFETY-REPORTING',
    area: 'Safety',
    factor: 'Adverse-event ascertainment and serious-adverse-event reporting within required timelines',
    rationale:
      'Timely, complete safety reporting is essential to participant protection and to the sponsor safety-oversight obligation.',
    riskLevel: 'critical',
    citation: '21 CFR 312.32; 312.64(b); ICH E6(R3) §2.x (safety)',
  },
  {
    id: 'CTQ-PRIMARY-ENDPOINT',
    area: 'Data integrity',
    factor: 'Accurate, complete capture of the primary efficacy endpoint',
    rationale:
      'Errors in primary-endpoint data directly threaten the reliability of the trial conclusion that supports the marketing decision.',
    riskLevel: 'high',
    citation: 'ICH E8(R1) Annex (CtQ); ICH E6(R3) Principle 9',
  },
  {
    id: 'CTQ-IP-ACCOUNTABILITY',
    area: 'Investigational product',
    factor: 'Investigational product storage, dispensing and accountability',
    rationale:
      'Incorrect dosing, compromised product, or accountability gaps affect both safety and the validity of exposure data.',
    riskLevel: 'high',
    citation: 'ICH E6(R3) Principle 8; 21 CFR 312.62(a)',
  },
  {
    id: 'CTQ-RANDOMIZATION',
    area: 'Data integrity',
    factor: 'Randomization and blinding integrity maintained',
    rationale:
      'Breaks in randomization or blinding introduce bias that cannot be corrected analytically.',
    riskLevel: 'high',
    citation: 'ICH E6(R3) §1 (design); ICH E9 (statistical principles)',
  },
  {
    id: 'CTQ-DATA-GOVERNANCE',
    area: 'Data governance',
    factor: 'ALCOA+ data integrity across the data life cycle, including computerised systems',
    rationale:
      'Reliable results depend on attributable, contemporaneous, original and accurate records and on validated, access-controlled systems with audit trails.',
    riskLevel: 'high',
    citation: 'ICH E6(R3) Annex (data governance & computerised systems); 21 CFR Part 11',
  },
];

/**
 * Design a risk-based, quality-by-design monitoring plan per ICH E6(R3) and
 * E8(R1) and the FDA 2013 RBM guidance. Pure and deterministic.
 */
export function designMonitoringPlan(params: MonitoringPlanParams): MonitoringPlanResult {
  const phase: TrialPhase = params.phase ?? 'phase3';
  const numberOfSites = num(params.numberOfSites, 1);
  const enrollment = num(params.plannedEnrollment, 0);
  const warnings: string[] = [];
  const notes: string[] = [];

  // ── Risk scoring (weighted contributors) ──
  const contributors: RiskContributor[] = [
    {
      label: 'First-in-human study',
      weight: 30,
      active: params.isFirstInHuman === true || phase === 'phase1',
      citation: 'FDA RBM Guidance (2013) §III.A; ICH E8(R1)',
    },
    {
      label: 'First-in-class or novel intervention',
      weight: 20,
      active: params.noveltyOfIntervention === 'first_in_class' || params.noveltyOfIntervention === 'novel',
      citation: 'ICH E8(R1) (prior knowledge informs risk)',
    },
    {
      label: 'Vulnerable population',
      weight: 18,
      active: params.vulnerablePopulation === true,
      citation: '21 CFR 50 Subpart B/D; ICH E6(R3) Principle 2',
    },
    {
      label: 'Complex protocol design',
      weight: 14,
      active: params.complexProtocol === true,
      citation: 'ICH E8(R1) Annex (CtQ); FDA RBM Guidance (2013)',
    },
    {
      label: 'Subjective primary endpoint',
      weight: 12,
      active: params.endpointObjectivity === 'subjective' || params.endpointObjectivity === 'mixed',
      citation: 'FDA RBM Guidance (2013) §III.B (data quality risk)',
    },
    {
      label: 'Multi-regional trial',
      weight: 10,
      active: params.isMultiRegional === true,
      citation: 'ICH E17 (MRCT); ICH E6(R3) (oversight of distributed conduct)',
    },
    {
      label: 'Large number of sites (>30)',
      weight: 10,
      active: numberOfSites > 30,
      citation: 'FDA RBM Guidance (2013) (centralized monitoring scales)',
    },
    {
      label: 'Investigational device involved',
      weight: 8,
      active: params.usesInvestigationalDevice === true,
      citation: '21 CFR 812 (IDE); FDA RBM Guidance (2013)',
    },
    {
      label: 'Inexperienced sites',
      weight: 8,
      active: params.experiencedSites === false,
      citation: 'FDA RBM Guidance (2013) §III.A (site experience)',
    },
    {
      label: 'No validated EDC / paper-based data',
      weight: 8,
      active: params.electronicDataCapture === false,
      citation: 'ICH E6(R3) Annex (data governance); FDA RBM Guidance (2013)',
    },
    {
      label: 'Prior inspection findings at sponsor/sites',
      weight: 10,
      active: params.priorInspectionFindings === true,
      citation: 'FDA BIMO CPGM 7348.810 (risk-based site selection)',
    },
  ];

  let riskScore = 0;
  const activeRationale: string[] = [];
  for (const c of contributors) {
    if (c.active) {
      riskScore += c.weight;
      activeRationale.push(`${c.label} (+${c.weight}; ${c.citation})`);
    }
  }
  riskScore = clamp(riskScore, 0, 100);

  let overallRiskLevel: RiskLevel;
  if (riskScore >= 60) overallRiskLevel = 'critical';
  else if (riskScore >= 40) overallRiskLevel = 'high';
  else if (riskScore >= 20) overallRiskLevel = 'medium';
  else overallRiskLevel = 'low';

  // ── Monitoring mix (centralized vs on-site vs remote) ──
  // Higher risk shifts effort toward on-site; centralized monitoring is the
  // backbone in all cases per FDA 2013 guidance.
  let centralizedPercent: number;
  let onSitePercent: number;
  let remotePercent: number;
  switch (overallRiskLevel) {
    case 'critical':
      centralizedPercent = 40;
      onSitePercent = 45;
      remotePercent = 15;
      break;
    case 'high':
      centralizedPercent = 50;
      onSitePercent = 30;
      remotePercent = 20;
      break;
    case 'medium':
      centralizedPercent = 60;
      onSitePercent = 18;
      remotePercent = 22;
      break;
    default:
      centralizedPercent = 70;
      onSitePercent = 8;
      remotePercent = 22;
      break;
  }

  const sdvStrategy =
    overallRiskLevel === 'critical' || overallRiskLevel === 'high'
      ? 'Targeted, risk-based source-data verification (SDV) focused on critical data (consent, eligibility, primary endpoint, SAEs); 100% SDV of critical variables, sampled SDV of non-critical variables.'
      : 'Reduced, sample-based SDV concentrated on critical-to-quality data only; central monitoring substitutes for routine 100% SDV.';

  const sdrStrategy =
    'Source data review (SDR) — review of the broader medical record for protocol compliance, safety and quality signals — prioritized over exhaustive SDV per FDA RBM guidance and ICH E6(R3) proportionate-effort principle.';

  const samplingApproach =
    overallRiskLevel === 'low'
      ? 'Risk-proportionate sampling: verify critical data for all participants and a 10–25% random sample of non-critical data; expand sample if signals emerge.'
      : 'Risk-proportionate sampling: 100% verification of critical-to-quality variables; 25–50% sample of remaining variables, with sample size increased on triggered findings.';

  const visitFrequency = (() => {
    if (overallRiskLevel === 'critical') return 'Initiation visit at activation, then on-site visits approximately every 4–8 weeks while enrolling, plus all triggered visits and a close-out visit.';
    if (overallRiskLevel === 'high') return 'Initiation visit, then on-site visits approximately every 8–12 weeks while enrolling, plus triggered visits and close-out.';
    if (overallRiskLevel === 'medium') return 'Initiation visit, then on-site visits approximately every 12–24 weeks or after enrollment milestones, plus triggered visits and close-out.';
    return 'Initiation visit, then primarily centralized/remote oversight with on-site visits driven by KRI triggers and a close-out visit.';
  })();

  const monitoringMix: MonitoringMix = {
    centralizedPercent,
    onSitePercent,
    remotePercent,
    sourceDataVerificationStrategy: sdvStrategy,
    sourceDataReviewStrategy: sdrStrategy,
    samplingApproach,
    onSiteVisitFrequencyGuidance: visitFrequency,
    rationale: [
      `Overall risk assessed as ${overallRiskLevel} (score ${riskScore}/100).`,
      'Centralized monitoring is the analytic backbone across all risk levels (FDA RBM Guidance 2013 §IV).',
      'On-site effort scales with risk to participants and to result reliability (ICH E6(R3) Principle 5).',
      ...activeRationale,
    ],
  };

  // ── Critical-to-quality factors (select + augment by context) ──
  const ctq: CriticalToQualityFactor[] = CTQ_LIBRARY.map((c) => ({ ...c }));
  if (params.blinded === true) {
    ctq.push({
      id: 'CTQ-BLIND-MAINTENANCE',
      area: 'Data integrity',
      factor: 'Maintenance of blinding and controlled, documented unblinding',
      rationale: 'Trial is blinded; uncontrolled unblinding biases assessments and endpoint ascertainment.',
      riskLevel: 'high',
      citation: 'ICH E6(R3) §1; ICH E9',
    });
  }
  if (params.vulnerablePopulation === true) {
    ctq.push({
      id: 'CTQ-VULNERABLE',
      area: 'Participant protection',
      factor: 'Additional safeguards for vulnerable participants (assent, LAR consent, undue-influence controls)',
      rationale: 'Vulnerable populations require heightened protection and IRB-mandated safeguards.',
      riskLevel: 'critical',
      citation: '21 CFR 50 Subpart B/D; ICH E6(R3) Principle 2',
    });
  }
  if (params.usesInvestigationalDevice === true) {
    ctq.push({
      id: 'CTQ-DEVICE-ACCOUNTABILITY',
      area: 'Investigational product',
      factor: 'Device accountability, malfunction reporting and labeling controls',
      rationale: 'Investigational device studies carry device-specific accountability and reporting obligations.',
      riskLevel: 'high',
      citation: '21 CFR 812.140; 812.150',
    });
  }

  // ── Key risk indicators ──
  const kris: KeyRiskIndicator[] = [
    {
      kri: 'Enrollment rate vs. plan',
      metric: 'Cumulative enrolled / planned by site and overall',
      thresholdGuidance: 'Flag sites <50% or >150% of expected pace; investigate over-enrolling outliers for eligibility shortcuts.',
      monitoringApproach: 'centralized',
      triggersAction: 'Site-level enrollment review; eligibility-source review for over-enrolling sites.',
    },
    {
      kri: 'Screen-failure / screening ratio',
      metric: 'Screen failures / screened per site',
      thresholdGuidance: 'Flag sites materially below cohort mean (possible eligibility-criteria circumvention).',
      monitoringApproach: 'centralized',
      triggersAction: 'Eligibility documentation review; targeted SDV of inclusion/exclusion data.',
    },
    {
      kri: 'SAE / AE reporting rate and latency',
      metric: 'AE count per participant-month and median days from awareness to report',
      thresholdGuidance: 'Flag sites with anomalously low AE rates or reporting latency exceeding protocol/SUSAR timelines.',
      monitoringApproach: 'centralized',
      triggersAction: 'Triggered on-site or remote review of source for under-reporting; safety-team escalation.',
    },
    {
      kri: 'Protocol deviation rate',
      metric: 'Important deviations per participant by site',
      thresholdGuidance: 'Flag sites above cohort threshold or with recurring deviation patterns.',
      monitoringApproach: 'centralized',
      triggersAction: 'Triggered visit; root-cause analysis and CAPA at site.',
    },
    {
      kri: 'Query rate and query aging',
      metric: 'Open queries per CRF page and median days-to-resolution',
      thresholdGuidance: 'Flag sites with high query density or aged (>30 day) queries.',
      monitoringApproach: 'centralized',
      triggersAction: 'Data-management outreach; remote source review.',
    },
    {
      kri: 'Data entry timeliness',
      metric: 'Median days from visit to eCRF entry',
      thresholdGuidance: 'Flag entry lag beyond protocol/EDC expectation (e.g., >2 weeks).',
      monitoringApproach: 'centralized',
      triggersAction: 'Site re-training; remote review of contemporaneity (ALCOA+).',
    },
    {
      kri: 'Missing / out-of-window visits',
      metric: '% visits missing or outside protocol windows',
      thresholdGuidance: 'Flag sites above cohort visit-compliance threshold.',
      monitoringApproach: 'centralized',
      triggersAction: 'Triggered visit; participant-retention and compliance review.',
    },
    {
      kri: 'Primary-endpoint completeness',
      metric: '% participants with complete primary-endpoint data',
      thresholdGuidance: 'Flag any site trending below the protocol-acceptable completeness.',
      monitoringApproach: 'centralized',
      triggersAction: 'Targeted SDV of primary endpoint; central statistical review of distributions.',
    },
    {
      kri: 'Data distribution / outlier checks',
      metric: 'Central statistical monitoring of digit preference, variance, and inlier/outlier patterns by site',
      thresholdGuidance: 'Flag implausible uniformity, low variance, or digit preference suggesting fabrication.',
      monitoringApproach: 'centralized',
      triggersAction: 'For-cause triggered visit; potential misconduct investigation.',
    },
  ];

  // ── Triggered-visit criteria ──
  const triggeredVisitCriteria: string[] = [
    'Any KRI threshold breach not resolved by central/remote follow-up.',
    'Cluster of important protocol deviations or a single critical deviation at a site.',
    'Suspected scientific misconduct or data-integrity signal from central statistical monitoring.',
    'SAE under-reporting signal or a participant-safety concern.',
    'New site with no prior monitoring history reaching its first enrollment milestone.',
    'High staff turnover or change of principal investigator at a site.',
    'Audit or inspection finding requiring on-site verification of corrective action.',
  ];

  // ── Central monitoring activities ──
  const centralMonitoringActivities: string[] = [
    'Aggregate review of KRIs and quality-tolerance-limit (QTL) breaches across sites.',
    'Statistical data surveillance: cross-site comparisons, outlier and digit-preference checks.',
    'Review of data entry timeliness, query metrics and protocol-deviation trends.',
    'Safety-data review in conjunction with the safety/medical-monitoring function.',
    'Reconciliation of essential-document/TMF completeness signals against site activity.',
    'Risk re-assessment at defined intervals and at protocol amendments (ICH E6(R3) iterative risk review).',
  ];

  // ── Plan components (FDA RBM 2013 expected content of a monitoring plan) ──
  const planComponents: string[] = [
    'Description of monitoring approach and rationale (risk-based, quality-by-design).',
    'Critical data and processes (critical-to-quality factors) to be monitored.',
    'Risks identified, evaluated and the controls/mitigations chosen.',
    'Quality tolerance limits (QTLs) for selected critical parameters and the action on breach.',
    'Centralized, on-site and remote monitoring activities and their respective triggers.',
    'Roles, responsibilities and training of monitoring personnel.',
    'Communication of monitoring results, escalation and documentation (monitoring visit reports).',
    'Management of and follow-up on identified issues, including root-cause analysis and CAPA.',
    'Process for amending the monitoring plan as risks evolve.',
  ];

  if (enrollment > 0 && numberOfSites > 0 && enrollment / numberOfSites < 3) {
    warnings.push(
      `Low planned enrollment per site (~${round(enrollment / numberOfSites, 1)} participants/site) may dilute statistical signal in central monitoring; consider central monitoring at the program level.`,
    );
  }
  if (params.electronicDataCapture === false) {
    warnings.push(
      'Paper-based or non-validated data capture limits centralized monitoring effectiveness and increases reliance on on-site SDV; consider EDC adoption (ICH E6(R3) Annex).',
    );
  }
  if (overallRiskLevel === 'critical') {
    notes.push('Critical overall risk: ensure an independent safety-oversight mechanism (e.g., DSMB) is considered and documented.');
  }

  const regulatoryCitations = uniq([
    'ICH E6(R3) Good Clinical Practice (2023; FDA adoption 2025) — Principles 4, 5, 9',
    'ICH E8(R1) General Considerations for Clinical Studies (2021) — critical-to-quality factors',
    'FDA Guidance: Oversight of Clinical Investigations — A Risk-Based Approach to Monitoring (2013)',
    'FDA Guidance: A Risk-Based Approach to Monitoring of Clinical Investigations — Q&A (2023)',
    'ICH E6(R3) Annex — data governance and computerised systems',
    'TransCelerate BioPharma Risk-Based Monitoring methodology',
    '21 CFR 312.50; 312.56 (sponsor monitoring obligations)',
    ...contributors.filter((c) => c.active).map((c) => c.citation),
  ]);

  return {
    overallRiskLevel,
    riskScore,
    criticalToQualityFactors: ctq,
    monitoringMix,
    keyRiskIndicators: kris,
    triggeredVisitCriteria,
    centralMonitoringActivities,
    planComponents,
    regulatoryCitations,
    warnings,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. INSPECTION READINESS (FDA BIMO / Sponsor)
// ─────────────────────────────────────────────────────────────────────────────

export type InspectionTarget = 'sponsor' | 'cro' | 'clinical_investigator' | 'irb';

export interface Common483Finding {
  area: string;
  finding: string;
  citation: string;
  preventiveAction: string;
}

export interface ReadinessAreaScore {
  area: string;
  score: number;
  status: 'ready' | 'gaps' | 'not_ready';
  gaps: string[];
  citation: string;
}

export interface InspectionReadinessParams {
  inspectionTarget?: InspectionTarget;
  essentialDocsCompletePercent?: number;
  tmfContemporaneous?: boolean;
  consentDocumentationComplete?: boolean;
  delegationLogCurrent?: boolean;
  trainingRecordsComplete?: boolean;
  ipAccountabilityReconciled?: boolean;
  safetyReportingCurrent?: boolean;
  protocolDeviationsLogged?: boolean;
  capaProcessInPlace?: boolean;
  openCapas?: number;
  dataTraceabilityVerified?: boolean;
  computerizedSystemsValidated?: boolean;
  monitoringReportsCurrent?: boolean;
  priorInspectionFindings?: boolean;
  organizationId?: string | number;
}

export interface InspectionReadinessResult {
  inspectionTarget: InspectionTarget;
  overallReadiness: 'ready' | 'gaps' | 'not_ready';
  readinessScore: number;
  areaScores: ReadinessAreaScore[];
  common483Findings: Common483Finding[];
  capaPosture: string[];
  dataTraceabilityChecks: string[];
  prioritizedActions: string[];
  regulatoryCitations: string[];
  warnings: string[];
}

/** Common BIMO 483 / Form FDA-483 observations by inspection target. */
const COMMON_483_FINDINGS: Record<InspectionTarget, Common483Finding[]> = {
  clinical_investigator: [
    {
      area: 'Protocol adherence',
      finding: 'Failure to conduct the investigation in accordance with the signed Statement of Investigator / protocol.',
      citation: '21 CFR 312.60; FDA-1572',
      preventiveAction: 'Maintain a current deviation log with root-cause and CAPA; train staff on protocol amendments before implementation.',
    },
    {
      area: 'Informed consent',
      finding: 'Inadequate informed consent — missing signatures/dates, consent obtained after procedures, outdated consent version.',
      citation: '21 CFR 50.20; 50.27; 56.109',
      preventiveAction: 'Consent QC checklist; confirm IRB-approved version; verify consent precedes any study procedure.',
    },
    {
      area: 'Records & data',
      finding: 'Inadequate or inaccurate case histories / source records (ALCOA+ deficiencies).',
      citation: '21 CFR 312.62(b); ICH E6(R3) Principle 9',
      preventiveAction: 'Contemporaneous documentation, controlled corrections, validated systems with audit trails.',
    },
    {
      area: 'Investigational product',
      finding: 'Failure to maintain adequate drug/device disposition and accountability records.',
      citation: '21 CFR 312.62(a); 812.140',
      preventiveAction: 'Reconcile receipt, dispensing, return and destruction; periodic accountability checks.',
    },
    {
      area: 'Safety reporting',
      finding: 'Failure to report adverse events / promptly report to sponsor and IRB.',
      citation: '21 CFR 312.64(b); 312.66',
      preventiveAction: 'Standardize AE ascertainment and reporting timelines; reconcile against safety database.',
    },
    {
      area: 'Delegation & oversight',
      finding: 'Inadequate supervision of the clinical investigation / delegation to unqualified or untrained staff.',
      citation: '21 CFR 312.60; ICH E6(R3) §2.x (investigator oversight)',
      preventiveAction: 'Maintain a current delegation-of-authority log mapped to training and qualification records.',
    },
  ],
  sponsor: [
    {
      area: 'Monitoring & oversight',
      finding: 'Failure to monitor the investigation adequately / to ensure proper monitoring.',
      citation: '21 CFR 312.50; 312.56; FDA RBM Guidance (2013)',
      preventiveAction: 'Document a risk-based monitoring plan, evidence of execution and follow-up on findings.',
    },
    {
      area: 'Vendor oversight',
      finding: 'Inadequate oversight of delegated parties (CRO/vendors) without documented sponsor retention of responsibility.',
      citation: '21 CFR 312.52; ICH E6(R3) Principle 6 (oversight of service providers)',
      preventiveAction: 'Written transfer-of-obligation agreements; documented governance and KPI oversight of vendors.',
    },
    {
      area: 'Safety reporting',
      finding: 'Failure to submit IND safety reports (SUSARs) within required timeframes.',
      citation: '21 CFR 312.32',
      preventiveAction: 'Pharmacovigilance SOPs with timeline controls; reconciliation of expedited reports.',
    },
    {
      area: 'Investigator selection & control',
      finding: 'Failure to ensure investigators were qualified and that the IP was shipped/controlled appropriately.',
      citation: '21 CFR 312.53; 312.57',
      preventiveAction: 'Qualification documentation; IP shipment/accountability records retained centrally.',
    },
    {
      area: 'TMF / records',
      finding: 'Incomplete or non-contemporaneous Trial Master File; essential documents missing.',
      citation: 'ICH E6(R3) §3.x (essential records); 21 CFR 312.57',
      preventiveAction: 'TMF completeness/QC plan with periodic reconciliation against the reference model.',
    },
  ],
  cro: [
    {
      area: 'Delegated obligations',
      finding: 'Performing transferred obligations without adequate procedures or documented sponsor oversight interface.',
      citation: '21 CFR 312.52; ICH E6(R3) Principle 6',
      preventiveAction: 'Map each transferred obligation to an SOP and to evidence of execution.',
    },
    {
      area: 'Monitoring execution',
      finding: 'Monitoring visit reports missing, untimely, or lacking documented issue follow-up.',
      citation: 'FDA RBM Guidance (2013); 21 CFR 312.56',
      preventiveAction: 'Standardize monitoring report templates, timelines and issue-tracking to closure.',
    },
    {
      area: 'Data management',
      finding: 'Query management and database controls not adequately documented or validated.',
      citation: 'ICH E6(R3) Annex (computerised systems); 21 CFR Part 11',
      preventiveAction: 'Validation evidence, audit-trail review, and documented data-handling procedures.',
    },
  ],
  irb: [
    {
      area: 'Membership & quorum',
      finding: 'IRB membership/quorum deficiencies or conflicting members voting.',
      citation: '21 CFR 56.107; 56.108',
      preventiveAction: 'Maintain roster with expertise; document quorum and recusal at each meeting.',
    },
    {
      area: 'Continuing review',
      finding: 'Failure to conduct continuing review at appropriate intervals.',
      citation: '21 CFR 56.108(a); 56.109(f)',
      preventiveAction: 'Tracking system for review intervals and expirations.',
    },
    {
      area: 'Records',
      finding: 'Inadequate IRB records (minutes lacking required detail, no documentation of determinations).',
      citation: '21 CFR 56.115',
      preventiveAction: 'Minutes capturing votes, rationale for controverted issues, and required determinations.',
    },
  ],
};

/**
 * Assess FDA BIMO / sponsor inspection readiness. Pure and deterministic.
 */
export function assessInspectionReadiness(
  params: InspectionReadinessParams,
): InspectionReadinessResult {
  const target: InspectionTarget = params.inspectionTarget ?? 'sponsor';
  const warnings: string[] = [];

  const docPct = clamp(num(params.essentialDocsCompletePercent, 100), 0, 100);

  // Helper: boolean to component score, undefined treated as a gap (unverified).
  const flag = (v: boolean | undefined): number => (v === true ? 100 : v === false ? 0 : 50);

  const areaScores: ReadinessAreaScore[] = [];

  const pushArea = (
    area: string,
    score: number,
    citation: string,
    gapText: string,
    isGap: boolean,
  ): void => {
    const status: ReadinessAreaScore['status'] = score >= 85 ? 'ready' : score >= 60 ? 'gaps' : 'not_ready';
    areaScores.push({
      area,
      score: round(score, 0),
      status,
      gaps: isGap ? [gapText] : [],
      citation,
    });
  };

  pushArea(
    'Essential documents / TMF completeness',
    Math.min(docPct, flag(params.tmfContemporaneous)),
    'ICH E6(R3) §3.x (essential records); 21 CFR 312.57',
    params.tmfContemporaneous === false
      ? 'TMF not maintained contemporaneously; reconcile and document timeliness.'
      : `Essential-document completeness at ${docPct}% — close outstanding items before inspection.`,
    docPct < 100 || params.tmfContemporaneous !== true,
  );
  pushArea(
    'Informed consent documentation',
    flag(params.consentDocumentationComplete),
    '21 CFR 50.20; 50.27',
    'Complete consent QC: signatures/dates present, correct IRB-approved version, consent precedes procedures.',
    params.consentDocumentationComplete !== true,
  );
  pushArea(
    'Delegation of authority',
    flag(params.delegationLogCurrent),
    '21 CFR 312.60; ICH E6(R3) (oversight)',
    'Bring the delegation-of-authority log current and reconcile with training/qualification records.',
    params.delegationLogCurrent !== true,
  );
  pushArea(
    'Training & qualification records',
    flag(params.trainingRecordsComplete),
    '21 CFR 312.53(c); ICH E6(R3) Principle 7',
    'Complete training/CV/qualification records for all delegated personnel.',
    params.trainingRecordsComplete !== true,
  );
  pushArea(
    'Investigational product accountability',
    flag(params.ipAccountabilityReconciled),
    '21 CFR 312.62(a); 812.140',
    'Reconcile IP receipt/dispensing/return/destruction; resolve discrepancies.',
    params.ipAccountabilityReconciled !== true,
  );
  pushArea(
    'Safety reporting currency',
    flag(params.safetyReportingCurrent),
    '21 CFR 312.32; 312.64(b)',
    'Reconcile AE/SAE reporting against safety database; confirm timelines met.',
    params.safetyReportingCurrent !== true,
  );
  pushArea(
    'Protocol deviation management',
    flag(params.protocolDeviationsLogged),
    'ICH E6(R3) §2.x; 21 CFR 312.60',
    'Ensure deviations are logged with root-cause and CAPA, and reported per IRB/sponsor policy.',
    params.protocolDeviationsLogged !== true,
  );
  pushArea(
    'Monitoring evidence',
    flag(params.monitoringReportsCurrent),
    '21 CFR 312.56; FDA RBM Guidance (2013)',
    'Ensure monitoring visit reports are current with documented issue follow-up to closure.',
    params.monitoringReportsCurrent !== true,
  );
  pushArea(
    'Data traceability',
    flag(params.dataTraceabilityVerified),
    'ICH E6(R3) Principle 9; Annex (data life cycle)',
    'Verify end-to-end traceability from source to eCRF to database/listings (ALCOA+).',
    params.dataTraceabilityVerified !== true,
  );
  pushArea(
    'Computerised-systems validation',
    flag(params.computerizedSystemsValidated),
    'ICH E6(R3) Annex (computerised systems); 21 CFR Part 11',
    'Confirm validation, access controls and audit-trail review for systems holding trial data.',
    params.computerizedSystemsValidated !== true,
  );

  const readinessScore = round(
    areaScores.reduce((acc, a) => acc + a.score, 0) / areaScores.length,
    0,
  );
  const overallReadiness: InspectionReadinessResult['overallReadiness'] =
    readinessScore >= 85 ? 'ready' : readinessScore >= 60 ? 'gaps' : 'not_ready';

  // ── CAPA posture ──
  const openCapas = num(params.openCapas, 0);
  const capaPosture: string[] = [];
  if (params.capaProcessInPlace !== true) {
    capaPosture.push('No documented CAPA process detected — establish a CAPA SOP with root-cause analysis, effectiveness checks and closure tracking.');
  } else {
    capaPosture.push('CAPA process in place — ensure each finding has a documented root cause, corrective action, preventive action and effectiveness verification.');
  }
  if (openCapas > 0) {
    capaPosture.push(`${openCapas} open CAPA(s) — prioritize closure or document interim controls and a realistic closure timeline before inspection.`);
  }
  if (params.priorInspectionFindings === true) {
    capaPosture.push('Prior inspection findings present — prepare evidence that previous CAPAs were implemented and verified effective; inspectors commonly verify recurrence.');
  }
  capaPosture.push('Maintain a chronological inspection-readiness binder: organizational charts, SOP index, deviation/CAPA log, and a back-room/front-room SOP.');

  // ── Data traceability checks ──
  const dataTraceabilityChecks: string[] = [
    'Trace a sample of primary-endpoint values from source document → eCRF → database extract → statistical listing.',
    'Confirm audit trails are enabled, reviewed, and not disabled for systems holding source or eCRF data.',
    'Verify electronic-record corrections retain original values, reason, author and timestamp (ALCOA+).',
    'Reconcile randomization/IRT records with dispensing and dosing data.',
    'Reconcile SAEs between the clinical database and the pharmacovigilance/safety database.',
    'Confirm certified-copy procedures for any source converted to another medium.',
  ];

  // ── Prioritized actions (gaps first, severity-ordered) ──
  const prioritized = areaScores
    .filter((a: ReadinessAreaScore) => a.status !== 'ready')
    .sort((a: ReadinessAreaScore, b: ReadinessAreaScore) => a.score - b.score)
    .map((a: ReadinessAreaScore) => `[${a.status === 'not_ready' ? 'P1' : 'P2'}] ${a.area}: ${a.gaps[0] ?? 'Close gap before inspection.'}`);

  const prioritizedActions = prioritized.length > 0
    ? prioritized
    : ['No material gaps detected — conduct a mock inspection to confirm readiness and rehearse front-room/back-room roles.'];

  if (params.essentialDocsCompletePercent !== undefined && docPct < 90) {
    warnings.push('Essential-document completeness below 90% is a frequent inspection trigger; prioritize TMF reconciliation.');
  }
  if (params.computerizedSystemsValidated === false) {
    warnings.push('Unvalidated computerised systems are a high-visibility finding under the ICH E6(R3) Annex and 21 CFR Part 11.');
  }

  const regulatoryCitations = uniq([
    'FDA BIMO Compliance Program Guidance Manual 7348.810 (Sponsors/CROs/Monitors)',
    'FDA BIMO Compliance Program Guidance Manual 7348.811 (Clinical Investigators)',
    'FDA BIMO Compliance Program Guidance Manual 7348.809 (IRBs)',
    'ICH E6(R3) Good Clinical Practice (2023) — Principles 6, 7, 9; Annex',
    '21 CFR Part 312 (IND); 21 CFR Part 50; 21 CFR Part 56; 21 CFR Part 11',
    'FDA Guidance: Oversight of Clinical Investigations — Risk-Based Monitoring (2013)',
  ]);

  return {
    inspectionTarget: target,
    overallReadiness,
    readinessScore,
    areaScores,
    common483Findings: COMMON_483_FINDINGS[target].map((f) => ({ ...f })),
    capaPosture,
    dataTraceabilityChecks,
    prioritizedActions,
    regulatoryCitations,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GCP COMPLIANCE ASSESSMENT (ICH E6(R3) principles)
// ─────────────────────────────────────────────────────────────────────────────

export interface GCPComplianceParams {
  ethicsApprovalCurrent?: boolean;
  informedConsentProcessCompliant?: boolean;
  sponsorOversightDocumented?: boolean;
  vendorOversightDocumented?: boolean;
  delegationDocumented?: boolean;
  personnelQualified?: boolean;
  protocolFollowedWithChangeControl?: boolean;
  ipManagementCompliant?: boolean;
  safetyReportingCompliant?: boolean;
  dataGovernanceAlcoaPlus?: boolean;
  computerizedSystemsValidated?: boolean;
  auditTrailReviewPerformed?: boolean;
  riskBasedQualityManagement?: boolean;
  recordRetentionCompliant?: boolean;
  organizationId?: string | number;
}

export interface PrincipleAssessment {
  principleId: string;
  title: string;
  conforms: 'conforms' | 'partial' | 'gap' | 'unverified';
  finding: string;
  citation: string;
}

export interface GCPGap {
  domain: 'oversight' | 'delegation' | 'data_governance' | 'computerized_systems' | 'safety' | 'consent' | 'quality_management';
  severity: Severity;
  description: string;
  remediation: string;
  citation: string;
}

export interface GCPComplianceResult {
  overallStatus: 'compliant' | 'minor_gaps' | 'major_gaps' | 'critical_gaps';
  complianceScore: number;
  principleAssessments: PrincipleAssessment[];
  gaps: GCPGap[];
  strengths: string[];
  regulatoryCitations: string[];
  notes: string[];
}

/**
 * Evaluate a trial/operation against the ICH E6(R3) unifying principles and
 * surface gaps in oversight, delegation, data governance and computerised
 * systems. Pure and deterministic.
 */
export function assessGCPCompliance(params: GCPComplianceParams): GCPComplianceResult {
  const notes: string[] = [];
  const gaps: GCPGap[] = [];
  const strengths: string[] = [];

  // Map each principle to the controlling input(s).
  const conformOf = (v: boolean | undefined): PrincipleAssessment['conforms'] =>
    v === true ? 'conforms' : v === false ? 'gap' : 'unverified';

  const principleAssessments: PrincipleAssessment[] = [];

  const pushPrinciple = (
    p: E6Principle,
    conforms: PrincipleAssessment['conforms'],
    findingPass: string,
    findingFail: string,
  ): void => {
    principleAssessments.push({
      principleId: p.id,
      title: p.title,
      conforms,
      finding:
        conforms === 'conforms'
          ? findingPass
          : conforms === 'unverified'
            ? `${findingFail} (status not provided — verify and document).`
            : findingFail,
      citation: p.citation,
    });
  };

  const principleById = (id: string): E6Principle =>
    E6R3_PRINCIPLES.find((p: E6Principle) => p.id === id) as E6Principle;

  pushPrinciple(
    principleById('P1'),
    conformOf(params.ethicsApprovalCurrent),
    'Ethical conduct supported by current ethics/IRB approval.',
    'Ethics/IRB approval not confirmed current — conduct without valid approval is a critical GCP violation.',
  );
  pushPrinciple(
    principleById('P2'),
    conformOf(params.informedConsentProcessCompliant),
    'Informed-consent process compliant with regulatory requirements.',
    'Informed-consent process non-compliant or unverified — a critical participant-protection gap.',
  );
  pushPrinciple(
    principleById('P3'),
    conformOf(params.ethicsApprovalCurrent),
    'Independent ethics review evidenced.',
    'Independent ethics review not evidenced — confirm IRB/IEC composition and review records.',
  );
  pushPrinciple(
    principleById('P4'),
    conformOf(params.riskBasedQualityManagement),
    'Quality-by-design / risk-based quality management is implemented.',
    'Risk-based quality management (CtQ identification, QTLs) not evidenced — required by E6(R3)/E8(R1).',
  );
  pushPrinciple(
    principleById('P5'),
    conformOf(params.riskBasedQualityManagement),
    'Processes are proportionate and fit-for-purpose.',
    'Proportionate, fit-for-purpose process design not evidenced.',
  );
  pushPrinciple(
    principleById('P6'),
    conformOf(params.sponsorOversightDocumented),
    'Sponsor oversight of delegated activities is documented.',
    'Sponsor oversight not documented — a frequent and serious deficiency under E6(R3) Principle 6.',
  );
  pushPrinciple(
    principleById('P7'),
    conformOf(params.personnelQualified),
    'Personnel qualifications and training are documented.',
    'Personnel qualification/training not evidenced.',
  );
  pushPrinciple(
    principleById('P8'),
    conformOf(params.ipManagementCompliant),
    'Investigational-product handling and accountability are compliant.',
    'IP management/accountability not evidenced or non-compliant.',
  );
  pushPrinciple(
    principleById('P9'),
    conformOf(params.dataGovernanceAlcoaPlus),
    'Data governance supports reliable results (ALCOA+).',
    'Data governance (ALCOA+) not evidenced — threatens reliability of results.',
  );

  // ── Gap synthesis (cross-cutting domains) ──
  if (params.sponsorOversightDocumented === false || params.sponsorOversightDocumented === undefined) {
    gaps.push({
      domain: 'oversight',
      severity: params.sponsorOversightDocumented === false ? 'major' : 'moderate',
      description: 'Sponsor oversight of trial conduct and delegated activities is not documented.',
      remediation: 'Document an oversight framework: governance meetings, KPIs/KRIs, escalation paths and review of delegated-party performance.',
      citation: 'ICH E6(R3) Principle 6; 21 CFR 312.50',
    });
  } else {
    strengths.push('Sponsor oversight of delegated activities is documented (E6(R3) Principle 6).');
  }

  if (params.vendorOversightDocumented === false) {
    gaps.push({
      domain: 'oversight',
      severity: 'major',
      description: 'Oversight of service providers / CROs is not documented despite delegation of obligations.',
      remediation: 'Maintain written transfer-of-obligation agreements (21 CFR 312.52) and documented governance of each delegated obligation.',
      citation: 'ICH E6(R3) Principle 6; 21 CFR 312.52',
    });
  }

  if (params.delegationDocumented === false || params.delegationDocumented === undefined) {
    gaps.push({
      domain: 'delegation',
      severity: params.delegationDocumented === false ? 'major' : 'moderate',
      description: 'Delegation of authority is not adequately documented and reconciled with qualification/training.',
      remediation: 'Maintain a current delegation-of-authority log mapping each task to a qualified, trained individual.',
      citation: 'ICH E6(R3) (investigator oversight); 21 CFR 312.60',
    });
  } else {
    strengths.push('Delegation of authority is documented and reconciled with qualifications.');
  }

  if (params.dataGovernanceAlcoaPlus === false || params.dataGovernanceAlcoaPlus === undefined) {
    gaps.push({
      domain: 'data_governance',
      severity: params.dataGovernanceAlcoaPlus === false ? 'major' : 'moderate',
      description: 'Data governance across the data life cycle (ALCOA+) is not evidenced.',
      remediation: 'Define data-flow and governance: source identification, certified copies, retention, and controls ensuring attributable/contemporaneous/original/accurate records.',
      citation: 'ICH E6(R3) Principle 9; Annex',
    });
  } else {
    strengths.push('ALCOA+ data governance is evidenced across the data life cycle.');
  }

  if (params.computerizedSystemsValidated === false || params.computerizedSystemsValidated === undefined) {
    gaps.push({
      domain: 'computerized_systems',
      severity: params.computerizedSystemsValidated === false ? 'major' : 'moderate',
      description: 'Computerised systems holding trial data are not evidenced as validated and access-controlled.',
      remediation: 'Provide validation evidence, role-based access control, and enabled audit trails per the E6(R3) Annex and 21 CFR Part 11.',
      citation: 'ICH E6(R3) Annex (computerised systems); 21 CFR Part 11',
    });
  } else {
    strengths.push('Computerised systems are validated with access controls and audit trails.');
  }

  if (params.auditTrailReviewPerformed === false) {
    gaps.push({
      domain: 'computerized_systems',
      severity: 'moderate',
      description: 'Audit-trail review is not performed, weakening detection of unauthorized or implausible data changes.',
      remediation: 'Institute risk-based audit-trail review focused on critical data and on metadata indicative of data-integrity concerns.',
      citation: 'ICH E6(R3) Annex; 21 CFR Part 11',
    });
  }

  if (params.safetyReportingCompliant === false) {
    gaps.push({
      domain: 'safety',
      severity: 'critical',
      description: 'Safety reporting is non-compliant — AE/SAE/SUSAR ascertainment or timelines are deficient.',
      remediation: 'Remediate pharmacovigilance SOPs and reconcile the safety database; treat as a participant-protection priority.',
      citation: '21 CFR 312.32; 312.64(b)',
    });
  }

  if (params.informedConsentProcessCompliant === false) {
    gaps.push({
      domain: 'consent',
      severity: 'critical',
      description: 'Informed-consent process is non-compliant.',
      remediation: 'Halt affected enrollment; remediate the consent process; consult IRB on re-consent and reportability.',
      citation: '21 CFR 50.20; 50.25; 50.27',
    });
  }

  if (params.riskBasedQualityManagement === false || params.riskBasedQualityManagement === undefined) {
    gaps.push({
      domain: 'quality_management',
      severity: params.riskBasedQualityManagement === false ? 'moderate' : 'minor',
      description: 'Risk-based quality management (CtQ identification, risk control, QTLs) is not evidenced.',
      remediation: 'Implement the E8(R1)/E6(R3) quality-by-design cycle: identify CtQ factors, assess and control risks, set QTLs, and review iteratively.',
      citation: 'ICH E6(R3) Principles 4–5; ICH E8(R1)',
    });
  } else {
    strengths.push('Risk-based, quality-by-design management is implemented (E6(R3) Principles 4–5).');
  }

  if (params.recordRetentionCompliant === false) {
    gaps.push({
      domain: 'data_governance',
      severity: 'moderate',
      description: 'Record retention does not meet regulatory minimums.',
      remediation: 'Retain essential documents per 21 CFR 312.62(c) / ICH E6(R3) (at least 2 years after marketing application approval or program discontinuation).',
      citation: '21 CFR 312.62(c); ICH E6(R3) §3.x (retention)',
    });
  }

  // ── Scoring ──
  const conformingPrinciples = principleAssessments.filter(
    (p: PrincipleAssessment) => p.conforms === 'conforms',
  ).length;
  const complianceScore = round((conformingPrinciples / principleAssessments.length) * 100, 0);

  const hasCritical = gaps.some((g: GCPGap) => g.severity === 'critical');
  const majorCount = gaps.filter((g: GCPGap) => g.severity === 'major').length;

  let overallStatus: GCPComplianceResult['overallStatus'];
  if (hasCritical) overallStatus = 'critical_gaps';
  else if (majorCount >= 2 || complianceScore < 55) overallStatus = 'major_gaps';
  else if (gaps.length > 0 || complianceScore < 85) overallStatus = 'minor_gaps';
  else overallStatus = 'compliant';

  if (gaps.some((g: GCPGap) => g.severity === 'critical')) {
    notes.push('One or more critical gaps affect participant protection or result reliability and should be remediated before continued conduct.');
  }
  notes.push('"Unverified" principles reflect inputs not provided; absence of evidence is itself an inspection risk under E6(R3).');

  const regulatoryCitations = uniq([
    'ICH E6(R3) Good Clinical Practice (2023; FDA adoption 2025) — Principles 1–9 and Annex',
    'ICH E8(R1) General Considerations for Clinical Studies (2021)',
    '21 CFR Part 312 (sponsor & investigator responsibilities)',
    '21 CFR Part 11 (electronic records / electronic signatures)',
    '21 CFR Part 50; 21 CFR Part 56',
    ...principleAssessments.map((p: PrincipleAssessment) => p.citation),
  ]);

  return {
    overallStatus,
    complianceScore,
    principleAssessments,
    gaps,
    strengths: uniq(strengths),
    regulatoryCitations,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. INFORMED-CONSENT DESIGN (21 CFR 50.25)
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsentElement {
  id: string;
  category: 'required' | 'additional';
  element: string;
  citation: string;
}

export interface InformedConsentParams {
  studyType?: 'interventional' | 'observational' | 'device' | 'gene_therapy';
  involvesRandomization?: boolean;
  involvesPlacebo?: boolean;
  moreThanMinimalRisk?: boolean;
  collectsBiospecimens?: boolean;
  futureResearchUse?: boolean;
  genomicData?: boolean;
  vulnerablePopulations?: Array<'children' | 'pregnant' | 'cognitively_impaired' | 'prisoners' | 'non_english' | 'emergency'>;
  electronicConsent?: boolean;
  remoteConsent?: boolean;
  commercialProfitPotential?: boolean;
  targetReadingGradeLevel?: number;
  organizationId?: string | number;
}

export interface VulnerabilitySafeguard {
  population: string;
  safeguards: string[];
  citation: string;
}

export interface InformedConsentResult {
  requiredElements: ConsentElement[];
  additionalElements: ConsentElement[];
  applicableAdditionalElements: ConsentElement[];
  readabilityGuidance: string[];
  vulnerablePopulationSafeguards: VulnerabilitySafeguard[];
  reConsentTriggers: string[];
  electronicConsentConsiderations: string[];
  documentationRequirements: string[];
  regulatoryCitations: string[];
  warnings: string[];
}

/** The eight basic required elements of informed consent — 21 CFR 50.25(a). */
const REQUIRED_CONSENT_ELEMENTS: ConsentElement[] = [
  { id: 'RE1', category: 'required', element: 'Statement that the study involves research, its purpose, expected duration of participation, description of procedures, and identification of any experimental procedures.', citation: '21 CFR 50.25(a)(1)' },
  { id: 'RE2', category: 'required', element: 'Description of any reasonably foreseeable risks or discomforts to the subject.', citation: '21 CFR 50.25(a)(2)' },
  { id: 'RE3', category: 'required', element: 'Description of any benefits to the subject or to others that may reasonably be expected.', citation: '21 CFR 50.25(a)(3)' },
  { id: 'RE4', category: 'required', element: 'Disclosure of appropriate alternative procedures or courses of treatment, if any, that might be advantageous to the subject.', citation: '21 CFR 50.25(a)(4)' },
  { id: 'RE5', category: 'required', element: 'Statement describing the extent to which confidentiality of records will be maintained, and noting the possibility that FDA may inspect the records.', citation: '21 CFR 50.25(a)(5)' },
  { id: 'RE6', category: 'required', element: 'For more-than-minimal-risk research, explanation of any compensation and whether medical treatments are available if injury occurs.', citation: '21 CFR 50.25(a)(6)' },
  { id: 'RE7', category: 'required', element: 'Explanation of whom to contact for questions about the research, subject rights, and research-related injury.', citation: '21 CFR 50.25(a)(7)' },
  { id: 'RE8', category: 'required', element: 'Statement that participation is voluntary, refusal involves no penalty or loss of benefits, and the subject may discontinue at any time without penalty.', citation: '21 CFR 50.25(a)(8)' },
];

/** Additional elements, when appropriate — 21 CFR 50.25(b). */
const ADDITIONAL_CONSENT_ELEMENTS: ConsentElement[] = [
  { id: 'AE1', category: 'additional', element: 'Statement that the particular treatment or procedure may involve unforeseeable risks to the subject (or to the embryo/fetus, if applicable).', citation: '21 CFR 50.25(b)(1)' },
  { id: 'AE2', category: 'additional', element: 'Anticipated circumstances under which the subject’s participation may be terminated by the investigator without the subject’s consent.', citation: '21 CFR 50.25(b)(2)' },
  { id: 'AE3', category: 'additional', element: 'Any additional costs to the subject that may result from participation.', citation: '21 CFR 50.25(b)(3)' },
  { id: 'AE4', category: 'additional', element: 'Consequences of a subject’s decision to withdraw and procedures for orderly termination of participation.', citation: '21 CFR 50.25(b)(4)' },
  { id: 'AE5', category: 'additional', element: 'Statement that significant new findings developed during the research that may affect willingness to continue will be provided to the subject.', citation: '21 CFR 50.25(b)(5)' },
  { id: 'AE6', category: 'additional', element: 'Approximate number of subjects involved in the study.', citation: '21 CFR 50.25(b)(6)' },
  { id: 'AE7', category: 'additional', element: 'Clinicaltrials.gov statement (for applicable clinical trials): a description of the trial will be available on the public registry.', citation: '21 CFR 50.25(c)' },
  { id: 'AE8', category: 'additional', element: 'Statement regarding whether biospecimens may be used for commercial profit and whether the subject will share in that profit.', citation: '21 CFR 50.25(b)(7) (2018 Common Rule alignment)' },
  { id: 'AE9', category: 'additional', element: 'Statement regarding whether clinically relevant research results, including individual results, will be returned to subjects.', citation: '21 CFR 50.25(b)(8) (Common Rule alignment)' },
  { id: 'AE10', category: 'additional', element: 'Statement on whether the research will or might include whole-genome sequencing of biospecimens.', citation: '21 CFR 50.25(b)(9) (Common Rule alignment)' },
];

/**
 * Design an informed-consent specification per 21 CFR 50.25. Pure and
 * deterministic.
 */
export function designInformedConsent(params: InformedConsentParams): InformedConsentResult {
  const warnings: string[] = [];

  // Select applicable additional elements based on study characteristics.
  const applicable: ConsentElement[] = [];
  const add = (id: string): void => {
    const el = ADDITIONAL_CONSENT_ELEMENTS.find((e: ConsentElement) => e.id === id);
    if (el) applicable.push(el);
  };
  if (params.moreThanMinimalRisk === true) add('AE1');
  add('AE2'); // investigator-initiated termination is broadly appropriate
  add('AE3');
  add('AE4');
  add('AE5'); // new findings disclosure
  add('AE6');
  if (params.studyType !== 'observational') add('AE7'); // applicable clinical trial registry statement
  if (params.collectsBiospecimens === true && params.commercialProfitPotential === true) add('AE8');
  if (params.collectsBiospecimens === true) add('AE9');
  if (params.genomicData === true || params.collectsBiospecimens === true) add('AE10');

  // ── Readability ──
  const targetGrade = clamp(num(params.targetReadingGradeLevel, 8), 4, 12);
  const readabilityGuidance: string[] = [
    `Target a reading level at or below grade ${targetGrade} (6th–8th grade is the common standard); use plain language and short sentences.`,
    'Lead with a concise summary of key information that a reasonable person would want to make a decision (2018 Common Rule “key information” requirement).',
    'Avoid technical jargon; define unavoidable terms; use second person and active voice.',
    'Organize with headings, white space and a logical flow; avoid exculpatory language (no waiver of legal rights — 21 CFR 50.20).',
    'Provide the consent in a language understandable to the subject or the legally authorized representative (LAR).',
  ];

  // ── Vulnerable populations ──
  const vulnerablePopulationSafeguards: VulnerabilitySafeguard[] = [];
  const vp = params.vulnerablePopulations ?? [];
  if (vp.includes('children')) {
    vulnerablePopulationSafeguards.push({
      population: 'Children',
      safeguards: [
        'Obtain parental/guardian permission and child assent appropriate to age and maturity.',
        'IRB must categorize risk/benefit under 21 CFR 50 Subpart D (50.51–50.54).',
        'Provide an age-appropriate assent document in addition to the parental permission form.',
      ],
      citation: '21 CFR 50 Subpart D; 50.55',
    });
  }
  if (vp.includes('pregnant')) {
    vulnerablePopulationSafeguards.push({
      population: 'Pregnant participants',
      safeguards: [
        'Address risks to the embryo/fetus explicitly (links to 50.25(b)(1)).',
        'Apply heightened risk/benefit scrutiny and any applicable Subpart B protections.',
      ],
      citation: '21 CFR 50.25(b)(1); 45 CFR 46 Subpart B (when applicable)',
    });
  }
  if (vp.includes('cognitively_impaired')) {
    vulnerablePopulationSafeguards.push({
      population: 'Cognitively impaired adults',
      safeguards: [
        'Use a legally authorized representative (LAR) where the subject lacks capacity; document the LAR basis.',
        'Assess and document decision-making capacity; obtain assent where feasible.',
        'Consider an independent consent monitor for higher-risk research.',
      ],
      citation: '21 CFR 50.20; 50.3(l) (LAR); IRB policy',
    });
  }
  if (vp.includes('prisoners')) {
    vulnerablePopulationSafeguards.push({
      population: 'Prisoners',
      safeguards: [
        'Apply additional protections and IRB composition requirements; minimize coercion/undue influence.',
        'Limit permissible categories of research; ensure parole considerations do not influence participation.',
      ],
      citation: '45 CFR 46 Subpart C (when applicable); 21 CFR 56 (IRB)',
    });
  }
  if (vp.includes('non_english')) {
    vulnerablePopulationSafeguards.push({
      population: 'Non-English speakers / limited literacy',
      safeguards: [
        'Provide an IRB-approved translated long-form consent or a short-form consent with a qualified interpreter and witness.',
        'Document the translation/interpretation process; ensure comprehension verification.',
      ],
      citation: '21 CFR 50.27(b)(2) (short-form); 50.20',
    });
  }
  if (vp.includes('emergency')) {
    vulnerablePopulationSafeguards.push({
      population: 'Emergency research (exception from informed consent)',
      safeguards: [
        'Meet all conditions of 21 CFR 50.24 (EFIC): life-threatening situation, impracticability of consent, community consultation and public disclosure.',
        'Obtain consent as soon as feasible from the subject or LAR; IRB must specifically approve EFIC.',
      ],
      citation: '21 CFR 50.24',
    });
  }

  // ── Re-consent triggers ──
  const reConsentTriggers: string[] = [
    'A new risk or significant new finding becomes known that may affect willingness to continue (50.25(b)(5)).',
    'A protocol amendment changes procedures, risks, duration, or the nature of participation.',
    'A new version of the consent form is approved by the IRB while the subject is still active.',
    'A minor reaches the age of majority during continued participation (transition to adult consent).',
    'A subject who consented via LAR regains decision-making capacity.',
    'A change in the legal/regulatory status of the investigational product affecting risk disclosure.',
  ];

  // ── Electronic / remote consent ──
  const electronicConsentConsiderations: string[] = [];
  if (params.electronicConsent === true || params.remoteConsent === true) {
    electronicConsentConsiderations.push(
      'Comply with 21 CFR Part 11 for electronic signatures and records (identity verification, audit trail, system validation).',
      'Follow FDA/OHRP guidance "Use of Electronic Informed Consent" (2016): present information in a manner the subject can understand and retain.',
      'Verify the identity of the person signing; allow questions to be answered by qualified study personnel (live or remote).',
      'Provide the subject a copy of the signed eConsent and the ability to review/download it.',
      'Ensure the IRB has reviewed and approved the eConsent process and materials.',
    );
    if (params.remoteConsent === true) {
      electronicConsentConsiderations.push(
        'For remote consent, document the method of LAR/witness participation where required and confirm a private, uncoerced setting.',
      );
    }
  } else {
    electronicConsentConsiderations.push('Paper consent process selected — ensure signed/dated original is retained and a copy is provided to the subject (50.27).');
  }

  // ── Documentation ──
  const documentationRequirements: string[] = [
    'Written informed consent signed and dated by the subject (or LAR) before any study-specific procedures (50.27(a)).',
    'Subject receives a copy of the signed consent form.',
    'Source documentation of the consent process (who consented, when, version, comprehension).',
    'Use of the current IRB-approved consent version only; retire superseded versions from circulation.',
    'For short-form consent: signed short form + witness signature + IRB-approved summary signed by witness and person obtaining consent (50.27(b)(2)).',
  ];

  if (params.moreThanMinimalRisk === true) {
    warnings.push('More-than-minimal-risk research: the compensation/injury element (50.25(a)(6)) and unforeseeable-risk element (50.25(b)(1)) must be addressed.');
  }
  if (params.involvesPlacebo === true) {
    warnings.push('Placebo-controlled design: clearly disclose the probability of receiving placebo and the implications for the subject’s usual care.');
  }
  if (params.studyType === 'gene_therapy' && params.genomicData !== true) {
    warnings.push('Gene-therapy study: address long-term follow-up, germline considerations and genomic-data handling explicitly.');
  }

  const regulatoryCitations = uniq([
    '21 CFR 50.20 (general requirements for informed consent)',
    '21 CFR 50.25(a) (required elements); 50.25(b) (additional elements); 50.25(c) (registry statement)',
    '21 CFR 50.27 (documentation of informed consent)',
    '21 CFR 50.24 (exception from informed consent for emergency research)',
    '21 CFR 50 Subpart D (additional protections for children)',
    'ICH E6(R3) Principle 2 (informed consent)',
    'FDA/OHRP Guidance: Use of Electronic Informed Consent (2016)',
    '21 CFR Part 11 (electronic records / signatures)',
  ]);

  return {
    requiredElements: REQUIRED_CONSENT_ELEMENTS.map((e) => ({ ...e })),
    additionalElements: ADDITIONAL_CONSENT_ELEMENTS.map((e) => ({ ...e })),
    applicableAdditionalElements: uniq(applicable.map((e: ConsentElement) => e.id)).map(
      (id: string) => ADDITIONAL_CONSENT_ELEMENTS.find((e: ConsentElement) => e.id === id) as ConsentElement,
    ),
    readabilityGuidance,
    vulnerablePopulationSafeguards,
    reConsentTriggers,
    electronicConsentConsiderations,
    documentationRequirements,
    regulatoryCitations,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. PROTOCOL-DEVIATION CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export type DeviationCategory =
  | 'eligibility'
  | 'consent'
  | 'safety_reporting'
  | 'study_procedure'
  | 'visit_window'
  | 'investigational_product'
  | 'randomization'
  | 'gcp_general'
  | 'other';

export interface ProtocolDeviationParams {
  category?: DeviationCategory;
  affectsParticipantSafety?: boolean;
  affectsPrimaryEndpoint?: boolean;
  affectsEligibilityCriticalCriterion?: boolean;
  affectsConsentValidity?: boolean;
  isRecurring?: boolean;
  numberOfParticipantsAffected?: number;
  involvedUnreportedSAE?: boolean;
  deviationFromIRBApprovedProtocol?: boolean;
  increasedRiskToSubjects?: boolean;
  description?: string;
  organizationId?: string | number;
}

export interface DeviationClassificationResult {
  importance: 'important' | 'non_important';
  severity: Severity;
  participantSafetyImpact: 'none' | 'potential' | 'actual';
  dataIntegrityImpact: 'none' | 'minor' | 'significant';
  reportability: {
    reportToIRB: boolean;
    reportToSponsor: boolean;
    reportToFDA: boolean;
    promptReportingRequired: boolean;
    rationale: string[];
  };
  correctiveActions: string[];
  preventiveActions: string[];
  regulatoryCitations: string[];
  notes: string[];
}

/**
 * Classify a protocol deviation by importance, safety/data impact and
 * reportability. Pure and deterministic.
 */
export function classifyProtocolDeviation(
  params: ProtocolDeviationParams,
): DeviationClassificationResult {
  const notes: string[] = [];
  const category: DeviationCategory = params.category ?? 'other';
  const affected = num(params.numberOfParticipantsAffected, 1);

  // ── Safety impact ──
  let participantSafetyImpact: DeviationClassificationResult['participantSafetyImpact'] = 'none';
  if (params.affectsParticipantSafety === true || params.involvedUnreportedSAE === true) {
    participantSafetyImpact = 'actual';
  } else if (
    params.increasedRiskToSubjects === true ||
    category === 'safety_reporting' ||
    params.affectsConsentValidity === true
  ) {
    participantSafetyImpact = 'potential';
  }

  // ── Data integrity impact ──
  let dataIntegrityImpact: DeviationClassificationResult['dataIntegrityImpact'] = 'none';
  if (
    params.affectsPrimaryEndpoint === true ||
    params.affectsEligibilityCriticalCriterion === true ||
    category === 'randomization'
  ) {
    dataIntegrityImpact = 'significant';
  } else if (category === 'study_procedure' || category === 'visit_window' || category === 'investigational_product') {
    dataIntegrityImpact = 'minor';
  }

  // ── Importance (ICH E6(R3): an "important" deviation is one that may
  // significantly affect participant rights/safety/well-being or the
  // reliability of trial results). ──
  const isImportant =
    participantSafetyImpact !== 'none' ||
    dataIntegrityImpact === 'significant' ||
    params.affectsConsentValidity === true ||
    params.affectsEligibilityCriticalCriterion === true ||
    params.deviationFromIRBApprovedProtocol === true ||
    params.isRecurring === true;

  const importance: DeviationClassificationResult['importance'] = isImportant ? 'important' : 'non_important';

  // ── Severity ──
  let severity: Severity;
  if (
    participantSafetyImpact === 'actual' ||
    params.involvedUnreportedSAE === true ||
    params.affectsConsentValidity === true
  ) {
    severity = 'critical';
  } else if (importance === 'important' && (dataIntegrityImpact === 'significant' || participantSafetyImpact === 'potential')) {
    severity = 'major';
  } else if (importance === 'important') {
    severity = 'moderate';
  } else {
    severity = 'minor';
  }
  if (params.isRecurring === true && severity === 'minor') {
    severity = 'moderate';
    notes.push('Recurrence elevated a minor deviation to moderate — a systemic pattern requires CAPA.');
  }
  if (affected > 1 && severity === 'minor') {
    notes.push(`Deviation affects ${affected} participants; assess for a systemic cause even if individually minor.`);
  }

  // ── Reportability ──
  const rationale: string[] = [];
  // To IRB: deviations to eliminate apparent immediate hazard are reportable;
  // changes/deviations affecting rights/safety/welfare, and "unanticipated
  // problems involving risks," must be reported promptly.
  const reportToIRB =
    importance === 'important' ||
    participantSafetyImpact !== 'none' ||
    params.deviationFromIRBApprovedProtocol === true ||
    params.affectsConsentValidity === true;
  if (reportToIRB) {
    rationale.push('Reportable to the IRB: deviation affects participant rights/safety/welfare or departs from the IRB-approved protocol (21 CFR 56.108(a)(3)–(4); 50.25; investigator obligation 312.66).');
  } else {
    rationale.push('Non-important deviation with no safety or IRB-protocol impact: log internally; report per protocol/sponsor policy and in aggregate (no individual prompt IRB report required).');
  }

  const reportToSponsor =
    importance === 'important' ||
    participantSafetyImpact !== 'none' ||
    dataIntegrityImpact !== 'none';
  if (reportToSponsor) {
    rationale.push('Reportable to the sponsor: investigator must keep the sponsor informed of deviations affecting safety or data reliability (21 CFR 312.60; ICH E6(R3) investigator obligations).');
  }

  // To FDA: routine deviations are not individually reported by the sponsor,
  // but an unreported SAE / SUSAR signal triggers IND safety reporting, and
  // emergency-deviation reporting obligations may apply to the investigator.
  const reportToFDA =
    params.involvedUnreportedSAE === true ||
    (participantSafetyImpact === 'actual' && category === 'safety_reporting');
  if (reportToFDA) {
    rationale.push('FDA notification implicated: a serious, unexpected, drug-related event triggers IND safety reporting by the sponsor (21 CFR 312.32); an investigator deviation to protect life may require FDA/IRB notice (312.66; 50.23/50.24 where applicable).');
  }

  const promptReportingRequired =
    participantSafetyImpact === 'actual' ||
    params.affectsConsentValidity === true ||
    params.involvedUnreportedSAE === true ||
    params.deviationFromIRBApprovedProtocol === true;
  if (promptReportingRequired) {
    rationale.push('Prompt (expedited) reporting required — do not wait for the next periodic report.');
  }

  // ── Corrective / preventive actions ──
  const correctiveActions: string[] = [];
  const preventiveActions: string[] = [];

  correctiveActions.push('Document the deviation in the deviation log with date, participants affected, and immediate actions taken.');
  if (participantSafetyImpact !== 'none') {
    correctiveActions.push('Assess and protect the affected participant(s); medical evaluation if indicated; notify the medical monitor.');
  }
  if (params.affectsConsentValidity === true) {
    correctiveActions.push('Consult the IRB on re-consent and on whether data/participation must be excluded; remediate the consent process immediately.');
  }
  if (params.affectsEligibilityCriticalCriterion === true) {
    correctiveActions.push('Evaluate continued participation of the ineligible participant with the medical monitor; document the benefit/risk decision.');
  }
  if (dataIntegrityImpact === 'significant') {
    correctiveActions.push('Flag affected data; pre-specify handling in the SAP (e.g., per-protocol exclusion); ensure transparency in the CSR.');
  }
  if (category === 'investigational_product') {
    correctiveActions.push('Reconcile IP accountability; quarantine affected product; assess dosing impact.');
  }

  preventiveActions.push('Perform root-cause analysis (e.g., 5-Whys / fishbone) and implement a CAPA proportionate to the deviation’s importance.');
  if (params.isRecurring === true) {
    preventiveActions.push('Recurring deviation: strengthen site training, update site-specific procedures, and increase targeted monitoring (triggered visit).');
  }
  preventiveActions.push('Re-train relevant staff on the affected procedure and confirm understanding; update SOPs/work instructions if a process gap is identified.');
  preventiveActions.push('Track CAPA to closure and verify effectiveness; review trend in central monitoring.');

  const regulatoryCitations = uniq([
    'ICH E6(R3) Good Clinical Practice (2023) — important vs. non-important deviations; investigator obligations',
    '21 CFR 312.60; 312.66 (investigator compliance and prompt reporting)',
    '21 CFR 56.108(a)(3)–(4) (IRB reporting of changes/deviations and unanticipated problems)',
    '21 CFR 312.32 (IND safety reporting) — where a deviation implicates an SAE/SUSAR',
    '21 CFR 50.25 (consent) — where consent validity is affected',
    'FDA Guidance: Reporting and Reviewing Unanticipated Problems (OHRP/FDA concepts)',
  ]);

  return {
    importance,
    severity,
    participantSafetyImpact,
    dataIntegrityImpact,
    reportability: {
      reportToIRB,
      reportToSponsor,
      reportToFDA,
      promptReportingRequired,
      rationale,
    },
    correctiveActions,
    preventiveActions,
    regulatoryCitations,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ESSENTIAL DOCUMENTS / TMF PLANNING
// ─────────────────────────────────────────────────────────────────────────────

export type TrialStage = 'before' | 'during' | 'after';

export interface EssentialDocument {
  id: string;
  name: string;
  stage: TrialStage;
  tmfZone: string;
  heldBy: Array<'sponsor' | 'investigator'>;
  purpose: string;
  citation: string;
}

export interface EssentialDocumentsParams {
  stage?: TrialStage | 'all';
  includeInvestigatorSiteFile?: boolean;
  includeSponsorTmf?: boolean;
  electronicTmf?: boolean;
  usesInvestigationalDevice?: boolean;
  multiSite?: boolean;
  organizationId?: string | number;
}

export interface TmfZone {
  zone: string;
  description: string;
  exampleSections: string[];
}

export interface QcCheckItem {
  check: string;
  citation: string;
}

export interface EssentialDocumentsResult {
  documents: EssentialDocument[];
  byStage: {
    before: EssentialDocument[];
    during: EssentialDocument[];
    after: EssentialDocument[];
  };
  tmfStructure: TmfZone[];
  completenessAndQcPlan: QcCheckItem[];
  retentionGuidance: string[];
  regulatoryCitations: string[];
  notes: string[];
}

/**
 * Essential-document library aligned to ICH E6 essential-records concepts and
 * the DIA TMF Reference Model zone structure.
 */
const ESSENTIAL_DOCUMENTS: EssentialDocument[] = [
  // ── Before the trial begins ──
  { id: 'ED-IB', name: 'Investigator’s Brochure (current version)', stage: 'before', tmfZone: 'IP & Trial Information', heldBy: ['sponsor', 'investigator'], purpose: 'Documents the available nonclinical/clinical information relevant to the IP.', citation: 'ICH E6(R3) §3.x (essential records); 21 CFR 312.55' },
  { id: 'ED-PROTOCOL', name: 'Signed protocol and amendments', stage: 'before', tmfZone: 'Trial Management', heldBy: ['sponsor', 'investigator'], purpose: 'Documents agreement to the protocol and any changes.', citation: 'ICH E6(R3); 21 CFR 312.23(a)(6)' },
  { id: 'ED-CONSENT', name: 'IRB-approved informed consent form(s) and any subject information', stage: 'before', tmfZone: 'Ethics', heldBy: ['sponsor', 'investigator'], purpose: 'Documents the consent materials approved for use.', citation: '21 CFR 50.25; 56.111' },
  { id: 'ED-IRB-APPROVAL', name: 'IRB/IEC approval and composition/statement', stage: 'before', tmfZone: 'Ethics', heldBy: ['sponsor', 'investigator'], purpose: 'Documents independent ethics review and approval before enrollment.', citation: '21 CFR 56.108; 56.115' },
  { id: 'ED-1572', name: 'Statement of Investigator (Form FDA-1572) and signed agreement', stage: 'before', tmfZone: 'Central & Site Management', heldBy: ['sponsor'], purpose: 'Documents the investigator’s commitments and qualifications.', citation: '21 CFR 312.53(c)' },
  { id: 'ED-CV', name: 'Curriculum vitae / qualification of investigator(s) and sub-investigators', stage: 'before', tmfZone: 'Central & Site Management', heldBy: ['sponsor', 'investigator'], purpose: 'Documents qualifications and eligibility to conduct the trial.', citation: 'ICH E6(R3) Principle 7; 21 CFR 312.53(c)' },
  { id: 'ED-FINANCIAL', name: 'Financial disclosure information (Form FDA-3454/3455)', stage: 'before', tmfZone: 'Central & Site Management', heldBy: ['sponsor'], purpose: 'Documents financial interests for disclosure to FDA.', citation: '21 CFR Part 54' },
  { id: 'ED-LAB-CERT', name: 'Normal ranges and laboratory certification/accreditation', stage: 'before', tmfZone: 'Central & Site Management', heldBy: ['sponsor', 'investigator'], purpose: 'Documents competence of facilities to perform required tests.', citation: 'ICH E6(R3) §3.x; CLIA where applicable' },
  { id: 'ED-IP-RELEASE', name: 'IP labeling, instructions, shipping and handling records', stage: 'before', tmfZone: 'IP & Trial Information', heldBy: ['sponsor'], purpose: 'Documents proper labeling and conditions for IP.', citation: 'ICH E6(R3) Principle 8; 21 CFR 312.57' },
  { id: 'ED-RANDOM', name: 'Randomization/blinding procedures and code (sponsor-held)', stage: 'before', tmfZone: 'Trial Management', heldBy: ['sponsor'], purpose: 'Documents the randomization method and emergency unblinding procedure.', citation: 'ICH E6(R3); ICH E9' },

  // ── During the trial ──
  { id: 'ED-IB-UPDATE', name: 'Updates to Investigator’s Brochure and other current documents', stage: 'during', tmfZone: 'IP & Trial Information', heldBy: ['sponsor', 'investigator'], purpose: 'Documents revisions made available during conduct.', citation: 'ICH E6(R3) §3.x' },
  { id: 'ED-IRB-CONTINUING', name: 'IRB continuing-review approvals and correspondence', stage: 'during', tmfZone: 'Ethics', heldBy: ['sponsor', 'investigator'], purpose: 'Documents ongoing ethics oversight.', citation: '21 CFR 56.108(a); 56.109(f)' },
  { id: 'ED-CONSENT-SIGNED', name: 'Signed informed-consent forms (source/site)', stage: 'during', tmfZone: 'Ethics / Site (ISF)', heldBy: ['investigator'], purpose: 'Documents that consent was obtained before procedures.', citation: '21 CFR 50.27' },
  { id: 'ED-SOURCE', name: 'Source documents and case-report forms / eCRFs', stage: 'during', tmfZone: 'Site (ISF)', heldBy: ['investigator'], purpose: 'Documents trial data (ALCOA+).', citation: '21 CFR 312.62(b); ICH E6(R3) Principle 9' },
  { id: 'ED-SAE', name: 'Safety reports, SAE source and reporting documentation', stage: 'during', tmfZone: 'Safety', heldBy: ['sponsor', 'investigator'], purpose: 'Documents AE/SAE ascertainment and reporting.', citation: '21 CFR 312.32; 312.64(b)' },
  { id: 'ED-MONITORING', name: 'Monitoring visit reports and follow-up letters', stage: 'during', tmfZone: 'Trial Management', heldBy: ['sponsor'], purpose: 'Documents sponsor monitoring and issue follow-up.', citation: '21 CFR 312.56; FDA RBM Guidance (2013)' },
  { id: 'ED-DELEGATION', name: 'Delegation-of-authority / signature and training logs', stage: 'during', tmfZone: 'Site (ISF)', heldBy: ['investigator'], purpose: 'Documents who performed and was qualified for each delegated task.', citation: 'ICH E6(R3) (oversight); 21 CFR 312.60' },
  { id: 'ED-IP-ACCOUNT', name: 'IP accountability (receipt, dispensing, return, destruction)', stage: 'during', tmfZone: 'IP & Trial Information', heldBy: ['sponsor', 'investigator'], purpose: 'Documents IP control throughout the trial.', citation: '21 CFR 312.62(a); 812.140' },
  { id: 'ED-DEVIATION', name: 'Protocol-deviation log and CAPA records', stage: 'during', tmfZone: 'Trial Management', heldBy: ['sponsor', 'investigator'], purpose: 'Documents deviations, importance and corrective actions.', citation: 'ICH E6(R3); 21 CFR 312.60' },

  // ── After completion ──
  { id: 'ED-IP-RECON', name: 'Final IP accountability and destruction records', stage: 'after', tmfZone: 'IP & Trial Information', heldBy: ['sponsor', 'investigator'], purpose: 'Documents final reconciliation of IP.', citation: 'ICH E6(R3) §3.x' },
  { id: 'ED-CLOSEOUT', name: 'Audit certificate / monitoring close-out report', stage: 'after', tmfZone: 'Trial Management', heldBy: ['sponsor'], purpose: 'Documents close-out of the site and trial.', citation: 'ICH E6(R3) §3.x' },
  { id: 'ED-FINAL-IRB', name: 'Final IRB notification of study completion', stage: 'after', tmfZone: 'Ethics', heldBy: ['investigator'], purpose: 'Documents notification of completion to the IRB.', citation: '21 CFR 56.108(a)' },
  { id: 'ED-DB-LOCK', name: 'Database lock documentation and final datasets', stage: 'after', tmfZone: 'Statistics / Data', heldBy: ['sponsor'], purpose: 'Documents the controlled finalization of trial data.', citation: 'ICH E6(R3) Annex (data governance)' },
  { id: 'ED-CSR', name: 'Clinical Study Report (CSR)', stage: 'after', tmfZone: 'Statistics / Data', heldBy: ['sponsor'], purpose: 'Documents trial results and conclusions.', citation: 'ICH E3; ICH E6(R3) §3.x' },
];

/** DIA TMF Reference Model zone concepts (abridged). */
const TMF_ZONES: TmfZone[] = [
  { zone: 'Trial Management', description: 'Oversight, planning, monitoring and reporting of the trial.', exampleSections: ['Trial oversight', 'Monitoring', 'Deviations & CAPA', 'Meetings'] },
  { zone: 'Central & Site Management', description: 'Site identification, qualification, and investigator documentation.', exampleSections: ['Site qualification', 'Form FDA-1572', 'CVs/qualifications', 'Financial disclosure'] },
  { zone: 'Ethics', description: 'IRB/IEC review, approvals, consent materials and correspondence.', exampleSections: ['IRB approvals', 'Consent forms', 'Continuing review'] },
  { zone: 'IP & Trial Information', description: 'Investigational product handling, labeling, accountability and the IB.', exampleSections: ['Investigator’s Brochure', 'IP accountability', 'Labeling/shipping'] },
  { zone: 'Safety', description: 'Adverse-event and safety-reporting documentation.', exampleSections: ['SAE reports', 'Safety correspondence', 'DSMB materials'] },
  { zone: 'Statistics / Data', description: 'Data management, statistics, database lock and the CSR.', exampleSections: ['SAP', 'Database lock', 'Final datasets', 'CSR'] },
  { zone: 'Site (ISF)', description: 'The Investigator Site File: site-held source and essential records.', exampleSections: ['Signed consents', 'Source documents', 'Delegation log', 'Site IP records'] },
];

/**
 * Plan the Trial Master File / essential-document set per ICH E6 and the DIA
 * TMF Reference Model. Pure and deterministic.
 */
export function planEssentialDocuments(
  params: EssentialDocumentsParams,
): EssentialDocumentsResult {
  const notes: string[] = [];
  const stageFilter: TrialStage | 'all' = params.stage ?? 'all';

  let documents = ESSENTIAL_DOCUMENTS.map((d) => ({ ...d, heldBy: [...d.heldBy] }));

  // Stage filter.
  if (stageFilter !== 'all') {
    documents = documents.filter((d: EssentialDocument) => d.stage === stageFilter);
  }

  // Optional holder filtering.
  if (params.includeInvestigatorSiteFile === false) {
    documents = documents.filter((d: EssentialDocument) => !(d.heldBy.length === 1 && d.heldBy[0] === 'investigator'));
    notes.push('Investigator Site File documents excluded per request (sponsor-held view).');
  }
  if (params.includeSponsorTmf === false) {
    documents = documents.filter((d: EssentialDocument) => !(d.heldBy.length === 1 && d.heldBy[0] === 'sponsor'));
    notes.push('Sponsor-only TMF documents excluded per request (site view).');
  }

  // Device-specific augmentation.
  if (params.usesInvestigationalDevice === true) {
    const deviceDoc: EssentialDocument = {
      id: 'ED-DEVICE-IDE',
      name: 'IDE application/approval and device-specific records (malfunction reports, device accountability)',
      stage: stageFilter === 'after' ? 'after' : 'before',
      tmfZone: 'IP & Trial Information',
      heldBy: ['sponsor', 'investigator'],
      purpose: 'Documents IDE status and device-specific obligations.',
      citation: '21 CFR Part 812 (IDE)',
    };
    if (stageFilter === 'all' || stageFilter === deviceDoc.stage) {
      documents = [...documents, deviceDoc];
    }
  }

  const byStage = {
    before: documents.filter((d: EssentialDocument) => d.stage === 'before'),
    during: documents.filter((d: EssentialDocument) => d.stage === 'during'),
    after: documents.filter((d: EssentialDocument) => d.stage === 'after'),
  };

  const completenessAndQcPlan: QcCheckItem[] = [
    { check: 'Define the expected document set (TMF index) by zone/section before first-patient-in; track expected vs. present.', citation: 'ICH E6(R3) §3.x; DIA TMF Reference Model' },
    { check: 'Confirm essential documents exist before the trial begins (consent, IRB approval, 1572, IB, protocol).', citation: 'ICH E6(R3); 21 CFR 312.53; 56.108' },
    { check: 'Verify documents are filed contemporaneously (timeliness metric per document type).', citation: 'ICH E6(R3) Principle 9 (contemporaneous)' },
    { check: 'QC each filed document for completeness, legibility, correct version, and required signatures/dates.', citation: 'ICH E6(R3) §3.x' },
    { check: 'Reconcile the Investigator Site File against the sponsor TMF for completeness and consistency.', citation: 'ICH E6(R3) (sponsor/investigator records)' },
    { check: 'For an electronic TMF, validate the system, control access, and ensure audit trails and certified copies.', citation: 'ICH E6(R3) Annex; 21 CFR Part 11' },
    { check: 'Perform periodic TMF completeness reviews and a pre-inspection/pre-close-out reconciliation.', citation: 'ICH E6(R3) §3.x; FDA BIMO CPGM 7348.810' },
  ];

  if (params.electronicTmf === true) {
    completenessAndQcPlan.push({
      check: 'Document the eTMF validation status, user access matrix, and audit-trail review cadence.',
      citation: 'ICH E6(R3) Annex (computerised systems); 21 CFR Part 11',
    });
  }
  if (params.multiSite === true) {
    notes.push('Multi-site trial: maintain a per-site ISF index and reconcile each site against the central TMF; track site-level completeness as a KRI.');
  }

  const retentionGuidance: string[] = [
    'Retain essential documents for at least 2 years after the last marketing-application approval in an ICH region, or 2 years after formal discontinuation of clinical development (21 CFR 312.62(c)).',
    'Do not destroy records without sponsor notification; honor any longer retention required by the agreement or local law.',
    'Ensure records remain retrievable, legible and (if electronic) readable for the full retention period.',
  ];

  const regulatoryCitations = uniq([
    'ICH E6(R3) Good Clinical Practice (2023) — essential records (before/during/after), §3.x',
    'ICH E6(R3) Annex — data governance and computerised systems (eTMF)',
    '21 CFR 312.57; 312.62 (record retention and case histories)',
    '21 CFR 312.53(c) (1572, CVs); 21 CFR Part 54 (financial disclosure)',
    '21 CFR Part 56 (IRB records); 21 CFR Part 11 (electronic records)',
    'DIA Trial Master File Reference Model (zone/section structure)',
  ]);

  return {
    documents,
    byStage,
    tmfStructure: TMF_ZONES.map((z) => ({ ...z, exampleSections: [...z.exampleSections] })),
    completenessAndQcPlan,
    retentionGuidance,
    regulatoryCitations,
    notes,
  };
}
