/**
 * Device Submission Registry — Section structures for FDA device submissions.
 *
 * Covers: 510(k), PMA, De Novo, CER (EU MDR)
 * Same pattern as IND Section Registry.
 *
 * @module server/services/device/device-section-registry
 */

export interface DeviceSection {
  code: string;
  title: string;
  submissionType: '510K' | 'PMA' | 'DE_NOVO' | 'CER';
  required: boolean;
  contentType: 'narrative' | 'table' | 'form' | 'data' | 'list' | 'mixed';
  guidance: string;
  generationPrompt: string;
  wordCountRange?: [number, number];
}

const SECTIONS_510K: DeviceSection[] = [
  { code: '510K.1', title: 'Cover Letter', submissionType: '510K', required: true, contentType: 'narrative', guidance: '21 CFR 807.87', generationPrompt: 'Generate a 510(k) cover letter for {{DEVICE_NAME}}. Include applicant info, device trade name, predicate device, and submission purpose.', wordCountRange: [300, 600] },
  { code: '510K.2', title: 'Indications for Use', submissionType: '510K', required: true, contentType: 'form', guidance: '21 CFR 807.87(e)', generationPrompt: 'Draft the Indications for Use statement for {{DEVICE_NAME}}. Include device name, indications, patient population, and use type.', wordCountRange: [200, 500] },
  { code: '510K.3', title: '510(k) Summary', submissionType: '510K', required: true, contentType: 'narrative', guidance: '21 CFR 807.92', generationPrompt: 'Draft the 510(k) Summary for {{DEVICE_NAME}}. Include device description, predicate comparison, technological characteristics, and SE conclusions.', wordCountRange: [1000, 3000] },
  { code: '510K.4', title: 'Device Description', submissionType: '510K', required: true, contentType: 'mixed', guidance: '21 CFR 807.87(d)', generationPrompt: 'Draft the Device Description for {{DEVICE_NAME}}. Include physical description, principles of operation, materials, components, and sterilization.', wordCountRange: [1000, 3000] },
  { code: '510K.5', title: 'Substantial Equivalence Comparison', submissionType: '510K', required: true, contentType: 'table', guidance: '21 CFR 807.87(f)', generationPrompt: 'Create SE comparison table for {{DEVICE_NAME}} vs predicate. Compare intended use, technology, design, materials, and performance.', wordCountRange: [1500, 5000] },
  { code: '510K.6', title: 'Performance Testing — Bench', submissionType: '510K', required: true, contentType: 'mixed', guidance: 'FDA Guidance: Content of Premarket Submissions', generationPrompt: 'Draft bench performance testing for {{DEVICE_NAME}}. Include test objectives, methods, acceptance criteria, results, and conclusions.', wordCountRange: [2000, 8000] },
  { code: '510K.7', title: 'Biocompatibility', submissionType: '510K', required: true, contentType: 'mixed', guidance: 'ISO 10993-1', generationPrompt: 'Draft biocompatibility evaluation for {{DEVICE_NAME}}. Include material characterization, contact categorization, endpoint testing, and risk assessment.', wordCountRange: [1000, 3000] },
  { code: '510K.8', title: 'Software Documentation', submissionType: '510K', required: false, contentType: 'mixed', guidance: 'FDA Software Guidance', generationPrompt: 'Draft software documentation for {{DEVICE_NAME}}. Include level of concern, architecture, hazard analysis, V&V, and cybersecurity.', wordCountRange: [2000, 8000] },
  { code: '510K.9', title: 'Labeling', submissionType: '510K', required: true, contentType: 'mixed', guidance: '21 CFR 801', generationPrompt: 'Draft labeling for {{DEVICE_NAME}}. Include device label, IFU, package insert, and required warnings.', wordCountRange: [1000, 5000] },
  { code: '510K.10', title: 'Sterilization and Shelf Life', submissionType: '510K', required: false, contentType: 'mixed', guidance: 'FDA Shelf Life Guidance', generationPrompt: 'Draft sterilization validation and shelf life data for {{DEVICE_NAME}}. Include method, SAL, packaging integrity, and aging results.', wordCountRange: [1000, 3000] },
];

