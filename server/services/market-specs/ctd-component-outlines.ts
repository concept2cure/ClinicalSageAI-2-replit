/**
 * A CTD Module 2 component's outline, read from the platform's one ICH M2–M5
 * record (docs/design/ANA_REGULATORY_RECORD.md "One ICH M2–M5 record"):
 * `CTD_AUTHORING_GUIDANCE` holds the codes a sponsor writes, with their briefs,
 * and `ICH_M4_HEADINGS` the structural headings around them. Two halves, one
 * tree; this module only reads it.
 *
 * Why (D2 increment 3, 2026-10-20). The template library kept the Nonclinical
 * Overview, the Clinical Overview and the Clinical Summary as hand copies of
 * their first level, and the 2.6 outline (nonclinicalSummaryBlueprint.ts) read
 * the guidance half only. So a Clinical Summary was six headings with no
 * 2.7.4.2 Adverse Events to write to, a Clinical Overview stopped at 2.5.6, and
 * the 2.6 written summaries had no 2.6.4.x or 2.6.6.x — while the record held
 * all of them. The Authoring picker, `get_document_template`, AnA drafting and
 * a class pack all read the one outline `getRegistryDocumentTemplate` serves,
 * so they now read the record.
 *
 * Not here, on purpose: the Quality Overall Summary (2.3) and Module 3. Their
 * deeper headings belong to the CMC lane (ich-m4-headings.ts header), and the
 * record does not hold them yet.
 *
 * Pure and deterministic: no database, no network, no model.
 *
 * @module server/services/market-specs/ctd-component-outlines
 */

import type { DocumentTemplateStructure, TemplateSection } from './document-template-library';
import type { CtdSection, RegulatoryBasis } from '../ind/ctd/types';
import { CTD_AUTHORING_GUIDANCE } from '../ind/ctd/authoring-guidance';
import { ICH_M4_HEADINGS } from '../ind/ctd/ich-m4-headings';
import { basisLabel } from '../../../shared/regulatory/regulatory-basis';
import { compareSectionCode } from '../../../shared/regulatory/section-code';

/** One heading of the record below a component's root: its brief when the guidance half holds it, its basis when the structural half does. */
export interface CtdRecordHeading {
  code: string;
  title: string;
  brief?: CtdSection;
  basis?: RegulatoryBasis;
}

const BRIEFED: ReadonlyMap<string, CtdSection> = new Map(Object.values(CTD_AUTHORING_GUIDANCE).map((s) => [s.code, s] as const));
const STRUCTURAL = new Map(ICH_M4_HEADINGS.map((h) => [h.code, h] as const));
const parentOf = (code: string) => code.slice(0, code.lastIndexOf('.'));

/** Every heading the record holds below `root` (exclusive), in CTD order. Throws on a root the record does not hold. */
export function ctdRecordSubtree(root: string): CtdRecordHeading[] {
  if (!BRIEFED.has(root) && !STRUCTURAL.has(root)) throw new Error(`The ICH M2–M5 record holds no heading ${root}.`);
  return [...new Set([...BRIEFED.keys(), ...STRUCTURAL.keys()])]
    .filter((c) => c.startsWith(`${root}.`))
    .sort(compareSectionCode)
    .map((code) => {
      const brief = BRIEFED.get(code);
      return brief ? { code, title: brief.title, brief } : { code, title: STRUCTURAL.get(code)!.title, basis: STRUCTURAL.get(code)!.basis };
    });
}

/** The nearest heading at or above `code` that the guidance half briefs, or undefined. */
function briefedAncestor(code: string): CtdSection | undefined {
  for (let c = code; c.includes('.'); c = parentOf(c)) {
    const s = BRIEFED.get(c);
    if (s) return s;
  }
  return undefined;
}

/**
 * What a heading is for. A briefed heading: its own key content. A structural
 * one: the key content its nearest briefed ancestor states for it, by number
 * (2.5.6.2 in the 2.5.6 brief) or as the one element that names it
 * ("Pharmacology" in the 2.4 brief); else where its content is briefed. Every
 * line is the record's own words, attributed; nothing is written here.
 */
function purposeOf(h: CtdRecordHeading): string {
  if (h.brief) return `${h.brief.keyContentElements.slice(0, 3).join('; ')}.`;
  const ancestor = briefedAncestor(parentOf(h.code));
  if (!ancestor) return `The ICH M4 heading ${h.code} ${h.title}.`;
  const title = h.title.toLowerCase();
  const byCode = ancestor.keyContentElements.find((k) => k.startsWith(`${h.code} `));
  const byTitle = ancestor.keyContentElements.filter((k) => k.toLowerCase().includes(title));
  const own = byCode ?? (byTitle.length === 1 ? byTitle[0] : undefined);
  return own
    ? `From the ${ancestor.code} brief: ${own}.`
    : `An ICH M4 heading of ${ancestor.code} ${ancestor.title}; the ${ancestor.code} brief states its content.`;
}

/**
 * Required: a brief whose `requiredFor` names any submission is required, one
 * that names none (the 2.6.2.x pharmacology leaves) is conditional. A
 * structural heading carries its nearest briefed ancestor's flag: ICH M4 lays
 * it out, and the record does not say it may be left out.
 */
function requiredOf(code: string): boolean {
  const s = briefedAncestor(code);
  return s ? s.requiredFor.length > 0 : true;
}

/** The headings below `root`, nested by code, in CTD order. */
export function ctdComponentSections(root: string): TemplateSection[] {
  const nodes = new Map<string, TemplateSection>();
  const top: TemplateSection[] = [];
  for (const h of ctdRecordSubtree(root)) {
    const section: TemplateSection = { number: h.code, heading: h.title, purpose: purposeOf(h), required: requiredOf(h.code) };
    nodes.set(h.code, section);
    const parent = nodes.get(parentOf(h.code));
    if (parent) (parent.subsections ??= []).push(section);
    else top.push(section);
  }
  return top;
}

/** A Module 2 component's template: its root's headings to the record's depth, with the basis and limits stated. */
export function ctdComponentTemplate(input: {
  id: string; registryId: string; root: string; title: string; guideline: string;
}): DocumentTemplateStructure {
  const basis: RegulatoryBasis = {
    ref: `${input.guideline}, ${input.root}: headings from the platform's ICH M2–M5 record`,
    confidence: 'recall',
    note: 'Headings and numbers as ich-m4-headings.ts and authoring-guidance.ts record them, matched against search extracts of the FDA-hosted ICH M4 guidelines; not re-read against the guideline text for this outline.',
  };
  return {
    id: input.id,
    title: input.title,
    families: ['ectd'],
    ctdSection: input.root,
    regulatoryBasis: basisLabel(basis),
    basis,
    outlineSource: { kind: 'document-outline', registryId: input.registryId, record: `CTD_AUTHORING_GUIDANCE+ICH_M4_HEADINGS:${input.root}` },
    outlineLimitations: [
      'A required heading is one the record says some submission (IND, NDA or BLA) needs. Scale its content to the development phase: an early IND does not need a complete marketing dossier.',
      'ICH M4 sets how the section is organised, not which studies or data a product must have. Confirm applicability and the receiving agency’s regional requirements.',
    ],
    sections: ctdComponentSections(input.root),
  };
}
