/**
 * Which outline sections a project's eSTAR requires: the one answer for a
 * 510(k) or De Novo (P-107 item 3, docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * Before this the platform gave two. The rule pack marks each outline section
 * `mandatory` or not, the same for every device, and the Vault's Library showed
 * that flag as Required or Optional. The eSTAR mapper (estar-mapper) decides
 * each of its slots from the device answers the project gave at intake, and
 * filing readiness is read from it. So a sterile device's Sterilization section
 * read Optional in the Library while readiness reported it missing.
 *
 * The rule here:
 *
 *   - **The mapper decides every outline section one of its slots takes.** The
 *     outline's sections are put to `mapToEstar` as readiness puts authored
 *     sections to it (same leaf, same matchers), so a section is required here
 *     exactly when readiness would count it. Nothing about what the eSTAR
 *     requires is written in this file.
 *   - **A section no slot takes keeps its pack's flag.** The mapper says
 *     nothing of it, and reading that silence as "not required" would drop
 *     marks the pack states. Each answer says which of the two decided it
 *     (`decidedBy`), so the sections still left to the pack can be listed.
 *
 * A slot is satisfied by any one section that supplies it. Where several
 * outline sections supply one slot (bench, animal and clinical testing all
 * supply performance testing), the requirement is one requirement, and each
 * section's answer names the others.
 *
 * Where no eSTAR applies (PMA, EU MDR, IVDR, every CTD filing) there is no
 * answer here and the pack's flag stays the rule: `estarFilingType` is null.
 *
 * PURE + DETERMINISTIC: no DB, no network, no clock. The one read it needs (the
 * device's answers) is the caller's, passed in.
 *
 * @module server/services/pathway-engines/estar/estar-outline-requirements
 */

import { DEVICE_FLAGS } from '../../../../shared/constants/domain/device-classification';
import {
  leafDocumentType,
  mapToEstar,
  type DeviceFlags,
  type EstarInputLeaf,
  type EstarSlotStatus,
  type EstarType,
} from './estar-mapper';

/**
 * What the eSTAR asks of one outline section, for this device.
 *
 *   required         the slot it supplies is required of this device.
 *   undetermined     the slot turns on a device question the project has not
 *                    answered. Not the same as not required.
 *   when-applicable  the slot turns on a property the intake does not ask.
 *   not-applicable   the project answered no, and finished content here would
 *                    contradict that answer (the mapper's `contradictions`).
 *   not-required     the project answered no and content here contradicts
 *                    nothing; or the pack decides and does not mark it.
 */
export type EstarSectionRequirement = 'required' | 'undetermined' | 'when-applicable' | 'not-applicable' | 'not-required';

export interface EstarOutlineSectionInput {
  /** The rule-pack key (c2c_document_sections.section_key). */
  key: string;
  label?: string | null;
  parentKey?: string | null;
  /** The pack's flag. Read only for a section no mapper slot takes. */
  mandatory?: boolean | null;
  /** Whether the section holds content, by the reader's own definition. Absent reads as none. */
  hasContent?: boolean | null;
}

export interface EstarOutlineSectionAnswer {
  key: string;
  /** `mapper`: one of its slots takes this section. `pack`: none does, and the pack's flag stands. */
  decidedBy: 'mapper' | 'pack';
  requirement: EstarSectionRequirement;
  /** The mapper slot that decides it. Absent when the pack does. */
  slotId?: string;
  /** Every outline section whose content supplies that slot, this one included, in outline order. */
  suppliedBy: string[];
  /** The word a reader shows: Required, Not decided, When applicable, Not applicable or Optional. */
  mark: string;
  /** Why, in words. Empty for a section the pack leaves optional. */
  reason: string;
  /** Said while the section is required, or not decided, and nothing that supplies its slot holds content. Else null. */
  blocker: string | null;
}

export interface EstarUnplacedSlot {
  slotId: string;
  label: string;
  applicability: 'required' | 'undetermined' | 'when-applicable';
}

export interface EstarOutlineRequirements {
  type: EstarType;
  variant: 'device' | 'ivd';
  /** One answer per outline section, in the order given. */
  sections: EstarOutlineSectionAnswer[];
  byKey: ReadonlyMap<string, EstarOutlineSectionAnswer>;
  /**
   * Slots this device's eSTAR needs, may need, or has not decided, that no
   * section of the outline supplies. They are part of the answer: a reader
   * that counts only sections would otherwise read the outline as complete.
   */
  unplaced: EstarUnplacedSlot[];
}

export interface EstarOutlineRequirementsInput {
  type: EstarType;
  /** nIVD or IVD. Omitted means 'device', as in the mapper. */
  variant?: 'device' | 'ivd';
  /** The device's answers at intake (program-device-flags). Undefined: never answered. */
  flags?: DeviceFlags;
  sections: ReadonlyArray<EstarOutlineSectionInput>;
}