const SECTIONS_PMA: DeviceSection[] = [
  { code: 'PMA.1', title: 'Cover Letter', submissionType: 'PMA', required: true, contentType: 'narrative', guidance: '21 CFR 814.20', generationPrompt: 'Generate PMA cover letter for {{DEVICE_NAME}}.', wordCountRange: [500, 1000] },
  { code: 'PMA.2', title: 'Device Description', submissionType: 'PMA', required: true, contentType: 'mixed', guidance: '21 CFR 814.20(b)(3)', generationPrompt: 'Draft comprehensive device description for {{DEVICE_NAME}} PMA.', wordCountRange: [2000, 5000] },
  { code: 'PMA.3', title: 'Indications for Use', submissionType: 'PMA', required: true, contentType: 'narrative', guidance: '21 CFR 814.20(b)(3)', generationPrompt: 'Draft indications for use for {{DEVICE_NAME}} PMA.', wordCountRange: [300, 800] },
  { code: 'PMA.4', title: 'Manufacturing Information', submissionType: 'PMA', required: true, contentType: 'mixed', guidance: '21 CFR 814.20(b)(4)', generationPrompt: 'Draft manufacturing information for {{DEVICE_NAME}} PMA. Include QMS, process controls, and testing.', wordCountRange: [2000, 6000] },
  { code: 'PMA.5', title: 'Nonclinical Laboratory Studies', submissionType: 'PMA', required: true, contentType: 'mixed', guidance: '21 CFR 814.20(b)(6)', generationPrompt: 'Draft nonclinical studies for {{DEVICE_NAME}} PMA. Include bench testing, biocompatibility, sterilization, and software V&V.', wordCountRange: [3000, 10000] },
  { code: 'PMA.6', title: 'Clinical Investigations', submissionType: 'PMA', required: true, contentType: 'mixed', guidance: '21 CFR 814.20(b)(6)', generationPrompt: 'Draft clinical investigation section for {{DEVICE_NAME}} PMA. Include pivotal study protocol, results, and statistical analysis.', wordCountRange: [5000, 20000] },
  { code: 'PMA.7', title: 'Labeling', submissionType: 'PMA', required: true, contentType: 'mixed', guidance: '21 CFR 814.20(b)(10)', generationPrompt: 'Draft proposed labeling for {{DEVICE_NAME}} PMA.', wordCountRange: [2000, 5000] },
  { code: 'PMA.8', title: 'Summary of Safety and Effectiveness', submissionType: 'PMA', required: true, contentType: 'narrative', guidance: '21 CFR 814.20(b)(3)', generationPrompt: 'Draft SSED for {{DEVICE_NAME}} PMA. Include device description, indications, contraindications, adverse events, and benefit-risk.', wordCountRange: [3000, 8000] },
];

const SECTIONS_CER: DeviceSection[] = [
  { code: 'CER.1', title: 'Executive Summary', submissionType: 'CER', required: true, contentType: 'narrative', guidance: 'MEDDEV 2.7/1 Rev 4', generationPrompt: 'Draft CER executive summary for {{DEVICE_NAME}}.', wordCountRange: [500, 1500] },
  { code: 'CER.2', title: 'Scope of Clinical Evaluation', submissionType: 'CER', required: true, contentType: 'narrative', guidance: 'MEDDEV 2.7/1 Rev 4', generationPrompt: 'Draft CER scope for {{DEVICE_NAME}}. Include intended purpose, patient population, and clinical claims.', wordCountRange: [1000, 3000] },
  { code: 'CER.3', title: 'Clinical Background', submissionType: 'CER', required: true, contentType: 'narrative', guidance: 'MEDDEV 2.7/1 Rev 4', generationPrompt: 'Draft clinical background for {{DEVICE_NAME}} CER. Include disease overview and state of the art.', wordCountRange: [2000, 5000] },
  { code: 'CER.4', title: 'Literature Review', submissionType: 'CER', required: true, contentType: 'mixed', guidance: 'MEDDEV 2.7/1 Rev 4', generationPrompt: 'Draft literature review for {{DEVICE_NAME}} CER. Include search strategy, PRISMA, and appraisal.', wordCountRange: [3000, 10000] },
  { code: 'CER.5', title: 'Clinical Investigations', submissionType: 'CER', required: false, contentType: 'mixed', guidance: 'MEDDEV 2.7/1 Rev 4', generationPrompt: 'Draft clinical investigation evidence for {{DEVICE_NAME}} CER.', wordCountRange: [2000, 8000] },
  { code: 'CER.6', title: 'Benefit-Risk Analysis', submissionType: 'CER', required: true, contentType: 'narrative', guidance: 'EU MDR 2017/745 Article 61', generationPrompt: 'Draft benefit-risk analysis for {{DEVICE_NAME}} CER per EU MDR.', wordCountRange: [2000, 5000] },
  { code: 'CER.7', title: 'Conclusions', submissionType: 'CER', required: true, contentType: 'narrative', guidance: 'MEDDEV 2.7/1 Rev 4', generationPrompt: 'Draft CER conclusions for {{DEVICE_NAME}}. Include GSPR conformity and PMCF requirements.', wordCountRange: [500, 1500] },
  { code: 'CER.8', title: 'PMCF Plan', submissionType: 'CER', required: true, contentType: 'mixed', guidance: 'EU MDR Annex XIV Part B', generationPrompt: 'Draft PMCF plan for {{DEVICE_NAME}}. Include objectives, activities, acceptance criteria, and timelines.', wordCountRange: [1500, 4000] },
];

