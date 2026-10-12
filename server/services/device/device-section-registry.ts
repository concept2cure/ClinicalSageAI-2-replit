/**
 * Device Submission Registry — section outlines for device submissions.
 *
 * Covers: 510(k), PMA, De Novo, and the EU CER (MDR) and PER (IVDR).
 * Same pattern as IND Section Registry.
 *
 * The CER and PER outlines are NOT held here. They are projections of the
 * canonical records (record step g-device-chat-cer-per-projection, 2026-10-05):
 *  - CER → CER_SECTIONS, server/services/market-specs/cer-structure.ts;
 *  - IVDR → PER_SECTIONS, server/services/market-specs/per-structure.ts.
 * Before, this file kept its own 8-section SECTIONS_CER (no equivalence,
 * appraisal, evaluator qualification or references, and the PMCF plan filed as
 * CER section 8), and 'IVDR' had no outline at all. That list is deleted.
 *
 * A projected section's code is keyed on the record's section id
 * (`CER.appraisal`, `PER.analytical_performance`), not its number: the retired
 * codes CER.1–CER.8 named different sections, and an artifact saved under one
 * of them must not be read as a drafted section of this outline.
 *
 * @module server/services/device/device-section-registry
 */

import { CER_SECTIONS } from '../market-specs/cer-structure.js';
import { PER_SECTIONS } from '../market-specs/per-structure.js';

export const DEVICE_SUBMISSION_TYPES = ['510K', 'PMA', 'DE_NOVO', 'CER', 'IVDR'] as const;
export type DeviceSubmissionType = (typeof DEVICE_SUBMISSION_TYPES)[number];

export function isDeviceSubmissionType(value: unknown): value is DeviceSubmissionType {
  return typeof value === 'string' && (DEVICE_SUBMISSION_TYPES as readonly string[]).includes(value);
}

export interface DeviceSection {
  code: string;
  title: string;
  submissionType: DeviceSubmissionType;
  required: boolean;
  /** Absent for the CER/PER projections: the canonical records do not say. */
  contentType?: 'narrative' | 'table' | 'form' | 'data' | 'list' | 'mixed';
  guidance: string;
  generationPrompt: string;
  wordCountRange?: [number, number];
  /** The condition under which a non-required section applies (e.g. equivalence claimed). */
  appliesWhen?: string;
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

const SECTIONS_DE_NOVO: DeviceSection[] = [
  { code: 'DN.1', title: 'Cover Letter', submissionType: 'DE_NOVO', required: true, contentType: 'narrative', guidance: '21 CFR 860.260', generationPrompt: 'Generate De Novo cover letter for {{DEVICE_NAME}}.', wordCountRange: [500, 1000] },
  { code: 'DN.2', title: 'Device Description', submissionType: 'DE_NOVO', required: true, contentType: 'mixed', guidance: '21 CFR 860.260(b)', generationPrompt: 'Draft device description for {{DEVICE_NAME}} De Novo. Explain why no predicate exists.', wordCountRange: [1500, 4000] },
  { code: 'DN.3', title: 'Proposed Classification and Controls', submissionType: 'DE_NOVO', required: true, contentType: 'narrative', guidance: '21 CFR 860.260(c)', generationPrompt: 'Draft proposed classification for {{DEVICE_NAME}} De Novo. Include class, special controls, and rationale.', wordCountRange: [1000, 3000] },
  { code: 'DN.4', title: 'Risk Analysis', submissionType: 'DE_NOVO', required: true, contentType: 'mixed', guidance: 'FDA De Novo Guidance', generationPrompt: 'Draft risk analysis for {{DEVICE_NAME}} De Novo. Include risks, mitigations, and residual risk.', wordCountRange: [2000, 5000] },
  { code: 'DN.5', title: 'Performance Testing', submissionType: 'DE_NOVO', required: true, contentType: 'mixed', guidance: '21 CFR 860.260(d)', generationPrompt: 'Draft performance testing for {{DEVICE_NAME}} De Novo.', wordCountRange: [3000, 10000] },
  { code: 'DN.6', title: 'Labeling', submissionType: 'DE_NOVO', required: true, contentType: 'mixed', guidance: '21 CFR 801', generationPrompt: 'Draft labeling for {{DEVICE_NAME}} De Novo.', wordCountRange: [1000, 3000] },
];

/** CER_SECTIONS projected into the DeviceSection shape. Nothing is restated. */
const CER_PROJECTION: DeviceSection[] = CER_SECTIONS.map((s) => ({
  code: `CER.${s.id}`,
  title: s.title,
  submissionType: 'CER',
  required: s.required,
  guidance: s.purpose,
  generationPrompt: `Draft the "${s.title}" section of the Clinical Evaluation Report for {{DEVICE_NAME}}. ${s.purpose}`,
  ...(s.equivalenceOnly ? { appliesWhen: 'only when equivalence is claimed' } : {}),
}));

/** PER_SECTIONS projected into the DeviceSection shape. Nothing is restated. */
const PER_PROJECTION: DeviceSection[] = PER_SECTIONS.map((s) => ({
  code: `PER.${s.id}`,
  title: s.title,
  submissionType: 'IVDR',
  required: s.required,
  guidance: s.purpose,
  generationPrompt: `Draft the "${s.title}" section of the Performance Evaluation Report for {{DEVICE_NAME}}. ${s.purpose}`,
}));

export const ALL_DEVICE_SECTIONS: DeviceSection[] = [
  ...SECTIONS_510K, ...SECTIONS_PMA, ...CER_PROJECTION, ...PER_PROJECTION, ...SECTIONS_DE_NOVO,
];

export function getDeviceSections(type: DeviceSubmissionType): DeviceSection[] {
  return ALL_DEVICE_SECTIONS.filter(s => s.submissionType === type);
}

/**
 * What each type's outline is. CER and IVDR are single documents of a larger
 * technical file, and the chat block says so rather than calling them the
 * whole submission.
 */
const OUTLINE_INTRO: Record<DeviceSubmissionType, string> = {
  '510K': 'This is a 510K medical device submission project.',
  PMA: 'This is a PMA medical device submission project.',
  DE_NOVO: 'This is a DE_NOVO medical device submission project.',
  CER:
    'This is an EU MDR clinical evaluation project. The outline below is the clinical evaluation report (CER); it is not the full MDR technical documentation.',
  IVDR:
    'This is an EU IVDR performance evaluation project. The outline below is the performance evaluation report (PER); it is not the full IVDR technical documentation.',
};

function sectionStatusLabel(s: DeviceSection): string {
  if (s.appliesWhen) return s.appliesWhen;
  return s.required ? 'required' : 'optional';
}

/**
 * The device block injected into AnA's chat prompt (send-message.ts). Empty for
 * a type this registry has no outline for.
 */
export function renderDeviceContextBlock(type: string, ctx: { activeProject?: string } = {}): string {
  if (!isDeviceSubmissionType(type)) return '';
  const sections = getDeviceSections(type);
  if (sections.length === 0) return '';
  const sectionList = sections
    .map((s) => `- ${s.code} ${s.title} (${sectionStatusLabel(s)}) — ${s.guidance}`)
    .join('\n');
  const requiredCount = sections.filter((s) => s.required).length;
  return `\n\n## ${type} Submission Context\n${OUTLINE_INTRO[type]}\n${ctx.activeProject ? `Project: ${ctx.activeProject}` : ''}\n\nRequired sections (${requiredCount} required, ${sections.length} total):\n${sectionList}\n\nUse the generate_document tool to draft any section. Guide the user through the submission systematically.\n`;
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
