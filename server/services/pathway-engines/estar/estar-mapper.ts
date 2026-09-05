/**
 * eSTAR readiness mapper (FDA 510(k) / De Novo — MedTech & IVD)
 *
 * Projects the canonical submission content onto the FDA eSTAR section structure
 * and reports completeness — which required eSTAR sections are present vs missing
 * — so a manufacturer sees CDRH-acceptance readiness (the RTA-style administrative
 * gate) before filling the eSTAR PDF.
 *
 * This is a READINESS / gap mapper. The actual eSTAR PDF-form fill lives in the
 * existing 510k-estar route; this complements it (the "is it complete?" check),
 * it does not duplicate the form rendering.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network, no LLM. A
 * section with no matching source leaf is a gap, never invented.
 *
 * @module server/services/pathway-engines/estar/estar-mapper
 */

export type EstarType = '510k' | 'de_novo';

export interface EstarInputLeaf {
  sectionCode: string;
  title: string;
  documentType?: string;
  /**
   * True only when this leaf carries real, finalized authored content — never a
   * draft/placeholder stub. A leaf whose title merely matches a section keyword
   * must NOT mark that section present unless it is also substantive: otherwise a
   * stub titled "Performance Testing" containing "TBD" would flip a required
   * section — and `ready` — to true on an incomplete submission. Required (not
   * optional) so every caller consciously decides this instead of it silently
   * defaulting to "present".
   */
  substantive?: boolean; // optional: undefined ⇒ NOT substantive (fail-closed)
}

import type { DeviceFlagId as SharedDeviceFlagId } from '../../../../shared/constants/domain/device-classification';

/**
 * The seven conditional flags W1-5 names, which are exactly the seven in
 * DEVICE_FLAGS (shared/constants/domain/device-classification.ts) that the
 * project intake already collects. The two work-order items join here: W1-6
 * asks the question, W1-5 uses the answer.
 */
export type { DeviceFlagId } from '../../../../shared/constants/domain/device-classification';
type DeviceFlagId = SharedDeviceFlagId;

export type DeviceFlags = Partial<Record<DeviceFlagId, boolean>>;

/**
 * How a section's necessity is decided.
 *
 *   always          required for every submission of this type.
 *   conditional     required exactly when a named device flag is set. Unset →
 *                   not applicable. UNKNOWN → undetermined, which is not the
 *                   same as not required and must never be reported as one.
 *   when-applicable the model cannot decide: it turns on a device property this
 *                   model does not capture (whether the device is electrically
 *                   powered, patient-contacting, reusable). Named with what
 *                   decides it, rather than silently scored as optional.
 *
 * The fourth possibility — "optional" — is deliberately absent. Every section
 * in the eSTAR template is required for SOME device; `required: false` was
 * doing the work of all three states above and reading as "you do not need
 * this", which for a sterile device's sterilization section is false.
 */
export type Necessity = 'always' | 'conditional' | 'when-applicable';

export interface EstarSlot {
  id: string;
  label: string;
  /**
   * True only for `necessity: 'always'`. Retained because five callers and
   * their tests read it; it is derived, not authored.
   */
  required: boolean;
  necessity: Necessity;
  /** For `conditional`: the device flag that decides it. */
  flag?: DeviceFlagId;
  /** For `when-applicable`: the device property that decides it, in words. */
  appliesWhen?: string;
  /** The regulation, statute, standard or guidance this section answers to. */
  authority: string;
}

/**
 * Whether this section is needed for THIS device.
 *
 * 'undetermined' exists because the alternative is worse in one direction only:
 * a submission whose sterilization section is absent, on a device nobody has
 * said is sterile, must not read as complete.
 */
export type Applicability = 'required' | 'not-applicable' | 'undetermined' | 'when-applicable';

export interface EstarSlotStatus extends EstarSlot {
  present: boolean;
  sources: string[];
  applicability: Applicability;
}

export interface EstarResult {
  type: EstarType;
  sections: EstarSlotStatus[];
  summary: {
    missingRequired: string[];
    /**
     * Sections that are absent and whose necessity could not be decided because
     * the device flag that decides them was not supplied. These block `ready`:
     * not knowing whether a section is needed is not the same as not needing it.
     */
    undetermined: string[];
    /** Absent sections that turn on a property this model does not capture. */
    checkApplicability: string[];
    ready: boolean;
  };
}

