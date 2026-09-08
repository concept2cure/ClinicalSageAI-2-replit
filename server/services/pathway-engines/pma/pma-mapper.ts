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

/**
 * The full FDA PMA application + supplement taxonomy (21 CFR 814). `original` is a
 * new PMA; the rest are the supplement/notice types a sponsor files against an
 * approved PMA. The `30_day_notice` and `135_day_supplement` types complete the
 * set that was previously missing.
 */
export type PmaSubmissionType =
  | 'original'
  | 'panel_track_supplement'
  | '180_day_supplement'
  | 'real_time_supplement'
  | '30_day_notice'
  | '135_day_supplement';

export interface PmaSubmissionTypeInfo {
  value: PmaSubmissionType;
  label: string;
  description: string;
  /** FDA review clock in days where FDA publishes one; undefined when meeting-based. */
  reviewGoalDays?: number;
  regulatoryRef: string;
}

/** Metadata for every PMA application/supplement type, in lifecycle order. */
export const PMA_SUBMISSION_TYPES: PmaSubmissionTypeInfo[] = [
  {
    value: 'original',
    label: 'Original PMA',
    description: 'New premarket approval application establishing safety and effectiveness for a Class III device.',
    reviewGoalDays: 180,
    regulatoryRef: '21 CFR 814.20; Section 515 FD&C Act',
  },
  {
    value: 'panel_track_supplement',
    label: 'Panel-Track Supplement (PTS)',
    description: 'Significant change (e.g., new indication) needing new clinical data and often advisory-panel review.',
    reviewGoalDays: 180,
    regulatoryRef: '21 CFR 814.39',
  },
  {
    value: '180_day_supplement',
    label: '180-Day Supplement',
    description: 'Significant change in design, components, or labeling affecting safety/effectiveness, without a panel track.',
    reviewGoalDays: 180,
    regulatoryRef: '21 CFR 814.39(a)',
  },
  {
    value: 'real_time_supplement',
    label: 'Real-Time (RT) Supplement',
    description: 'Minor change to design, software, or labeling reviewed interactively in a real-time meeting.',
    regulatoryRef: '21 CFR 814.39(e); Real-Time PMA Supplements guidance',
  },
  {
    value: '30_day_notice',
    label: '30-Day Notice',
    description: 'Notice of a manufacturing-process/method change; effective 30 days after FDA receipt unless FDA acts.',
    reviewGoalDays: 30,
    regulatoryRef: '21 CFR 814.39(f); Section 515(d)(6) FD&C Act',
  },
  {
    value: '135_day_supplement',
    label: '135-Day Supplement',
    description: 'A 30-day notice FDA determines requires fuller review, reviewed on a 135-day clock.',
    reviewGoalDays: 135,
    regulatoryRef: '21 CFR 814.39(f); Section 515(d)(6) FD&C Act',
  },
];

/** Look up metadata for a PMA submission type. */
export function getPmaSubmissionTypeInfo(type: PmaSubmissionType): PmaSubmissionTypeInfo | undefined {
  return PMA_SUBMISSION_TYPES.find((t) => t.value === type);
}

/** True when the submission type is a supplement/notice against an approved PMA. */
export function isPmaSupplement(type: PmaSubmissionType): boolean {
  return type !== 'original';
}

