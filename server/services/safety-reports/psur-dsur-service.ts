/**
 * PSUR / DSUR safety report structure generation service.
 *
 * Generates deterministic ICH E2C(R2) PSUR and ICH E2F DSUR report structures
 * with all required sections, guidance text, and metadata. These are structural
 * skeletons that define the table-of-contents and per-section guidance for
 * authoring safety reports — they do NOT contain actual safety data.
 *
 * Pure: no DB, no network, no LLM. Identical input → identical output.
 *
 * @module server/services/safety-reports/psur-dsur-service
 */

// ── Input / Output types ─────────────────────────────────────────────────────

export interface MarketingAuthorization {
  country: string;
  holderName: string;
  approvalDate: string;
}

export interface PsurInput {
  productName: string;
  substanceName: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  marketingAuthorizations: MarketingAuthorization[];
}

export interface DsurInput {
  productName: string;
  substanceName: string;
  developmentPhase: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
}

export interface ReportSection {
  number: string;
  title: string;
  required: boolean;
  guidance: string;
}

export interface SafetyReportStructure {
  sections: ReportSection[];
  reportingPeriod: { start: string; end: string };
  status: 'structure_generated';
}

// ── ICH E2C(R2) PSUR Sections ────────────────────────────────────────────────

const PSUR_SECTIONS: ReportSection[] = [
  {
    number: '1',
    title: 'Executive Summary',
    required: true,
    guidance:
      'Concise summary of the most important safety-related findings, actions, and conclusions from the reporting period. Should stand alone for rapid review.',
  },
  {
    number: '2',
    title: 'Introduction',
    required: true,
    guidance:
      'State the international birth date, reporting interval, approved indications, and estimated patient exposure. Identify the MAH and responsible pharmacovigilance contact.',
  },
  {
    number: '3',
    title: 'Worldwide Marketing Authorization Status',
    required: true,
    guidance:
      'Tabulate all countries where the product holds a marketing authorization, including date of first authorization, trade names, formulations, and current regulatory status.',
  },
  {
    number: '4',
    title: 'Actions Taken in the Reporting Interval for Safety Reasons',
    required: true,
    guidance:
      'Describe any regulatory or MAH-initiated actions taken during the period: withdrawals, suspensions, labeling changes, REMS/RMP updates, Dear Healthcare Professional letters, or risk minimization measures.',
  },
  {
    number: '5',
    title: 'Changes to Reference Safety Information',
    required: true,
    guidance:
      'List all changes to the Company Core Safety Information (CCSI) or Company Core Data Sheet (CCDS) during the reporting period, with rationale.',
  },
  {
    number: '6',
    title: 'Estimated Exposure and Use Patterns',
    required: true,
    guidance:
      'Provide cumulative and interval-specific patient exposure from clinical trials and post-marketing data. Include patient-years, prescriptions, or doses sold, with methodology and limitations.',
  },
  {
    number: '7',
    title: 'Summary Tabulations of Individual Case Safety Reports',
    required: true,
    guidance:
      'Present cumulative and interval tabulations of ICSRs by seriousness, listedness/expectedness, and System Organ Class (SOC). Include line listings of serious cases.',
  },
  {
    number: '8',
    title: 'Summaries of Significant Safety Findings from Clinical Trials',
    required: true,
    guidance:
      'Summarize completed, ongoing, and planned clinical trials. Address serious adverse events, discontinuations due to AEs, and any new or changed risks identified from trial data.',
  },
  {
    number: '9',
    title: 'Summaries of Significant Safety Findings from Non-Interventional Studies',
    required: true,
    guidance:
      'Summarize findings from post-authorization safety studies (PASS), registries, epidemiological studies, and other observational data sources.',
  },
  {
    number: '10',
    title: 'Summaries of Significant Safety Findings from Other Sources',
    required: true,
    guidance:
      'Cover safety information from other clinical trials (e.g., investigator-initiated), published literature, and other sources not covered in Sections 8–9.',
  },
  {
    number: '11',
    title: 'Safety-Related Information from Non-Clinical Studies',
    required: true,
    guidance:
      'Describe new preclinical findings with potential clinical relevance (carcinogenicity, reproductive toxicity, new pharmacological findings).',
  },
  {
    number: '12',
    title: 'Literature',
    required: true,
    guidance:
      'Summarize safety-relevant published literature identified during the reporting period through systematic review.',
  },
  {
    number: '13',
    title: 'Other Periodic Reports',
    required: true,
    guidance:
      'Reference any other periodic safety reports submitted (e.g., DSUR for ongoing trials, other PSUR variants for the same substance).',
  },
  {
    number: '14',
    title: 'Lack of Efficacy in Controlled Clinical Trials',
    required: true,
    guidance:
      'For products where lack of efficacy may constitute a safety concern (e.g., vaccines, contraceptives, life-saving therapies), provide relevant findings.',
  },
  {
    number: '15',
    title: 'Late-Breaking Information',
    required: true,
    guidance:
      'Include any significant safety information received after data lock point but before report finalization.',
  },
  {
    number: '16',
    title: 'Signal Evaluation and Risk Analysis',
    required: true,
    guidance:
      'Present all signals identified, evaluated, and closed during the period. For ongoing signals describe the evaluation status and planned actions.',
  },
  {
    number: '17',
    title: 'Benefit Evaluation',
    required: true,
    guidance:
      'Summarize the known benefits of the product for its approved indications, including data from new studies or analyses during the reporting period.',
  },
  {
    number: '18',
    title: 'Integrated Benefit-Risk Analysis',
    required: true,
    guidance:
      'Integrate the benefit and risk findings for each approved indication. State whether the benefit-risk balance remains favorable and justify the conclusion.',
  },
  {
    number: '19',
    title: 'Conclusions and Actions',
    required: true,
    guidance:
      'State overall conclusions and any proposed or initiated actions: labeling changes, additional studies, risk minimization measures, or communication to regulators.',
  },
];

