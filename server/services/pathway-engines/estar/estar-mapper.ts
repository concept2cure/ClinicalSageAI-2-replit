/**
 * eSTAR readiness mapper (FDA 510(k) / De Novo — MedTech & IVD)
 *
 * Projects the canonical submission content onto the FDA eSTAR section structure
 * and reports completeness — which required eSTAR sections are present vs missing,
 * and which device answers the authored content contradicts — so a manufacturer
 * sees what FDA's eSTAR technical screening will check before filling the eSTAR
 * PDF. An eSTAR 510(k) or De Novo is not expected to go through refuse-to-accept;
 * FDA screens it instead, and holds one that fails (see `contradictions` below).
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
export type EstarApplicability = 'required' | 'not-applicable' | 'undetermined' | 'when-applicable';

export interface EstarSlotStatus extends EstarSlot {
  present: boolean;
  sources: string[];
  applicability: EstarApplicability;
}

/**
 * A device answer that the authored content contradicts: the program answered
 * the deciding flag "no", which makes this section not applicable, yet a
 * finished (substantive) section for it exists.
 */
export interface EstarContradiction {
  /** The slot the authored content matched. */
  section: string;
  /** The device question that was answered "no". */
  flag: DeviceFlagId;
  /** The authored sections that contradict the answer (sectionCode, else title). */
  sources: string[];
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
    /**
     * Device answers the authored content contradicts. FDA's eSTAR technical
     * screening checks that the eSTAR's responses accurately describe the
     * device, and an inaccurate response can put the submission on a
     * technical-screening hold. The other half of that screening — a relevant
     * attachment for every applicable question — is `missingRequired`. These
     * block `ready`.
     */
    contradictions: EstarContradiction[];
    ready: boolean;
  };
}

type Matcher = (l: EstarInputLeaf) => boolean;
const dt = (...t: string[]): Matcher => (l) => !!l.documentType && t.includes(l.documentType);
const ti = (...n: string[]): Matcher => (l) => n.some((x) => l.title.toLowerCase().includes(x));
const any = (...m: Matcher[]): Matcher => (l) => m.some((f) => f(l));
const all = (...m: Matcher[]): Matcher => (l) => m.every((f) => f(l));
const not = (m: Matcher): Matcher => (l) => !m(l);

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

/**
 * `contradicts`: which of the slot's matched leaves, when substantive, assert
 * the opposite of a "no" to the slot's flag. Defaults to the slot's own
 * matcher. Narrower where the slot also collects content a "no" device still
 * owes (shelf life on a non-sterile device), and `null` where authored content
 * cannot contradict the answer at all (cybersecurity on a non-cyber device).
 */
type SlotDef = EstarSlot & { match: Matcher; contradicts?: Matcher | null };

const always = (
  id: string, label: string, authority: string, match: Matcher,
): SlotDef => ({ id, label, authority, match, necessity: 'always', required: true });

const whenFlag = (
  id: string, label: string, authority: string, flag: DeviceFlagId, match: Matcher,
): SlotDef => ({ id, label, authority, flag, match, necessity: 'conditional', required: false });

/** A conditional slot whose contradiction evidence is not its whole matcher (see `SlotDef.contradicts`). */
const screenedAs = (slot: SlotDef, contradicts: Matcher | null): SlotDef => ({ ...slot, contradicts });

const whenApplicable = (
  id: string, label: string, authority: string, appliesWhen: string, match: Matcher,
): SlotDef => ({ id, label, authority, appliesWhen, match, necessity: 'when-applicable', required: false });

// Shared eSTAR administrative + technical spine (FDA eSTAR template).
/*
 * WHY THERE IS NO `cdrh-cover-sheet` SLOT.
 *
 * This required "CDRH Premarket Review Submission Cover Sheet (FDA 3514)" of
 * every device. FDA retired that paper cover sheet when eSTAR became mandatory
 * — 510(k) on 2023-10-01, De Novo on 2025-10-01 — because the eSTAR itself
 * captures the data. migrations/20260901b_estar_510k_denovo_outlines.sql exists
 * to strike those sections from the k510 and denovo outlines, and says so in its
 * header. Only half of that change landed: the outlines lost the section, this
 * mapper kept demanding it, so every governed 510(k) scored one required slot
 * short and the readiness surface told a paying customer to produce a form FDA
 * no longer accepts.
 */
