/**
 * PreSTAR readiness mapper — FDA Early Submission Requests (the "third eSTAR").
 *
 * Projects canonical submission content onto the PreSTAR (PreSTAR2) section
 * structure for the early/pre-market request pathways and reports completeness,
 * so a sponsor sees filing readiness before assembling the PreSTAR PDF:
 *
 *   - Q-Submissions (Q-Sub) — Pre-Submissions, Submission Issue Requests,
 *     Informational Meetings, Study Risk Determinations, PMA Day 100 Meetings,
 *     and Accessory Classification Requests
 *   - Investigational Device Exemptions (IDE) — originals and supplements/amendments
 *   - 513(g) Requests for Information
 *
 * Mirrors estar-mapper (510(k)/De Novo) and pma-mapper (PMA): the sections come
 * from the request type, required = the core of a fileable request, and a section
 * with no matching source leaf is a gap. This is a READINESS / gap mapper — the
 * PreSTAR PDF fill lives with the template registry + fill orchestration.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network, no LLM. A
 * section with no matching source leaf is a gap, never invented.
 *
 * @module server/services/pathway-engines/prestar/prestar-mapper
 */

/** PreSTAR carries three program submission types. */
export type PreStarSubmissionType = 'q_sub' | 'ide' | '513g';

/**
 * Q-Submission sub-types (the Q-Sub program). Every request FDA accepts through
 * the Q-Submission program, including PMA Day 100 Meetings and Accessory
 * Classification Requests.
 */
export type QSubType =
  | 'pre_submission'
  | 'submission_issue_request'
  | 'informational_meeting'
  | 'study_risk_determination'
  | 'pma_day_100_meeting'
  | 'accessory_classification_request';

export interface QSubTypeInfo {
  value: QSubType;
  label: string;
  description: string;
  /** Whether the request asks FDA for feedback (vs. one-way information sharing). */
  requestsFeedback: boolean;
  regulatoryRef: string;
}

/** Metadata for every Q-Submission sub-type. */
export const Q_SUB_TYPES: QSubTypeInfo[] = [
  {
    value: 'pre_submission',
    label: 'Pre-Submission (Pre-Sub)',
    description: 'Formal written request for FDA feedback on a planned submission or study.',
    requestsFeedback: true,
    regulatoryRef: 'Q-Submission Program guidance',
  },
  {
    value: 'submission_issue_request',
    label: 'Submission Issue Request (SIR)',
    description: 'Feedback request to resolve deficiencies on a pending submission placed on hold.',
    requestsFeedback: true,
    regulatoryRef: 'Q-Submission Program guidance',
  },
  {
    value: 'informational_meeting',
    label: 'Informational Meeting',
    description: 'Share information with FDA with no request for feedback or a decision.',
    requestsFeedback: false,
    regulatoryRef: 'Q-Submission Program guidance',
  },
  {
    value: 'study_risk_determination',
    label: 'Study Risk Determination (SRD)',
    description: 'Request FDA’s significant-risk / nonsignificant-risk / exempt determination for a study.',
    requestsFeedback: true,
    regulatoryRef: 'Q-Submission Program guidance; 21 CFR 812.2',
  },
  {
    value: 'pma_day_100_meeting',
    label: 'PMA Day 100 Meeting',
    description: 'Statutory meeting to discuss the review status of a filed original PMA (~day 100).',
    requestsFeedback: true,
    regulatoryRef: 'Section 515(d)(3) FD&C Act; Q-Submission Program guidance',
  },
  {
    value: 'accessory_classification_request',
    label: 'Accessory Classification Request',
    description: 'Request risk-based classification of a device accessory distinct from its parent device.',
    requestsFeedback: true,
    regulatoryRef: 'Section 513(f)(6) FD&C Act; Medical Device Accessories guidance',
  },
];

/** Look up metadata for a Q-Submission sub-type. */
export function getQSubTypeInfo(type: QSubType): QSubTypeInfo | undefined {
  return Q_SUB_TYPES.find((t) => t.value === type);
}

export interface PreStarInputLeaf {
  sectionCode: string;
  title: string;
  documentType?: string;
  /**
   * True only when this leaf carries real, finalized authored content — never a
   * draft/placeholder stub. A leaf whose title merely matches a section keyword
   * must NOT mark that section present unless it is also substantive: otherwise a
   * stub titled "Specific questions for FDA" containing "TBD" would flip a
   * required section — and `ready` — to true on an incomplete request. Required
   * (not optional) so every caller consciously decides this instead of it
   * silently defaulting to "present".
   */
  substantive?: boolean; // optional: undefined ⇒ NOT substantive (fail-closed)
}