// ── ICH E2F DSUR Sections ────────────────────────────────────────────────────

const DSUR_SECTIONS: ReportSection[] = [
  {
    number: '1',
    title: 'Executive Summary',
    required: true,
    guidance:
      'Concise summary highlighting the most important findings and their implications for ongoing clinical development. Should enable rapid review by DMCs and regulators.',
  },
  {
    number: '2',
    title: 'Introduction',
    required: true,
    guidance:
      'Identify the investigational drug, development international birth date (DIBD), current development phase, and reporting period. State the purpose and scope of the report.',
  },
  {
    number: '3',
    title: 'Worldwide Marketing Authorization Status',
    required: true,
    guidance:
      'If the drug has any marketing authorizations (including for different indications), list them with countries, dates, and approved indications.',
  },
  {
    number: '4',
    title: 'Update on Ongoing and Completed Clinical Trials',
    required: true,
    guidance:
      'Tabulate all ongoing and completed interventional trials during the reporting period: trial identifiers, phase, status, enrollment, sites, and key protocol amendments.',
  },
  {
    number: '5',
    title: 'Estimated Cumulative Subject Exposure',
    required: true,
    guidance:
      'Present cumulative exposure data for subjects in all trials: number of subjects, person-time, dose ranges, and duration of exposure. Distinguish active drug from comparator/placebo.',
  },
  {
    number: '6',
    title: 'Data in Line Listings and Summary Tabulations',
    required: true,
    guidance:
      'Provide line listings of SAEs and summary tabulations of adverse events by SOC and preferred term. Include fatal cases, treatment discontinuations due to AEs, and events of special interest.',
  },
  {
    number: '7',
    title: 'Significant Findings from Clinical Trials During the Reporting Period',
    required: true,
    guidance:
      'Discuss important safety findings including completed trial results, interim analyses, and safety data from any investigator-initiated or literature-reported studies.',
  },
  {
    number: '8',
    title: 'Safety Findings from Non-Interventional Studies',
    required: true,
    guidance:
      'Summarize relevant findings from epidemiological, registry, and other observational studies not reported in Section 7.',
  },
  {
    number: '9',
    title: 'Other Safety Information',
    required: true,
    guidance:
      'Cover safety-relevant preclinical findings, quality/manufacturing issues, published literature, and class effects. Include data from other formulations or indications of the same compound.',
  },
  {
    number: '10',
    title: 'Safety Signal Evaluation',
    required: true,
    guidance:
      'Present all safety signals identified, evaluated, or closed during the reporting period. Describe methodology, signal assessment outcome, and planned or completed actions.',
  },
  {
    number: '11',
    title: 'Late-Breaking Information',
    required: true,
    guidance:
      'Include significant safety information received after the data lock point but before report finalization.',
  },
  {
    number: '12',
    title: 'Overall Safety Assessment',
    required: true,
    guidance:
      'Integrate all safety data to provide a comprehensive assessment. Compare the safety profile to the Reference Safety Information (RSI) and highlight any changes to the risk profile.',
  },
  {
    number: '13',
    title: 'Summary of Important Risks',
    required: true,
    guidance:
      'Enumerate identified and potential risks, with a brief characterization of each. Include missing information that could affect the risk assessment.',
  },
  {
    number: '14',
    title: 'Conclusions',
    required: true,
    guidance:
      'State whether the benefit-risk profile continues to support ongoing clinical development. Specify any recommended changes to the Investigator Brochure, protocols, or informed consent.',
  },
  {
    number: 'A',
    title: 'Appendices',
    required: false,
    guidance:
      'Include the Reference Safety Information (RSI) / Investigator Brochure safety section, line listings, and any supplementary tabulations or analyses.',
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate ICH E2C(R2) PSUR report structure with all 19 required sections.
 */
export function generatePsurStructure(input: PsurInput): SafetyReportStructure {
  if (!input.productName) throw new Error('productName is required');
  if (!input.substanceName) throw new Error('substanceName is required');
  if (!input.reportingPeriodStart) throw new Error('reportingPeriodStart is required');
  if (!input.reportingPeriodEnd) throw new Error('reportingPeriodEnd is required');
  if (!input.marketingAuthorizations || input.marketingAuthorizations.length === 0) {
    throw new Error('marketingAuthorizations must have at least one entry');
  }

  return {
    sections: PSUR_SECTIONS.map((s) => ({ ...s })),
    reportingPeriod: {
      start: input.reportingPeriodStart,
      end: input.reportingPeriodEnd,
    },
    status: 'structure_generated',
  };
}

/**
 * Generate ICH E2F DSUR report structure with all required sections.
 */
export function generateDsurStructure(input: DsurInput): SafetyReportStructure {
  if (!input.productName) throw new Error('productName is required');
  if (!input.substanceName) throw new Error('substanceName is required');
  if (!input.developmentPhase) throw new Error('developmentPhase is required');
  if (!input.reportingPeriodStart) throw new Error('reportingPeriodStart is required');
  if (!input.reportingPeriodEnd) throw new Error('reportingPeriodEnd is required');

  return {
    sections: DSUR_SECTIONS.map((s) => ({ ...s })),
    reportingPeriod: {
      start: input.reportingPeriodStart,
      end: input.reportingPeriodEnd,
    },
    status: 'structure_generated',
  };
}
