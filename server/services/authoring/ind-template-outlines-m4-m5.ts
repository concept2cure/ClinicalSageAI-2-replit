/** Working headings from existing nonclinical, E3 and M11 records. No study
 * facts, model execution or additional CTD filing positions are created. */
import type { INDSection } from '../../../services/regulatory/ind-ectd-sections';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { ICH_M11_PROTOCOL_BASIS, ICH_M11_PROTOCOL_LIMITATIONS, ICH_M11_PROTOCOL_SECTIONS } from '../../../shared/regulatory/protocol-m11';
import { e3BasisFor, e3SectionSummary, e3SectionDraftingMode, ICH_E3_GUIDANCE } from '../ind/ctd/csr-e3-guidance';
import type { E3Section } from '../ind/ctd/types';
import { NONCLINICAL_STUDY_REPORT_STRUCTURE } from './nonclinical-study-report-structure';
import type { IndTemplateOutlineSection } from './ind-template-types';

const FACT_LIMIT = 'Populate from verified sponsor source records. Do not invent study findings, identifiers, signatures or GLP/GCP compliance. Retain original reports and datasets.';
const LOCAL_LIMIT = 'This is a document-local working heading, not a CTD filing node or a completeness verdict.';

interface HeadingInput { title: string; guidance: string; checklist: string[]; pitfalls: string[]; reference: string; refs?: string[]; drafting_mode?: 'narrative' | 'manual' }
function heading(section: INDSection, ordinal: number, input: HeadingInput): IndTemplateOutlineSection {
  const { title, guidance, checklist, pitfalls, reference, refs = [] } = input;
  return { code: `${section.code}:work:${ordinal}`, title, content: '', ordering: ordinal,
    guidance: { ...(input.drafting_mode ? { drafting_mode: input.drafting_mode } : {}), guidance_text: `${guidance} ${FACT_LIMIT} ${LOCAL_LIMIT}`,
      regulatory_references: [...new Set([section.regulatoryRef, ...refs].filter(Boolean))],
      compliance_checklist: checklist, common_pitfalls: pitfalls,
      source_reference: reference } };
}

function nonclinical(section: INDSection): IndTemplateOutlineSection[] {
  return NONCLINICAL_STUDY_REPORT_STRUCTURE.map((row, i) => heading(section, i + 1, {
    title: row.title,
    guidance: `The platform's recorded nonclinical study-report structure calls for: ${row.description}. Apply this to ${section.title} only where supported by the original study.`,
    checklist: row.requires.map(field => `Verify the recorded ${field.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)} against the original study report.`),
    pitfalls: ['Treating a missing result or unverified GLP statement as established.', 'Replacing signed original study reports or raw datasets with this working outline.'],
    reference: 'server/services/authoring/nonclinical-study-report-structure.ts', refs: ['ICH M4S; confirm current study-specific guidance'] }));
}

function clinicalReport(section: INDSection, records: readonly E3Section[] = ICH_E3_GUIDANCE): IndTemplateOutlineSection[] {
  return records.map((row, i) => heading(section, i + 1, { title: `${row.number} ${row.title}`,
    drafting_mode: e3SectionDraftingMode(row.number),
    guidance: `${e3SectionSummary(row)} Applicability: ${row.applies}; verify the study-specific requirement before finalisation.`,
    checklist: [...(row.contains ?? []), ...(row.sources ?? []).map(source => `Verify source records (platform practice): ${source}`), ...(row.presentation ?? [])],
    pitfalls: [...(row.pitfalls ?? []), 'Reporting planned analyses as observed results, or drawing conclusions unsupported by the source records.'],
    reference: `server/services/ind/ctd/csr-e3-guidance.ts#${row.number}`,
    refs: e3BasisFor(row).map(basis => `${basis.ref} (${basis.confidence})`) }));
}