export interface PreStarSlot {
  id: string;
  label: string;
  required: boolean;
}

export interface PreStarSlotStatus extends PreStarSlot {
  present: boolean;
  sources: string[];
}

export interface PreStarResult {
  submissionType: PreStarSubmissionType;
  qSubType?: QSubType;
  sections: PreStarSlotStatus[];
  summary: { missingRequired: string[]; ready: boolean; completeness: number };
}

type Matcher = (l: PreStarInputLeaf) => boolean;
const dt = (...t: string[]): Matcher => (l) => !!l.documentType && t.includes(l.documentType);
const ti = (...n: string[]): Matcher => (l) => n.some((x) => l.title.toLowerCase().includes(x));
const any = (...m: Matcher[]): Matcher => (l) => m.some((f) => f(l));

type SlotDef = PreStarSlot & { match: Matcher };

// Administrative spine shared by every PreSTAR request (the PreSTAR2 admin pages).
const adminSlots: SlotDef[] = [
  { id: 'cover-letter', label: 'Cover letter', required: true, match: any(dt('cover_letter', 'cover_sheet'), ti('cover letter', 'cover sheet')) },
  { id: 'contact-admin', label: 'Applicant contact & administrative information', required: true, match: any(dt('administrative', 'contact_information'), ti('contact', 'administrative', 'applicant information')) },
  { id: 'device-description', label: 'Device description & proposed intended use', required: true, match: any(dt('device_description', 'indications_for_use', 'intended_use'), ti('device description', 'intended use', 'indications for use')) },
];

// ── Q-Submission section registry (varies by sub-type) ──────────────────────
const Q_SUB_COMMON: SlotDef[] = [
  ...adminSlots,
  { id: 'regulatory-history', label: 'Regulatory history & prior interactions', required: false, match: any(dt('regulatory_history', 'prior_submission'), ti('regulatory history', 'prior submission', 'previous interaction')) },
];

const Q_SUB_FEEDBACK: SlotDef[] = [
  ...Q_SUB_COMMON,
  { id: 'questions', label: 'Specific questions for FDA', required: true, match: any(dt('questions', 'fda_questions'), ti('question')) },
  { id: 'background-rationale', label: 'Background & sponsor position/rationale', required: true, match: any(dt('background', 'rationale', 'sponsor_position'), ti('background', 'rationale', 'our position', 'sponsor position')) },
];

// Sub-type specific registries.
const Q_SUB_SLOTS: Record<QSubType, SlotDef[]> = {
  pre_submission: [
    ...Q_SUB_FEEDBACK,
    { id: 'proposed-testing', label: 'Proposed testing / study protocol', required: false, match: any(dt('test_protocol', 'study_protocol', 'performance_testing'), ti('protocol', 'test plan', 'study design')) },
  ],
  submission_issue_request: [
    ...Q_SUB_FEEDBACK,
    { id: 'deficiency-reference', label: 'Reference to the pending submission & FDA deficiencies', required: true, match: any(dt('deficiency', 'hold_letter', 'fda_deficiencies'), ti('deficiency', 'hold letter', 'additional information request')) },
  ],
  informational_meeting: [
    // Informational meetings share information; they do NOT pose questions.
    ...Q_SUB_COMMON,
    { id: 'information-package', label: 'Information/materials to be presented', required: true, match: any(dt('presentation', 'information_package'), ti('information package', 'presentation', 'overview', 'materials to be presented', 'briefing')) },
  ],
  study_risk_determination: [
    ...Q_SUB_FEEDBACK,
    { id: 'study-protocol', label: 'Study protocol & risk rationale', required: true, match: any(dt('study_protocol', 'clinical_protocol'), ti('protocol', 'study design', 'risk')) },
  ],
  pma_day_100_meeting: [
    ...Q_SUB_FEEDBACK,
    { id: 'pma-reference', label: 'Reference to the filed original PMA', required: true, match: any(dt('pma_reference', 'pma_filing'), ti('pma', 'premarket approval')) },
  ],
  accessory_classification_request: [
    ...Q_SUB_COMMON,
    { id: 'accessory-description', label: 'Accessory description & parent-device relationship', required: true, match: any(dt('accessory', 'accessory_description'), ti('accessory', 'parent device')) },
    { id: 'proposed-classification', label: 'Proposed classification & risk rationale', required: true, match: any(dt('classification_request', 'risk_analysis'), ti('classification', 'risk')) },
  ],
};

