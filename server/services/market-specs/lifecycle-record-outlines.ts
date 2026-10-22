/**
 * Registry filings whose outline is an existing lifecycle record, not a
 * project heading copy: the NDA/BLA and IND annual reports, the Prior Approval
 * Supplement (and the sBLA), the CBE-30 / CBE-0 supplement, and the Type A/B/C
 * meeting packages. Read by `getRegistryDocumentTemplate`
 * (document-template-library.ts), so AnA, the Authoring template picker and the
 * governed rule packs minted from it (server/services/c2c/filing-class-packs.ts)
 * give one outline.
 *
 * Split out of document-template-library.ts on 2026-10-18, when the PAS, CBE,
 * IND annual report and meeting outlines joined the annual report here.
 *
 * Pure and deterministic: no database, no network, no model.
 *
 * @module server/services/market-specs/lifecycle-record-outlines
 */

import type { DocumentTemplateStructure, TemplateSection } from './document-template-library';
import { basisLabel, type RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';
import { getApplicationType } from '../../../shared/regulatory/global-document-registry';
import { compareSectionCode } from '../../../shared/regulatory/section-code';
import {
  FDA_FORMAL_MEETINGS_GUIDANCE, FDA_MEETING_PACKAGE_CORE, LIFECYCLE_DOCUMENT_TYPES,
} from '../ind/ctd/lifecycle-document-types';
import { ichHeadingTitle } from '../ind/ctd/ich-m4-headings';

/** The shown basis is the one rendering of the structured basis (as document-template-library.ts withBasis). */
function withBasis(t: Omit<DocumentTemplateStructure, 'regulatoryBasis'> & { basis: RegulatoryBasis }): DocumentTemplateStructure {
  return { ...t, regulatoryBasis: basisLabel(t.basis) };
}

/** Reuse the post-approval record; an IND annual report is a different obligation. */
function postApprovalAnnualOutline(): DocumentTemplateStructure {
  const source = LIFECYCLE_DOCUMENT_TYPES.find(record => record.id === 'nda_bla_annual_report');
  if (!source) throw new Error('The NDA/BLA annual-report lifecycle record is unavailable.');
  return withBasis({
    id: 'US_NDA_ANNUAL', title: source.label, families: ['ectd'],
    basis: {
      ref: source.regulatoryBasis.join('; '), confidence: 'recall',
      note: 'Existing advisory lifecycle record; current regulator text was not independently re-read for this projection.',
    },
    outlineSource: { kind: 'lifecycle-record', registryId: 'US_NDA_ANNUAL', record: `LIFECYCLE_DOCUMENT_TYPES:${source.id}` },
    outlineLimitations: [
      'Advisory post-approval annual-report outline. Confirm the application-specific NDA or BLA obligations and current regional instructions.',
      'Retain the original Form FDA 2252, approved labeling, distribution and manufacturing records, and postmarketing study records; this outline does not replace them.',
      'This annual report is distinct from an IND annual report and from expedited or periodic adverse-experience reporting.',
      'Its parts follow the NDA annual report (21 CFR 314.81(b)(2)). Part 314 does not govern a licensed biologic: a BLA reports minor changes annually under 601.12(d), postmarketing study status under 601.70, pediatric information under 601.28 and distribution under 600.81, and this outline does not model those reports part by part.',
    ],
    sections: source.components.map(component => ({
      number: component.code, heading: component.title, purpose: component.authoringGuidance, required: component.required,
    })),
  });
}

/**
 * The other registry filings an existing lifecycle record describes better than
 * the project heading copy (2026-10-18). The copies were the generic CTD spine:
 * a Prior Approval Supplement and an sBLA were sixteen required CTD headings
 * (2.4 nonclinical overview, 4.2.3 toxicology, 5.3 study reports among them), a
 * CBE was five, and the IND annual report was a seven-heading paraphrase of
 * 21 CFR 312.33. The records carry the supplement's own parts — its labelled
 * cover letter, the 356h, the change and its justification, the environmental
 * claim — and the CTD sections the change updates.
 *
 * US_BLA_SUPP reads the PAS record: 21 CFR 601.12(b) is the biologics
 * prior-approval category, and the parts are the same. US_CBE is ONE registry
 * filing for two records (CBE-30, CBE-0): their shared parts are listed once and
 * required, and each variant's own parts are listed under its name and not
 * required, because which applies is the filer's classification of the change.
 */
const LIFECYCLE_RECORD_OUTLINES: Readonly<Record<string, readonly string[]>> = {
  US_NDA_SUPP: ['nda_pas'],
  US_BLA_SUPP: ['nda_pas'],
  US_CBE: ['cbe_30', 'cbe_0'],
  US_IND_ANNUAL: ['ind_annual_report'],
};

/** "Changes Being Effected in 30 Days Supplement (CBE-30)" → "CBE-30". */
function recordShortName(label: string): string {
  const m = /\(([^()]+)\)\s*$/.exec(label);
  return (m ? m[1] : label).split(',')[0].trim();
}

function lifecycleRecordOutline(registryId: string, recordIds: readonly string[]): DocumentTemplateStructure {
  const entry = getApplicationType(registryId);
  const records = recordIds.map((id) => {
    const record = LIFECYCLE_DOCUMENT_TYPES.find((r) => r.id === id);
    if (!record) throw new Error(`The lifecycle record "${id}" for ${registryId} is unavailable.`);
    return record;
  });
  const variants = records.length > 1;
  // A part is keyed by its title: the CBE-30 and CBE-0 cover letters are one part.
  const parts = new Map<string, { code: string; heading: string; purpose: string; requiredIn: number; in: string[]; formerTitles: string[] }>();
  for (const record of records) {
    for (const c of record.components) {
      const seen = parts.get(c.title);
      if (seen) {
        seen.in.push(recordShortName(record.label)); if (c.required) seen.requiredIn += 1;
        seen.formerTitles.push(...(c.formerTitles ?? []));
        continue;
      }
      parts.set(c.title, {
        code: c.code, heading: c.title, purpose: c.authoringGuidance, requiredIn: c.required ? 1 : 0,
        in: [recordShortName(record.label)], formerTitles: [...(c.formerTitles ?? [])],
      });
    }
  }
  const sections: TemplateSection[] = [...parts.values()].map((p) => ({
    number: p.code,
    heading: variants && p.in.length < records.length ? `${p.heading} (${p.in.join(', ')})` : p.heading,
    purpose: p.purpose,
    required: p.requiredIn === records.length,
    // A heading a correction replaced still names this part (2026-10-19).
    ...(p.formerTitles.length ? { formerTitles: [...new Set(p.formerTitles)] } : {}),
  }));
  // The record's Module 1 codes name where its own parts file (1.2 the cover
  // letter, 1.14.1 the labeling); Modules 2–5 are the content the change updates.
  const updated = [...new Set(records.flatMap((r) => r.ctdSectionCodes ?? []))]
    .filter((code) => /^[2-5]/.test(code))
    .sort(compareSectionCode);
  if (updated.length > 0) {
    sections.push({
      number: 'CTD',
      heading: 'Updated CTD Sections',
      purpose: 'The Module 2–5 sections the change updates, each as a replacement of the approved section. Include only the sections the change affects.',
      required: false,
      subsections: updated.map((code) => ({
        number: code, heading: ichHeadingTitle(code) ?? code,
        purpose: 'Updated section carrying the change, as it will replace the approved one.', required: false,
      })),
    });
  }
  // The registry's own name, so the PAS and the sBLA read apart in the template picker (review nit, 2026-10-18).
  const title = entry?.displayName ?? (variants ? registryId : records[0].label);
  return withBasis({
    id: registryId, title, families: ['ectd'],
    basis: {
      ref: [...new Set(records.flatMap((r) => r.regulatoryBasis))].join('; '), confidence: 'recall',
      note: 'Existing advisory lifecycle record; current regulator text was not independently re-read for this projection.',
    },
    outlineSource: { kind: 'lifecycle-record', registryId, record: records.map((r) => `LIFECYCLE_DOCUMENT_TYPES:${r.id}`).join('+') },
    outlineLimitations: [
      'Advisory outline from the platform\'s lifecycle record. Confirm the application-specific obligations and current FDA instructions before filing.',
      ...(registryId === 'US_BLA_SUPP'
        ? ['A BLA supplement is governed by 21 CFR 601.12 (601.12(b) for a manufacturing change, 601.12(f)(1) for a labeling change); this outline is the NDA Prior Approval Supplement record (21 CFR 314.70(b)), whose parts the biologics prior-approval supplement shares.']
        : []),
      ...(variants ? ['Which variant applies is the filer\'s classification of the change; its own parts are named with it and are not marked required.'] : []),
    ],
    sections,
  });
}

/**
 * A Type A, B or C meeting package: the type-neutral core every FDA formal
 * meeting package carries (lifecycle-document-types.ts FDA_MEETING_PACKAGE_CORE,
 * the one ana-ri's meeting template reads), plus the discipline summaries its
 * questions need. The project heading copy asked a Type A package for a
 * nonclinical program and a clinical development plan, which a dispute or
 * clinical-hold meeting does not carry (2026-10-18).
 */
const MEETING_REGISTRY_IDS: ReadonlySet<string> = new Set(['US_TYPE_A_MEETING', 'US_TYPE_B_MEETING', 'US_TYPE_C_MEETING']);

function meetingPackageOutline(registryId: string): DocumentTemplateStructure {
  const entry = getApplicationType(registryId);
  return withBasis({
    id: registryId, title: `${entry?.displayName ?? registryId} Package`, families: ['ectd'],
    basis: {
      ref: `${FDA_FORMAL_MEETINGS_GUIDANCE}; 21 CFR 312.47 (meetings)`, confidence: 'recall',
      note: 'Contents of a meeting request and a meeting package, from the platform\'s meeting record; the guidance text was not re-read for this projection.',
    },
    outlineSource: { kind: 'lifecycle-record', registryId, record: 'FDA_MEETING_PACKAGE_CORE' },
    outlineLimitations: [
      'The type-neutral core of an FDA formal meeting package. The meeting type sets the deadlines and whether the package goes with the request.',
    ],
    sections: [
      ...FDA_MEETING_PACKAGE_CORE.map((c) => ({ number: c.code, heading: c.title, purpose: c.guidance, required: c.required })),
      {
        number: 'MTG-SUPPORT', heading: 'Supporting Discipline Summaries (CMC, Nonclinical, Clinical)', required: false,
        purpose: 'The discipline summaries the meeting\'s questions need, each holding the data behind the sponsor\'s position.',
      },
    ],
  });
}

/** The lifecycle-record outline for a registry filing, or undefined when the filing has none. */
export function lifecycleRecordOutlineFor(registryId: string): DocumentTemplateStructure | undefined {
  if (registryId === 'US_NDA_ANNUAL') return postApprovalAnnualOutline();
  const records = LIFECYCLE_RECORD_OUTLINES[registryId];
  if (records) return lifecycleRecordOutline(registryId, records);
  if (MEETING_REGISTRY_IDS.has(registryId)) return meetingPackageOutline(registryId);
  return undefined;
}

/** One part of a lifecycle-record outline, with the brief its record gives it. */
export interface LifecycleOutlinePart {
  /** The record the part is read from: 'LIFECYCLE_DOCUMENT_TYPES:cbe_30', 'FDA_MEETING_PACKAGE_CORE'. */
  record: string;
  /** The record's short name ("CBE-30", "CBE-0"), so a part two records share is told apart by variant. */
  variant: string;
  code: string;
  title: string;
  guidance: string;
  keyContentElements: readonly string[];
}

/**
 * The record parts a filing's lifecycle-record outline is built from, for a
 * reader that needs a part's full brief, not only its heading: AnA drafting
 * answers a section of these outlines from the same record the outline is read
 * from (review finding, 2026-10-18: it read the retired blueprint, so no
 * section of the PAS, CBE, IND annual report or meeting outlines resolved).
 * Empty for a filing with no lifecycle-record outline.
 */
export function lifecycleOutlineParts(registryId: string): LifecycleOutlinePart[] {
  const fromRecord = (id: string): LifecycleOutlinePart[] => {
    const record = LIFECYCLE_DOCUMENT_TYPES.find((r) => r.id === id);
    if (!record) throw new Error(`The lifecycle record "${id}" for ${registryId} is unavailable.`);
    return record.components.map((c) => ({
      record: `LIFECYCLE_DOCUMENT_TYPES:${id}`, variant: recordShortName(record.label), code: c.code, title: c.title,
      guidance: c.authoringGuidance, keyContentElements: c.keyContentElements,
    }));
  };
  if (registryId === 'US_NDA_ANNUAL') return fromRecord('nda_bla_annual_report');
  const records = LIFECYCLE_RECORD_OUTLINES[registryId];
  if (records) return records.flatMap(fromRecord);
  if (MEETING_REGISTRY_IDS.has(registryId)) {
    return FDA_MEETING_PACKAGE_CORE.map((c) => ({
      record: 'FDA_MEETING_PACKAGE_CORE', variant: 'FDA formal meeting', code: c.code, title: c.title, guidance: c.guidance, keyContentElements: [],
    }));
  }
  return [];
}