const baseSlots: SlotDef[] = [
  // ── Administrative, all statutory ─────────────────────────────────────────
  always('cover-letter', 'Cover letter / submission cover sheet', 'FDA eSTAR administrative section',
    any(dt('cover_letter', 'cover_sheet'), ti('cover letter', 'cover sheet'))),
  always('user-fee-cover-sheet', 'MDUFA user-fee cover sheet and payment (FDA 3601)',
    'Form FDA 3601; MDUFA. An unpaid submission is not accepted and no substantive review begins.',
    any(dt('user_fee', 'form_3601', 'mdufa_cover_sheet'), ti('3601', 'user fee', 'mdufa'))),
  always('indications-for-use', 'Indications for use (FDA 3881)', 'Form FDA 3881',
    any(dt('indications_for_use', 'ifu_statement', 'form_3881'), ti('indications for use', '3881'))),
  /* The statute calls this the "truthful and accurate" statement; the k510 and
     denovo rule packs both title their section "Truthful and accuracy
     statement". One letter, and it cost the filer the slot: the section they
     had written and approved scored as absent, forever. Matched on the
     citation too, which is in the pack's own label and cannot drift the way a
     phrase does. */
  always('truthful-accurate-statement', 'Truthful and Accurate Statement', '21 CFR 807.87(k)',
    any(dt('truthful_accurate', 'truthful_and_accurate', 'truthful_and_accuracy'),
        ti('truthful and accurate', 'truthful & accurate', 'truthful and accuracy', '807.87(k)'))),

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
        ti('performance testing', 'bench test'),
        /* "Clinical data" names a performance section — but BOTH shipped
           outlines title their financial-disclosure node "Financial
           certification or disclosure (21 CFR Part 54), where clinical data are
           relied on", and a bare substring match on that conditional clause
           marked performance testing PRESENT for a sponsor who had authored
           nothing of the kind. It also dropped out of missingRequired, so the
           readiness verdict claimed a required section was satisfied when
           nothing addressed it.
           The direction matters, not just the case: see the biocompatibility
           note below — over-asking costs a reader a moment, under-asking costs
           a refusal to accept. A false "present" is the one way this mapper may
           not be wrong. The exclusion is narrow and stated rather than clever:
           a title that is about financial disclosure is not a performance
           section, whatever else it mentions.
           Pinned by tests/schema-contract/estar-mapper-matches-shipped-outlines
           .contract.test.ts, which also carries the whole node-to-slot map so a
           future matcher edit shows its blast radius. */
        all(ti('clinical data'), not(ti('financial', '21 cfr part 54'))))),

  /* Biocompatibility turns on patient contact, which is not one of the seven
     flags the intake collects, so it cannot be resolved conditionally here. It
     stays always-required — the safe direction, since over-asking for a
     biocompatibility section costs a reader a moment and under-asking costs
     them a technical-screening hold. For the same reason it cannot be checked
     for contradictions: there is no "no" answer to contradict. Adding a
     patient-contact flag is an intake change and an SME question, not
     something to infer. */
  always('biocompatibility', 'Biocompatibility', 'ISO 10993-1 (contact category and duration)',
    any(dt('biocompatibility'), ti('biocompatibilit'))),

  // ── Conditional on the seven device flags ─────────────────────────────────
  screenedAs(whenFlag('sterilization', 'Sterilization, shelf life and packaging validation',
    'FDA sterility review guidance; ISO 11135 / 11137 / 17665 as applicable', 'sterile',
    any(dt('sterilization'), ti('steriliz', 'shelf life', 'packaging validation'))),
    /* Only content about sterilization contradicts "not sterile". Shelf life
       and packaging are owed by non-sterile devices too, and a reprocessing
       section validates the USER's sterilization of a device supplied
       non-sterile — neither says the device is supplied sterile. */
    all(any(dt('sterilization'), ti('steriliz')), not(any(dt('reprocessing'), ti('reprocessing', 'reuse'))))),
  whenFlag('software', 'Software / firmware documentation',
    'FDA premarket software guidance (June 2023): documentation level, architecture, SRS/SDS, V&V, SBOM',
    'softwareAiMl',
    any(dt('software', 'firmware'), ti('software', 'firmware', 'sbom'))),
  screenedAs(whenFlag('cybersecurity', 'Cybersecurity documentation',
    'FD&C Act §524B — required in a premarket submission for a cyber device. For an eSTAR, FDA\'s ' +
      'technical screening checks that the attachment is there.', 'cyberDevice',
    any(dt('cybersecurity'), ti('cybersecurity', 'cyber security', 'threat model'))),
    /* FDA's premarket cybersecurity guidance covers any device with software or
       programmable logic; §524B cyber devices are a subset. Cybersecurity
       documentation on a device that is not a cyber device is expected, not an
       inaccurate answer. */
    null),
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
    /* FDA's final guidance (FR 2026-10734, 2026-05-29; submissions received on
       or after 2026-08-01). The eSTAR itself branches on it: the vendored v7.0
       template asks for HF Submission Category 1, 2 or 3 and maps them to
       Section 1, Sections 1-4 and Sections 1-8 of the HFE/UE report. The
       category is the sponsor's answer in the form; no engine here decides it. */
    'IEC 62366-1; FDA guidance "Content of Human Factors Information in Medical Device Marketing ' +
      'Submissions" (2026) — the eSTAR asks for HF Submission Category 1, 2 or 3 (HFE/UE report ' +
      'Section 1, Sections 1-4, or Sections 1-8)',
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