// ── IDE section registry (21 CFR 812) ───────────────────────────────────────
const IDE_SLOTS: SlotDef[] = [
  ...adminSlots,
  { id: 'investigational-plan', label: 'Investigational plan', required: true, match: any(dt('investigational_plan'), ti('investigational plan')) },
  { id: 'report-prior-investigations', label: 'Report of prior investigations', required: true, match: any(dt('prior_investigations', 'nonclinical', 'bench_testing'), ti('prior investigation', 'nonclinical', 'bench')) },
  { id: 'clinical-protocol', label: 'Clinical protocol', required: true, match: any(dt('clinical_protocol', 'study_protocol'), ti('clinical protocol', 'study protocol')) },
  { id: 'risk-analysis', label: 'Risk analysis', required: true, match: any(dt('risk_analysis'), ti('risk analysis')) },
  { id: 'manufacturing', label: 'Manufacturing information', required: true, match: any(dt('manufacturing', 'quality_system'), ti('manufacturing', 'quality system')) },
  { id: 'informed-consent', label: 'Informed consent & IRB information', required: true, match: any(dt('informed_consent', 'irb'), ti('informed consent', 'irb', 'institutional review')) },
  { id: 'investigator-agreements', label: 'Investigator agreements & list of investigators', required: false, match: any(dt('investigator_agreement'), ti('investigator agreement', 'list of investigators')) },
  { id: 'labeling', label: 'Investigational device labeling', required: true, match: any(dt('labeling', 'label'), ti('labeling', 'label')) },
];

// ── 513(g) section registry (Section 513(g) FD&C Act) ────────────────────────
const FIVE13G_SLOTS: SlotDef[] = [
  ...adminSlots,
  { id: 'classification-questions', label: 'Specific classification questions for FDA', required: true, match: any(dt('questions', 'classification_questions'), ti('question', 'classification')) },
  { id: 'proposed-classification', label: 'Applicant’s proposed classification & rationale', required: true, match: any(dt('proposed_classification', 'rationale'), ti('proposed classification', 'rationale', 'our position')) },
  { id: 'user-fee', label: 'User-fee information', required: false, match: any(dt('user_fee', 'fee'), ti('user fee', 'fee')) },
];

function registryFor(type: PreStarSubmissionType, qSubType?: QSubType): SlotDef[] {
  switch (type) {
    case 'q_sub': {
      // The sub-types carry genuinely different mandatory sections: a
      // Submission Issue Request requires a deficiency reference, an
      // Informational Meeting requires an information package and no
      // questions. Defaulting an unstated sub-type to Pre-Submission scored an
      // SIR complete while missing the reference to FDA's own deficiencies.
      if (!qSubType) {
        throw new Error(
          'A Q-Submission cannot be assessed without its sub-type (pre_submission, submission_issue_request, ' +
            'informational_meeting, study_risk_determination, pma_day_100_meeting, accessory_classification_request); ' +
            'each carries different mandatory sections.',
        );
      }
      return Q_SUB_SLOTS[qSubType];
    }
    case 'ide':
      return IDE_SLOTS;
    case '513g':
      return FIVE13G_SLOTS;
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown PreSTAR submission type: ${String(_exhaustive)}`);
    }
  }
}

function evalSlot(slot: SlotDef, leaves: PreStarInputLeaf[]): PreStarSlotStatus {
  // A matched-but-non-substantive leaf (a draft/placeholder stub whose title
  // merely matches) never marks a required section present — only a matched
  // leaf that is ALSO substantive counts.
  const matched = leaves.filter((l) => slot.match(l));
  const present = matched.some((l) => l.substantive);
  const sources = matched.filter((l) => l.substantive).map((l) => l.sectionCode || l.title);
  const { match, ...rest } = slot;
  return { ...rest, present, sources };
}

export interface MapToPreStarInput {
  leaves: PreStarInputLeaf[];
  submissionType: PreStarSubmissionType;
  /** Required when submissionType is 'q_sub' — refused when absent, never defaulted. */
  qSubType?: QSubType;
}

/** Map canonical leaves onto the PreSTAR section structure + completeness report. */
export function mapToPreStar(input: MapToPreStarInput): PreStarResult {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const qSubType = input.submissionType === 'q_sub' ? input.qSubType : undefined;
  const registry = registryFor(input.submissionType, qSubType);
  const sections = registry.map((s) => evalSlot(s, leaves));
  const requiredSections = sections.filter((s) => s.required);
  const missingRequired = requiredSections.filter((s) => !s.present).map((s) => s.id);
  const presentRequired = requiredSections.length - missingRequired.length;
  const completeness = requiredSections.length === 0 ? 0 : Math.round((presentRequired / requiredSections.length) * 100);
  return {
    submissionType: input.submissionType,
    qSubType,
    sections,
    summary: { missingRequired, ready: missingRequired.length === 0, completeness },
  };
}

export default { mapToPreStar, Q_SUB_TYPES, getQSubTypeInfo };
