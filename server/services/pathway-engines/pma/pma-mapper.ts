/**
 * PMA (FDA Premarket Approval) readiness mapper — Class III device pathway.
 *
 * Projects canonical submission content onto the FDA PMA structure and reports
 * completeness, so a sponsor sees PMA filing readiness (the administrative + core
 * technical gate) before assembling. This closes the "PMA is a stub" gap from the
 * device/IVD audit: PMA had a generic document drafter but no structured readiness
 * mapper analogous to the eSTAR one.
 *
 * Scope: structure + readiness only. PMA is filed on eCTD/eSTAR rails; the actual
 * package assembly is the eCTD path (out of scope here, like estar-mapper which is
 * complemented by the form-fill route). This module is the "is it complete?" check.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network, no LLM. A
 * section with no matching source leaf is a gap, never invented.
 *
 * @module server/services/pathway-engines/pma/pma-mapper
 */

export type PmaSubmissionType = 'original' | 'panel_track_supplement' | '180_day_supplement' | 'real_time_supplement';

export interface PmaInputLeaf {
  sectionCode: string;
  title: string;
  documentType?: string;
}

export interface PmaSlot {
  /** Stable id for the PMA section. */
  id: string;
  /** Human-readable label (aligned to FDA PMA module structure). */
  label: string;
  /** FDA PMA module number (1–10) for traceability. */
  module: number;
  required: boolean;
}

export interface PmaSlotStatus extends PmaSlot {
  present: boolean;
  sources: string[];
}

export interface PmaResult {
  submissionType: PmaSubmissionType;
  sections: PmaSlotStatus[];
  summary: { missingRequired: string[]; ready: boolean; completeness: number };
}

type Matcher = (l: PmaInputLeaf) => boolean;
const dt = (...t: string[]): Matcher => (l) => !!l.documentType && t.includes(l.documentType);
const ti = (...n: string[]): Matcher => (l) => n.some((x) => l.title.toLowerCase().includes(x));
const any = (...m: Matcher[]): Matcher => (l) => m.some((f) => f(l));

// FDA PMA structure (21 CFR 814.20). Module numbers per the conventional PMA
// 10-module layout. Required = the core of a fileable original PMA; the rest are
// conditionally required and modeled as optional here so readiness is honest.
const PMA_SLOTS: Array<PmaSlot & { match: Matcher }> = [
  { id: 'admin-regulatory', module: 1, label: 'Administrative & regulatory information (cover, 814.20 checklist)', required: true, match: any(dt('cover_letter', 'administrative', 'regulatory_info'), ti('cover letter', 'administrative', 'table of contents')) },
  { id: 'device-description', module: 2, label: 'Device description & indications for use', required: true, match: any(dt('device_description', 'indications_for_use'), ti('device description', 'indications for use')) },
  { id: 'manufacturing', module: 3, label: 'Manufacturing information (QSR / 820)', required: true, match: any(dt('manufacturing', 'qsr', 'quality_system'), ti('manufacturing', 'quality system', 'qsr')) },
  { id: 'nonclinical', module: 4, label: 'Nonclinical laboratory studies (bench, animal, biocompatibility)', required: true, match: any(dt('nonclinical', 'bench_testing', 'biocompatibility', 'animal_study'), ti('nonclinical', 'bench', 'biocompatibility', 'animal stud')) },
  { id: 'clinical', module: 5, label: 'Clinical investigations (pivotal study, GCP)', required: true, match: any(dt('clinical_study', 'clinical_data', 'pivotal_study'), ti('clinical investigation', 'clinical study', 'pivotal')) },
  { id: 'labeling', module: 6, label: 'Proposed labeling', required: true, match: any(dt('labeling', 'labelling', 'label', 'ifu'), ti('labeling', 'instructions for use', 'proposed labeling')) },
  { id: 'ssed-summary', module: 7, label: 'Summary of safety and effectiveness data (SSED)', required: true, match: any(dt('ssed', 'safety_effectiveness_summary'), ti('safety and effectiveness', 'ssed')) },
  { id: 'statistical-analysis', module: 9, label: 'Statistical analysis plan & results', required: true, match: any(dt('statistical_analysis_plan', 'sap', 'biostatistics'), ti('statistical analysis', 'sap', 'biostatistic')) },
  { id: 'post-approval-study', module: 8, label: 'Post-approval study plan', required: false, match: any(dt('post_approval_study', 'pas'), ti('post-approval', 'post approval study')) },
  { id: 'references', module: 10, label: 'References & bibliography', required: false, match: any(dt('references', 'bibliography'), ti('references', 'bibliography')) },
];

function evalSlot(slot: PmaSlot & { match: Matcher }, leaves: PmaInputLeaf[]): PmaSlotStatus {
  const sources = leaves.filter((l) => slot.match(l)).map((l) => l.sectionCode || l.title);
  const { match, ...rest } = slot;
  return { ...rest, present: sources.length > 0, sources };
}

export interface MapToPmaInput {
  leaves: PmaInputLeaf[];
  submissionType?: PmaSubmissionType;
}

/** Map canonical leaves onto the FDA PMA section structure + completeness report. */
export function mapToPma(input: MapToPmaInput): PmaResult {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const submissionType = input.submissionType ?? 'original';
  const sections = PMA_SLOTS.map((s) => evalSlot(s, leaves));
  const requiredSections = sections.filter((s) => s.required);
  const missingRequired = requiredSections.filter((s) => !s.present).map((s) => s.id);
  const presentRequired = requiredSections.length - missingRequired.length;
  const completeness = requiredSections.length === 0 ? 0 : Math.round((presentRequired / requiredSections.length) * 100);
  return {
    submissionType,
    sections,
    summary: { missingRequired, ready: missingRequired.length === 0, completeness },
  };
}

export default { mapToPma };