/*
 * THE IVD 510(k) SLOT REGISTRY.
 *
 * `mapToEstar` had two registries — SLOTS_510K and SLOTS_DE_NOVO — and no
 * notion of variant. Both were enumerated from the nIVD eSTAR. So an IVD
 * 510(k), which /assemble and /filing-readiness accept and echo as
 * `variant: 'ivd'`, was scored against the non-IVD slot set: it was never once
 * asked for analytical performance, method comparison or expected values, and
 * an IVD holding none of them could reach "ready".
 *
 * Measured against the two vendored templates with listXfaFields. The nIVD
 * form's PerformanceTesting section holds ClinicalTesting, BenchTesting and
 * AnimalTesting (142 fields). The IVD form's holds AnalyticalPerformance (140
 * fields on its own), ClinicalStudies, ComparisonStudies and ReferenceRange
 * (329 total). The IVD questions below are FDA's own, quoted from the IVD
 * template's captions — not authored here.
 *
 * NECESSITY. FDA asks each of these as a yes/no question the applicant answers,
 * so all but one are `when-applicable`: the mapper reports them for a human to
 * confirm rather than inventing a requirement it cannot decide. The exception
 * is analytical performance itself. An IVD 510(k) with no analytical
 * performance data at all is not a submission FDA will accept for review, and
 * the form devotes 140 fields to it; that one is required, and it is what stops
 * an IVD with nothing measured from scoring complete.
 */