const SECTIONS_DE_NOVO: DeviceSection[] = [
  { code: 'DN.1', title: 'Cover Letter', submissionType: 'DE_NOVO', required: true, contentType: 'narrative', guidance: '21 CFR 860.260', generationPrompt: 'Generate De Novo cover letter for {{DEVICE_NAME}}.', wordCountRange: [500, 1000] },
  { code: 'DN.2', title: 'Device Description', submissionType: 'DE_NOVO', required: true, contentType: 'mixed', guidance: '21 CFR 860.260(b)', generationPrompt: 'Draft device description for {{DEVICE_NAME}} De Novo. Explain why no predicate exists.', wordCountRange: [1500, 4000] },
  { code: 'DN.3', title: 'Proposed Classification and Controls', submissionType: 'DE_NOVO', required: true, contentType: 'narrative', guidance: '21 CFR 860.260(c)', generationPrompt: 'Draft proposed classification for {{DEVICE_NAME}} De Novo. Include class, special controls, and rationale.', wordCountRange: [1000, 3000] },
  { code: 'DN.4', title: 'Risk Analysis', submissionType: 'DE_NOVO', required: true, contentType: 'mixed', guidance: 'FDA De Novo Guidance', generationPrompt: 'Draft risk analysis for {{DEVICE_NAME}} De Novo. Include risks, mitigations, and residual risk.', wordCountRange: [2000, 5000] },
  { code: 'DN.5', title: 'Performance Testing', submissionType: 'DE_NOVO', required: true, contentType: 'mixed', guidance: '21 CFR 860.260(d)', generationPrompt: 'Draft performance testing for {{DEVICE_NAME}} De Novo.', wordCountRange: [3000, 10000] },
  { code: 'DN.6', title: 'Labeling', submissionType: 'DE_NOVO', required: true, contentType: 'mixed', guidance: '21 CFR 801', generationPrompt: 'Draft labeling for {{DEVICE_NAME}} De Novo.', wordCountRange: [1000, 3000] },
];

export const ALL_DEVICE_SECTIONS: DeviceSection[] = [
  ...SECTIONS_510K, ...SECTIONS_PMA, ...SECTIONS_CER, ...SECTIONS_DE_NOVO,
];

export function getDeviceSections(type: '510K' | 'PMA' | 'DE_NOVO' | 'CER'): DeviceSection[] {
  return ALL_DEVICE_SECTIONS.filter(s => s.submissionType === type);
}

export function getDeviceSectionByCode(code: string): DeviceSection | undefined {
  return ALL_DEVICE_SECTIONS.find(s => s.code === code);
}

export function getDeviceGenerationPrompt(code: string, context: { deviceName?: string }): string {
  const section = getDeviceSectionByCode(code);
  if (!section) return '';
  let prompt = section.generationPrompt;
  prompt = prompt.replace(/\{\{DEVICE_NAME\}\}/g, context.deviceName || '[Device Name]');
  return `You are a regulatory affairs expert specializing in medical device submissions. ${prompt}\n\nWrite in formal regulatory language. Reference: ${section.guidance}.`;
}

export default ALL_DEVICE_SECTIONS;