type Matcher = (l: EstarInputLeaf) => boolean;
const dt = (...t: string[]): Matcher => (l) => !!l.documentType && t.includes(l.documentType);
const ti = (...n: string[]): Matcher => (l) => n.some((x) => l.title.toLowerCase().includes(x));
const any = (...m: Matcher[]): Matcher => (l) => m.some((f) => f(l));

/* ── The section model ───────────────────────────────────────────────────────
 *
 * Eleven slots, seven of them required, is what this modelled before. A real
 * 510(k) requires more than that, and several of the missing ones are statutory
 * — a submission without a 510(k) Summary or a Truthful and Accurate Statement
 * is refused acceptance, and neither appeared here at all (W1-5).
 *
 * The sharper defect was not the count. `required` was a static boolean, so
 * `sterilization` read `required: false` for every device including sterile
 * ones, and `software` read `required: false` for a device that is nothing but
 * software. The model was not saying "this depends"; it was saying "you do not
 * need this", to every reader, on a filing-readiness surface.
 *
 * Necessity is therefore decided per device, from the same seven flags the
 * project intake already collects (DEVICE_FLAGS, W1-6). What the flags cannot
 * decide is labelled `when-applicable` with the property that decides it,
 * rather than being quietly scored as satisfied.
 *
 * Each slot carries the authority it answers to, so a reader can check the
 * requirement rather than take this file's word for it.
 */

type SlotDef = EstarSlot & { match: Matcher };

const always = (
  id: string, label: string, authority: string, match: Matcher,
): SlotDef => ({ id, label, authority, match, necessity: 'always', required: true });

const whenFlag = (
  id: string, label: string, authority: string, flag: DeviceFlagId, match: Matcher,
): SlotDef => ({ id, label, authority, flag, match, necessity: 'conditional', required: false });

const whenApplicable = (
  id: string, label: string, authority: string, appliesWhen: string, match: Matcher,
): SlotDef => ({ id, label, authority, appliesWhen, match, necessity: 'when-applicable', required: false });