const IVD_PERFORMANCE_SLOTS: SlotDef[] = [
  always('ivd-analytical-performance', 'Analytical performance (precision, detection limit, linearity, interference)',
    'FDA IVD eSTAR — Performance Testing › Analytical Performance › Assay Performance',
    any(dt('analytical_performance', 'precision', 'linearity', 'detection_limit', 'lod', 'interference'),
        ti('analytical performance', 'precision', 'repeatability', 'reproducibility', 'linearity',
           'detection limit', 'analytical sensitivity', 'analytical specificity', 'interference'))),
  whenApplicable('ivd-method-comparison', 'Method comparison study',
    'FDA IVD eSTAR — "Did you perform Method Comparison Study?"',
    'the assay is compared against a comparator or reference method',
    any(dt('method_comparison'), ti('method comparison', 'comparator method'))),
  whenApplicable('ivd-matrix-comparison', 'Validation of specimens / matrix comparison',
    'FDA IVD eSTAR — "Did you perform Validation of Specimens/Matrix Comparison Study?"',
    'more than one specimen type or matrix is claimed',
    any(dt('matrix_comparison', 'specimen_validation'), ti('matrix comparison', 'validation of specimens', 'specimen type'))),
  whenApplicable('ivd-reference-range', 'Reference range / expected values',
    'FDA IVD eSTAR — "Do you have Reference Range/Expected Values information to include in this submission?"',
    'the assay reports a quantitative or semi-quantitative result',
    any(dt('reference_range', 'expected_values'), ti('reference range', 'expected values', 'reference interval'))),
  whenApplicable('ivd-specimen-stability', 'Stability of specimens',
    'FDA IVD eSTAR — "Did you perform Stability of Sample(s) Study?"',
    'specimens are stored or transported before testing',
    any(dt('specimen_stability', 'sample_stability'), ti('specimen stability', 'stability of sample', 'sample stability'))),
  whenApplicable('ivd-traceability', 'Metrological traceability of calibrators and controls',
    'FDA IVD eSTAR — "Do you have Traceability information to include in this submission?"',
    'the assay reports a value against a calibrator',
    any(dt('traceability', 'calibrator_traceability'), ti('traceability', 'calibrator'))),
  whenApplicable('ivd-cutoff', 'Assay cut-off',
    'FDA IVD eSTAR — "Did you perform Assay Cut-Off Study?"',
    'the assay reports a qualitative result against a cut-off',
    any(dt('assay_cutoff', 'cut_off'), ti('cut-off', 'cutoff', 'medical decision point'))),
  whenApplicable('ivd-carryover', 'Carry-over',
    'FDA IVD eSTAR — "Did you perform Carry-Over Study?"',
    'the assay runs on an automated analyser that processes specimens in sequence',
    any(dt('carry_over', 'carryover'), ti('carry-over', 'carryover'))),
  whenApplicable('ivd-hook-effect', 'High-dose hook effect',
    'FDA IVD eSTAR — "Did you perform High Dose Hook Effect Study?"',
    'the assay is a sandwich immunoassay or otherwise subject to hook effect',
    any(dt('hook_effect'), ti('hook effect', 'high dose hook'))),
  whenApplicable('ivd-clinical-performance', 'Clinical performance (clinical sensitivity and specificity)',
    'FDA IVD eSTAR — "Do you have Clinical Sensitivity and/or Clinical Specificity to include in this submission?"',
    'the intended use makes a claim about clinical performance',
    any(dt('clinical_performance', 'clinical_sensitivity', 'clinical_specificity'),
        ti('clinical sensitivity', 'clinical specificity', 'clinical performance'))),
];

const SLOTS_510K_IVD: SlotDef[] = [...SLOTS_510K, ...IVD_PERFORMANCE_SLOTS];

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
export function slotApplicability(
  slot: Pick<EstarSlot, 'necessity' | 'flag'>, flags: DeviceFlags | undefined,
): EstarApplicability {
  if (slot.necessity === 'always') return 'required';
  if (slot.necessity === 'when-applicable') return 'when-applicable';
  const value = flags?.[slot.flag as DeviceFlagId];
  if (value === undefined) return 'undetermined';
  return value ? 'required' : 'not-applicable';
}

/** A slot as readers see it: everything but the matchers. A fresh object. */
function publicSlot(s: SlotDef): EstarSlot {
  return {
    id: s.id,
    label: s.label,
    required: s.required,
    necessity: s.necessity,
    ...(s.flag ? { flag: s.flag } : {}),
    ...(s.appliesWhen ? { appliesWhen: s.appliesWhen } : {}),
    authority: s.authority,
  };
}