export interface PmaInputLeaf {
  sectionCode: string;
  title: string;
  documentType?: string;
  /**
   * True only when this leaf carries real, finalized authored content — never a
   * draft/placeholder stub. A leaf whose title merely matches a section keyword
   * must NOT mark that section present unless it is also substantive: otherwise a
   * stub titled "Clinical investigation" containing "TBD" would flip a required
   * module — and `ready` — to true on an incomplete PMA. Required (not optional)
   * so every caller consciously decides this instead of it silently defaulting to
   * "present".
   */
  substantive?: boolean; // optional: undefined ⇒ NOT substantive (fail-closed)
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
/**
 * Match a leaf by its rule-pack section key. The governed pma:fda pack
 * (fda-pma-21cfr814-20-v1.0) keys its 21 CFR 814.20 tree by letter — A
 * administrative, B SSED, C device description, D manufacturing, F nonclinical,
 * G clinical (G.5 statistics), H labeling, I post-approval, K bibliography —
 * and a sponsor authors the LEAVES (A.3, G.1, G.5 …), not the folders. A
 * child's label ("Study protocols and amendments") does not name its module;
 * its key does, so a title-only matcher reported 'clinical' missing on a PMA
 * whose protocols were written. Anchored and case-sensitive: a legacy numeric
 * code ('1', '3') or a lower-case token never matches.
 */
const key = (...roots: string[]): Matcher => (l) => {
  const code = (l.sectionCode ?? '').trim();
  return roots.some((r) => code === r || code.startsWith(`${r}.`));
};

// FDA PMA structure (21 CFR 814.20). Module numbers per the conventional PMA
// 10-module layout. Required = the core of a fileable original PMA; the rest are
// conditionally required and modeled as optional here so readiness is honest.
const PMA_SLOTS: Array<PmaSlot & { match: Matcher }> = [
  { id: 'admin-regulatory', module: 1, label: 'Administrative & regulatory information (cover, 814.20 checklist)', required: true, match: any(key('A'), dt('cover_letter', 'administrative', 'regulatory_info'), ti('cover letter', 'administrative', 'table of contents')) },
  { id: 'device-description', module: 2, label: 'Device description & indications for use', required: true, match: any(key('C'), dt('device_description', 'indications_for_use'), ti('device description', 'indications for use')) },
  { id: 'manufacturing', module: 3, label: 'Manufacturing information (QSR / 820)', required: true, match: any(key('D'), dt('manufacturing', 'qsr', 'quality_system'), ti('manufacturing', 'quality system', 'qsr')) },
  { id: 'nonclinical', module: 4, label: 'Nonclinical laboratory studies (bench, animal, biocompatibility)', required: true, match: any(key('F'), dt('nonclinical', 'bench_testing', 'biocompatibility', 'animal_study'), ti('nonclinical', 'bench', 'biocompatibility', 'animal stud')) },
  { id: 'clinical', module: 5, label: 'Clinical investigations (pivotal study, GCP)', required: true, match: any(key('G'), dt('clinical_study', 'clinical_data', 'pivotal_study'), ti('clinical investigation', 'clinical study', 'pivotal')) },
  { id: 'labeling', module: 6, label: 'Proposed labeling', required: true, match: any(key('H'), dt('labeling', 'labelling', 'label', 'ifu'), ti('labeling', 'instructions for use', 'proposed labeling')) },
  { id: 'ssed-summary', module: 7, label: 'Summary of safety and effectiveness data (SSED)', required: true, match: any(key('B'), dt('ssed', 'safety_effectiveness_summary'), ti('safety and effectiveness', 'ssed')) },
  { id: 'statistical-analysis', module: 9, label: 'Statistical analysis plan & results', required: true, match: any(key('G.5'), dt('statistical_analysis_plan', 'sap', 'biostatistics'), ti('statistical analysis', 'sap', 'biostatistic')) },
  { id: 'post-approval-study', module: 8, label: 'Post-approval study plan', required: false, match: any(key('I.1'), dt('post_approval_study', 'pas'), ti('post-approval', 'post approval study')) },
  { id: 'references', module: 10, label: 'References & bibliography', required: false, match: any(key('K'), dt('references', 'bibliography'), ti('references', 'bibliography')) },
];

/**
 * Required sections PER submission type. An original PMA (21 CFR 814.20) carries
 * the full safety-and-effectiveness package; a supplement/notice (21 CFR 814.39)
 * need only contain the sections its change actually touches, so each type
 * requires a focused subset. Sections NOT listed for a type stay conditionally
 * required (present-if-applicable) — reported by the mapper but not blocking —
 * so readiness never OVERSTATES what a supplement owes (e.g. a 30-day
 * manufacturing notice is not gated on new clinical data).
 */
const REQUIRED_BY_TYPE: Record<PmaSubmissionType, readonly string[]> = {
  // Full package establishing safety & effectiveness (814.20).
  original: [
    'admin-regulatory', 'device-description', 'manufacturing', 'nonclinical',
    'clinical', 'labeling', 'ssed-summary', 'statistical-analysis',
  ],
  // Significant change needing NEW clinical data (+ often panel) (814.39).
  panel_track_supplement: [
    'admin-regulatory', 'device-description', 'clinical', 'ssed-summary',
    'statistical-analysis', 'labeling',
  ],
  // Significant design/component/labeling change, no panel (814.39(a)).
  '180_day_supplement': [
    'admin-regulatory', 'device-description', 'manufacturing', 'nonclinical', 'labeling',
  ],
  // Minor change reviewed interactively (814.39(e)).
  real_time_supplement: ['admin-regulatory', 'device-description', 'labeling'],
  // Manufacturing-process change notice (814.39(f)).
  '30_day_notice': ['admin-regulatory', 'manufacturing'],
  // 30-day notice escalated to fuller review (814.39(f)).
  '135_day_supplement': ['admin-regulatory', 'manufacturing', 'nonclinical'],
};

function evalSlot(slot: PmaSlot & { match: Matcher }, leaves: PmaInputLeaf[]): PmaSlotStatus {
  // A matched-but-non-substantive leaf (a draft/placeholder stub whose title
  // merely matches) never marks a required module present — only a matched leaf
  // that is ALSO substantive counts.
  const matched = leaves.filter((l) => slot.match(l));
  const present = matched.some((l) => l.substantive);
  const sources = matched.filter((l) => l.substantive).map((l) => l.sectionCode || l.title);
  const { match, ...rest } = slot;
  return { ...rest, present, sources };
}

export interface MapToPmaInput {
  leaves: PmaInputLeaf[];
  submissionType?: PmaSubmissionType;
}

/** Map canonical leaves onto the FDA PMA section structure + completeness report. */
export function mapToPma(input: MapToPmaInput): PmaResult {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const submissionType = input.submissionType ?? 'original';
  // Required-ness is per submission type (814.20 original vs 814.39 supplements);
  // override each slot's default flag with the type-specific profile.
  const requiredIds = new Set(REQUIRED_BY_TYPE[submissionType] ?? REQUIRED_BY_TYPE.original);
  const sections = PMA_SLOTS.map((s) => ({ ...evalSlot(s, leaves), required: requiredIds.has(s.id) }));
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

export default { mapToPma, PMA_SUBMISSION_TYPES, getPmaSubmissionTypeInfo, isPmaSupplement };