// Shared eSTAR administrative + technical spine (FDA eSTAR template).
const baseSlots: SlotDef[] = [
  // ── Administrative, all statutory ─────────────────────────────────────────
  always('cover-letter', 'Cover letter / submission cover sheet', 'FDA eSTAR administrative section',
    any(dt('cover_letter', 'cover_sheet'), ti('cover letter', 'cover sheet'))),
  always('cdrh-cover-sheet', 'CDRH Premarket Review Submission Cover Sheet (FDA 3514)', 'Form FDA 3514',
    any(dt('cdrh_cover_sheet', 'form_3514'), ti('3514', 'premarket review submission cover sheet'))),
  always('user-fee-cover-sheet', 'MDUFA user-fee cover sheet and payment (FDA 3601)',
    'Form FDA 3601; MDUFA. An unpaid submission is not accepted and no substantive review begins.',
    any(dt('user_fee', 'form_3601', 'mdufa_cover_sheet'), ti('3601', 'user fee', 'mdufa'))),
  always('indications-for-use', 'Indications for use (FDA 3881)', 'Form FDA 3881',
    any(dt('indications_for_use', 'ifu_statement', 'form_3881'), ti('indications for use', '3881'))),
  always('truthful-accurate-statement', 'Truthful and Accurate Statement', '21 CFR 807.87(k)',
    any(dt('truthful_accurate', 'truthful_and_accurate'), ti('truthful and accurate', 'truthful & accurate'))),

  // ── Technical spine ───────────────────────────────────────────────────────
  always('device-description', 'Device description', '21 CFR 807.87(f)',
    any(dt('device_description'), ti('device description'))),
  always('proposed-labeling', 'Proposed labeling', '21 CFR 807.87(e)',
    any(dt('labeling', 'labelling', 'label', 'ifu'), ti('labeling', 'instructions for use'))),
  always('risk-management', 'Risk management file', 'ISO 14971',
    any(dt('risk_management', 'risk_analysis'), ti('risk management', 'risk analysis', '14971'))),
  always('performance-testing', 'Performance testing (bench / animal / clinical)',
    'FDA eSTAR performance section',
    any(dt('performance_testing', 'bench_testing', 'clinical_testing'),
        ti('performance testing', 'bench test', 'clinical data'))),

  /* Biocompatibility turns on patient contact, which is not one of the seven
     flags the intake collects, so it cannot be resolved conditionally here. It
     stays always-required — the safe direction, since over-asking for a
     biocompatibility section costs a reader a moment and under-asking costs
     them an RTA hold. Adding a patient-contact flag is an intake change and an
     SME question, not something to infer. */
  always('biocompatibility', 'Biocompatibility', 'ISO 10993-1 (contact category and duration)',
    any(dt('biocompatibility'), ti('biocompatibilit'))),

  // ── Conditional on the seven device flags ─────────────────────────────────
  whenFlag('sterilization', 'Sterilization, shelf life and packaging validation',
    'FDA sterility review guidance; ISO 11135 / 11137 / 17665 as applicable', 'sterile',
    any(dt('sterilization'), ti('steriliz', 'shelf life', 'packaging validation'))),
  whenFlag('software', 'Software / firmware documentation',
    'FDA premarket software guidance (June 2023): documentation level, architecture, SRS/SDS, V&V, SBOM',
    'softwareAiMl',
    any(dt('software', 'firmware'), ti('software', 'firmware', 'sbom'))),
  whenFlag('cybersecurity', 'Cybersecurity documentation',
    'FD&C Act §524B. A cyber device without it is an RTA ground.', 'cyberDevice',
    any(dt('cybersecurity'), ti('cybersecurity', 'cyber security', 'threat model'))),
  whenFlag('clinical-financial-disclosure', 'Financial certification or disclosure (FDA 3454 / 3455)',
    '21 CFR Part 54 — required where clinical data are submitted', 'clinicalData',
    any(dt('financial_disclosure', 'form_3454', 'form_3455'),
        ti('financial certification', 'financial disclosure', '3454', '3455'))),
  whenFlag('combination-product', 'Combination-product constituent information',
    '21 CFR Part 4; cross-labelled constituent parts', 'combinationProduct',
    any(dt('combination_product'), ti('combination product', 'constituent part'))),
  whenFlag('implant-labeling', 'Implant-specific labeling and long-term performance',
    'Implantable-device labeling and duration-appropriate testing', 'implantable',
    any(dt('implant_card', 'implant_labeling'), ti('implant card', 'implant labeling'))),
  whenFlag('clia-waiver', 'CLIA waiver by application / dual submission',
    'CLIA — applies to IVDs seeking waived status', 'cliaWaived',
    any(dt('clia_waiver', 'dual_submission'), ti('clia waiver', 'dual submission'))),

  // ── Turns on a property this model does not capture ───────────────────────
  whenApplicable('emc-electrical', 'Electrical safety, EMC and wireless coexistence',
    'IEC 60601-1, IEC 60601-1-2; AAMI TIR69 for wireless',
    'the device is electrically powered or uses wireless communication',
    any(dt('emc', 'electrical_safety'),
        ti('electromagnetic', 'electrical safety', 'emc', 'wireless coexistence'))),
  whenApplicable('human-factors', 'Human factors / usability engineering',
    'IEC 62366-1; FDA human factors guidance',
    'the device has critical tasks whose use error could cause harm',
    any(dt('human_factors', 'usability'), ti('human factors', 'usability', '62366'))),
  whenApplicable('reprocessing', 'Reprocessing instructions and validation',
    'FDA reprocessing guidance',
    'the device is reusable',
    any(dt('reprocessing'), ti('reprocessing', 'reuse validation'))),
  whenApplicable('standards-conformance', 'Declarations of Conformity (FDA 3654)',
    'Form FDA 3654 — required for each recognised consensus standard relied on',
    'the submission relies on a recognised consensus standard',
    any(dt('standards_conformance', 'declaration_of_conformity', 'form_3654'),
        ti('conformity', 'consensus standard', '3654'))),
  whenApplicable('class-iii-certification', 'Class III Summary and Certification',
    '21 CFR 807.94',
    'the device is class III',
    any(dt('class_iii_certification'), ti('class iii summary', 'class iii certification'))),
];