function protocol(section: INDSection): IndTemplateOutlineSection[] {
  return ICH_M11_PROTOCOL_SECTIONS.map((row, i) => heading(section, i + 1, {
    title: row.number ? `${row.number} ${row.title}` : row.title,
    guidance: `${row.purpose} Retaining a heading does not establish applicability of its content to this trial.`,
    checklist: ['Reconcile with the current sponsor protocol version and approved trial design.', 'Confirm current agency and country implementation and source-template details.'],
    pitfalls: i === 0 ? [...ICH_M11_PROTOCOL_LIMITATIONS] : ['Treating retained M11 headings as completed trial content or filing approval.'],
    reference: `shared/regulatory/protocol-m11.ts#${row.code}`, refs: [ICH_M11_PROTOCOL_BASIS.ref] }));
}

function sourceReview(section: INDSection): IndTemplateOutlineSection[] {
  const rows = [
    ['Original source inventory', 'Record the original source identities, versions, dates, study identifiers and exact CTD association.'],
    ['Applicability and completeness', `${section.description} Identify applicable reports or data, missing source records and justified exclusions.`],
    ['Verified extraction and reconciliation', 'Check any extracted text, tables and references against the original. Preserve data definitions, units and source traceability.'],
    ['Review and outstanding actions', 'Record discrepancies and required actions for the responsible reviewer; obtain required signatures and approvals through their governed source workflow.'],
  ];
  return rows.map(([title, guidance], i) => heading(section, i + 1, { title, guidance,
    checklist: ['Retain the original source and identify its current verified version.', 'Distinguish reviewed evidence from evidence that could not be read or verified.'],
    pitfalls: ['Treating a preparation worksheet as an official form, dataset, signed report or readiness decision.'],
    reference: `services/regulatory/ind-ectd-sections.ts#${section.code}` }));
}

function previousExperience(section: INDSection): IndTemplateOutlineSection[] {
  const rows = [
    ['Scope and source inventory', 'Identify countries, indications, products, study reports and source versions for the actual previous human experience.'],
    ['Investigational experience', 'Summarise prior clinical investigations from verified study reports and identify limits in the available evidence.'],
    ['Marketing experience', 'Describe actual marketing experience by territory and date only when the sponsor records establish it.'],
    ['Safety, effectiveness and withdrawals', 'Reconcile known safety and effectiveness findings, withdrawals and restrictions with the underlying records. Do not imply the absence of a concern from missing evidence.'],
    ['Relevance to the proposed investigation', 'Explain implications for the proposed study using the clinical and nonclinical evidence, with uncertainty stated.'],
    ['Source records and references', 'Link each factual claim to the exact supporting report or published literature; preserve originals and name evidence gaps.'],
  ];
  return rows.map(([title, guidance], i) => heading(section, i + 1, { title, guidance,
    checklist: ['Reconcile with the Clinical Overview and current sponsor safety records.'],
    pitfalls: ['Inventing previous exposure, marketed status, withdrawals or safety conclusions.'],
    reference: `services/regulatory/ind-ectd-sections.ts#${section.code}`, refs: ['21 CFR 312.23(a)(9); ICH M4E 5.3.5.4'] }));
}

/** The composer adds the canonical root; returned identifiers are local work headings. */
export function buildModule4Or5Outline(section: INDSection): IndTemplateOutlineSection[] {
  if (section.module === 'M4') return nonclinical(section);
  if (section.module !== 'M5') return [];
  if (/\bprotocol\b/i.test(section.title)) return protocol(section);
  const code = normalizeCtdCode(section.code);
  if (code === '5.3.5.1' || code === '5.3.5.2') return clinicalReport(section);
  if (code === '5.3.5.3') {
    const numbers = new Set(['1', '7', '9.7', '11.1', '11.4', '12', '13', '14', '15', '16']);
    return clinicalReport(section, ICH_E3_GUIDANCE.filter(row => numbers.has(row.number)));
  }
  if (code === '5.3.5.4') return previousExperience(section);
  return sourceReview(section);
}