/**
 * The eSTAR type a governed document is filed as, or null when no eSTAR mapper
 * applies to its class and the pack's flag stays the rule.
 *
 * A PMA is filed on the same FDA form, but its sections are 21 CFR 814.20's
 * and its readiness is pma-mapper's, not this registry's.
 */
export function estarFilingType(docType: string | null | undefined, agency: string | null | undefined): EstarType | null {
  if (String(agency ?? '').trim().toLowerCase() !== 'fda') return null;
  const klass = String(docType ?? '').trim().toLowerCase();
  if (klass === 'k510') return '510k';
  return klass === 'denovo' ? 'de_novo' : null;
}

/** The device's answers, as a reader holds them for one project's filing documents. */
export interface EstarDeviceAnswers {
  variant: 'device' | 'ivd';
  /** Undefined: the questions were never answered; or no document needed them, and they were not read. */
  flags: DeviceFlags | undefined;
}

/**
 * The device answers a project's filing documents need: read at most once, and
 * only when one of the documents is an eSTAR filing.
 *
 * `read` is the caller's reader of the stored answers (program-device-flags,
 * `loadProgramDeviceFlags`). A read that throws is thrown on: an answer that
 * could not be read is not an unanswered question. `view` is the project's
 * client view; 'ivd' selects the IVD slot registry, as in the mapper.
 */
export async function estarDeviceAnswers(
  documents: ReadonlyArray<{ doc_type?: string | null; agency?: string | null }>,
  view: string | null | undefined,
  read: () => Promise<DeviceFlags | undefined>,
): Promise<EstarDeviceAnswers> {
  const needed = documents.some((d) => estarFilingType(d.doc_type, d.agency) !== null);
  return { variant: view === 'ivd' ? 'ivd' : 'device', flags: needed ? await read() : undefined };
}

const FLAG_LABELS = new Map<string, string>(DEVICE_FLAGS.map((f) => [f.id, f.label]));
const FILING_NAME: Record<EstarType, string> = { '510k': '510(k)', de_novo: 'De Novo request' };
const STRONGEST_FIRST: EstarSectionRequirement[] = ['required', 'undetermined', 'when-applicable', 'not-applicable', 'not-required'];
const NO_CONTENT = 'Mandatory section — no content yet';

/**
 * An outline section as the leaf readiness would read once it is authored:
 * the key is the section code and the label is both the title and the
 * document-type source (estar-content-leaves, `governedSectionsToDeviceSections`
 * then `sectionsToLeaves`). Marked substantive so the mapper reports which
 * slots it would supply.
 */
function outlineLeaf(section: EstarOutlineSectionInput): EstarInputLeaf {
  const title = section.label || section.key;
  return { sectionCode: section.key, title, documentType: leafDocumentType(title), substantive: true };
}

/** "D4 or D5", "E5, E6 or E7". */
function orList(keys: string[]): string {
  return keys.length < 2 ? keys.join('') : `${keys.slice(0, -1).join(', ')} or ${keys[keys.length - 1]}`;
}

interface Asked {
  type: EstarType;
  /** `${slotId} ${key}` for each section whose finished content would contradict a "no". */
  contradicted: ReadonlySet<string>;
  /** Sections that hold other sections: headings, not choices. */
  headings: ReadonlySet<string>;
  withContent: ReadonlySet<string>;
  slots: EstarSlotStatus[];
}

/** One slot's bearing on one section it takes. */
interface Bearing {
  slot: EstarSlotStatus;
  requirement: EstarSectionRequirement;
  /** The sections a person can choose between to supply the slot: `suppliedBy` without headings. */
  choices: string[];
  supplied: boolean;
}

function bearingOf(slot: EstarSlotStatus, key: string, asked: Asked): Bearing {
  const answeredNo = slot.applicability === 'not-applicable';
  const contradicts = asked.contradicted.has(`${slot.id} ${key}`);
  const requirement: EstarSectionRequirement = answeredNo ? (contradicts ? 'not-applicable' : 'not-required') : slot.applicability;
  return {
    slot,
    requirement,
    choices: slot.sources.filter((k) => !asked.headings.has(k)),
    supplied: slot.sources.some((k) => asked.withContent.has(k)),
  };
}

function markFor(b: Bearing): string {
  switch (b.requirement) {
    case 'required': return b.choices.length > 1 ? `Required: one of ${b.choices.join(', ')}` : 'Required';
    case 'undetermined': return 'Not decided';
    case 'when-applicable': return 'When applicable';
    case 'not-applicable': return 'Not applicable';
    default: return 'Optional';
  }
}

