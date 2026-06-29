/**
 * PSUR (ICH E2C(R2)) and DSUR (ICH E2F) report structure generators.
 *
 * Pure/deterministic: returns the canonical section structures per the ICH
 * guidelines with reporting-period metadata. No DB, no network, no LLM.
 *
 * @module server/services/safety-reports/psur-dsur-structure
 */

export interface ReportSection {
  number: string;
  title: string;
  required: boolean;
  guidance: string;
}

export interface PsurStructureInput {
  productName: string;
  substanceName: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  marketingAuthorizations?: Array<{
    country: string;
    holderName: string;
    approvalDate: string;
  }>;
}

export interface DsurStructureInput {
  productName: string;
  substanceName: string;
  developmentPhase: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
}

export interface SafetyReportStructure {
  reportType: 'PSUR' | 'DSUR';
  guideline: string;
  productName: string;
  substanceName: string;
  reportingPeriod: { start: string; end: string };
  sections: ReportSection[];
  status: 'structure_generated';
}

const PSUR_SECTIONS: ReportSection[] = [
  { number: '1', title: 'Introduction', required: true, guidance: 'Identify the medicinal product(s), active substance, reporting interval, and IBD/RSI.' },
  { number: '2', title: 'Worldwide marketing authorization status', required: true, guidance: 'Table of all marketing authorizations (country, holder, date, status, withdrawals).' },
  { number: '3', title: 'Actions taken in the reporting interval for safety reasons', required: true, guidance: 'Regulatory or MAH-initiated actions (warnings, restrictions, recalls).' },
  { number: '4', title: 'Changes to reference safety information', required: true, guidance: 'Changes to the IBD/RSI during the interval.' },
  { number: '5', title: 'Estimated exposure and use patterns', required: true, guidance: 'Cumulative and interval patient-exposure estimates with method.' },
  { number: '6', title: 'Data in summary tabulations', required: true, guidance: 'Line-listing and SOC tabulations of serious and non-serious AEs from all sources.' },
  { number: '7', title: 'Summaries of significant findings from clinical trials', required: true, guidance: 'Completed/ongoing trial safety data relevant to benefit-risk.' },
  { number: '8', title: 'Findings from non-interventional studies', required: true, guidance: 'Observational studies, registries, active-surveillance data.' },
  { number: '9', title: 'Information from other clinical trials and sources', required: true, guidance: 'Publicly available safety data from other programs or literature.' },
  { number: '10', title: 'Non-clinical data', required: false, guidance: 'Relevant new non-clinical safety findings.' },
  { number: '11', title: 'Literature', required: true, guidance: 'Published case reports and safety reviews.' },
  { number: '12', title: 'Other periodic reports', required: false, guidance: 'Cross-reference to other periodic reports (RMP, REMS).' },
  { number: '13', title: 'Lack of efficacy in controlled clinical trials', required: false, guidance: 'Only when efficacy loss has safety implications.' },
  { number: '14', title: 'Late-breaking information', required: false, guidance: 'Significant safety information received after data lock.' },
  { number: '15', title: 'Overview of signals: new, ongoing, and closed', required: true, guidance: 'Comprehensive signal tracking with evaluation status.' },
  { number: '16', title: 'Signal and risk evaluation', required: true, guidance: 'Detailed evaluation of each signal identified.' },
  { number: '17', title: 'Benefit evaluation', required: true, guidance: 'Summary of efficacy/effectiveness data supporting benefit.' },
  { number: '18', title: 'Integrated benefit-risk analysis for authorized indications', required: true, guidance: 'Structured B/R assessment per the ICH E2C(R2) framework.' },
  { number: '19', title: 'Conclusions and actions', required: true, guidance: 'Overall conclusions + proposed/initiated actions.' },
];

const DSUR_SECTIONS: ReportSection[] = [
  { number: '1', title: 'Executive summary', required: true, guidance: 'One-page overview of significant safety findings and actions.' },
  { number: '2', title: 'Introduction', required: true, guidance: 'Product, IB edition, development phase, reporting interval.' },
  { number: '3', title: 'Worldwide marketing authorization status', required: true, guidance: 'Marketed jurisdictions (if any) and development status.' },
  { number: '4', title: 'Update on actions taken for safety reasons', required: true, guidance: 'Regulatory or sponsor actions during the interval.' },
  { number: '5', title: 'Update on safety reference information', required: true, guidance: 'IB changes; RSI revisions during the interval.' },
  { number: '6', title: 'Inventory of ongoing and completed clinical trials', required: true, guidance: 'Table of all trials with status, enrollment, sites.' },
  { number: '7', title: 'Estimated cumulative subject exposure', required: true, guidance: 'Cumulative exposure from all clinical trials (subjects, person-years).' },
  { number: '8', title: 'Data in line listings and aggregate summary tabulations', required: true, guidance: 'Serious AE line listings + SOC tabulations from all trials.' },
  { number: '9', title: 'Significant findings from clinical trials during the reporting period', required: true, guidance: 'Completed/ongoing trial findings with safety relevance.' },
  { number: '10', title: 'Safety findings from non-interventional studies', required: false, guidance: 'Observational data, registries if available.' },
  { number: '11', title: 'Other safety information', required: true, guidance: 'Published reports, animal data, in-vitro findings.' },
  { number: '12', title: 'Summary of important risks', required: true, guidance: 'List of identified and potential risks from the development program.' },
  { number: '13', title: 'Summary of important efficacy/effectiveness findings', required: false, guidance: 'When relevant to overall B/R assessment.' },
  { number: '14', title: 'Late-breaking information', required: false, guidance: 'Significant data received after data lock.' },
  { number: '15', title: 'Overall safety assessment', required: true, guidance: 'Integrated safety evaluation across the development program.' },
  { number: '16', title: 'Conclusion', required: true, guidance: 'Conclusions on B/R and proposed changes to IB or trial conduct.' },
];

export function generatePsurStructure(input: PsurStructureInput): SafetyReportStructure {
  if (!input?.productName) throw new Error('productName is required');
  if (!input?.substanceName) throw new Error('substanceName is required');
  if (!input?.reportingPeriodStart || !input?.reportingPeriodEnd) {
    throw new Error('reportingPeriodStart and reportingPeriodEnd are required');
  }
  return {
    reportType: 'PSUR',
    guideline: 'ICH E2C(R2)',
    productName: input.productName,
    substanceName: input.substanceName,
    reportingPeriod: { start: input.reportingPeriodStart, end: input.reportingPeriodEnd },
    sections: PSUR_SECTIONS,
    status: 'structure_generated',
  };
}

export function generateDsurStructure(input: DsurStructureInput): SafetyReportStructure {
  if (!input?.productName) throw new Error('productName is required');
  if (!input?.substanceName) throw new Error('substanceName is required');
  if (!input?.reportingPeriodStart || !input?.reportingPeriodEnd) {
    throw new Error('reportingPeriodStart and reportingPeriodEnd are required');
  }
  return {
    reportType: 'DSUR',
    guideline: 'ICH E2F',
    productName: input.productName,
    substanceName: input.substanceName,
    reportingPeriod: { start: input.reportingPeriodStart, end: input.reportingPeriodEnd },
    sections: DSUR_SECTIONS,
    status: 'structure_generated',
  };
}