function evalSlot(slot: SlotDef, leaves: EstarInputLeaf[], flags: DeviceFlags | undefined): EstarSlotStatus {
  // A matched-but-non-substantive leaf (a draft/placeholder stub whose title
  // merely matches) never marks a required section present — only a matched
  // leaf that is ALSO substantive counts.
  const matched = leaves.filter((l) => slot.match(l));
  const present = matched.some((l) => l.substantive);
  const sources = matched.filter((l) => l.substantive).map((l) => l.sectionCode || l.title);
  const rest = publicSlot(slot);
  const applicability = slotApplicability(slot, flags);
  /* `required` is derived, not authored: it now means "required for THIS
     device", so a sterile device's sterilization section reports required and
     the completeness figures computed from it by five callers are right without
     any of them changing. */
  return { ...rest, required: applicability === 'required', present, sources, applicability };
}

/**
 * The device answer this slot's authored content contradicts, if any: a "no"
 * to the deciding flag beside substantive content that asserts the opposite.
 * An unanswered flag is undetermined and cannot be contradicted; a draft is not
 * a claim about the device.
 */
function contradictionFor(
  slot: SlotDef, leaves: EstarInputLeaf[], applicability: EstarApplicability,
): EstarContradiction | null {
  if (applicability !== 'not-applicable' || !slot.flag || slot.contradicts === null) return null;
  const asserts = slot.contradicts ?? slot.match;
  const sources = leaves
    .filter((l) => l.substantive && slot.match(l) && asserts(l))
    .map((l) => l.sectionCode || l.title);
  return sources.length > 0 ? { section: slot.id, flag: slot.flag, sources } : null;
}

/* The one place the registry is chosen. De Novo is filed on the same two
   family templates, but its own slot set is enumerated from the nIVD form; an
   IVD De Novo is out of scope here and falls to SLOTS_DE_NOVO rather than being
   silently given the 510(k) IVD set. */
function registryFor(type: EstarType, variant: 'device' | 'ivd' | undefined): SlotDef[] {
  return type === 'de_novo' ? SLOTS_DE_NOVO
    : variant === 'ivd' ? SLOTS_510K_IVD
    : SLOTS_510K;
}

/**
 * The eSTAR slot registry for a submission type, without its matchers: id,
 * label, necessity, the deciding flag or property, and the authority.
 *
 * This is how other engines read eSTAR content rather than keeping their own
 * list of it — market-specs/submission-requirements.ts builds its 510k and
 * de_novo rows from this, so a slot added or re-labelled here reaches every
 * reader. Returns fresh objects; mutating them does not touch the registry.
 */
export function estarSlots(type: EstarType, variant?: 'device' | 'ivd'): EstarSlot[] {
  return registryFor(type, variant).map(publicSlot);
}

export interface MapToEstarInput {
  leaves: EstarInputLeaf[];
  type: EstarType;
  /**
   * nIVD ('device') or IVD. FDA ships one eSTAR per family and they ask
   * different performance questions, so the slot registry follows the variant.
   * Omitted means 'device', which is what every caller got before this existed.
   */
  variant?: 'device' | 'ivd';
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
  const registry = registryFor(input.type, input.variant);
  const sections = registry.map((s) => evalSlot(s, leaves, input.flags));
  const contradictions = registry
    .map((s, i) => contradictionFor(s, leaves, sections[i].applicability))
    .filter((c): c is EstarContradiction => c !== null);

  const absent = sections.filter((s) => !s.present);
  const missingRequired = absent.filter((s) => s.applicability === 'required').map((s) => s.id);
  const undetermined = absent.filter((s) => s.applicability === 'undetermined').map((s) => s.id);
  const checkApplicability = absent
    .filter((s) => s.applicability === 'when-applicable')
    .map((s) => s.id);

  /* Ready means every section this device needs is present, there is no
     section whose necessity is still unanswered, AND no device answer is
     contradicted by the authored content (a submission FDA's technical
     screening would hold). `when-applicable` does not block: the model
     genuinely cannot decide those, and saying so is honest where blocking on
     them would be noise — they are reported for a human to confirm instead. */
  const ready = missingRequired.length === 0 && undetermined.length === 0 && contradictions.length === 0;

  return {
    type: input.type,
    sections,
    summary: { missingRequired, undetermined, checkApplicability, contradictions, ready },
  };
}

export default { mapToEstar, estarSlots };