/** The intake question that decides a conditional slot, as the intake words it (DEVICE_FLAGS), in quotes. */
function questionOf(b: Bearing): string {
  return `“${FLAG_LABELS.get(b.slot.flag ?? '') ?? b.slot.label}”`;
}

function reasonFor(b: Bearing, type: EstarType): string {
  switch (b.requirement) {
    case 'required':
      return b.slot.necessity === 'always' ? `required of every ${FILING_NAME[type]}` : `required: the project answered yes to ${questionOf(b)}`;
    case 'undetermined': return `not decided: the project has not answered ${questionOf(b)}`;
    case 'when-applicable': return `required when ${b.slot.appliesWhen ?? 'it applies to the device'}`;
    case 'not-applicable': return `not applicable: the project answered no to ${questionOf(b)}`;
    default: return `not required: the project answered no to ${questionOf(b)}`;
  }
}

/** What is said while a required or undecided slot holds nothing; null when the bearing does not block. */
function blockerFor(b: Bearing): string | null {
  if (b.supplied) return null;
  if (b.requirement === 'required') return b.choices.length > 1 ? `${NO_CONTENT} in ${orList(b.choices)}` : NO_CONTENT;
  return b.requirement === 'undetermined' ? `Not decided — the project has not answered ${questionOf(b)}` : null;
}

/** A section no slot takes: the pack's flag, in the words the Library has always used for it. */
function packAnswer(section: EstarOutlineSectionInput): EstarOutlineSectionAnswer {
  const mandatory = section.mandatory === true;
  return {
    key: section.key,
    decidedBy: 'pack',
    requirement: mandatory ? 'required' : 'not-required',
    suppliedBy: [section.key],
    mark: mandatory ? 'Required' : 'Optional',
    reason: mandatory ? 'mandatory section' : '',
    blocker: mandatory && !section.hasContent ? NO_CONTENT : null,
  };
}

function answerFor(section: EstarOutlineSectionInput, asked: Asked): EstarOutlineSectionAnswer {
  const bearings = asked.slots
    .filter((slot) => slot.sources.includes(section.key))
    .map((slot) => bearingOf(slot, section.key, asked))
    .sort((a, b) => STRONGEST_FIRST.indexOf(a.requirement) - STRONGEST_FIRST.indexOf(b.requirement));
  if (bearings.length === 0) return packAnswer(section);
  // The strongest bearing is the section's answer; any bearing that blocks, blocks.
  const decides = bearings[0];
  const blocker = bearings.map(blockerFor).find((said) => said !== null) ?? null;
  return {
    key: section.key,
    decidedBy: 'mapper',
    requirement: decides.requirement,
    slotId: decides.slot.id,
    suppliedBy: [...decides.slot.sources],
    mark: markFor(decides),
    reason: reasonFor(decides, asked.type),
    blocker,
  };
}

function unplacedSlots(slots: EstarSlotStatus[]): EstarUnplacedSlot[] {
  const out: EstarUnplacedSlot[] = [];
  for (const slot of slots) {
    if (slot.sources.length > 0 || slot.applicability === 'not-applicable') continue;
    out.push({ slotId: slot.id, label: slot.label, applicability: slot.applicability });
  }
  return out;
}

/**
 * For each section of a 510(k) or De Novo outline: what this device's eSTAR
 * asks of it, in words a reader can show, and whether it blocks.
 *
 * A reader of the pack's `mandatory` flag asks this for an eSTAR filing
 * (`estarFilingType`), so that it and filing readiness cannot give different
 * answers. The Vault's Library does (routes/c2c/project-vault.ts,
 * `documentFolder`).
 */
export function estarOutlineRequirements(input: EstarOutlineRequirementsInput): EstarOutlineRequirements {
  const variant = input.variant === 'ivd' ? 'ivd' : 'device';
  const sections = input.sections.filter((s) => typeof s.key === 'string' && s.key.length > 0);
  const result = mapToEstar({ type: input.type, variant, flags: input.flags, leaves: sections.map(outlineLeaf) });
  const asked: Asked = {
    type: input.type,
    slots: result.sections,
    contradicted: new Set(result.summary.contradictions.flatMap((c) => c.sources.map((key) => `${c.section} ${key}`))),
    headings: new Set(sections.map((s) => s.parentKey).filter((k): k is string => !!k)),
    withContent: new Set(sections.filter((s) => s.hasContent === true).map((s) => s.key)),
  };
  const answers = sections.map((s) => answerFor(s, asked));
  return {
    type: input.type,
    variant,
    sections: answers,
    byKey: new Map(answers.map((a) => [a.key, a])),
    unplaced: unplacedSlots(result.sections),
  };
}

export default { estarFilingType, estarDeviceAnswers, estarOutlineRequirements };
