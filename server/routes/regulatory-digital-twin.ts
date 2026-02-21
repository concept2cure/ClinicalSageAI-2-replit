/**
 * Regulatory Digital Twin — FDA/EMA Reviewer AI Simulator
 *
 * Simulates how FDA and EMA reviewers would evaluate a submission,
 * predicting questions, deficiency letters, RTF (Refuse to File) risks,
 * and Advisory Committee concerns BEFORE the real submission.
 *
 * Builds on the existing shadow_510k_reviewer.py foundation and extends
 * to full IND/NDA/BLA/MAA submission types with multi-agency support.
 *
 * Capabilities:
 * - Reviewer persona modeling (CDER, CDRH, CBER division styles)
 * - RTF / Validation risk analysis
 * - Deficiency letter prediction (IR, CR, AI letter generation)
 * - Advisory Committee simulation (vote prediction, panelist modeling)
 * - Monte Carlo submission timing optimization
 * - Cross-agency comparison (FDA vs EMA vs PMDA simultaneous review)
 * - Regulatory intelligence from historical decisions
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// Types & Interfaces
// ═══════════════════════════════════════════════════════════════════════════════

interface ReviewerPersona {
  id: string;
  agency: 'FDA' | 'EMA' | 'PMDA' | 'Health_Canada' | 'TGA';
  division: string; // e.g., 'CDER/OND/DGIEP', 'CHMP', 'CDRH/OHT7'
  reviewerType:
    | 'medical'
    | 'chemistry'
    | 'pharmacology'
    | 'statistical'
    | 'clinical'
    | 'bioresearch_monitoring';
  strictnessLevel: number; // 1-10 scale derived from historical review patterns
  focusAreas: string[]; // e.g., ['endpoint_selection', 'safety_signals', 'CMC_deficiencies']
  historicalApprovalRate: number; // 0-1 based on division history
  averageReviewCycles: number;
  commonDeficiencies: string[];
}

interface SubmissionProfile {
  id: string;
  type: 'IND' | 'NDA' | 'BLA' | 'sNDA' | 'ANDA' | '510k' | 'PMA' | 'De_Novo' | 'MAA' | 'IMPD';
  therapeuticArea: string;
  indication: string;
  phase?: string;
  moduleContents: Record<string, ModuleContent>;
  clinicalData?: ClinicalDataSummary;
  cmcData?: CMCDataSummary;
  nonClinicalData?: NonClinicalDataSummary;
  regulatoryHistory?: RegulatoryHistoryEntry[];
}

interface ModuleContent {
  moduleId: string; // eCTD module e.g., 'm1', 'm2.3', 'm2.5', 'm2.7', 'm3', 'm4', 'm5'
  title: string;
  completeness: number; // 0-1 score
  wordCount: number;
  hasAppendices: boolean;
  lastUpdated: string;
  qualityScore?: number;
}

interface ClinicalDataSummary {
  pivotalTrials: number;
  totalPatients: number;
  primaryEndpointMet: boolean;
  pValue?: number;
  effectSize?: number;
  safetySignals: string[];
  missingDataPercentage: number;
}

interface CMCDataSummary {
  drugSubstanceCharacterized: boolean;
  manufacturingSitesInspected: boolean;
  stabilityDataMonths: number;
  impurityProfile: 'acceptable' | 'borderline' | 'concerning';
  batchConsistency: number; // 0-1
}

interface NonClinicalDataSummary {
  carcinogenicityComplete: boolean;
  reproductiveToxComplete: boolean;
  genotoxBattery: boolean;
  toxSpeciesCount: number;
  noaelEstablished: boolean;
}

interface RegulatoryHistoryEntry {
  date: string;
  agency: string;
  action: string;
  details: string;
}

interface PredictedQuestion {
  id: string;
  category:
    | 'clinical_efficacy'
    | 'clinical_safety'
    | 'CMC'
    | 'nonclinical'
    | 'bioresearch'
    | 'statistical'
    | 'labeling'
    | 'REMS'
    | 'pediatric'
    | 'regulatory_pathway';
  severity: 'critical' | 'major' | 'minor';
  question: string;
  rationale: string;
  fdaGuidanceCitation: string;
  suggestedResponse: string;
  confidenceScore: number;
  historicalFrequency: number; // How often this type of question appears (0-1)
  reviewerType: string;
}

interface RTFRiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  overallScore: number; // 0-100 (higher = more likely to be refused)
  categoryScores: Record<string, number>;
  criticalDeficiencies: string[];
  remediationPlan: RemediationItem[];
  estimatedRemediationDays: number;
}

interface RemediationItem {
  deficiency: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  estimatedEffortDays: number;
  suggestedAction: string;
  responsible: string;
}

interface DeficiencyLetterPrediction {
  letterType: 'IR' | 'CR' | 'AI' | 'RTF' | 'CRL'; // Info Request, Complete Response, Approvable If, Refuse to File, Complete Response Letter
  likelihood: number; // 0-1
  predictedDeficiencies: DeficiencyItem[];
  estimatedResponseTime: number;
  historicalPrecedents: string[];
}

interface DeficiencyItem {
  section: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  ectdModule: string;
  suggestedRemedy: string;
}

interface AdvisoryCommitteeSimulation {
  committeeType: string; // e.g., 'ODAC', 'EMDAC', 'CRGAC', 'PCAC'
  votePrediction: { yes: number; no: number; abstain: number };
  overallSentiment: 'favorable' | 'mixed' | 'unfavorable';
  keyDebateTopics: string[];
  panelistConcerns: PanelistConcern[];
  recommendedPrepStrategy: string[];
}

interface PanelistConcern {
  panelistType: string; // e.g., 'statistician', 'clinical_expert', 'patient_advocate'
  primaryConcern: string;
  likelihood: number;
  mitigationStrategy: string;
}

interface MonteCarloTimingResult {
  optimalSubmissionDate: string;
  p50ReviewDays: number;
  p90ReviewDays: number;
  approvalProbability: number;
  scenarioDistribution: TimingScenario[];
  riskFactors: string[];
}

interface TimingScenario {
  scenario: string;
  probability: number;
  reviewDays: number;
  outcome: 'approval' | 'CRL' | 'RTF' | 'withdrawal';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reviewer Persona Database
// ═══════════════════════════════════════════════════════════════════════════════

const REVIEWER_PERSONAS: ReviewerPersona[] = [
  {
    id: 'fda-cder-medical',
    agency: 'FDA',
    division: 'CDER/OND',
    reviewerType: 'medical',
    strictnessLevel: 7,
    focusAreas: [
      'primary_endpoint',
      'safety_signals',
      'benefit_risk',
      'subgroup_analyses',
      'labeling_claims',
    ],
    historicalApprovalRate: 0.85,
    averageReviewCycles: 1.4,
    commonDeficiencies: [
      'Insufficient characterization of safety signals',
      'Missing subgroup analysis by demographics',
      'Inadequate benefit-risk discussion',
      'Primary endpoint clinical meaningfulness not established',
    ],
  },
  {
    id: 'fda-cder-stats',
    agency: 'FDA',
    division: 'CDER/OB/OTS',
    reviewerType: 'statistical',
    strictnessLevel: 9,
    focusAreas: [
      'multiplicity_adjustment',
      'missing_data_handling',
      'interim_analysis',
      'sample_size',
      'estimand',
    ],
    historicalApprovalRate: 0.78,
    averageReviewCycles: 1.6,
    commonDeficiencies: [
      'Type I error not adequately controlled',
      'Missing data >20% without sensitivity analysis',
      'Estimand not aligned with ICH E9(R1)',
      'Post-hoc subgroup analyses presented as confirmatory',
    ],
  },
  {
    id: 'fda-cder-cmc',
    agency: 'FDA',
    division: 'CDER/OPQ',
    reviewerType: 'chemistry',
    strictnessLevel: 8,
    focusAreas: [
      'impurity_limits',
      'stability_data',
      'manufacturing_process',
      'dissolution',
      'container_closure',
    ],
    historicalApprovalRate: 0.9,
    averageReviewCycles: 1.2,
    commonDeficiencies: [
      'Insufficient stability data for proposed shelf life',
      'Impurity characterization incomplete above ICH Q3A thresholds',
      'Process validation protocol inadequate',
      'Dissolution specification not clinically relevant',
    ],
  },
  {
    id: 'fda-cder-pharm',
    agency: 'FDA',
    division: 'CDER/OCP',
    reviewerType: 'pharmacology',
    strictnessLevel: 7,
    focusAreas: [
      'PK_modeling',
      'drug_interactions',
      'dose_response',
      'special_populations',
      'QTc_assessment',
    ],
    historicalApprovalRate: 0.88,
    averageReviewCycles: 1.3,
    commonDeficiencies: [
      'Hepatic/renal impairment study not conducted',
      'Drug interaction potential not fully characterized',
      'Dose-response relationship inadequately explored',
      'PopPK model covariates not justified',
    ],
  },
  {
    id: 'fda-cdrh-clinical',
    agency: 'FDA',
    division: 'CDRH/OHT',
    reviewerType: 'clinical',
    strictnessLevel: 6,
    focusAreas: [
      'substantial_equivalence',
      'predicate_comparison',
      'performance_testing',
      'biocompatibility',
      'usability',
    ],
    historicalApprovalRate: 0.92,
    averageReviewCycles: 1.1,
    commonDeficiencies: [
      'Predicate comparison table incomplete',
      'Technological characteristics not adequately compared',
      'Biocompatibility testing not per ISO 10993-1 flowchart',
      'Human factors validation insufficiently powered',
    ],
  },
  {
    id: 'ema-chmp-rapporteur',
    agency: 'EMA',
    division: 'CHMP',
    reviewerType: 'medical',
    strictnessLevel: 8,
    focusAreas: [
      'unmet_medical_need',
      'comparator_choice',
      'HTA_readiness',
      'pediatric_plan',
      'risk_management',
    ],
    historicalApprovalRate: 0.8,
    averageReviewCycles: 2.1,
    commonDeficiencies: [
      'Active comparator not included in pivotal trial',
      'Pediatric investigation plan not adequate',
      'Risk management plan incomplete',
      'European-specific population data insufficient',
      'HTA-relevant endpoints not captured',
    ],
  },
  {
    id: 'pmda-medical',
    agency: 'PMDA',
    division: 'Review Division',
    reviewerType: 'medical',
    strictnessLevel: 9,
    focusAreas: [
      'Japanese_population',
      'ethnic_sensitivity',
      'bridging_study',
      'dose_finding_Japan',
      'postmarket_requirements',
    ],
    historicalApprovalRate: 0.82,
    averageReviewCycles: 1.8,
    commonDeficiencies: [
      'Japanese PK bridging data insufficient per ICH E5',
      'Ethnic sensitivity assessment not conducted',
      'Dose-finding in Japanese population inadequate',
      'J-GCP compliance documentation incomplete',
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// FDA RTF Criteria (21 CFR 314.101)
// ═══════════════════════════════════════════════════════════════════════════════

const RTF_CRITERIA = {
  eCTDFormat: {
    weight: 0.15,
    checks: [
      { id: 'ectd_valid_xml', description: 'Valid eCTD XML backbone', critical: true },
      { id: 'ectd_module_complete', description: 'All required modules present', critical: true },
      {
        id: 'ectd_file_integrity',
        description: 'All referenced files present and valid',
        critical: true,
      },
      { id: 'ectd_sequence_number', description: 'Correct sequence numbering', critical: false },
    ],
  },
  clinicalContent: {
    weight: 0.3,
    checks: [
      {
        id: 'pivotal_study_included',
        description: 'At least one adequate and well-controlled study',
        critical: true,
      },
      {
        id: 'safety_database',
        description: 'Safety database meets ICH E1 minimums',
        critical: true,
      },
      {
        id: 'efficacy_endpoints',
        description: 'Primary efficacy endpoints clearly defined',
        critical: true,
      },
      {
        id: 'statistical_analysis',
        description: 'Statistical analysis plan included',
        critical: false,
      },
      {
        id: 'clinical_overview',
        description: 'Module 2.5 Clinical Overview present',
        critical: true,
      },
    ],
  },
  cmcContent: {
    weight: 0.25,
    checks: [
      {
        id: 'drug_substance_spec',
        description: 'Drug substance specification set',
        critical: true,
      },
      { id: 'drug_product_spec', description: 'Drug product specification set', critical: true },
      {
        id: 'stability_data',
        description: 'Sufficient stability data (≥6 months)',
        critical: true,
      },
      {
        id: 'manufacturing_info',
        description: 'Manufacturing process and controls described',
        critical: true,
      },
      {
        id: 'impurity_characterization',
        description: 'Impurity profile within ICH Q3A/Q3B limits',
        critical: false,
      },
    ],
  },
  nonClinicalContent: {
    weight: 0.15,
    checks: [
      { id: 'tox_package', description: 'Adequate toxicology package per ICH M3', critical: true },
      {
        id: 'carcinogenicity',
        description: 'Carcinogenicity assessment (if required)',
        critical: false,
      },
      { id: 'reproductive_tox', description: 'Reproductive toxicology studies', critical: false },
      { id: 'genotox_battery', description: 'Standard genotoxicity battery', critical: true },
    ],
  },
  administrativeContent: {
    weight: 0.15,
    checks: [
      { id: 'form_356h', description: 'FDA Form 356h complete and signed', critical: true },
      { id: 'patent_info', description: 'Patent information (if applicable)', critical: false },
      { id: 'user_fee', description: 'PDUFA user fee paid', critical: true },
      { id: 'debarment_cert', description: 'Debarment certification included', critical: true },
      { id: 'field_copy_cert', description: 'Field copy certification', critical: false },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Deficiency Pattern Database (derived from historical FDA actions)
// ═══════════════════════════════════════════════════════════════════════════════

const DEFICIENCY_PATTERNS: Record<string, DeficiencyItem[]> = {
  clinical_efficacy: [
    {
      section: 'Module 2.5 — Clinical Overview',
      description:
        'Primary endpoint did not meet statistical significance or clinical meaningfulness threshold not established',
      severity: 'critical',
      ectdModule: 'm2.5',
      suggestedRemedy:
        'Provide additional analyses demonstrating clinical relevance (MCID, responder analysis, NNT)',
    },
    {
      section: 'Module 5.3.5 — Reports of Efficacy and Safety Studies',
      description: 'Inadequate documentation of study conduct, protocol amendments, or deviations',
      severity: 'major',
      ectdModule: 'm5',
      suggestedRemedy:
        'Provide comprehensive protocol amendment history and deviation impact analysis',
    },
  ],
  clinical_safety: [
    {
      section: 'Module 2.7.4 — Summary of Clinical Safety',
      description: 'Safety database does not meet ICH E1 requirements for chronic use indication',
      severity: 'critical',
      ectdModule: 'm2.7.4',
      suggestedRemedy:
        'Enroll additional patients to meet 300/100/1500 rule per ICH E1; or provide justification for waiver',
    },
    {
      section: 'Module 5.3.5 — Integrated Safety Summary',
      description: "Hepatotoxicity signal (Hy's Law cases) not adequately characterized",
      severity: 'critical',
      ectdModule: 'm5',
      suggestedRemedy:
        "Conduct eDISH analysis, document Hy's Law assessment per FDA 2009 guidance on DILI",
    },
  ],
  CMC: [
    {
      section: 'Module 3.2.S — Drug Substance',
      description:
        'Process-related impurity above ICH Q3A qualification threshold without safety data',
      severity: 'major',
      ectdModule: 'm3',
      suggestedRemedy:
        'Conduct qualification study per ICH Q3A(R2) or tighten specification to below threshold',
    },
    {
      section: 'Module 3.2.P.8 — Stability',
      description: 'Insufficient long-term stability data to support proposed shelf life',
      severity: 'major',
      ectdModule: 'm3',
      suggestedRemedy:
        'Provide 12-month accelerated and 24-month long-term data; statistical extrapolation per ICH Q1E',
    },
  ],
  nonclinical: [
    {
      section: 'Module 4.2.3 — Genotoxicity',
      description: 'Positive finding in one genotoxicity assay without follow-up evaluation',
      severity: 'major',
      ectdModule: 'm4',
      suggestedRemedy:
        'Conduct additional in vivo genotoxicity study (e.g., micronucleus, transgenic rodent) per ICH S2(R1)',
    },
    {
      section: 'Module 2.4 — Nonclinical Overview',
      description: 'NOAEL/MABEL calculation or safety margin relative to human dose not provided',
      severity: 'major',
      ectdModule: 'm2.4',
      suggestedRemedy:
        'Calculate safety margins using allometric scaling; address in Module 2.4 and 2.6',
    },
  ],
  statistical: [
    {
      section: 'Module 5.3.5 — Statistical Analysis Plan',
      description:
        'Multiplicity not adequately controlled for multiple primary endpoints or key secondary endpoints',
      severity: 'critical',
      ectdModule: 'm5',
      suggestedRemedy:
        'Apply Hochberg, Holm, or pre-specified gatekeeping procedure; re-analyze per ICH E9(R1) estimand framework',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Core Simulation Engine
// ═══════════════════════════════════════════════════════════════════════════════

class RegulatoryDigitalTwin {
  private simulationId: string;
  private createdAt: string;

  constructor(simulationId?: string) {
    this.simulationId =
      simulationId || `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.createdAt = new Date().toISOString();
  }

  /**
   * Generate predicted reviewer questions using persona-based analysis
   */
  async predictReviewerQuestions(
    submission: SubmissionProfile,
    agencies: string[] = ['FDA']
  ): Promise<PredictedQuestion[]> {
    const questions: PredictedQuestion[] = [];
    const relevantPersonas = REVIEWER_PERSONAS.filter(p => agencies.includes(p.agency));

    for (const persona of relevantPersonas) {
      const personaQuestions = await this.generatePersonaQuestions(submission, persona);
      questions.push(...personaQuestions);
    }

    // Sort by severity (critical > major > minor) then confidence
    const severityOrder = { critical: 0, major: 1, minor: 2 };
    questions.sort((a, b) => {
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return b.confidenceScore - a.confidenceScore;
    });

    return questions;
  }

  private async generatePersonaQuestions(
    submission: SubmissionProfile,
    persona: ReviewerPersona
  ): Promise<PredictedQuestion[]> {
    const questions: PredictedQuestion[] = [];

    // Clinical efficacy questions
    if (['medical', 'clinical'].includes(persona.reviewerType) && submission.clinicalData) {
      const cd = submission.clinicalData;

      if (!cd.primaryEndpointMet) {
        questions.push({
          id: `q_${this.simulationId}_${questions.length}`,
          category: 'clinical_efficacy',
          severity: 'critical',
          question: `The primary endpoint did not achieve statistical significance (p=${cd.pValue ?? 'N/A'}). Please provide analysis of clinical meaningfulness, responder analyses, and time-to-event sensitivity analyses.`,
          rationale: `${persona.division} reviewers require demonstration of both statistical and clinical significance per FDA Guidance on Effectiveness.`,
          fdaGuidanceCitation:
            'FDA Guidance for Industry: Providing Clinical Evidence of Effectiveness for Human Drug and Biological Products (1998)',
          suggestedResponse:
            'Prepare pre-specified responder analysis, MCID justification, and Tipping Point sensitivity analysis for missing data.',
          confidenceScore: 0.95,
          historicalFrequency: 0.78,
          reviewerType: persona.reviewerType,
        });
      }

      if (cd.safetySignals.length > 0) {
        for (const signal of cd.safetySignals.slice(0, 3)) {
          questions.push({
            id: `q_${this.simulationId}_${questions.length}`,
            category: 'clinical_safety',
            severity: 'major',
            question: `Describe the characterization of the "${signal}" safety signal. Include incidence rates by severity, time to onset, reversibility, dose-response, and risk mitigation measures.`,
            rationale: `Safety signals require thorough characterization per ICH E2E Pharmacovigilance Planning and FDA safety reporting guidance.`,
            fdaGuidanceCitation:
              'ICH E2E: Pharmacovigilance Planning; FDA Guidance: Premarketing Risk Assessment (2005)',
            suggestedResponse: `Prepare detailed safety narrative including Kaplan-Meier event curves, exposure-adjusted incidence, MedDRA SOC/PT analysis, and subgroup vulnerability assessment.`,
            confidenceScore: 0.88,
            historicalFrequency: 0.65,
            reviewerType: persona.reviewerType,
          });
        }
      }

      if (cd.missingDataPercentage > 10) {
        questions.push({
          id: `q_${this.simulationId}_${questions.length}`,
          category: 'statistical',
          severity: cd.missingDataPercentage > 20 ? 'critical' : 'major',
          question: `Missing data rate is ${cd.missingDataPercentage}%. Provide sensitivity analyses under MNAR assumptions per ICH E9(R1), including tipping point analysis and pattern mixture models.`,
          rationale:
            'E9(R1) estimand framework requires explicit handling of intercurrent events including treatment discontinuation.',
          fdaGuidanceCitation:
            'ICH E9(R1): Addendum on Estimands and Sensitivity Analysis in Clinical Trials (2021)',
          suggestedResponse:
            'Run tipping point, delta-adjusted, pattern mixture model analyses; present multiple estimand results.',
          confidenceScore: 0.92,
          historicalFrequency: 0.71,
          reviewerType: 'statistical',
        });
      }
    }

    // CMC questions
    if (persona.reviewerType === 'chemistry' && submission.cmcData) {
      const cmc = submission.cmcData;

      if (cmc.stabilityDataMonths < 24) {
        questions.push({
          id: `q_${this.simulationId}_${questions.length}`,
          category: 'CMC',
          severity: cmc.stabilityDataMonths < 12 ? 'critical' : 'major',
          question: `Only ${cmc.stabilityDataMonths} months of stability data provided. Justify proposed shelf life using ICH Q1E statistical extrapolation or provide commitment for ongoing stability studies.`,
          rationale:
            'ICH Q1A(R2) requires long-term and accelerated stability data sufficient to support proposed shelf life.',
          fdaGuidanceCitation:
            'ICH Q1A(R2): Stability Testing of New Drug Substances and Products; ICH Q1E: Evaluation for Stability Data',
          suggestedResponse:
            'Provide all available long-term and accelerated data with ICH Q1E-compliant statistical extrapolation analysis.',
          confidenceScore: 0.9,
          historicalFrequency: 0.45,
          reviewerType: persona.reviewerType,
        });
      }

      if (cmc.impurityProfile === 'concerning') {
        questions.push({
          id: `q_${this.simulationId}_${questions.length}`,
          category: 'CMC',
          severity: 'critical',
          question:
            'Impurity profile raises concerns. Provide full characterization of identified and unidentified impurities above ICH Q3A(R2) identification thresholds, including mutagenic impurity assessment per ICH M7(R1).',
          rationale:
            'ICH Q3A/B require identification, qualification, and safety assessment of impurities above specified thresholds.',
          fdaGuidanceCitation:
            'ICH Q3A(R2), Q3B(R2): Impurities in New Drug Substances/Products; ICH M7(R1): Mutagenic Impurities',
          suggestedResponse:
            'Complete structural identification of unknowns; conduct ICH M7 assessment; provide qualification data or tighten specifications.',
          confidenceScore: 0.94,
          historicalFrequency: 0.38,
          reviewerType: persona.reviewerType,
        });
      }
    }

    // Pharmacology/PK questions
    if (persona.reviewerType === 'pharmacology' && submission.clinicalData) {
      questions.push({
        id: `q_${this.simulationId}_${questions.length}`,
        category: 'clinical_efficacy',
        severity: 'major',
        question:
          'Provide exposure-response analysis for both efficacy and safety endpoints. Include popPK model description, covariates evaluated, and model-based simulations for special populations.',
        rationale:
          'FDA increasingly requires exposure-response analysis per the 2003 Exposure-Response guidance to support dose selection rationale.',
        fdaGuidanceCitation:
          'FDA Guidance: Exposure-Response Relationships — Study Design, Data Analysis, and Regulatory Applications (2003)',
        suggestedResponse:
          'Develop and validate popPK model; conduct E-R analyses for primary endpoint and key safety events; simulate for hepatic/renal impairment.',
        confidenceScore: 0.82,
        historicalFrequency: 0.55,
        reviewerType: persona.reviewerType,
      });
    }

    // Nonclinical questions
    if (['pharmacology', 'medical'].includes(persona.reviewerType) && submission.nonClinicalData) {
      const nc = submission.nonClinicalData;

      if (!nc.noaelEstablished) {
        questions.push({
          id: `q_${this.simulationId}_${questions.length}`,
          category: 'nonclinical',
          severity: 'critical',
          question:
            'NOAEL was not clearly established in the toxicology program. Provide additional analysis or justify the selected starting dose using MABEL/MFD/NOAEL-based approaches per ICH S9 (if oncology) or ICH M3.',
          rationale:
            'Human dose justification requires a clearly established NOAEL with adequate safety margin.',
          fdaGuidanceCitation:
            'ICH M3(R2): Nonclinical Safety Studies; FDA Guidance: Estimating the Maximum Safe Starting Dose (2005)',
          suggestedResponse:
            'Re-analyze tox data to establish NOAEL; calculate safety margins using HED conversion; justify starting dose.',
          confidenceScore: 0.91,
          historicalFrequency: 0.32,
          reviewerType: persona.reviewerType,
        });
      }
    }

    // EMA-specific questions
    if (persona.agency === 'EMA') {
      questions.push({
        id: `q_${this.simulationId}_${questions.length}`,
        category: 'regulatory_pathway',
        severity: 'major',
        question:
          'Describe the unmet medical need this product addresses. Compare with currently authorized medicinal products in the EU. How does the benefit-risk compare to the current standard of care?',
        rationale:
          'CHMP assessment requires demonstration of therapeutic benefit relative to EU-authorized comparators.',
        fdaGuidanceCitation:
          'EMA/CHMP Guideline on the Investigation of Subgroups in Confirmatory Clinical Trials (EMA/CHMP/539146/2013)',
        suggestedResponse:
          'Prepare comparative efficacy table vs. EU-authorized alternatives; address EMA scientific advice recommendations.',
        confidenceScore: 0.87,
        historicalFrequency: 0.72,
        reviewerType: persona.reviewerType,
      });
    }

    return questions;
  }

  /**
   * Assess RTF (Refuse to File) risk based on 21 CFR 314.101 criteria
   */
  assessRTFRisk(submission: SubmissionProfile): RTFRiskAssessment {
    const categoryScores: Record<string, number> = {};
    const criticalDeficiencies: string[] = [];
    const remediationPlan: RemediationItem[] = [];

    for (const [category, criteria] of Object.entries(RTF_CRITERIA)) {
      let categoryScore = 0;
      let totalWeight = 0;

      for (const check of criteria.checks) {
        const passed = this.evaluateRTFCheck(check.id, submission);
        const checkWeight = check.critical ? 2.0 : 1.0;
        totalWeight += checkWeight;

        if (!passed) {
          categoryScore += checkWeight;
          if (check.critical) {
            criticalDeficiencies.push(`[${category}] ${check.description}`);
            remediationPlan.push({
              deficiency: check.description,
              priority: 'P0',
              estimatedEffortDays: this.estimateRemediationEffort(check.id),
              suggestedAction: `Address ${check.description} before submission`,
              responsible: this.assignResponsible(category),
            });
          } else {
            remediationPlan.push({
              deficiency: check.description,
              priority: 'P1',
              estimatedEffortDays: this.estimateRemediationEffort(check.id),
              suggestedAction: `Resolve ${check.description}; may not trigger RTF but will cause deficiency letter`,
              responsible: this.assignResponsible(category),
            });
          }
        }
      }

      categoryScores[category] =
        totalWeight > 0 ? Math.round((categoryScore / totalWeight) * 100) : 0;
    }

    // Weighted overall score
    let overallScore = 0;
    for (const [category, criteria] of Object.entries(RTF_CRITERIA)) {
      overallScore += (categoryScores[category] || 0) * criteria.weight;
    }
    overallScore = Math.round(overallScore);

    const overallRisk =
      overallScore < 15
        ? 'low'
        : overallScore < 35
          ? 'medium'
          : overallScore < 60
            ? 'high'
            : 'critical';

    const estimatedRemediationDays = remediationPlan.reduce(
      (sum, item) => sum + item.estimatedEffortDays,
      0
    );

    return {
      overallRisk,
      overallScore,
      categoryScores,
      criticalDeficiencies,
      remediationPlan,
      estimatedRemediationDays,
    };
  }

  private evaluateRTFCheck(checkId: string, submission: SubmissionProfile): boolean {
    const moduleKeys = Object.keys(submission.moduleContents || {});

    switch (checkId) {
      case 'ectd_valid_xml':
      case 'ectd_file_integrity':
        return moduleKeys.length > 0;
      case 'ectd_module_complete':
        return ['m1', 'm2', 'm3', 'm4', 'm5'].every(m => moduleKeys.some(k => k.startsWith(m)));
      case 'ectd_sequence_number':
        return true; // Assume valid unless flagged
      case 'pivotal_study_included':
        return (submission.clinicalData?.pivotalTrials ?? 0) >= 1;
      case 'safety_database':
        return (submission.clinicalData?.totalPatients ?? 0) >= 300;
      case 'efficacy_endpoints':
        return submission.clinicalData?.primaryEndpointMet !== undefined;
      case 'statistical_analysis':
        return true; // Would check Module 5.3.5 SAP
      case 'clinical_overview':
        return moduleKeys.some(k => k.includes('2.5'));
      case 'drug_substance_spec':
      case 'drug_product_spec':
        return submission.cmcData?.drugSubstanceCharacterized ?? false;
      case 'stability_data':
        return (submission.cmcData?.stabilityDataMonths ?? 0) >= 6;
      case 'manufacturing_info':
        return submission.cmcData?.manufacturingSitesInspected ?? false;
      case 'impurity_characterization':
        return submission.cmcData?.impurityProfile !== 'concerning';
      case 'tox_package':
        return (submission.nonClinicalData?.toxSpeciesCount ?? 0) >= 2;
      case 'carcinogenicity':
        return submission.nonClinicalData?.carcinogenicityComplete ?? true;
      case 'reproductive_tox':
        return submission.nonClinicalData?.reproductiveToxComplete ?? true;
      case 'genotox_battery':
        return submission.nonClinicalData?.genotoxBattery ?? false;
      case 'form_356h':
      case 'user_fee':
      case 'debarment_cert':
        return moduleKeys.some(k => k.startsWith('m1'));
      case 'patent_info':
      case 'field_copy_cert':
        return true;
      default:
        return true;
    }
  }

  private estimateRemediationEffort(checkId: string): number {
    const effortMap: Record<string, number> = {
      pivotal_study_included: 365,
      safety_database: 180,
      stability_data: 90,
      tox_package: 120,
      genotox_battery: 60,
      impurity_characterization: 45,
      ectd_valid_xml: 5,
      ectd_module_complete: 14,
      form_356h: 1,
      user_fee: 1,
    };
    return effortMap[checkId] ?? 14;
  }

  private assignResponsible(category: string): string {
    const responsibleMap: Record<string, string> = {
      eCTDFormat: 'Regulatory Publishing',
      clinicalContent: 'Clinical Development / Medical Writing',
      cmcContent: 'CMC / Pharmaceutical Development',
      nonClinicalContent: 'Nonclinical / Toxicology',
      administrativeContent: 'Regulatory Affairs',
    };
    return responsibleMap[category] ?? 'Regulatory Affairs';
  }

  /**
   * Predict probable deficiency letters (IR, CR, CRL)
   */
  predictDeficiencyLetter(
    submission: SubmissionProfile,
    rtfAssessment: RTFRiskAssessment
  ): DeficiencyLetterPrediction {
    const predictedDeficiencies: DeficiencyItem[] = [];

    // Check each deficiency pattern category
    for (const [category, patterns] of Object.entries(DEFICIENCY_PATTERNS)) {
      const relevant = this.isCategoryRelevant(category, submission);
      if (relevant) {
        const applicablePatterns = patterns.filter(p => this.isDeficiencyApplicable(p, submission));
        predictedDeficiencies.push(...applicablePatterns);
      }
    }

    // Add RTF-derived deficiencies
    for (const deficiency of rtfAssessment.criticalDeficiencies) {
      predictedDeficiencies.push({
        section: 'Administrative',
        description: deficiency,
        severity: 'critical',
        ectdModule: 'm1',
        suggestedRemedy: 'Address before submission to avoid RTF',
      });
    }

    // Determine letter type and likelihood
    const criticalCount = predictedDeficiencies.filter(d => d.severity === 'critical').length;
    const majorCount = predictedDeficiencies.filter(d => d.severity === 'major').length;

    let letterType: DeficiencyLetterPrediction['letterType'];
    let likelihood: number;

    if (rtfAssessment.overallRisk === 'critical') {
      letterType = 'RTF';
      likelihood = 0.85;
    } else if (criticalCount >= 3) {
      letterType = 'CRL';
      likelihood = 0.75;
    } else if (criticalCount >= 1) {
      letterType = 'CR';
      likelihood = 0.6;
    } else if (majorCount >= 3) {
      letterType = 'IR';
      likelihood = 0.7;
    } else {
      letterType = 'AI';
      likelihood = 0.4;
    }

    return {
      letterType,
      likelihood,
      predictedDeficiencies,
      estimatedResponseTime: letterType === 'IR' ? 30 : letterType === 'CR' ? 90 : 180,
      historicalPrecedents: this.findHistoricalPrecedents(submission.therapeuticArea, letterType),
    };
  }

  private isCategoryRelevant(category: string, submission: SubmissionProfile): boolean {
    switch (category) {
      case 'clinical_efficacy':
      case 'clinical_safety':
        return !!submission.clinicalData;
      case 'CMC':
        return !!submission.cmcData;
      case 'nonclinical':
        return !!submission.nonClinicalData;
      case 'statistical':
        return !!submission.clinicalData;
      default:
        return true;
    }
  }

  private isDeficiencyApplicable(
    deficiency: DeficiencyItem,
    submission: SubmissionProfile
  ): boolean {
    // Heuristic: apply deficiency if its eCTD module exists in submission but may have gaps
    const moduleKeys = Object.keys(submission.moduleContents || {});
    const modulePresent = moduleKeys.some(k =>
      k.startsWith(deficiency.ectdModule.replace('m', ''))
    );

    // Also consider clinical data quality signals
    if (deficiency.ectdModule === 'm5' && submission.clinicalData) {
      if (deficiency.severity === 'critical') {
        return (
          !submission.clinicalData.primaryEndpointMet ||
          submission.clinicalData.missingDataPercentage > 15
        );
      }
    }

    if (deficiency.ectdModule === 'm3' && submission.cmcData) {
      return (
        submission.cmcData.impurityProfile !== 'acceptable' ||
        submission.cmcData.stabilityDataMonths < 24
      );
    }

    if (deficiency.ectdModule === 'm4' && submission.nonClinicalData) {
      return (
        !submission.nonClinicalData.genotoxBattery || !submission.nonClinicalData.noaelEstablished
      );
    }

    return modulePresent;
  }

  private findHistoricalPrecedents(therapeuticArea: string, letterType: string): string[] {
    // In production, this would query a database of historical FDA actions
    // For now, return representative precedent strings
    const precedents: Record<string, string[]> = {
      oncology: [
        'Accelerated approval with post-marketing confirmatory trial requirement',
        'CRL for OS endpoint not reaching significance despite PFS benefit',
        'IR requesting additional biomarker validation data',
      ],
      cardiology: [
        'MACE endpoint adjudication methodology questioned',
        'Requirement for CV outcomes trial per FDA 2008 CV guidance',
        'Additional long-term safety data requested (>2 year follow-up)',
      ],
      neurology: [
        'Clinical meaningfulness of cognitive endpoint questioned',
        'Amyloid PET endpoint as surrogate not accepted without clinical correlation',
        'REMS required for hepatotoxicity risk',
      ],
      rare_disease: [
        'Flexibility on endpoint selection acknowledged per FDA Rare Disease Guidance',
        'Natural history data accepted as external control',
        'Accelerated approval based on surrogate endpoint',
      ],
    };

    return (
      precedents[therapeuticArea.toLowerCase()] || [
        `Historical ${letterType} actions in ${therapeuticArea} — query regulatory intelligence database for specifics`,
      ]
    );
  }

  /**
   * Simulate Advisory Committee meeting outcome
   */
  simulateAdvisoryCommittee(
    submission: SubmissionProfile,
    committeeType?: string
  ): AdvisoryCommitteeSimulation {
    const committee = committeeType || this.inferCommitteeType(submission.therapeuticArea);
    const panelistConcerns = this.generatePanelistConcerns(submission);

    // Vote prediction using weighted factors
    let yesVotes = 0;
    let noVotes = 0;
    const totalPanelists = 13; // typical ODAC size

    // Base approval sentiment from clinical data
    let approvalSentiment = 0.5;
    if (submission.clinicalData) {
      if (submission.clinicalData.primaryEndpointMet) approvalSentiment += 0.2;
      if (submission.clinicalData.pValue && submission.clinicalData.pValue < 0.001)
        approvalSentiment += 0.1;
      if (submission.clinicalData.safetySignals.length > 2) approvalSentiment -= 0.15;
      if (submission.clinicalData.missingDataPercentage > 20) approvalSentiment -= 0.1;
      if (submission.clinicalData.effectSize && submission.clinicalData.effectSize > 0.5)
        approvalSentiment += 0.1;
    }

    approvalSentiment = Math.max(0.1, Math.min(0.95, approvalSentiment));

    // Simulate each panelist vote (slightly randomized)
    for (let i = 0; i < totalPanelists; i++) {
      const personalBias = (Math.random() - 0.5) * 0.2;
      if (approvalSentiment + personalBias > 0.5) {
        yesVotes++;
      } else {
        noVotes++;
      }
    }

    const abstain = Math.random() > 0.85 ? 1 : 0;
    if (abstain && yesVotes > 0) yesVotes--;

    const overallSentiment =
      yesVotes > totalPanelists * 0.65
        ? 'favorable'
        : yesVotes > totalPanelists * 0.45
          ? 'mixed'
          : 'unfavorable';

    const keyDebateTopics = this.generateDebateTopics(submission);

    return {
      committeeType: committee,
      votePrediction: { yes: yesVotes, no: noVotes, abstain },
      overallSentiment,
      keyDebateTopics,
      panelistConcerns,
      recommendedPrepStrategy: [
        'Prepare concise benefit-risk framework presentation (max 45 min)',
        'Anticipate and pre-address top 5 panelist concerns in opening statement',
        'Have KOL speakers ready for disease area context',
        'Prepare patient testimonials for unmet need demonstration',
        `Focus rebuttal preparation on: ${keyDebateTopics[0] || 'primary endpoint interpretation'}`,
      ],
    };
  }

  private inferCommitteeType(therapeuticArea: string): string {
    const mapping: Record<string, string> = {
      oncology: 'ODAC (Oncologic Drugs Advisory Committee)',
      cardiology: 'CRDAC (Cardiovascular and Renal Drugs Advisory Committee)',
      neurology: 'PCNS-AC (Peripheral and Central Nervous System Drugs Advisory Committee)',
      endocrinology: 'EMDAC (Endocrinologic and Metabolic Drugs Advisory Committee)',
      antiinfective: 'AIDAC (Anti-Infective Drugs Advisory Committee)',
      dermatology: 'DAC (Dermatologic and Ophthalmic Drugs Advisory Committee)',
      psychiatry: 'Psychopharmacologic Drugs Advisory Committee',
      pulmonology: 'PADAC (Pulmonary-Allergy Drugs Advisory Committee)',
      gastroenterology: 'GI Drugs Advisory Committee',
    };
    return mapping[therapeuticArea.toLowerCase()] || 'General Advisory Committee';
  }

  private generatePanelistConcerns(submission: SubmissionProfile): PanelistConcern[] {
    const concerns: PanelistConcern[] = [];

    concerns.push({
      panelistType: 'biostatistician',
      primaryConcern:
        submission.clinicalData?.missingDataPercentage &&
        submission.clinicalData.missingDataPercentage > 10
          ? `Missing data rate of ${submission.clinicalData.missingDataPercentage}% may bias primary analysis`
          : 'Statistical analysis methodology and multiplicity control',
      likelihood: 0.9,
      mitigationStrategy:
        'Present pre-specified sensitivity analyses and tipping point results upfront',
    });

    concerns.push({
      panelistType: 'clinical_expert',
      primaryConcern:
        'Clinical meaningfulness of observed treatment effect relative to existing therapies',
      likelihood: 0.85,
      mitigationStrategy:
        'Present responder analyses, NNT, and patient-reported outcome improvements',
    });

    concerns.push({
      panelistType: 'patient_advocate',
      primaryConcern: 'QoL impact and patient-friendliness of treatment regimen',
      likelihood: 0.7,
      mitigationStrategy: 'Include PRO data and patient experience narratives in presentation',
    });

    if (
      submission.clinicalData?.safetySignals &&
      submission.clinicalData.safetySignals.length > 0
    ) {
      concerns.push({
        panelistType: 'safety_expert',
        primaryConcern: `Safety signals (${submission.clinicalData.safetySignals.join(', ')}) require thorough characterization and risk mitigation plan`,
        likelihood: 0.95,
        mitigationStrategy:
          'Present comprehensive safety analysis with exposure-adjusted rates and risk mitigation strategy',
      });
    }

    return concerns;
  }

  private generateDebateTopics(submission: SubmissionProfile): string[] {
    const topics: string[] = [];

    if (submission.clinicalData) {
      if (!submission.clinicalData.primaryEndpointMet) {
        topics.push(
          'Whether the primary endpoint results support approval despite not meeting statistical significance'
        );
      }
      if (submission.clinicalData.safetySignals.length > 0) {
        topics.push(`Safety signal management: ${submission.clinicalData.safetySignals[0]}`);
      }
      if (submission.clinicalData.missingDataPercentage > 15) {
        topics.push('Impact of missing data on reliability of efficacy conclusions');
      }
      topics.push('Adequacy of the benefit-risk balance for the proposed indication');
    }

    if (topics.length === 0) {
      topics.push('Overall benefit-risk determination for the proposed indication');
    }

    return topics;
  }

  /**
   * Monte Carlo simulation for submission timing optimization
   */
  runMonteCarloTimingSimulation(
    submission: SubmissionProfile,
    targetSubmissionDate: string,
    iterations: number = 10000
  ): MonteCarloTimingResult {
    const scenarios: TimingScenario[] = [];
    const reviewDays: number[] = [];

    // FDA PDUFA target dates: 10 months standard, 6 months priority
    const baseReviewDays = submission.type === 'NDA' || submission.type === 'BLA' ? 300 : 180;
    for (let i = 0; i < iterations; i++) {
      // Perturb base review time with historical distribution (log-normal)
      const perturbation = this.logNormalRandom(0, 0.3);
      let simReviewDays = Math.round(baseReviewDays * Math.exp(perturbation));

      // RTF scenario
      if (Math.random() < 0.08) {
        // ~8% historical RTF rate
        scenarios.push({
          scenario: 'RTF',
          probability: 0.08,
          reviewDays: 60,
          outcome: 'RTF',
        });
        reviewDays.push(60 + baseReviewDays); // RTF + resubmit
        continue;
      }

      // Information Request cycle
      const irProbability = 0.45; // ~45% of applications receive at least one IR
      if (Math.random() < irProbability) {
        simReviewDays += Math.round(30 + Math.random() * 60); // 30-90 day extension
      }

      // CRL scenario
      const crlProbability = submission.clinicalData?.primaryEndpointMet ? 0.12 : 0.45;
      if (Math.random() < crlProbability) {
        scenarios.push({
          scenario: 'CRL',
          probability: crlProbability,
          reviewDays: simReviewDays,
          outcome: 'CRL',
        });
        reviewDays.push(simReviewDays);
        continue;
      }

      // Approval scenario
      scenarios.push({
        scenario: 'Approval',
        probability: 1 - crlProbability,
        reviewDays: simReviewDays,
        outcome: 'approval',
      });
      reviewDays.push(simReviewDays);
    }

    reviewDays.sort((a, b) => a - b);
    const p50 = reviewDays[Math.floor(reviewDays.length * 0.5)];
    const p90 = reviewDays[Math.floor(reviewDays.length * 0.9)];
    const approvalCount = scenarios.filter(s => s.outcome === 'approval').length;

    // Aggregate scenario types
    const scenarioSummary: TimingScenario[] = [
      {
        scenario: 'Approval (standard timeline)',
        probability: approvalCount / iterations,
        reviewDays: p50,
        outcome: 'approval',
      },
      {
        scenario: 'Complete Response Letter',
        probability: scenarios.filter(s => s.outcome === 'CRL').length / iterations,
        reviewDays: p50 + 180,
        outcome: 'CRL',
      },
      {
        scenario: 'Refuse to File',
        probability: scenarios.filter(s => s.outcome === 'RTF').length / iterations,
        reviewDays: 60,
        outcome: 'RTF',
      },
    ];

    // Optimal submission date: working backwards from desired approval
    const targetDate = new Date(targetSubmissionDate);
    const optimalDate = new Date(targetDate.getTime() - p50 * 24 * 60 * 60 * 1000);

    return {
      optimalSubmissionDate: optimalDate.toISOString().split('T')[0],
      p50ReviewDays: p50,
      p90ReviewDays: p90,
      approvalProbability: approvalCount / iterations,
      scenarioDistribution: scenarioSummary,
      riskFactors: this.identifyTimingRiskFactors(submission),
    };
  }

  private logNormalRandom(mu: number, sigma: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private identifyTimingRiskFactors(submission: SubmissionProfile): string[] {
    const risks: string[] = [];

    if (
      submission.clinicalData?.safetySignals &&
      submission.clinicalData.safetySignals.length > 2
    ) {
      risks.push('Multiple safety signals may trigger additional review cycles');
    }
    if (submission.cmcData && submission.cmcData.stabilityDataMonths < 12) {
      risks.push('Limited stability data may require CMC amendment during review');
    }
    if (!submission.clinicalData?.primaryEndpointMet) {
      risks.push('Missed primary endpoint significantly increases CRL probability');
    }

    risks.push('PDUFA date may shift if FDA issues major information request');
    risks.push('Government shutdown or pandemic can delay review timelines');

    return risks;
  }

  /**
   * Cross-agency comparison: simultaneous FDA/EMA/PMDA review simulation
   */
  async runCrossAgencyComparison(submission: SubmissionProfile): Promise<
    Record<
      string,
      {
        questions: PredictedQuestion[];
        rtfRisk: RTFRiskAssessment;
        timeline: MonteCarloTimingResult;
      }
    >
  > {
    const agencies = ['FDA', 'EMA', 'PMDA'];
    const results: Record<string, any> = {};

    for (const agency of agencies) {
      const questions = await this.predictReviewerQuestions(submission, [agency]);
      const rtfRisk = this.assessRTFRisk(submission);
      const timeline = this.runMonteCarloTimingSimulation(
        submission,
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        5000
      );

      results[agency] = { questions, rtfRisk, timeline };
    }

    return results;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// In-memory simulation store
// ═══════════════════════════════════════════════════════════════════════════════

const simulationStore = new Map<
  string,
  {
    twin: RegulatoryDigitalTwin;
    submission: SubmissionProfile;
    results: Record<string, any>;
    createdAt: string;
  }
>();

// ═══════════════════════════════════════════════════════════════════════════════
// API Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /simulations — Create a new regulatory digital twin simulation
 */
router.post('/simulations', async (req: Request, res: Response) => {
  try {
    const { submission, agencies } = req.body as {
      submission: SubmissionProfile;
      agencies?: string[];
    };

    if (!submission || !submission.type || !submission.therapeuticArea) {
      return res.status(400).json({
        error: 'submission.type and submission.therapeuticArea are required',
      });
    }

    const twin = new RegulatoryDigitalTwin();
    const simulationId = `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Run full simulation
    const [questions, rtfRisk] = await Promise.all([
      twin.predictReviewerQuestions(submission, agencies || ['FDA']),
      Promise.resolve(twin.assessRTFRisk(submission)),
    ]);

    const deficiencyPrediction = twin.predictDeficiencyLetter(submission, rtfRisk);
    const advisoryCommittee = twin.simulateAdvisoryCommittee(submission);

    const results = {
      questions,
      rtfRisk,
      deficiencyPrediction,
      advisoryCommittee,
    };

    simulationStore.set(simulationId, {
      twin,
      submission,
      results,
      createdAt: new Date().toISOString(),
    });

    // Persist to DB if available
    try {
      await db.execute(sql`
        INSERT INTO regulatory_twin_simulations (id, submission_type, therapeutic_area, results, created_at)
        VALUES (${simulationId}, ${submission.type}, ${submission.therapeuticArea}, ${JSON.stringify(results)}::jsonb, NOW())
      `);
    } catch (dbErr) {
      // Table may not exist yet — log and proceed with in-memory only
      console.warn('[DigitalTwin] DB persistence failed:', (dbErr as Error).message);
    }

    res.json({
      simulationId,
      submissionType: submission.type,
      therapeuticArea: submission.therapeuticArea,
      summary: {
        totalPredictedQuestions: questions.length,
        criticalQuestions: questions.filter(q => q.severity === 'critical').length,
        rtfRisk: rtfRisk.overallRisk,
        rtfScore: rtfRisk.overallScore,
        predictedLetterType: deficiencyPrediction.letterType,
        deficiencyLikelihood: deficiencyPrediction.likelihood,
        advisoryVote: advisoryCommittee.votePrediction,
        advisorySentiment: advisoryCommittee.overallSentiment,
      },
      results,
    });
  } catch (error: any) {
    console.error('[regulatory-digital-twin] Simulation error:', error);
    res.status(500).json({ error: 'Simulation failed', details: error.message });
  }
});

/**
 * GET /simulations/:id — Retrieve a simulation result
 */
router.get('/simulations/:id', (req: Request, res: Response) => {
  const sim = simulationStore.get(req.params.id);
  if (!sim) {
    return res.status(404).json({ error: 'Simulation not found' });
  }
  res.json({
    simulationId: req.params.id,
    createdAt: sim.createdAt,
    submission: sim.submission,
    results: sim.results,
  });
});

/**
 * GET /simulations — List all simulations
 */
router.get('/simulations', (_req: Request, res: Response) => {
  const simulations = Array.from(simulationStore.entries()).map(([id, sim]) => ({
    simulationId: id,
    submissionType: sim.submission.type,
    therapeuticArea: sim.submission.therapeuticArea,
    createdAt: sim.createdAt,
    rtfRisk: sim.results.rtfRisk?.overallRisk,
  }));
  res.json({ simulations, total: simulations.length });
});

/**
 * POST /predict-questions — Predict reviewer questions for a submission profile
 */
router.post('/predict-questions', async (req: Request, res: Response) => {
  try {
    const { submission, agencies } = req.body;
    const twin = new RegulatoryDigitalTwin();
    const questions = await twin.predictReviewerQuestions(submission, agencies);

    res.json({
      totalQuestions: questions.length,
      bySeverity: {
        critical: questions.filter(q => q.severity === 'critical').length,
        major: questions.filter(q => q.severity === 'major').length,
        minor: questions.filter(q => q.severity === 'minor').length,
      },
      byCategory: groupBy(questions, 'category'),
      questions,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /rtf-assessment — Assess Refuse-to-File risk
 */
router.post('/rtf-assessment', (req: Request, res: Response) => {
  try {
    const { submission } = req.body;
    const twin = new RegulatoryDigitalTwin();
    const assessment = twin.assessRTFRisk(submission);
    res.json(assessment);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /deficiency-prediction — Predict deficiency letters
 */
router.post('/deficiency-prediction', (req: Request, res: Response) => {
  try {
    const { submission } = req.body;
    const twin = new RegulatoryDigitalTwin();
    const rtfRisk = twin.assessRTFRisk(submission);
    const prediction = twin.predictDeficiencyLetter(submission, rtfRisk);
    res.json(prediction);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /advisory-committee — Simulate Advisory Committee meeting
 */
router.post('/advisory-committee', (req: Request, res: Response) => {
  try {
    const { submission, committeeType } = req.body;
    const twin = new RegulatoryDigitalTwin();
    const simulation = twin.simulateAdvisoryCommittee(submission, committeeType);
    res.json(simulation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /monte-carlo-timing — Run Monte Carlo timing simulation
 */
router.post('/monte-carlo-timing', (req: Request, res: Response) => {
  try {
    const { submission, targetDate, iterations } = req.body;
    const twin = new RegulatoryDigitalTwin();
    const result = twin.runMonteCarloTimingSimulation(
      submission,
      targetDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      iterations || 10000
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /cross-agency — Compare FDA vs EMA vs PMDA review predictions
 */
router.post('/cross-agency', async (req: Request, res: Response) => {
  try {
    const { submission } = req.body;
    const twin = new RegulatoryDigitalTwin();
    const comparison = await twin.runCrossAgencyComparison(submission);

    res.json({
      agencies: Object.keys(comparison),
      comparison,
      harmonizationOpportunities: identifyHarmonizationOpportunities(comparison),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /personas — List all available reviewer personas
 */
router.get('/personas', (_req: Request, res: Response) => {
  res.json({
    personas: REVIEWER_PERSONAS,
    total: REVIEWER_PERSONAS.length,
    agencies: [...new Set(REVIEWER_PERSONAS.map(p => p.agency))],
  });
});

/**
 * GET /rtf-criteria — Get all RTF assessment criteria
 */
router.get('/rtf-criteria', (_req: Request, res: Response) => {
  res.json(RTF_CRITERIA);
});

/**
 * GET /health — Health check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'regulatory-digital-twin',
    version: '1.0.0',
    simulationsInMemory: simulationStore.size,
    personasLoaded: REVIEWER_PERSONAS.length,
    rtfCriteriaCategories: Object.keys(RTF_CRITERIA).length,
    deficiencyPatternCategories: Object.keys(DEFICIENCY_PATTERNS).length,
    capabilities: [
      'reviewer_question_prediction',
      'rtf_risk_assessment',
      'deficiency_letter_prediction',
      'advisory_committee_simulation',
      'monte_carlo_timing',
      'cross_agency_comparison',
    ],
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {
  return items.reduce(
    (groups, item) => {
      const group = String(item[key]);
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
      return groups;
    },
    {} as Record<string, T[]>
  );
}

function identifyHarmonizationOpportunities(comparison: Record<string, any>): string[] {
  const opportunities: string[] = [];

  const agencies = Object.keys(comparison);
  if (agencies.length < 2) return opportunities;

  // Find common questions across agencies
  const allQuestionCategories = agencies.map(
    a => new Set((comparison[a].questions || []).map((q: PredictedQuestion) => q.category))
  );

  const commonCategories = [...allQuestionCategories[0]].filter(cat =>
    allQuestionCategories.every(set => set.has(cat))
  );

  if (commonCategories.length > 0) {
    opportunities.push(
      `Common deficiency categories across agencies: ${commonCategories.join(', ')} — address once in a harmonized response`
    );
  }

  opportunities.push(
    'Align clinical study reports with ICH E3 template accepted by all three agencies'
  );
  opportunities.push('Use ICH CTD (M4) format for simultaneous submissions');
  opportunities.push(
    'Coordinate pre-submission meetings (Pre-IND/Pre-NDA, Scientific Advice, Pre-application consultation)'
  );

  return opportunities;
}

export default router;