const SLOTS_510K: SlotDef[] = [
  ...baseSlots,
  always('510k-summary-or-statement', '510(k) Summary or 510(k) Statement',
    '21 CFR 807.92 (summary) or 807.93 (statement) — one or the other is mandatory',
    any(dt('510k_summary', '510k_statement'), ti('510(k) summary', '510k summary', '510(k) statement'))),
  always('substantial-equivalence', 'Substantial equivalence comparison (predicate)',
    '21 CFR 807.87(f); FD&C Act §513(i)',
    any(dt('substantial_equivalence', 'predicate_comparison', '510k_predicate'),
        ti('substantial equivalence', 'predicate'))),
];

const SLOTS_DE_NOVO: SlotDef[] = [
  ...baseSlots,
  always('classification-request', 'De Novo classification request & risk-to-benefit',
    'FD&C Act §513(f)(2); 21 CFR 860 subpart D',
    any(dt('de_novo_request', 'classification_request'), ti('de novo', 'classification request'))),
  always('special-controls', 'Proposed special controls',
    'FD&C Act §513(a)(1)(B)',
    any(dt('special_controls'), ti('special controls'))),
];

/**
 * Whether this section is needed for THIS device.
 *
 * A conditional section whose flag was not supplied is 'undetermined', never
 * 'not-applicable'. The two are only the same if you assume the answer, and the
 * direction that assumption fails in is the dangerous one: a sterile device
 * whose sterilization section is missing would read as complete.
 */
function applicabilityOf(slot: SlotDef, flags: DeviceFlags | undefined): Applicability {
  if (slot.necessity === 'always') return 'required';
  if (slot.necessity === 'when-applicable') return 'when-applicable';
  const value = flags?.[slot.flag as DeviceFlagId];
  if (value === undefined) return 'undetermined';
  return value ? 'required' : 'not-applicable';
}

function evalSlot(slot: SlotDef, leaves: EstarInputLeaf[], flags: DeviceFlags | undefined): EstarSlotStatus {
  // A matched-but-non-substantive leaf (a draft/placeholder stub whose title
  // merely matches) never marks a required section present — only a matched
  // leaf that is ALSO substantive counts.
  const matched = leaves.filter((l) => slot.match(l));
  const present = matched.some((l) => l.substantive);
  const sources = matched.filter((l) => l.substantive).map((l) => l.sectionCode || l.title);
  const { match, ...rest } = slot;
  const applicability = applicabilityOf(slot, flags);
  /* `required` is derived, not authored: it now means "required for THIS
     device", so a sterile device's sterilization section reports required and
     the completeness figures computed from it by five callers are right without
     any of them changing. */
  return { ...rest, required: applicability === 'required', present, sources, applicability };
}

export interface MapToEstarInput {
  leaves: EstarInputLeaf[];
  type: EstarType;
  /**
   * The device's answers to the seven intake flags. Optional so the existing
   * callers compile unchanged — but omitting it does NOT make the conditional
   * sections go away. They become undetermined, and an undetermined section
   * that is absent blocks `ready`, because a readiness figure computed without
   * knowing whether the device is sterile is not a readiness figure.
   */
  flags?: DeviceFlags;
}

/** Map canonical leaves onto the FDA eSTAR sections + completeness report. */
export function mapToEstar(input: MapToEstarInput): EstarResult {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const registry = input.type === 'de_novo' ? SLOTS_DE_NOVO : SLOTS_510K;
  const sections = registry.map((s) => evalSlot(s, leaves, input.flags));

  const absent = sections.filter((s) => !s.present);
  const missingRequired = absent.filter((s) => s.applicability === 'required').map((s) => s.id);
  const undetermined = absent.filter((s) => s.applicability === 'undetermined').map((s) => s.id);
  const checkApplicability = absent
    .filter((s) => s.applicability === 'when-applicable')
    .map((s) => s.id);

  /* Ready means every section this device needs is present AND there is no
     section whose necessity is still unanswered. `when-applicable` does not
     block: the model genuinely cannot decide those, and saying so is honest
     where blocking on them would be noise — they are reported for a human to
     confirm instead. */
  const ready = missingRequired.length === 0 && undetermined.length === 0;

  return {
    type: input.type,
    sections,
    summary: { missingRequired, undetermined, checkApplicability, ready },
  };
}

export default { mapToEstar };
